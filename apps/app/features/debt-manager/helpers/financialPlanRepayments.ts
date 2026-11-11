import type { DebtAccount } from "../../../local-db/repositories/debts/debtAccounts";
import type { DebtPayment } from "../../../local-db/repositories/debts/debtPayments";
import type { CreditCardPayment } from "../../../local-db/repositories/credit-cards/creditCardPayments";
import type { CreditCardStatement } from "../../../local-db/repositories/credit-cards/creditCardStatements";
import type { CreditCardCycle } from "../../../local-db/repositories/credit-cards/creditCardCycles";
import type { FinancialAccount } from "../../../local-db/repositories/foundations/financialFoundations";
import type { AcceptedFinancialPlan } from "../../../local-db/repositories/financial-plans/financialPlans";
import type { FinancialPlanReservation } from "../../financial-plan/types";
import { commitmentKey, requirementReservations } from "../../financial-plan/helpers/commitmentBudget";
import { commitmentPayments, type CommitmentPayment } from "../../financial-plan/helpers/commitmentPayments";

export type FinancialPlanRepayment = {
  id: string; label: string; amountCentavos: number; dueDate?: string | null;
  // The debt surplus candidate this repayment belongs to: a loan id or `card:<accountId>`.
  targetId?: string;
  payment: CommitmentPayment;
};

type Input = {
  plan: AcceptedFinancialPlan | null; period: { start: string; end: string }; today: string;
  debts: DebtAccount[]; cards: FinancialAccount[]; statements: CreditCardStatement[];
  cycles: CreditCardCycle[]; debtPayments: DebtPayment[]; cardPayments: CreditCardPayment[];
};

export function buildFinancialPlanRepayments({ plan, period, today, debts, cards, statements, cycles, debtPayments, cardPayments }: Input): FinancialPlanRepayment[] {
  if (!Array.isArray(plan?.recommendation.debtReservations)) return [];
  const reservations = plan.recommendation.debtReservations.filter((row): row is FinancialPlanReservation => {
    if (!row || typeof row !== "object") return false;
    const value = row as FinancialPlanReservation;
    return Number.isSafeInteger(value.amountCentavos) && value.amountCentavos >= 0
      && (typeof value.debtAccountId === "string" || typeof value.creditCardStatementId === "string")
      && (value.dueDate == null || typeof value.dueDate === "string");
  });
  const paidCentavos: Record<string, number> = {};
  for (const payment of debtPayments) {
    if (payment.payment_date < period.start || payment.payment_date > period.end || payment.payment_date > today) continue;
    const key = `debt:${payment.debt_account_id}`;
    paidCentavos[key] = (paidCentavos[key] ?? 0) + payment.amount_centavos;
  }
  // Statement payments follow the statement, including payments made before this plan's period.
  for (const payment of cardPayments) {
    if (payment.deleted || !payment.statement_id || payment.payment_date > today) continue;
    const key = `statement:${payment.statement_id}`;
    paidCentavos[key] = (paidCentavos[key] ?? 0) + payment.amount_centavos;
  }
  const requirements = requirementReservations(plan.inputSnapshot?.debtRequirements as Record<string, unknown> | undefined);
  const statuses = commitmentPayments(reservations, requirements, { paidCentavos, settledKeys: [] });
  const debtsById = new Map(debts.map((debt) => [debt.id, debt]));
  const statementsById = new Map(statements.filter((statement) => !statement.deleted).map((statement) => [statement.id, statement]));
  const cyclesById = new Map(cycles.map((cycle) => [cycle.id, cycle]));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return reservations.flatMap((row) => {
    const debt = row.debtAccountId ? debtsById.get(row.debtAccountId) : undefined;
    const statement = row.creditCardStatementId ? statementsById.get(row.creditCardStatementId) : undefined;
    const accountId = statement ? cyclesById.get(statement.cycle_id)?.account_id : undefined;
    const card = accountId ? cardsById.get(accountId) : undefined;
    const label = debt?.name ?? (statement ? `${card?.name ?? "Credit card"} statement` : null);
    const id = commitmentKey(row);
    const payment = statuses.get(id) ?? { paidCentavos: 0, dueCentavos: 0, status: "paid" as const };
    const targetId = debt?.id ?? (accountId ? `card:${accountId}` : undefined);
    return label ? [{ id, label, amountCentavos: row.amountCentavos, dueDate: row.dueDate, payment, targetId }] : [];
  });
}
