import type { SavingsExpenseWithdrawal } from "../savings/savingsExpenseFunding";
import type { CreateCreditCardInstallmentInput } from "../credit-cards/creditCardInstallments";

export type TransactionListRow = {
  id: string;
  name: string;
  category_label: string | null;
  icon_key: string | null;
  color_hex: string | null;
  financial_account_name: string | null;
  amount_centavos: number;
  transaction_date: string;
  transaction_type: string;
  // 1 when the transaction pays a biller or remittance.
  is_scheduled_payment: number;
  created_at: string;
  row_id: number;
};

export type Transaction = {
  id: string;
  transaction_type: string;
  status: string;
  entry_source: string;
  transaction_date: string;
  posted_at: string | null;
  credit_card_posting_date: string | null;
  amount_centavos: number;
  subcategory_id: string | null;
  source_account_id: string | null;
  destination_account_id: string | null;
  destination_savings_goal_id?: string | null;
  source_savings_goal_id?: string | null;
  recurring_template_id: string | null;
  merchant_name: string | null;
  counterparty_name: string | null;
  notes: string | null;
  client_mutation_id: string | null;
};

export type TransactionListItem = TransactionListRow;

// "recurring" marks an automatic post (an income payday or a biller auto-post); the server jobs write the same.
export type TransactionEntrySource = "manual" | "recurring";

export type CreateIncomeInput = {
  entry_source?: TransactionEntrySource;
  amount_centavos: number;
  destination_account_id: string;
  subcategory_id: string;
  transaction_date: string;
  merchant_name?: string;
  counterparty_name?: string;
  notes?: string;
};

export type CreateExpenseInput = {
  entry_source?: TransactionEntrySource;
  savings_goal_withdrawals?: SavingsExpenseWithdrawal[];
  amount_centavos: number;
  source_account_id: string;
  subcategory_id: string;
  transaction_date: string;
  credit_card_posting_date?: string | null;
  merchant_name?: string;
  counterparty_name?: string;
  notes?: string;
  client_mutation_id?: string;
  installment?: CreateCreditCardInstallmentInput;
};

// Only a biller or remittance payment may be an uncategorized expense. It is marked by a client_mutation_id
// naming the scheduled payment; the server enforces the same rule.
export const BILLER_PAYMENT_MUTATION_PREFIX = "scheduled-payment:";
export type ExpenseInsertInput = Omit<CreateExpenseInput, "subcategory_id"> & { subcategory_id: string | null };

export type CreateTransferInput = {
  amount_centavos: number;
  source_account_id: string;
  destination_account_id: string;
  transaction_date: string;
  notes?: string;
  source_savings_goal_id?: string | null;
  destination_savings_goal_id?: string | null;
};

export type UpdateTransactionInput = {
  savings_goal_withdrawals?: SavingsExpenseWithdrawal[];
  amount_centavos?: number;
  subcategory_id?: string;
  source_account_id?: string;
  destination_account_id?: string;
  transaction_date?: string;
  credit_card_posting_date?: string | null;
  merchant_name?: string;
  counterparty_name?: string;
  notes?: string;
};

export type TransactionFilters = {
  transaction_type?: string;
  category_id?: string;
  status?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  sort_by?: string;
  sort_dir?: string;
  limit?: number;
  offset?: number;
  // Keyset cursor: the last row of the previous page. Takes precedence over offset.
  after?: Pick<TransactionListItem, "transaction_date" | "amount_centavos" | "created_at" | "row_id">;
};
