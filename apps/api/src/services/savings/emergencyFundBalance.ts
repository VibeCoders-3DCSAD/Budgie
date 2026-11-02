import type { SupabaseClient } from "@supabase/supabase-js";

type SavingsGoalActivity = { activity_kind: string; amount_centavos: number | string };

function sumActivity(activities: SavingsGoalActivity[], kind: "contribution" | "withdrawal"): number {
  return activities.filter((activity) => activity.activity_kind === kind).reduce((sum, activity) => sum + Number(activity.amount_centavos), 0);
}

// The active emergency-fund goal's balance in pesos, never below zero. Null when there is no such goal or it cannot be read.
export async function resolveEmergencyFundBalance(userId: string, supabase: SupabaseClient): Promise<number | null> {
  const { data: goal, error: goalError } = await supabase
    .from("savings_goals")
    .select("id, starting_amount_centavos")
    .eq("user_id", userId)
    .eq("is_emergency_fund", true)
    .eq("status", "active")
    .eq("deleted", false)
    .maybeSingle();
  if (goalError || !goal) {
    console.info("financial classification emergency fund source", { user_id: userId, has_emergency_fund: false });
    return null;
  }

  const { data: activities, error: activityError } = await supabase
    .from("savings_goal_activities")
    .select("activity_kind, amount_centavos")
    .eq("user_id", userId)
    .eq("savings_goal_id", goal.id)
    .eq("deleted", false);
  if (activityError) return null;

  const contributionCentavos = sumActivity(activities ?? [], "contribution");
  const withdrawalCentavos = sumActivity(activities ?? [], "withdrawal");
  const balanceCentavos = Number(goal.starting_amount_centavos) + contributionCentavos - withdrawalCentavos;
  // Amounts are personal financial data; the goal id is enough to trace the source.
  console.info("financial classification emergency fund source", {
    user_id: userId,
    goal_id: goal.id,
    has_emergency_fund: true,
    activity_count: activities?.length ?? 0,
  });
  return Math.max(0, balanceCentavos) / 100;
}
