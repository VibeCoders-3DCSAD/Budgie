type ForecastTransaction = {
  id: string;
  amount_centavos: number;
  transaction_date: string;
  transaction_type: string;
  subcategory_id: string | null;
};

// The history the plan's forecast reads: the last twelve months of spending in every category, without scheduled
// payments, which the plan reserves at their set amounts instead, or payments that come back in certain months,
// which are added back in their months. Transfers are not spending, and the forecast rejects them.
export function planForecastTransactions(cleanTransactions: ForecastTransaction[], recurringIds: Set<string>, scheduledRecords: Array<{ transaction_id: string }>, categorySlugBySubcategoryId: Map<string, string | undefined>, historyStart: string) {
  const scheduledTransactionIds = new Set(scheduledRecords.map((record) => record.transaction_id));
  return cleanTransactions.flatMap((transaction) => transaction.transaction_type === "expense" && transaction.transaction_date >= historyStart && transaction.amount_centavos > 0 && !scheduledTransactionIds.has(transaction.id) && !recurringIds.has(transaction.id)
    ? [{
      transactionId: transaction.id,
      date: transaction.transaction_date,
      amount: transaction.amount_centavos / 100,
      category: (transaction.subcategory_id ? categorySlugBySubcategoryId.get(transaction.subcategory_id) : undefined) ?? "Other",
      transactionType: "expense" as const,
    }]
    : []);
}

export function excludeUnusualTransactions<T extends { id: string }>(transactions: T[], unusualTransactionIds: Set<string>): T[] {
  return transactions.filter((transaction) => !unusualTransactionIds.has(transaction.id));
}
