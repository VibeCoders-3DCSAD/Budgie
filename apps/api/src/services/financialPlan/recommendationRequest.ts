import { FinancialPlanInputError } from "./errors.js";
import { validateCommitmentBudgets, type CommitmentBudget } from "./commitments.js";
import { financialPlanPeriod } from "./period.js";

export type ManualAllocation = { target: "category" | "subcategory"; id: string; amountCentavos: number };
export type ReservationSkips = { skipDebtRepayments?: boolean; skipSavingsContributions?: boolean; skipScheduledPayments?: boolean; commitmentBudgets?: CommitmentBudget[] };

export type RecommendationRequest = {
  plannedAmountCentavos: number;
  includedSubcategoryIds: string[];
  includedCategoryIds: string[];
  manualAllocations: ManualAllocation[];
  reservationSkips: ReservationSkips;
  planMonth?: string;
};

const MAX_INCLUDED_IDS = 200;
const MAX_ID_LENGTH = 128;
const MAX_PLANNED_CENTAVOS = 100_000_000_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isValidId(id: unknown): id is string {
  return typeof id === "string" && !!id.trim() && id.length <= MAX_ID_LENGTH;
}

function parseIncludedIds(ids: unknown): string[] {
  if (ids === undefined) return [];
  if (!Array.isArray(ids) || ids.length > MAX_INCLUDED_IDS || !ids.every(isValidId)) throw new FinancialPlanInputError("Included categories are invalid");
  return [...new Set(ids.map((id) => id.trim()))];
}

function parsePlannedAmount(amount: unknown): number {
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_PLANNED_CENTAVOS) throw new FinancialPlanInputError("Planning amount is invalid");
  return amount;
}

function parseManualAllocation(allocation: unknown, plannedAmountCentavos: number): ManualAllocation {
  if (!isPlainObject(allocation)) throw new FinancialPlanInputError("Manual category allocations are invalid");
  const { target, id, amountCentavos } = allocation;
  const validTarget = target === "category" || target === "subcategory";
  const validAmount = typeof amountCentavos === "number" && Number.isSafeInteger(amountCentavos) && amountCentavos > 0 && amountCentavos <= plannedAmountCentavos;
  if (!validTarget || !isValidId(id) || !validAmount) throw new FinancialPlanInputError("Manual category allocations are invalid");
  return { target, id: id.trim(), amountCentavos };
}

function parseManualAllocations(value: unknown, plannedAmountCentavos: number): ManualAllocation[] {
  if (value !== undefined && (!Array.isArray(value) || value.length > MAX_INCLUDED_IDS)) throw new FinancialPlanInputError("Manual category allocations are invalid");
  const allocations = ((value ?? []) as unknown[]).map((allocation) => parseManualAllocation(allocation, plannedAmountCentavos));
  if (new Set(allocations.map((allocation) => `${allocation.target}:${allocation.id}`)).size !== allocations.length) throw new FinancialPlanInputError("Manual category allocations are invalid");
  return allocations;
}

function parseSkip(skip: unknown, fallback: boolean): boolean {
  if (skip !== undefined && typeof skip !== "boolean") throw new FinancialPlanInputError("Reservation skips are invalid");
  return skip ?? fallback;
}

function parsePlanMonth(planMonth: unknown): string | undefined {
  if (planMonth === undefined) return undefined;
  if (typeof planMonth !== "string") throw new FinancialPlanInputError("Plan month is invalid");
  financialPlanPeriod(planMonth);
  return planMonth;
}

// Throws FinancialPlanInputError for any invalid field.
export function parseRecommendationRequest(body: unknown): RecommendationRequest {
  if (!isPlainObject(body)) throw new FinancialPlanInputError("Planning amount is invalid");
  const includedSubcategoryIds = parseIncludedIds(body.includedSubcategoryIds);
  const includedCategoryIds = parseIncludedIds(body.includedCategoryIds);
  if (includedSubcategoryIds.length + includedCategoryIds.length > MAX_INCLUDED_IDS) throw new FinancialPlanInputError("Included subcategories are invalid");
  const plannedAmountCentavos = parsePlannedAmount(body.plannedAmountCentavos);
  const manualAllocations = parseManualAllocations(body.manualAllocations, plannedAmountCentavos);
  // Billers and remittances were always planned before they could be skipped, so older clients keep them included.
  const skipDebtRepayments = parseSkip(body.skipDebtRepayments, true);
  const skipSavingsContributions = parseSkip(body.skipSavingsContributions, true);
  const skipScheduledPayments = parseSkip(body.skipScheduledPayments, false);
  const planMonth = parsePlanMonth(body.planMonth);

  const commitmentBudgets = validateCommitmentBudgets(body.commitmentBudgets);
  const budgetsSent = body.commitmentBudgets !== undefined;
  if ((!skipDebtRepayments || !skipSavingsContributions) && !budgetsSent) {
    throw new FinancialPlanInputError("Review savings and debt amounts before recommending category budgets");
  }

  const reservationSkips: ReservationSkips = { skipDebtRepayments, skipSavingsContributions, skipScheduledPayments };
  if (budgetsSent) reservationSkips.commitmentBudgets = commitmentBudgets;
  return { plannedAmountCentavos, includedSubcategoryIds, includedCategoryIds, manualAllocations, reservationSkips, planMonth };
}
