import { addDays, addMonths } from "../../../lib/dates";
import { categorySlugBySubcategory, monthlySpendBySubcategory, type PracticeData } from "./fixtures/practiceData";
import { practiceRecommendation } from "./fixtures/recommendation";
import { centavos, practiceMonths, practiceId, synced, type Row, type SeedContext } from "./seed/context";
import type { PracticeSeed } from "./seed";
import type { Taxonomy } from "./taxonomy";

// Andrea's monthly take-home pay: salary plus freelance work.
const PLANNED_PESOS = 81_000;

// Accepted plans for the last two completed months, so Past Financial Plans has history to show. Each is
// built by the same fixture that answers the tour's own plan, as of that month.
export function withPastPlans(seed: PracticeSeed, taxonomy: Taxonomy, ctx: SeedContext): PracticeSeed {
  const months = practiceMonths(ctx.today).slice(1, -1);
  return { ...seed, financial_plans: months.map((month) => pastPlan(seed, taxonomy, ctx, month)) };
}

function pastPlan(seed: PracticeSeed, taxonomy: Taxonomy, ctx: SeedContext, month: string): Row {
  const data: PracticeData = { today: month, seed, taxonomy };
  const plan = practiceRecommendation(data, {
    includedSubcategoryIds: [], includedCategoryIds: spentCategories(data), plannedAmountCentavos: centavos(PLANNED_PESOS),
    manualAllocations: [], skipDebtRepayments: false, skipSavingsContributions: false, skipScheduledPayments: false,
  });
  const forecast = plan.inputSnapshot.forecast as { month: string; totalAmountCentavos: number; modelVersion: string; generatedAt: string; quality: string };
  const accepted = `${addDays(month, -1)}T04:00:00.000Z`;
  return {
    ...synced(ctx), id: practiceId(`plan:${month}`), period_start: month, period_end: addDays(addMonths(month, 1), -1), status: "accepted",
    forecast_month: forecast.month, forecast_total_centavos: forecast.totalAmountCentavos, forecast_model_version: forecast.modelVersion,
    forecast_generated_at: forecast.generatedAt, forecast_quality: forecast.quality,
    available_funds_centavos: plan.recommendation.availableFundsCentavos, required_funds_centavos: plan.recommendation.requiredFundsCentavos ?? null,
    shortfall_centavos: plan.recommendation.shortfallCentavos ?? null, debt_surplus_centavos: 0, savings_surplus_centavos: 0,
    input_snapshot_json: plan.inputSnapshot, recommendation_json: plan.recommendation, created_at: accepted, updated_at: accepted,
  };
}

// Parent categories she spent on in the months before the plan, as the plan screen would preselect them.
function spentCategories(data: PracticeData): string[] {
  const slugs = categorySlugBySubcategory(data.taxonomy);
  const spent = new Set([...monthlySpendBySubcategory(data).keys()].map((id) => slugs.get(id)));
  return data.taxonomy.categories.filter((row) => spent.has(String(row.slug))).map((row) => String(row.id));
}
