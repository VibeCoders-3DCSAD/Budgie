import type { FinancialPlanAllocation } from "../../../financial-plan/types";
import { formatPeso } from "../../../../lib/format/money";

type Labelled = { id: string; label: string; forecast: number };

// Plain-language reasons for the practice plan, the way the server's deterministic explanations read.
export function planExplanations(allocations: FinancialPlanAllocation[], targets: Labelled[], surplus: number): string[] {
  const lines = allocations.map((allocation, index) => {
    const target = targets[index];
    if (!target) return null;
    if (allocation.allocatedAmountCentavos >= target.forecast) return `${target.label} gets ${formatPeso(allocation.allocatedAmountCentavos)}, matching what you usually spend in a month.`;
    return `${target.label} gets ${formatPeso(allocation.allocatedAmountCentavos)}, a little under your usual ${formatPeso(target.forecast)} so the plan fits your money.`;
  }).filter((line): line is string => line !== null);
  if (surplus > 0) lines.push(`${formatPeso(surplus)} is left over. Your emergency fund is complete, so extra payments on your motorcycle loan would save the most interest.`);
  return lines;
}
