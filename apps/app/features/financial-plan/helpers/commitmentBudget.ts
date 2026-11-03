import type { FinancialPlanRecommendation, FinancialPlanReservation } from "../types";

export type CommitmentPreview = { period: { start: string; end: string }; debtReservations: FinancialPlanReservation[]; savingsReservations: FinancialPlanReservation[]; obligations?: FinancialPlanReservation[] };
export type CommitmentBudget = { key: string; amountCentavos: number };

export function commitmentTarget(row: FinancialPlanReservation): string {
  return row.debtAccountId ? `debt:${row.debtAccountId}` : row.creditCardStatementId ? `statement:${row.creditCardStatementId}` : row.scheduledPaymentId ? `scheduled:${row.scheduledPaymentId}` : `savings:${row.savingsGoalId}`;
}

export function commitmentKey(row: FinancialPlanReservation): string {
  return `${commitmentTarget(row)}:${row.dueDate}`;
}

export function parseBudgetAmount(value: string): number | null {
  if (!/^\d+(\.\d{0,2})?$/.test(value.trim())) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents <= 100_000_000_000 ? cents : null;
}

export function requirementReservations(snapshot: Record<string, unknown> | undefined): FinancialPlanReservation[] {
  if (!Array.isArray(snapshot?.reservations)) return [];
  return snapshot.reservations.filter((row): row is FinancialPlanReservation => !!row && typeof row === "object" && typeof row.amountCentavos === "number");
}

export type CommitmentKind = "debtReservations" | "savingsReservations" | "obligations";

function isReservation(value: unknown): value is FinancialPlanReservation {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return Number.isSafeInteger(row.amountCentavos) && (row.amountCentavos as number) >= 0 && (row.label == null || typeof row.label === "string") && (row.dueDate == null || typeof row.dueDate === "string");
}

// Billers and remittances live in the plan's input snapshot: `reservations` are budgeted, `requirements` are the amounts due.
export function obligationRows(obligations: unknown): { reservations: FinancialPlanReservation[]; requirements: FinancialPlanReservation[] } {
  const snapshot = obligations && typeof obligations === "object" ? obligations as Record<string, unknown> : {};
  const rows = (value: unknown) => Array.isArray(value) ? value.filter(isReservation).filter((row) => typeof row.scheduledPaymentId === "string") : [];
  return { reservations: rows(snapshot.reservations), requirements: rows(snapshot.requirements) };
}

export function planObligations(plan: FinancialPlanRecommendation) {
  return obligationRows(plan.inputSnapshot.obligations);
}

export function planCommitmentBudgets(plan: FinancialPlanRecommendation): CommitmentBudget[] {
  return [...plan.recommendation.debtReservations, ...plan.recommendation.savingsReservations, ...planObligations(plan).reservations].map((row) => ({ key: commitmentKey(row), amountCentavos: row.amountCentavos }));
}

export function updateCommitmentBudget(plan: FinancialPlanRecommendation, kind: CommitmentKind, index: number, amountCentavos: number): FinancialPlanRecommendation {
  const current = plan.recommendation;
  const rows = kind === "obligations" ? planObligations(plan).reservations : current[kind];
  const row = rows[index];
  if (!row) return plan;
  const updatedRows = rows.map((item, rowIndex) => rowIndex === index ? { ...item, amountCentavos } : item);
  const delta = amountCentavos - row.amountCentavos;
  const availableFundsCentavos = current.availableFundsCentavos - delta;
  const requiredCategoryFunds = current.allocations.reduce((sum, allocation) => sum + allocation.floorAmountCentavos, 0);
  const shortfallCentavos = Math.max(0, requiredCategoryFunds - availableFundsCentavos);
  const inputSnapshot = kind === "obligations" ? { ...plan.inputSnapshot, obligations: { ...plan.inputSnapshot.obligations, reservations: updatedRows } } : plan.inputSnapshot;
  return { ...plan, inputSnapshot, status: shortfallCentavos > 0 ? "INFEASIBLE" : "RECOMMENDATION_READY", recommendation: { ...current, availableFundsCentavos, requiredFundsCentavos: current.requiredFundsCentavos == null ? undefined : current.requiredFundsCentavos + delta, shortfallCentavos, ...(kind === "obligations" ? {} : { [kind]: updatedRows }) } };
}

export type CommitmentSkips = { debtRepayments: boolean; savingsContributions: boolean; scheduledPayments: boolean };

// Nothing skipped: every commitment is reserved at its amount due. Frozen because it is shared as a default.
export const NO_COMMITMENT_SKIPS: CommitmentSkips = Object.freeze({ debtRepayments: false, savingsContributions: false, scheduledPayments: false });

const commitmentKinds = { debtRepayments: "debtReservations", savingsContributions: "savingsReservations", scheduledPayments: "obligations" } as const;

// Types the user budgets manually start at what was already paid towards each row (nothing when unpaid); the rest start at
// their amount due. Only the types whose choice changed are reset.
export function manualCommitmentDraft(draft: CommitmentPreview, preview: CommitmentPreview, previous: CommitmentSkips, next: CommitmentSkips, paidCentavos: Map<string, number> = new Map()): CommitmentPreview {
  const result = { ...draft };
  for (const choice of Object.keys(commitmentKinds) as (keyof CommitmentSkips)[]) {
    if (previous[choice] === next[choice]) continue;
    const kind = commitmentKinds[choice];
    result[kind] = (preview[kind] ?? []).map((row) => next[choice] ? { ...row, amountCentavos: paidCentavos.get(commitmentKey(row)) ?? 0 } : row);
  }
  return result;
}

function selectedCommitments(draft: CommitmentPreview, skips: CommitmentSkips): FinancialPlanReservation[] {
  return [...(skips.debtRepayments ? [] : draft.debtReservations), ...(skips.savingsContributions ? [] : draft.savingsReservations), ...(skips.scheduledPayments ? [] : draft.obligations ?? [])];
}

export function selectedCommitmentBudgets(draft: CommitmentPreview, skips: CommitmentSkips): CommitmentBudget[] {
  return selectedCommitments(draft, skips).map((row) => ({ key: commitmentKey(row), amountCentavos: row.amountCentavos }));
}

export function hasUnderfundedReservation(requirements: FinancialPlanReservation[], reservations: FinancialPlanReservation[]): boolean {
  const due = new Map(requirements.map((row) => [commitmentKey(row), row.amountCentavos]));
  return reservations.some((row) => row.amountCentavos < (due.get(commitmentKey(row)) ?? 0));
}

export function hasUnderfundedCommitment(requirements: CommitmentPreview, draft: CommitmentPreview, skips: CommitmentSkips): boolean {
  return hasUnderfundedReservation([...requirements.debtReservations, ...requirements.savingsReservations, ...(requirements.obligations ?? [])], selectedCommitments(draft, skips));
}

export function commitmentTotals(draft: CommitmentPreview, skips: CommitmentSkips, plannedAmountCentavos: number) {
  const sum = (rows: FinancialPlanReservation[]) => rows.reduce((total, row) => total + row.amountCentavos, 0);
  const savingsCentavos = skips.savingsContributions ? 0 : sum(draft.savingsReservations);
  const debtCentavos = skips.debtRepayments ? 0 : sum(draft.debtReservations);
  const scheduledCentavos = skips.scheduledPayments ? 0 : sum(draft.obligations ?? []);
  return { savingsCentavos, debtCentavos, scheduledCentavos, remainingCentavos: plannedAmountCentavos - savingsCentavos - debtCentavos - scheduledCentavos };
}
