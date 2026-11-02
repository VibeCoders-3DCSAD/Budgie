const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateSavingsGoalContributionPayload(value: unknown): void {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "activity_id,savings_goal_id"
    || !("savings_goal_id" in value) || typeof value.savings_goal_id !== "string" || !UUID.test(value.savings_goal_id)
    || !("activity_id" in value) || typeof value.activity_id !== "string" || !UUID.test(value.activity_id)) throw new Error("invalid savings goal contribution");
}
