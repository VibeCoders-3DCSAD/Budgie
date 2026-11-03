import { useCallback, useEffect, useRef, useState } from "react";
import { ensureCurrentCreditCardCycles, listCreditCardCycles, listCreditCardCycleTransactions, type CreditCardCycle, type CreditCardCycleTransaction } from "../../../local-db/repositories/credit-cards/creditCardCycles";
import { listCreditCardInstallments, type CreditCardInstallment } from "../../../local-db/repositories/credit-cards/creditCardInstallments";
import { listCreditCardPayments, type CreditCardPayment } from "../../../local-db/repositories/credit-cards/creditCardPayments";
import { listCreditCardStrategies, type CreditCardStrategy } from "../../../local-db/repositories/credit-cards/creditCardRepaymentPlans";
import { listCreditCardSettlements, type CreditCardSettlement } from "../../../local-db/repositories/credit-cards/creditCardSettlements";
import { listCreditCardStatements, type CreditCardStatement } from "../../../local-db/repositories/credit-cards/creditCardStatements";
import { listFinancialAccounts, type FinancialAccount } from "../../../local-db/repositories/foundations/financialFoundations";

export type DebtManagerData = {
  accounts: FinancialAccount[];
  cycles: CreditCardCycle[];
  cycleTransactions: CreditCardCycleTransaction[];
  statements: CreditCardStatement[];
  installments: CreditCardInstallment[];
  payments: CreditCardPayment[];
  strategies: CreditCardStrategy[];
  settlements: CreditCardSettlement[];
};

const EMPTY_DATA: DebtManagerData = { accounts: [], cycles: [], cycleTransactions: [], statements: [], installments: [], payments: [], strategies: [], settlements: [] };

// Active credit cards and their cycles, statements, installments, payments, strategies and settlements.
// error: something could not be loaded; stale: the screen still shows data from an earlier load.
export function useDebtManagerData(userId: string, deviceId: string) {
  const [data, setData] = useState<DebtManagerData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stale, setStale] = useState(false);
  const hasLoadedData = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const accounts = await listFinancialAccounts(userId, { kind: "credit_card", status: "active" });
      setData((current) => ({ ...current, accounts }));
      hasLoadedData.current = accounts.length > 0;

      // A failed cycle catch-up still shows the cycles already stored.
      let cycleLoadFailed = false;
      try {
        await ensureCurrentCreditCardCycles(userId, deviceId);
      } catch (cycleError) {
        cycleLoadFailed = true;
        console.error("[debt-manager] billing cycle load failed", {
          userId,
          error: cycleError instanceof Error ? cycleError.message : "unknown error",
        });
      }
      const [cycles, cycleTransactions, statements, installments, payments, strategies, settlements] = await Promise.all([
        listCreditCardCycles(userId),
        listCreditCardCycleTransactions(userId),
        listCreditCardStatements(userId),
        listCreditCardInstallments(userId),
        listCreditCardPayments(userId),
        listCreditCardStrategies(userId),
        listCreditCardSettlements(userId),
      ]);
      setData({ accounts, cycles, cycleTransactions, statements, installments, payments, strategies, settlements });
      setError(cycleLoadFailed);
      setStale(cycleLoadFailed && hasLoadedData.current);
    } catch (loadError) {
      console.error("[debt-manager] account load failed", {
        userId,
        reason: loadError instanceof Error ? loadError.message : "unknown error",
      });
      setError(true);
      setStale(hasLoadedData.current);
    } finally {
      setLoading(false);
    }
  }, [deviceId, userId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  return { ...data, loading, error, stale, load };
}
