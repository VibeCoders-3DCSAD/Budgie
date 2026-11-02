const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ownership and live balances are checked under database locks by the sync RPC.
export function validateSavingsExpenseWithdrawalPayload(value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 100) throw new Error("savings_goal_withdrawals must contain at most 100 goals");
  const goals = new Set<string>();
  const ids = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).sort().join(",") !== "amount_centavos,id,savings_goal_id"
      || typeof entry.id !== "string" || !UUID.test(entry.id)
      || typeof entry.savings_goal_id !== "string" || !UUID.test(entry.savings_goal_id)
      || !Number.isSafeInteger(entry.amount_centavos) || entry.amount_centavos <= 0
      || goals.has(entry.savings_goal_id) || ids.has(entry.id)) throw new Error("invalid savings goal withdrawal split");
    goals.add(entry.savings_goal_id); ids.add(entry.id);
  }
}
