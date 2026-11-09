import { ACCOUNT_IDS } from "./accounts";
import { centavos, monthDay, nextMonthlyDate, practiceId, synced, transaction, type Row, type SeedContext, type SeedPart } from "./context";
import { addMonths } from "../../../../lib/dates";

export const GOAL_IDS = {
  emergency: practiceId("goal:emergency-fund"),
  house: practiceId("goal:house-deposit"),
  japan: practiceId("goal:japan-trip"),
};

// A fully funded emergency fund, a house deposit with monthly transfers, and a trip fund still early on.
export function savingsPart(ctx: SeedContext, months: [string, ...string[]]): SeedPart {
  const current = months[months.length - 1]!;
  const goals = [
    { ...synced(ctx), id: GOAL_IDS.emergency, linked_account_id: ACCOUNT_IDS.emergency, name: "Six-month emergency fund", is_emergency_fund: true, target_amount_centavos: centavos(210_000), starting_amount_centavos: centavos(210_000), emergency_fund_baseline_centavos: centavos(35_000), emergency_fund_target_method: "essential_expense_coverage", essential_expense_coverage_months: 6, priority: "high", status: "active", notes: "Fully funded: six months of essential expenses." },
    { ...synced(ctx), id: GOAL_IDS.house, linked_account_id: ACCOUNT_IDS.house, name: "House deposit", is_emergency_fund: false, target_amount_centavos: centavos(600_000), starting_amount_centavos: centavos(60_000), target_date: monthDay(addMonths(current, 24), 16), priority: "medium", status: "active", planned_contribution_amount_centavos: centavos(20_000), contribution_frequency: "monthly", contribution_interval_count: 1, contribution_day_of_month: 16, next_contribution_date: nextMonthlyDate(ctx.today, 16), notes: "Down payment for a condo unit in two years." },
    { ...synced(ctx), id: GOAL_IDS.japan, linked_account_id: ACCOUNT_IDS.house, name: "Japan trip", is_emergency_fund: false, target_amount_centavos: centavos(80_000), starting_amount_centavos: 0, target_date: monthDay(addMonths(current, 10), 28), priority: "low", status: "active", planned_contribution_amount_centavos: centavos(3_000), contribution_frequency: "monthly", contribution_interval_count: 1, contribution_day_of_month: 28, next_contribution_date: nextMonthlyDate(ctx.today, 28), notes: "Cherry blossom season next spring." },
  ];
  const contributions = [
    { goal: GOAL_IDS.house, key: "house", pesos: 20_000, day: 16, name: "Monthly house deposit" },
    { goal: GOAL_IDS.japan, key: "japan", pesos: 3_000, day: 28, name: "Japan trip fund" },
  ];
  const transactions = [];
  const activities: Row[] = [];
  for (const month of months) {
    for (const contribution of contributions) {
      const date = monthDay(month, contribution.day);
      if (date > ctx.today) continue;
      const row = transaction(ctx, { key: `contribution:${contribution.key}:${month}`, date, type: "transfer", pesos: contribution.pesos, source: ACCOUNT_IDS.payroll, destination: ACCOUNT_IDS.house, merchant: contribution.name, extra: { destination_savings_goal_id: contribution.goal } });
      transactions.push(row);
      activities.push({ ...synced(ctx), id: practiceId(`goal-activity:${contribution.key}:${month}`), savings_goal_id: contribution.goal, transaction_id: row.id, activity_kind: "contribution", amount_centavos: row.amount_centavos, activity_date: date, notes: contribution.name });
    }
  }
  return { tables: { savings_goals: goals, savings_goal_activities: activities }, transactions };
}
