import { commitmentKey, type CommitmentBudget } from "../../../financial-plan/helpers/commitmentBudget";
import type { FinancialPlanAllocation, FinancialPlanRecommendation, FinancialPlanReservation } from "../../../financial-plan/types";
import type { ManualPlanAllocation } from "../../../financial-plan/api";
import { DEBT_IDS } from "../seed/debts";
import { practiceAssessment } from "./classification";
import { practiceCommitments } from "./commitments";
import { monthlySpendBySubcategory, type PracticeData } from "./practiceData";
import { planExplanations } from "./explanations";
import { PRACTICE_MODEL_VERSION } from "./forecast";

export type RecommendationInput = {
  includedSubcategoryIds: string[]; includedCategoryIds: string[]; plannedAmountCentavos: number; manualAllocations: ManualPlanAllocation[];
  skipDebtRepayments: boolean; skipSavingsContributions: boolean; skipScheduledPayments: boolean; commitmentBudgets?: CommitmentBudget[];
};

type Target = { target: "category" | "subcategory"; id: string; label: string; forecast: number; manual?: number };

// A plan for the picked categories: commitments are reserved first, then each category gets its usual
// spending, scaled down to fit when the planning amount is short.
export function practiceRecommendation(data: PracticeData, input: RecommendationInput): FinancialPlanRecommendation {
  const preview = practiceCommitments(data);
  const budgets = new Map((input.commitmentBudgets ?? []).map((budget) => [budget.key, budget.amountCentavos]));
  const budgeted = (rows: FinancialPlanReservation[], skip: boolean) => skip ? [] : rows.map((row) => ({ ...row, amountCentavos: budgets.get(commitmentKey(row)) ?? row.amountCentavos }));
  const debtReservations = budgeted(preview.debtReservations, input.skipDebtRepayments);
  const savingsReservations = budgeted(preview.savingsReservations, input.skipSavingsContributions);
  const obligations = budgeted(preview.obligations ?? [], input.skipScheduledPayments);
  const reserved = [...debtReservations, ...savingsReservations, ...obligations].reduce((sum, row) => sum + row.amountCentavos, 0);
  const available = input.plannedAmountCentavos - reserved;

  const targets = planTargets(data, input);
  const allocations = allocate(targets, available);
  const allocated = allocations.reduce((sum, row) => sum + row.allocatedAmountCentavos, 0);
  const floors = allocations.reduce((sum, row) => sum + row.floorAmountCentavos, 0);
  const shortfall = Math.max(0, reserved + floors - input.plannedAmountCentavos);
  const surplus = Math.max(0, available - allocated);
  const explanations = planExplanations(allocations, targets, surplus);
  const motorcycle = data.seed.debt_accounts.find((debt) => debt.id === DEBT_IDS.motorcycle);
  return {
    status: shortfall > 0 ? "INFEASIBLE" : "RECOMMENDATION_READY",
    period: preview.period,
    inputSnapshot: {
      commitmentSelection: { debtRepayments: !input.skipDebtRepayments, savingsContributions: !input.skipSavingsContributions, scheduledPayments: !input.skipScheduledPayments },
      plannedAmountCentavos: input.plannedAmountCentavos,
      // The same snapshot shape the server sends: createFinancialPlan rejects a plan without it.
      forecast: planForecastSnapshot(data, preview.period.start, targets),
      restrictions: { allocations: targets.map((target) => ({ id: target.id, target: target.target, forecastCentavos: target.forecast })) },
      obligations: { reservations: obligations, requirements: preview.obligations ?? [] },
      debtRequirements: { reservations: preview.debtReservations, surplusCentavos: 0 },
      savingsRequirements: { reservations: preview.savingsReservations, surplusCentavos: 0 },
      classification: { outputSnapshot: practiceAssessment(data), assessedAt: `${data.today}T00:00:00.000Z` },
    },
    recommendation: {
      availableFundsCentavos: available, requiredFundsCentavos: reserved + floors, shortfallCentavos: shortfall, allocations,
      debtReservations, debtSurplusCentavos: 0, savingsReservations, savingsSurplusCentavos: 0,
      surplusRecommendation: {
        unallocatedSurplusCentavos: surplus, reasonCode: "DEBT_SIGNAL", assessmentStatus: "applied",
        advisoryDestination: surplus > 0 && motorcycle ? { type: "debt", debtAccountId: String(motorcycle.id), label: String(motorcycle.name) } : null,
        assessmentEvidence: null,
      },
    },
    explanations,
    explanationRequest: { practice: true, explanations },
  };
}

function planForecastSnapshot(data: PracticeData, periodStart: string, targets: Target[]) {
  const categoryForecasts = targets.map((target) => ({ category: target.id, amountCentavos: target.forecast }));
  return {
    month: periodStart.slice(0, 7), categoryForecasts, quality: "PERSONALIZED",
    totalAmountCentavos: categoryForecasts.reduce((sum, point) => sum + point.amountCentavos, 0),
    modelVersion: PRACTICE_MODEL_VERSION, generatedAt: `${data.today}T00:00:00.000Z`,
  };
}

function planTargets(data: PracticeData, input: RecommendationInput): Target[] {
  const spend = monthlySpendBySubcategory(data);
  const manual = new Map(input.manualAllocations.map((row) => [`${row.target}:${row.id}`, row.amountCentavos]));
  const subcategories = new Map(data.taxonomy.subcategories.map((row) => [String(row.id), row]));
  const categories = new Map(data.taxonomy.categories.map((row) => [String(row.id), row]));
  return [
    ...input.includedCategoryIds.map((id) => ({
      target: "category" as const, id, label: String(categories.get(id)?.label ?? "Category"),
      forecast: data.taxonomy.subcategories.filter((row) => row.category_id === id).reduce((sum, row) => sum + (spend.get(String(row.id)) ?? 0), 0),
      manual: manual.get(`category:${id}`),
    })),
    ...input.includedSubcategoryIds.map((id) => ({
      target: "subcategory" as const, id, label: String(subcategories.get(id)?.label ?? "Subcategory"),
      forecast: spend.get(id) ?? 0, manual: manual.get(`subcategory:${id}`),
    })),
  ];
}

// Manual amounts are kept as set; the rest share what is left in proportion to their usual spending.
function allocate(targets: Target[], available: number): FinancialPlanAllocation[] {
  const manualTotal = targets.reduce((sum, target) => sum + (target.manual ?? 0), 0);
  const flexible = targets.filter((target) => target.manual === undefined);
  const wanted = flexible.reduce((sum, target) => sum + target.forecast, 0);
  const room = Math.max(0, available - manualTotal);
  const scale = wanted > room && wanted > 0 ? room / wanted : 1;
  return targets.map((target) => {
    const amount = target.manual ?? Math.floor(target.forecast * scale);
    const floor = target.manual ?? Math.floor(target.forecast * 0.6);
    return {
      categoryId: target.target === "category" ? target.id : null, subcategoryId: target.target === "subcategory" ? target.id : null,
      allocationRule: target.manual === undefined ? "FLEXIBLE" : "FIXED", allocatedAmountCentavos: amount, floorAmountCentavos: Math.min(floor, amount),
      ceilingAmountCentavos: target.manual ?? null, forecastAmountCentavos: target.forecast, label: target.label,
    };
  });
}
