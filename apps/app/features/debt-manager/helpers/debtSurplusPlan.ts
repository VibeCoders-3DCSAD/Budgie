import type { DebtAccount, DebtAccountStatus, DebtTypePreset } from "../../../local-db/repositories/debts/debtAccounts";
import type { DebtPayment } from "../../../local-db/repositories/debts/debtPayments";
import type { CreditCardCycle } from "../../../local-db/repositories/credit-cards/creditCardCycles";
import type { CreditCardStatement } from "../../../local-db/repositories/credit-cards/creditCardStatements";
import type { CreditCardPayment } from "../../../local-db/repositories/credit-cards/creditCardPayments";
import type { FinancialAccount } from "../../../local-db/repositories/foundations/financialFoundations";
import type { DebtPriority, DebtStrategy } from "../../../local-db/repositories/debts/debtRepaymentPlans";

export type DebtSurplusCandidate = {
  id: string;
  label: string;
  kind: "loan" | "credit_card_statement";
  type?: DebtTypePreset;
  status: DebtAccountStatus;
  allowsExtraPayments: boolean;
  annualInterestRateBps: number;
  // What was owed when the plan month started, before this month's payments.
  startBalanceCentavos: number;
  // The Financial Plan's required payment for this debt this month.
  reservedCentavos: number;
  // Payments recorded against this debt during the plan month.
  paidThisPeriodCentavos: number;
};

export type DebtSurplusRecommendation = {
  id: string;
  label: string;
  plannedCentavos: number;
  paidCentavos: number;
  remainingCentavos: number;
};

export type DebtSurplusPlan = {
  surplusCentavos: number;
  // Surplus no debt can take: every candidate is planned up to its balance.
  unassignedCentavos: number;
  // Planned surplus not yet paid this month.
  remainingSurplusCentavos: number;
  recommendations: DebtSurplusRecommendation[];
};

type Eligible = DebtSurplusCandidate & { roomCentavos: number };

// Amounts come from stored plan JSON and SQLite rows; anything that is not a
// finite number counts as zero, and fractions of a centavo are dropped.
function toCentavos(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function isEligible(candidate: DebtSurplusCandidate): boolean {
  if (candidate.status === "archived" || candidate.status === "deleted") return false;
  if (candidate.type === "salary_loan") return false;
  return candidate.allowsExtraPayments;
}

// Avalanche: card statements first (cards do not store a rate, and their
// finance charges are usually higher than any loan's), then the highest rate.
function byAvalanche(left: Eligible, right: Eligible): number {
  const statementOrder = Number(right.kind === "credit_card_statement") - Number(left.kind === "credit_card_statement");
  return statementOrder
    || right.annualInterestRateBps - left.annualInterestRateBps
    || left.roomCentavos - right.roomCentavos
    || left.id.localeCompare(right.id);
}

// Snowball: the smallest balance left after required payments first.
function bySnowball(left: Eligible, right: Eligible): number {
  return left.roomCentavos - right.roomCentavos
    || right.annualInterestRateBps - left.annualInterestRateBps
    || left.id.localeCompare(right.id);
}

function orderCandidates(eligible: Eligible[], strategy: DebtStrategy, priorities: DebtPriority[]): Eligible[] {
  const byId = new Map(eligible.map((candidate) => [candidate.id, candidate]));
  const prioritized = [...priorities]
    .sort((left, right) => left.priorityRank - right.priorityRank)
    .map((priority) => byId.get(priority.debtAccountId))
    .filter((candidate): candidate is Eligible => candidate !== undefined);
  const prioritizedIds = new Set(prioritized.map((candidate) => candidate.id));
  const rest = eligible.filter((candidate) => !prioritizedIds.has(candidate.id));
  rest.sort(strategy === "snowball" ? bySnowball : byAvalanche);
  return [...new Set([...prioritized, ...rest])];
}

/**
 * Recommends where the Financial Plan's debt surplus goes this month.
 * Planning uses the start-of-month balance minus the required payment, so the
 * recommendation stays stable as payments are recorded; payments above a
 * debt's required payment count toward its planned surplus.
 */
export function planDebtSurplus({ candidates, surplusCentavos, strategy, priorities = [] }: {
  candidates: DebtSurplusCandidate[];
  surplusCentavos: number;
  strategy: DebtStrategy;
  priorities?: DebtPriority[];
}): DebtSurplusPlan {
  const normalizedSurplusCentavos = toCentavos(surplusCentavos);
  const eligible = candidates.filter(isEligible).map((candidate) => {
    const startBalanceCentavos = toCentavos(candidate.startBalanceCentavos);
    const reservedCentavos = toCentavos(candidate.reservedCentavos);
    const paidThisPeriodCentavos = toCentavos(candidate.paidThisPeriodCentavos);
    const annualInterestRateBps = toCentavos(candidate.annualInterestRateBps);
    return { ...candidate, startBalanceCentavos, reservedCentavos, paidThisPeriodCentavos, annualInterestRateBps, roomCentavos: Math.max(0, startBalanceCentavos - reservedCentavos) };
  }).filter((candidate) => candidate.roomCentavos > 0);

  let available = normalizedSurplusCentavos;
  const recommendations: DebtSurplusRecommendation[] = [];
  for (const candidate of orderCandidates(eligible, strategy, priorities)) {
    if (available <= 0) break;
    const plannedCentavos = Math.min(available, candidate.roomCentavos);
    available -= plannedCentavos;
    const paidCentavos = Math.min(plannedCentavos, Math.max(0, candidate.paidThisPeriodCentavos - candidate.reservedCentavos));
    recommendations.push({ id: candidate.id, label: candidate.label, plannedCentavos, paidCentavos, remainingCentavos: plannedCentavos - paidCentavos });
  }

  return {
    surplusCentavos: normalizedSurplusCentavos,
    unassignedCentavos: available,
    remainingSurplusCentavos: recommendations.reduce((total, recommendation) => total + recommendation.remainingCentavos, 0),
    recommendations,
  };
}

type PlanDebtReservation = { debtAccountId?: string | null; creditCardStatementId?: string | null; amountCentavos?: number };

function sumReserved(reservations: PlanDebtReservation[], matches: (reservation: PlanDebtReservation) => boolean): number {
  return reservations.reduce((total, reservation) => {
    if (!matches(reservation)) return total;
    return total + toCentavos(typeof reservation.amountCentavos === "number" ? reservation.amountCentavos : 0);
  }, 0);
}

const inPeriod = (date: string, period: { start: string; end: string }, today: string) => date >= period.start && date <= period.end && date <= today;

/**
 * Builds surplus candidates for the plan month: loans and each credit card,
 * with what was owed at the start of the month, the plan's required payment,
 * and what has been paid this month.
 *
 * A card's surplus belongs to the card for the whole plan month. It is sized
 * from the statement the plan reserved for (or, without a reservation, the
 * statement already issued when the month began), so a statement issued
 * mid-month does not move it, and every payment made to the card this month
 * counts toward it.
 */
export function buildDebtSurplusCandidates({ debts, debtPayments, cards, cycles, statements, cardPayments, reservations, period, today }: {
  debts: DebtAccount[];
  debtPayments: DebtPayment[];
  cards: FinancialAccount[];
  cycles: CreditCardCycle[];
  statements: CreditCardStatement[];
  cardPayments: CreditCardPayment[];
  reservations: PlanDebtReservation[];
  period: { start: string; end: string };
  today: string;
}): DebtSurplusCandidate[] {
  const loans = debts.map((debt): DebtSurplusCandidate => {
    const paidThisPeriod = debtPayments.filter((payment) => payment.debt_account_id === debt.id && inPeriod(payment.payment_date, period, today));
    const principalPaid = paidThisPeriod.reduce((total, payment) => total + toCentavos(payment.principal_centavos), 0);
    return {
      id: debt.id, label: debt.name, kind: "loan", type: debt.type, status: debt.status,
      allowsExtraPayments: debt.allowsExtraPayments === true, annualInterestRateBps: debt.annualInterestRateBps,
      startBalanceCentavos: toCentavos(debt.currentBalanceCentavos) + principalPaid,
      reservedCentavos: sumReserved(reservations, (reservation) => reservation.debtAccountId === debt.id),
      paidThisPeriodCentavos: paidThisPeriod.reduce((total, payment) => total + toCentavos(payment.amount_centavos), 0),
    };
  });
  const cardCandidates = cards.flatMap((card): DebtSurplusCandidate[] => {
    const cycleIds = new Set(cycles.filter((cycle) => cycle.account_id === card.id).map((cycle) => cycle.id));
    const cardStatements = statements
      .filter((item) => item.authoritative && !item.deleted && cycleIds.has(item.cycle_id) && item.statement_date <= today)
      .sort((left, right) => right.statement_date.localeCompare(left.statement_date));
    const statement = anchorStatement(cardStatements, reservations, period);
    if (!statement) return [];
    const cardStatementIds = new Set(cardStatements.map((item) => item.id));
    const cardPaymentsToDate = cardPayments.filter((payment) => (cardStatementIds.has(payment.statement_id) || cycleIds.has(payment.cycle_id)) && payment.payment_date <= today);
    const paidBeforePeriod = cardPaymentsToDate.filter((payment) => payment.statement_id === statement.id && payment.payment_date < period.start).reduce((total, payment) => total + toCentavos(payment.amount_centavos), 0);
    const paidThisPeriod = cardPaymentsToDate.filter((payment) => inPeriod(payment.payment_date, period, today)).reduce((total, payment) => total + toCentavos(payment.amount_centavos), 0);
    return [{
      id: `card:${card.id}`, label: `${card.name} statement`, kind: "credit_card_statement", status: "active",
      allowsExtraPayments: true, annualInterestRateBps: 0,
      startBalanceCentavos: Math.max(0, toCentavos(statement.statement_balance_centavos) - paidBeforePeriod),
      reservedCentavos: sumReserved(reservations, (reservation) => typeof reservation.creditCardStatementId === "string" && cardStatementIds.has(reservation.creditCardStatementId)),
      paidThisPeriodCentavos: paidThisPeriod,
    }];
  });
  return [...loans, ...cardCandidates];
}

// Statements are newest first. The plan's reserved statement wins; otherwise
// the newest one issued before the month began; otherwise the newest so far.
function anchorStatement(statements: CreditCardStatement[], reservations: PlanDebtReservation[], period: { start: string }): CreditCardStatement | undefined {
  const reservedIds = new Set(reservations.map((reservation) => reservation.creditCardStatementId).filter((id): id is string => typeof id === "string"));
  const reserved = statements.find((statement) => reservedIds.has(statement.id));
  if (reserved) return reserved;
  return statements.find((statement) => statement.statement_date < period.start) ?? statements[0];
}
