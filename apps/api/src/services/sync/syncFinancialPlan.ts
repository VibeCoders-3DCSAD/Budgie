import type { SupabaseClient } from "@supabase/supabase-js";
import { currentCalendarMonth } from "../../lib/date/manila.js";
import { SYNC_RPCS } from "./constants/entities.js";
import { FINANCIAL_PLAN_CREATE_FIELDS } from "./constants/financialPlans.js";
import { verifyAccountOwnership } from "./syncOwnership.js";
import {
  allowedPayload,
  requireDateString,
  requireString,
  type EntitySyncTable,
  type Payload,
  type SyncContext,
} from "./syncValidation.js";

type AdvisoryTargets = { debtId: string | null; savingsGoalId: string | null };

function requirePlanObject(value: unknown, message: string): Payload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Payload;
}

// Period checks: the plan covers the current calendar month and was accepted.
function validatePlanPeriod(sanitized: Payload): void {
  for (const field of ["period_start", "period_end"]) requireDateString(sanitized, field);
  const start = sanitized.period_start as string;
  const end = sanitized.period_end as string;
  // A plan accepted offline near month end may sync after the month rolls over, so the month that just ended is also accepted.
  const currentPeriod = currentCalendarMonth();
  const previousPeriod = currentCalendarMonth(new Date(Date.parse(`${currentPeriod.start}T00:00:00Z`) - 86_400_000));
  if (![currentPeriod, previousPeriod].some((period) => start === period.start && end === period.end)) throw new Error("Financial Plans can only cover the current calendar month or the one that just ended");
  if (sanitized.status !== "accepted") throw new Error("only accepted Financial Plans can sync");
}

function validateInputSnapshot(sanitized: Payload): Payload {
  const inputSnapshot = requirePlanObject(sanitized.input_snapshot, "input_snapshot must be an object");
  for (const field of ["forecast", "restrictions", "obligations", "debtRequirements", "savingsRequirements", "classification"]) {
    const value = inputSnapshot[field];
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value as Payload).length === 0) throw new Error(`input_snapshot.${field} must contain plan input data`);
  }
  return inputSnapshot;
}

// Returns the debt or savings goal the surplus is pointed at, so their ownership can be checked with the reservations.
async function validateAdvisoryDestination({ supabase, userId }: SyncContext, destination: unknown): Promise<AdvisoryTargets> {
  const none: AdvisoryTargets = { debtId: null, savingsGoalId: null };
  if (destination === null) return none;
  const target = requirePlanObject(destination, "surplusRecommendation destination is invalid");
  if (target.type === "debt") {
    requireString(target, "debtAccountId");
    return { ...none, debtId: target.debtAccountId as string };
  }
  if (target.type === "emergency_fund") {
    requireString(target, "savingsGoalId");
    return { ...none, savingsGoalId: target.savingsGoalId as string };
  }
  if (target.type !== "credit_card") throw new Error("surplusRecommendation destination is invalid");
  requireString(target, "accountId");
  await verifyAccountOwnership(supabase, userId, target.accountId as string);
  return none;
}

async function validateSurplus(ctx: SyncContext, recommendation: Payload): Promise<AdvisoryTargets> {
  let advisory: AdvisoryTargets = { debtId: null, savingsGoalId: null };
  if (recommendation.surplusRecommendation !== undefined) {
    const document = requirePlanObject(recommendation.surplusRecommendation, "surplusRecommendation must be an object");
    assertPlanAmount(document, "unallocatedSurplusCentavos");
    if (!["NEGATIVE_FINANCIAL_MARGIN", "EMERGENCY_FUND_INADEQUATE", "DEBT_SIGNAL", "CREDIT_CARD_SIGNAL", "REWARD_YOURSELF", "USER_DIRECTED", "ASSESSMENT_UNAVAILABLE", "ASSESSMENT_STALE", "ASSESSMENT_INSUFFICIENT_DATA"].includes(document.reasonCode as string)) throw new Error("surplusRecommendation reason code is invalid");
    if (!["applied", "unavailable", "stale", "insufficient_data"].includes(document.assessmentStatus as string)) throw new Error("surplusRecommendation assessment status is invalid");
    advisory = await validateAdvisoryDestination(ctx, document.advisoryDestination);
  }
  for (const field of ["debtSurplusCentavos", "savingsSurplusCentavos"]) {
    if (recommendation[field] !== undefined) assertPlanAmount(recommendation, field);
  }
  for (const field of ["allocations", "debtReservations", "savingsReservations"]) {
    if (!Array.isArray(recommendation[field]) || (recommendation[field] as unknown[]).length > 200) throw new Error(`recommendation.${field} must be a bounded array`);
  }
  return advisory;
}

// Allocations: each targets one category, respects its floor and ceiling, and together with the surplus fits the available funds.
function validateAllocations(recommendation: Payload): void {
  const allocations = recommendation.allocations as Payload[];
  for (const allocation of allocations) {
    if (Boolean(allocation.categoryId) === Boolean(allocation.subcategoryId)) throw new Error("each Financial Plan allocation must reference one category or subcategory");
    if (!["FIXED", "MINIMUM", "FLEXIBLE"].includes(allocation.allocationRule as string)) throw new Error("Financial Plan allocation rule is invalid");
    assertPlanAmount(allocation, "allocatedAmountCentavos");
    assertPlanAmount(allocation, "floorAmountCentavos");
    if ((allocation.allocatedAmountCentavos as number) < (allocation.floorAmountCentavos as number)) throw new Error("Financial Plan allocation does not meet its floor");
    if (allocation.ceilingAmountCentavos != null) {
      assertPlanAmount(allocation, "ceilingAmountCentavos");
      if ((allocation.ceilingAmountCentavos as number) < (allocation.allocatedAmountCentavos as number)) throw new Error("Financial Plan allocation exceeds its ceiling");
    }
    if (allocation.subcategoryWeightBps != null && (!Number.isSafeInteger(allocation.subcategoryWeightBps) || (allocation.subcategoryWeightBps as number) < 0 || (allocation.subcategoryWeightBps as number) > 10_000)) throw new Error("Financial Plan subcategory weight must be between 0 and 10000 basis points");
  }
  assertPlanAmount(recommendation, "availableFundsCentavos");
  const allocatedTotal = allocations.reduce((total, allocation) => total + (allocation.allocatedAmountCentavos as number), 0);
  const surplusTotal = (recommendation.debtSurplusCentavos as number | undefined ?? 0) + (recommendation.savingsSurplusCentavos as number | undefined ?? 0);
  if (allocatedTotal + surplusTotal > (recommendation.availableFundsCentavos as number)) {
    throw new Error("Financial Plan allocations and surplus exceed available funds");
  }
}

// Reservations: each has one target and an amount, and together with the available funds they fit the planning amount.
function validateReservations(inputSnapshot: Payload, recommendation: Payload): void {
  const debtReservations = recommendation.debtReservations as Payload[];
  const savingsReservations = recommendation.savingsReservations as Payload[];
  for (const reservation of debtReservations) {
    if (Boolean(reservation.debtAccountId) === Boolean(reservation.creditCardStatementId)) throw new Error("each debt reservation must reference one debt or statement");
    assertPlanAmount(reservation, "amountCentavos");
  }
  for (const reservation of savingsReservations) {
    requireString(reservation, "savingsGoalId");
    assertPlanAmount(reservation, "amountCentavos");
  }
  const plannedAmount = inputSnapshot.plannedAmountCentavos;
  // Older immutable plans did not snapshot the planning amount.
  if (plannedAmount === undefined) return;
  if (!Number.isSafeInteger(plannedAmount) || (plannedAmount as number) <= 0) throw new Error("Financial Plan planning amount is invalid");
  const obligations = (inputSnapshot.obligations as Payload).reservations;
  let scheduledTotal = 0;
  if (Array.isArray(obligations)) {
    for (const row of obligations as Payload[]) {
      assertPlanAmount(row, "amountCentavos");
      scheduledTotal += row.amountCentavos as number;
    }
  }
  const committed = [...debtReservations, ...savingsReservations].reduce((total, row) => total + (row.amountCentavos as number), scheduledTotal);
  if ((recommendation.availableFundsCentavos as number) + committed > (plannedAmount as number) + 0.001) throw new Error("Financial Plan commitments exceed the planning amount");
}

function stringIds(rows: Payload[], field: string): string[] {
  return rows.flatMap((row) => typeof row[field] === "string" ? [row[field] as string] : []);
}

async function checkOwnedRows(supabase: SupabaseClient, userId: string, table: string, ids: string[]): Promise<{ failed: boolean; missing: boolean }> {
  if (ids.length === 0) return { failed: false, missing: false };
  const uniqueIds = [...new Set(ids)];
  const { data, error } = await supabase.from(table).select("id").in("id", uniqueIds).eq("user_id", userId).eq("deleted", false);
  return { failed: Boolean(error), missing: (data?.length ?? 0) !== uniqueIds.length };
}

// Reference lookups: every category, debt, statement and savings goal the plan points at belongs to the user.
async function verifyPlanReferences({ supabase, userId }: SyncContext, recommendation: Payload, advisory: AdvisoryTargets): Promise<void> {
  const allocations = recommendation.allocations as Payload[];
  const allocationTargets = allocations.map((allocation) => typeof allocation.categoryId === "string" ? `category:${allocation.categoryId}` : `subcategory:${allocation.subcategoryId}`);
  if (new Set(allocationTargets).size !== allocationTargets.length) throw new Error("Financial Plan allocations cannot target the same category or subcategory twice");
  await verifyFinancialPlanAllocationReferences(supabase, userId, stringIds(allocations, "categoryId"), stringIds(allocations, "subcategoryId"));

  const debtReservations = recommendation.debtReservations as Payload[];
  const debtIds = stringIds(debtReservations, "debtAccountId");
  if (advisory.debtId) debtIds.push(advisory.debtId);
  const statementIds = stringIds(debtReservations, "creditCardStatementId");
  const savingsGoalIds = (recommendation.savingsReservations as Payload[]).map((reservation) => reservation.savingsGoalId as string);
  if (advisory.savingsGoalId) savingsGoalIds.push(advisory.savingsGoalId);

  const lookups: [string, string[]][] = [["debt_accounts", debtIds], ["credit_card_statements", statementIds], ["savings_goals", savingsGoalIds]];
  const results = await Promise.all(lookups.map(([table, ids]) => checkOwnedRows(supabase, userId, table, ids)));
  if (results.some((result) => result.failed)) throw new Error("Financial Plan reservation validation failed");
  if (results.some((result) => result.missing)) throw new Error("Financial Plan reservation is not accessible");
}

async function validateFinancialPlanCreate(ctx: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, FINANCIAL_PLAN_CREATE_FIELDS);
  validatePlanPeriod(sanitized);
  const inputSnapshot = validateInputSnapshot(sanitized);
  const recommendation = requirePlanObject(sanitized.recommendation, "recommendation must be an object");
  const advisory = await validateSurplus(ctx, recommendation);
  validateAllocations(recommendation);
  validateReservations(inputSnapshot, recommendation);
  await verifyPlanReferences(ctx, recommendation, advisory);
  return sanitized;
}

function assertPlanAmount(payload: Payload, field: string): void {
  if (typeof payload[field] !== "number" || !Number.isFinite(payload[field]) || (payload[field] as number) < 0 || (payload[field] as number) > Number.MAX_SAFE_INTEGER) throw new Error(`${field} must be a finite non-negative amount`);
}

async function verifyFinancialPlanAllocationReferences(
  supabase: SupabaseClient,
  userId: string,
  categoryIds: string[],
  subcategoryIds: string[],
): Promise<void> {
  const [categories, subcategories] = await Promise.all([
    categoryIds.length ? supabase.from("categories").select("id").in("id", [...new Set(categoryIds)]).eq("deleted", false).eq("is_active", true).eq("user_id", userId) : Promise.resolve({ data: [], error: null }),
    subcategoryIds.length ? supabase.from("subcategories").select("id, category_id").in("id", [...new Set(subcategoryIds)]).eq("deleted", false).eq("is_active", true).eq("kind", "expense").eq("user_id", userId) : Promise.resolve({ data: [], error: null }),
  ]);
  if (categories.error) throw new Error(`category validation failed: ${categories.error.message}`);
  if (subcategories.error) throw new Error(`subcategory validation failed: ${subcategories.error.message}`);
  if ((categories.data?.length ?? 0) !== new Set(categoryIds).size || (subcategories.data?.length ?? 0) !== new Set(subcategoryIds).size) throw new Error("Financial Plan allocation reference is not accessible");
  const selectedCategoryIds = new Set(categoryIds);
  if ((subcategories.data ?? []).some((subcategory) => selectedCategoryIds.has(subcategory.category_id))) throw new Error("Financial Plan cannot allocate both a category and one of its subcategories");
}

export const syncFinancialPlan: EntitySyncTable = {
  financial_plans: {
    rpc: SYNC_RPCS.financialPlan,
    create: validateFinancialPlanCreate,
    update: () => {
      throw new Error("accepted Financial Plans are immutable");
    },
  },
};
