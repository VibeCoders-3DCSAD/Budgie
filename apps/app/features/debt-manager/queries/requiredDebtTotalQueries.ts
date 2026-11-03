import { listCreditCardCycles, listCreditCardCycleTransactions } from "../../../local-db/repositories/credit-cards/creditCardCycles";
import { listCreditCardPayments } from "../../../local-db/repositories/credit-cards/creditCardPayments";
import { listCreditCardStrategies } from "../../../local-db/repositories/credit-cards/creditCardRepaymentPlans";
import { listCreditCardStatements } from "../../../local-db/repositories/credit-cards/creditCardStatements";
import { listDebtAccounts } from "../../../local-db/repositories/debts/debtAccounts";
import { listAllDebtPayments } from "../../../local-db/repositories/debts/debtPayments";
import { listFinancialAccounts } from "../../../local-db/repositories/foundations/financialFoundations";
import { getRequiredDebtTotal, type RequiredDebtTotal } from "../helpers/requiredDebtTotal";

export type RequiredDebtTotalForPeriod = RequiredDebtTotal & {
  accountNames: Record<string, string>;
};

export async function getRequiredDebtTotalForPeriod(
  userId: string,
  periodStart: string,
  periodEnd: string,
): Promise<RequiredDebtTotalForPeriod> {
  const [debts, creditCards, creditCardCycles, creditCardCycleTransactions, creditCardStatements, creditCardStrategies, creditCardPayments, debtPayments] = await Promise.all([
    listDebtAccounts(userId, "all"),
    // Only active credit cards have obligations, so the other accounts are never read.
    listFinancialAccounts(userId, { kind: "credit_card", status: "active" }),
    listCreditCardCycles(userId),
    listCreditCardCycleTransactions(userId),
    listCreditCardStatements(userId),
    listCreditCardStrategies(userId),
    listCreditCardPayments(userId),
    listAllDebtPayments(userId),
  ]);

  const total = getRequiredDebtTotal({
    periodStart,
    periodEnd,
    debts,
    creditCards,
    creditCardCycles,
    creditCardCycleTransactions,
    creditCardStatements,
    creditCardStrategies,
    creditCardPayments,
    debtPayments,
  });
  return {
    ...total,
    accountNames: Object.fromEntries([
      ...debts.map((debt) => [debt.id, debt.name]),
      ...creditCards.map((card) => [card.id, card.name]),
    ]),
  };
}
