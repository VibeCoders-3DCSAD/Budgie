import type { DebtAccount } from "../../../local-db/repositories/debts/debtAccounts";
import type { DebtPriority, DebtStrategy } from "../../../local-db/repositories/debts/debtRepaymentPlans";

type AllocatableDebt = Pick<DebtAccount, "id" | "status" | "currentBalanceCentavos" | "minimumPaymentCentavos" | "annualInterestRateBps" | "allowsExtraPayments"> & {
  type?: DebtAccount["type"];
};

export type DebtRepaymentAllocation = {
  requiredPaymentCentavos: number;
  surplusCentavos: number;
  shortfallCentavos: number;
  allocations: Map<string, number>;
};

function strategyOrder(strategy: DebtStrategy, debts: AllocatableDebt[]) {
  return [...debts].sort((left, right) => {
    if (strategy === "snowball") {
      return left.currentBalanceCentavos - right.currentBalanceCentavos
        || right.annualInterestRateBps - left.annualInterestRateBps
        || left.id.localeCompare(right.id);
    }
    return right.annualInterestRateBps - left.annualInterestRateBps
      || left.currentBalanceCentavos - right.currentBalanceCentavos
      || left.id.localeCompare(right.id);
  });
}

export function allocateDebtRepayments({
  debts,
  debtBudgetCentavos,
  strategy,
  priorities = [],
}: {
  debts: AllocatableDebt[];
  debtBudgetCentavos: number;
  strategy: DebtStrategy;
  priorities?: DebtPriority[];
}): DebtRepaymentAllocation {
  const activeDebts = debts.filter((debt) => debt.status === "active" && debt.currentBalanceCentavos > 0);
  const requiredPaymentCentavos = activeDebts.reduce((total, debt) => total + Math.min(debt.minimumPaymentCentavos, debt.currentBalanceCentavos), 0);
  const availableCentavos = Math.max(0, debtBudgetCentavos);
  const shortfallCentavos = Math.max(0, requiredPaymentCentavos - availableCentavos);
  let remainingSurplusCentavos = Math.max(0, availableCentavos - requiredPaymentCentavos);
  const allocations = new Map(activeDebts.map((debt) => [debt.id, Math.min(debt.minimumPaymentCentavos, debt.currentBalanceCentavos)]));
  const activeById = new Map(activeDebts.map((debt) => [debt.id, debt]));
  const prioritized = priorities
    .slice()
    .sort((left, right) => left.priorityRank - right.priorityRank)
    .map((priority) => activeById.get(priority.debtAccountId))
    .filter((debt): debt is AllocatableDebt => debt !== undefined && debt.type !== "salary_loan" && debt.allowsExtraPayments === true);
  const prioritizedIds = new Set(prioritized.map((debt) => debt.id));
  const orderedDebts = [...prioritized, ...strategyOrder(strategy, activeDebts.filter((debt) => debt.type !== "salary_loan" && debt.allowsExtraPayments === true && !prioritizedIds.has(debt.id)))];

  for (const debt of orderedDebts) {
    if (remainingSurplusCentavos <= 0) break;
    const currentAllocation = allocations.get(debt.id) ?? 0;
    const extraCentavos = Math.min(remainingSurplusCentavos, debt.currentBalanceCentavos - currentAllocation);
    allocations.set(debt.id, currentAllocation + extraCentavos);
    remainingSurplusCentavos -= extraCentavos;
  }

  return {
    requiredPaymentCentavos,
    surplusCentavos: Math.max(0, availableCentavos - requiredPaymentCentavos),
    shortfallCentavos,
    allocations,
  };
}
