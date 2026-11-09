import type { Transaction } from "./context";

const TYPE_ORDER = { income: 0, transfer: 1, expense: 2 };

// Replays the ledger day by day (income before spending) from the opening balances. Throws if any account
// in `guarded` dips below zero, so the practice data never shows an overdrawn wallet.
export function replayBalances(opening: Record<string, number>, transactions: Transaction[], guarded: string[]): Record<string, number> {
  const balances = { ...opening };
  const ordered = [...transactions].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date) || TYPE_ORDER[a.transaction_type] - TYPE_ORDER[b.transaction_type]);
  for (const row of ordered) {
    for (const [accountId, sign] of [[row.source_account_id, -1], [row.destination_account_id, 1]] as const) {
      const balance = accountId ? balances[accountId] : undefined;
      if (!accountId || balance === undefined) continue;
      balances[accountId] = balance + sign * row.amount_centavos;
      if (guarded.includes(accountId) && balances[accountId]! < 0) {
        throw new Error(`Practice data overdraws ${accountId} on ${row.transaction_date}.`);
      }
    }
  }
  return balances;
}
