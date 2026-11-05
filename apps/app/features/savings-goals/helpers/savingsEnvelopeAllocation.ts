import type { SavingsAllocationStrategy } from "../../../local-db/repositories/savings/savingsAllocationPreferences";

export type AllocatableSavingsGoal = {
  id: string;
  name: string;
  isEmergencyFund: boolean;
  targetDate: string | null;
  remainingAmountCentavos: number;
  requiredCentavos: number;
  recordedContributionCentavos: number;
};

export type SavingsAllocationProposal = AllocatableSavingsGoal & {
  plannedTotalCentavos?: number;
  proposedRequiredCentavos: number;
  proposedSurplusCentavos: number;
  proposedTotalCentavos: number;
  unfundedRequiredCentavos: number;
  state: "funded" | "partially_funded" | "unfunded";
  reason: "emergency_fund_required" | "scheduled_required" | "avalanche_surplus" | "snowball_surplus" | "no_envelope";
};

export type SavingsEnvelopeAllocation = {
  envelopeCentavos: number;
  requiredCentavos: number;
  accountRequiredCentavos: number;
  shortfallCentavos: number;
  unallocatedCentavos: number;
  proposals: SavingsAllocationProposal[];
};

export type SavingsCycleContribution = {
  id: string;
  name: string;
  dueDate: string | null;
  plannedCentavos: number;
  recordedCentavos: number;
};

export type SavingsCycleAllocation = SavingsEnvelopeAllocation & {
  contributions: SavingsCycleContribution[];
  remainingToContributeCentavos: number;
};

// Amounts arrive from stored plan JSON and SQLite rows; anything that is not a
// finite number counts as zero, and fractions of a centavo are dropped.
function toCentavos(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

type NormalizedGoal = AllocatableSavingsGoal & { unmetRequiredCentavos: number };

function normalizeGoal(goal: AllocatableSavingsGoal): NormalizedGoal {
  const remainingAmountCentavos = toCentavos(goal.remainingAmountCentavos);
  const requiredCentavos = toCentavos(goal.requiredCentavos);
  const recordedContributionCentavos = toCentavos(goal.recordedContributionCentavos);
  // A goal can never need more this cycle than it needs to reach its target.
  const unmetRequiredCentavos = Math.min(remainingAmountCentavos, Math.max(0, requiredCentavos - recordedContributionCentavos));
  return { ...goal, remainingAmountCentavos, requiredCentavos, recordedContributionCentavos, unmetRequiredCentavos };
}

const isEmergencyFund = (goal: AllocatableSavingsGoal) => goal.isEmergencyFund;

function byTargetDateThenId(left: AllocatableSavingsGoal, right: AllocatableSavingsGoal): number {
  const target = (left.targetDate ?? "9999-12-31").localeCompare(right.targetDate ?? "9999-12-31");
  if (target !== 0) return target;
  return left.id.localeCompare(right.id);
}

// Avalanche: the largest unmet required contribution first. When every goal's
// required contribution is already covered (all zero), the goal that still
// needs the most to reach its target gets the extra savings.
function byAvalanche(left: NormalizedGoal, right: NormalizedGoal): number {
  return right.unmetRequiredCentavos - left.unmetRequiredCentavos
    || right.remainingAmountCentavos - left.remainingAmountCentavos
    || byTargetDateThenId(left, right);
}

// Snowball: the goal closest to its target first.
function bySnowball(left: NormalizedGoal, right: NormalizedGoal): number {
  return left.remainingAmountCentavos - right.remainingAmountCentavos || byTargetDateThenId(left, right);
}

// The Emergency Fund always comes first; the chosen strategy orders the rest
// (and orders Emergency Funds among themselves, keeping the sort consistent).
function compareSavingsGoals(strategy: SavingsAllocationStrategy, left: NormalizedGoal, right: NormalizedGoal): number {
  const emergencyOrder = Number(isEmergencyFund(right)) - Number(isEmergencyFund(left));
  if (emergencyOrder !== 0) return emergencyOrder;
  if (strategy === "snowball") return bySnowball(left, right);
  return byAvalanche(left, right);
}

export function fundingState(proposedCentavos: number, requiredCentavos: number): SavingsAllocationProposal["state"] {
  if (proposedCentavos >= requiredCentavos) return "funded";
  if (proposedCentavos > 0) return "partially_funded";
  return "unfunded";
}

function requiredReason(goal: NormalizedGoal, proposedRequiredCentavos: number): SavingsAllocationProposal["reason"] {
  if (isEmergencyFund(goal)) return "emergency_fund_required";
  if (proposedRequiredCentavos > 0) return "scheduled_required";
  return "no_envelope";
}

function surplusReason(goal: NormalizedGoal, strategy: SavingsAllocationStrategy): SavingsAllocationProposal["reason"] {
  if (isEmergencyFund(goal)) return "emergency_fund_required";
  if (strategy === "snowball") return "snowball_surplus";
  return "avalanche_surplus";
}

export function allocateSavingsEnvelope(envelopeCentavos: number, strategy: SavingsAllocationStrategy, goals: AllocatableSavingsGoal[], accountRequiredCentavos = 0): SavingsEnvelopeAllocation {
  const normalizedEnvelopeCentavos = toCentavos(envelopeCentavos);
  const normalizedAccountRequiredCentavos = toCentavos(accountRequiredCentavos);
  let available = Math.max(0, normalizedEnvelopeCentavos - normalizedAccountRequiredCentavos);
  const eligible = goals.map(normalizeGoal).filter((goal) => goal.remainingAmountCentavos > 0);
  const requiredCentavos = normalizedAccountRequiredCentavos + eligible.reduce((total, goal) => total + goal.unmetRequiredCentavos, 0);
  const ordered = [...eligible].sort((left, right) => compareSavingsGoals(strategy, left, right));
  // Pass 1: required contributions, in priority order.
  const proposals = ordered.map((goal) => {
    const proposedRequiredCentavos = Math.min(goal.unmetRequiredCentavos, available);
    available -= proposedRequiredCentavos;
    return { goal, proposal: { ...stripNormalized(goal), proposedRequiredCentavos, proposedSurplusCentavos: 0, proposedTotalCentavos: proposedRequiredCentavos, unfundedRequiredCentavos: goal.unmetRequiredCentavos - proposedRequiredCentavos, state: fundingState(proposedRequiredCentavos, goal.unmetRequiredCentavos), reason: requiredReason(goal, proposedRequiredCentavos) } as SavingsAllocationProposal };
  });
  // Pass 2: whatever is left fills each goal up to its target, in the same order.
  for (const { goal, proposal } of proposals) {
    if (available <= 0) break;
    const surplus = Math.min(available, goal.remainingAmountCentavos - proposal.proposedTotalCentavos);
    if (surplus <= 0) continue;
    proposal.proposedSurplusCentavos = surplus;
    proposal.proposedTotalCentavos += surplus;
    available -= surplus;
    if (proposal.proposedRequiredCentavos === 0) proposal.reason = surplusReason(goal, strategy);
  }
  return { envelopeCentavos: normalizedEnvelopeCentavos, requiredCentavos, accountRequiredCentavos: normalizedAccountRequiredCentavos, shortfallCentavos: Math.max(0, requiredCentavos - normalizedEnvelopeCentavos), unallocatedCentavos: available, proposals: proposals.map(({ proposal }) => proposal) };
}

function stripNormalized({ unmetRequiredCentavos: _unmet, ...goal }: NormalizedGoal): AllocatableSavingsGoal {
  return goal;
}
