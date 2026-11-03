// Public entry point for financial accounts, credit-card details and income sources.
// The implementations live in the domain modules next to this file.

export type {
  CreateFinancialAccountInput,
  CreditCardDetails,
  CreditCardDetailsInput,
  CreditCardRepaymentStrategy,
  FinancialAccount,
  FinancialAccountKind,
  FinancialAccountStatus,
  UpdateFinancialAccountInput,
} from "./financialAccountModel";
export type {
  CreateIncomeSourceInput,
  IncomeFrequency,
  IncomeSource,
  UpdateIncomeSourceInput,
} from "./incomeSourceModel";
export type { IncomeSchedule } from "./incomeSchedule";
export { incomeScheduleError } from "./incomeSchedule";
export { reconcileCreditCardAvailableCredit } from "./creditCardDetails";
export {
  createFinancialAccount,
  deleteFinancialAccount,
  getFinancialAccount,
  listAccountOptions,
  listFinancialAccounts,
  updateFinancialAccount,
} from "./financialAccounts";
export type { AccountOption, FinancialAccountFilter } from "./financialAccounts";
export {
  createIncomeSource,
  deleteIncomeSource,
  getIncomeSource,
  listIncomeSources,
  updateIncomeSource,
} from "./incomeSources";
