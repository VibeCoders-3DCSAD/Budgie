import type { CommitmentPayment } from "../../financial-plan/helpers/commitmentPayments";
import type { FinancialPlanRepayment } from "./financialPlanRepayments";
import type { DebtExtraReason, DebtSurplusPlan } from "./debtSurplusPlan";

// One row per plan payment: the required repayment plus any strategy extra on the same debt.
export type DebtPlanRow = {
  id: string;
  label: string;
  dueDate?: string | null;
  requiredCentavos: number;
  extraCentavos: number;
  extraReason: DebtExtraReason | null;
  payment?: CommitmentPayment;
  extraPaidBeyondPlanCentavos: number;
};

function combinedPayment(payment: CommitmentPayment, extraCentavos: number, extraPaidCentavos: number): CommitmentPayment {
  const paidCentavos = payment.paidCentavos + extraPaidCentavos;
  const dueCentavos = payment.dueCentavos + extraCentavos;
  if (paidCentavos >= dueCentavos) return { paidCentavos, dueCentavos, status: "paid" };
  if (paidCentavos > 0) return { paidCentavos, dueCentavos, status: "partial" };
  return { paidCentavos, dueCentavos, status: "unpaid" };
}

/**
 * Merges the plan's required repayments with the strategy's surplus. A debt's extra
 * goes on its latest repayment row (payments fill the earliest rows first); debts
 * with extra but no repayment get their own row.
 */
export function buildDebtPlanRows(repayments: FinancialPlanRepayment[], surplusPlan: DebtSurplusPlan): DebtPlanRow[] {
  const recommendations = new Map(surplusPlan.recommendations.map((recommendation) => [recommendation.id, recommendation]));
  const beyondPlan = new Map(surplusPlan.extraPaidBeyondPlan.map((entry) => [entry.id, entry]));
  const lastRowIdByTarget = new Map(repayments.flatMap((row) => row.targetId ? [[row.targetId, row.id] as const] : []));
  const rows: DebtPlanRow[] = repayments.map((row) => {
    const base = { id: row.id, label: row.label, dueDate: row.dueDate, requiredCentavos: row.amountCentavos, extraCentavos: 0, extraReason: null, payment: row.payment, extraPaidBeyondPlanCentavos: 0 };
    if (!row.targetId || lastRowIdByTarget.get(row.targetId) !== row.id) return base;
    const recommendation = recommendations.get(row.targetId);
    const extraPaidBeyondPlanCentavos = beyondPlan.get(row.targetId)?.amountCentavos ?? 0;
    if (!recommendation) return { ...base, extraPaidBeyondPlanCentavos };
    return { ...base, extraCentavos: recommendation.plannedCentavos, extraReason: recommendation.reason, payment: combinedPayment(row.payment, recommendation.plannedCentavos, recommendation.paidCentavos), extraPaidBeyondPlanCentavos };
  });
  for (const recommendation of surplusPlan.recommendations) {
    if (lastRowIdByTarget.has(recommendation.id)) continue;
    const payment = recommendation.paidCentavos > 0 ? combinedPayment({ paidCentavos: 0, dueCentavos: 0, status: "paid" }, recommendation.plannedCentavos, recommendation.paidCentavos) : undefined;
    rows.push({ id: recommendation.id, label: recommendation.label, requiredCentavos: 0, extraCentavos: recommendation.plannedCentavos, extraReason: recommendation.reason, payment, extraPaidBeyondPlanCentavos: beyondPlan.get(recommendation.id)?.amountCentavos ?? 0 });
  }
  for (const entry of surplusPlan.extraPaidBeyondPlan) {
    if (lastRowIdByTarget.has(entry.id) || recommendations.has(entry.id)) continue;
    rows.push({ id: entry.id, label: entry.label, requiredCentavos: 0, extraCentavos: 0, extraReason: null, extraPaidBeyondPlanCentavos: entry.amountCentavos });
  }
  return rows;
}
