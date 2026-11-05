import { getAcceptedFinancialPlanForPeriod, getCurrentFinancialPlanPeriod } from "../../../local-db/repositories/financial-plans/financialPlans";
import { getPlanCommitmentPayments } from "../../../local-db/repositories/financial-plans/financialPlanCommitmentReview";
import { getSavingsAllocationStrategy, type SavingsAllocationStrategy } from "../../../local-db/repositories/savings/savingsAllocationPreferences";
import { listSavingsGoals } from "../../../local-db/repositories/savings/savingsGoals";
import { getRequiredSavingsContributionsForPeriod } from "./requiredSavingsContributionQueries";
import { allocateSavingsEnvelope, fundingState, type AllocatableSavingsGoal, type SavingsAllocationProposal, type SavingsCycleAllocation } from "../helpers/savingsEnvelopeAllocation";

export async function getCurrentSavingsEnvelopeAllocation(userId: string, asOfDate: string): Promise<SavingsCycleAllocation | null> {
  const period = getCurrentFinancialPlanPeriod(asOfDate);
  const plan = await getAcceptedFinancialPlanForPeriod(userId, period.start, period.end);
  if (!plan) return null;
  const [requirements, strategy, savedGoals, payments] = await Promise.all([
    getRequiredSavingsContributionsForPeriod(userId, plan.periodStart, plan.periodEnd),
    getSavingsAllocationStrategy(userId),
    listSavingsGoals(userId),
    // Any deposit dated inside the plan month counts, even one recorded before acceptance.
    getPlanCommitmentPayments(userId, { start: plan.periodStart, end: plan.periodEnd }),
  ]);
  const requirementsByGoalId = new Map(requirements.contributions.filter((contribution) => contribution.source === "goal").map((contribution) => [contribution.savingsId, contribution]));
  const recordedForGoal = (id: string) => recordedCentavosFor(payments.paidCentavos, id);
  const goals = savedGoals.filter((goal) => goal.status === "active" && (goal.remainingAmountCentavos > 0 || recordedForGoal(goal.id) > 0)).map((goal) => {
    const requirement = requirementsByGoalId.get(goal.id);
    return {
      id: goal.id,
      name: goal.name,
      goalCategory: goal.goalCategory,
      targetDate: goal.targetDate,
      // Reconstruct this month's capacity before deposits, so completing a goal
      // does not remove its budget or its Done row from the monthly review.
      remainingAmountCentavos: goal.remainingAmountCentavos + recordedForGoal(goal.id),
      requiredCentavos: requirement?.configuredMinimumCentavos ?? 0,
      recordedContributionCentavos: 0,
    };
  });
  const reservations = ((plan.recommendation.savingsReservations as Array<{ savingsGoalId?: string; amountCentavos?: number; dueDate?: string | null }> | undefined) ?? []);
  const reservedByGoalId = new Map<string, number>();
  const dueDatesByGoalId = new Map<string, string>();
  for (const reservation of reservations) {
    if (!reservation.savingsGoalId || reservation.amountCentavos === undefined || !Number.isSafeInteger(reservation.amountCentavos)) continue;
    reservedByGoalId.set(reservation.savingsGoalId, (reservedByGoalId.get(reservation.savingsGoalId) ?? 0) + Math.max(0, reservation.amountCentavos));
    if (reservation.dueDate && (!dueDatesByGoalId.has(reservation.savingsGoalId) || reservation.dueDate < dueDatesByGoalId.get(reservation.savingsGoalId)!)) dueDatesByGoalId.set(reservation.savingsGoalId, reservation.dueDate);
  }
  for (const goal of savedGoals) {
    const scheduledDate = requirementsByGoalId.get(goal.id)?.scheduledDates?.[0] ?? goal.nextContributionDate;
    if (!dueDatesByGoalId.has(goal.id) && scheduledDate && scheduledDate >= plan.periodStart && scheduledDate <= plan.periodEnd) dueDatesByGoalId.set(goal.id, scheduledDate);
  }
  const savingsSurplus = plan.recommendation.savingsSurplusCentavos;
  const savingsSurplusCentavos = typeof savingsSurplus === "number" && Number.isSafeInteger(savingsSurplus) ? Math.max(0, savingsSurplus) : 0;
  const envelopeCentavos = [...reservedByGoalId.values()].reduce((total, amount) => total + amount, savingsSurplusCentavos);
  const plannedProposals = allocatePlannedSavings(goals, strategy, reservedByGoalId, savingsSurplusCentavos);
  return buildSavingsCycle(plannedProposals, envelopeCentavos, payments.paidCentavos, dueDatesByGoalId);
}

function allocatePlannedSavings(goals: AllocatableSavingsGoal[], strategy: SavingsAllocationStrategy, reservedByGoalId: Map<string, number>, savingsSurplusCentavos: number): SavingsAllocationProposal[] {
  const reservationAllocation = allocateSavingsEnvelope(0, strategy, goals);
  const reservedProposals = reservationAllocation.proposals.map((proposal) => {
    const reserved = Math.min(proposal.remainingAmountCentavos, reservedByGoalId.get(proposal.id) ?? 0);
    const required = Math.min(proposal.remainingAmountCentavos, Math.max(0, proposal.requiredCentavos - proposal.recordedContributionCentavos));
    return { ...proposal, proposedRequiredCentavos: Math.min(required, reserved), proposedSurplusCentavos: Math.max(0, reserved - required), proposedTotalCentavos: reserved, unfundedRequiredCentavos: Math.max(0, required - reserved), state: fundingState(reserved, required), reason: reserved > 0 ? proposal.reason : "no_envelope" as const };
  });
  const surplusAllocation = allocateSavingsEnvelope(savingsSurplusCentavos, strategy, reservedProposals.map((proposal) => ({ ...proposal, remainingAmountCentavos: Math.max(0, proposal.remainingAmountCentavos - proposal.proposedTotalCentavos), recordedContributionCentavos: proposal.recordedContributionCentavos + proposal.proposedRequiredCentavos })));
  const surplusByGoalId = new Map(surplusAllocation.proposals.map((proposal) => [proposal.id, proposal]));
  const plannedProposals = reservedProposals.map((proposal) => {
    const surplus = surplusByGoalId.get(proposal.id);
    if (!surplus) return proposal;
    const proposedRequiredCentavos = proposal.proposedRequiredCentavos + surplus.proposedRequiredCentavos;
    const proposedSurplusCentavos = proposal.proposedSurplusCentavos + surplus.proposedSurplusCentavos;
    const proposedTotalCentavos = proposal.proposedTotalCentavos + surplus.proposedTotalCentavos;
    return { ...proposal, proposedRequiredCentavos, proposedSurplusCentavos, proposedTotalCentavos, unfundedRequiredCentavos: Math.max(0, proposal.unfundedRequiredCentavos - surplus.proposedRequiredCentavos), state: fundingState(proposedTotalCentavos, Math.min(proposal.remainingAmountCentavos, Math.max(0, proposal.requiredCentavos - proposal.recordedContributionCentavos))), reason: proposal.proposedTotalCentavos > 0 ? proposal.reason : surplus.reason };
  });
  return plannedProposals;
}

function buildSavingsCycle(plannedProposals: SavingsAllocationProposal[], envelopeCentavos: number, paidCentavos: Record<string, number>, dueDatesByGoalId: Map<string, string>): SavingsCycleAllocation {
  const recordedForGoal = (id: string) => recordedCentavosFor(paidCentavos, id);
  const contributions = plannedProposals.filter((proposal) => proposal.proposedTotalCentavos > 0).map((proposal) => ({ id: proposal.id, name: proposal.name, dueDate: dueDatesByGoalId.get(proposal.id) ?? null, plannedCentavos: proposal.proposedTotalCentavos, recordedCentavos: recordedForGoal(proposal.id) }));
  // Extra deposits to one goal cannot settle another goal's monthly allocation.
  const recordedCentavos = contributions.reduce((total, contribution) => total + Math.min(contribution.plannedCentavos, Math.max(0, contribution.recordedCentavos)), 0);
  // Surplus that no goal can take (every goal is already planned up to its
  // target) is not money anyone can contribute, so it is reported on its own.
  const plannedCentavos = contributions.reduce((total, contribution) => total + contribution.plannedCentavos, 0);
  const unassignedCentavos = Math.max(0, envelopeCentavos - plannedCentavos);
  const remainingToContributeCentavos = Math.max(0, envelopeCentavos - unassignedCentavos - recordedCentavos);
  const proposals = plannedProposals.map((proposal) => remainingProposal(proposal, recordedForGoal(proposal.id)));
  const requiredCentavos = proposals.reduce((total, proposal) => total + Math.min(proposal.remainingAmountCentavos, Math.max(0, proposal.requiredCentavos - proposal.recordedContributionCentavos)), 0);
  return { envelopeCentavos, requiredCentavos, accountRequiredCentavos: 0, shortfallCentavos: Math.max(0, requiredCentavos - remainingToContributeCentavos), unallocatedCentavos: unassignedCentavos, proposals, contributions, remainingToContributeCentavos };
}

function remainingProposal(proposal: SavingsAllocationProposal, recordedContributionCentavos: number) {
  const proposedRequiredCentavos = Math.max(0, proposal.proposedRequiredCentavos - recordedContributionCentavos);
  const proposedSurplusCentavos = Math.max(0, proposal.proposedSurplusCentavos - Math.max(0, recordedContributionCentavos - proposal.proposedRequiredCentavos));
  const remainingAmountCentavos = Math.max(0, proposal.remainingAmountCentavos - recordedContributionCentavos);
  const required = Math.min(remainingAmountCentavos, Math.max(0, proposal.requiredCentavos - recordedContributionCentavos));
  return { ...proposal, plannedTotalCentavos: proposal.proposedTotalCentavos, remainingAmountCentavos, recordedContributionCentavos, proposedRequiredCentavos, proposedSurplusCentavos, proposedTotalCentavos: proposedRequiredCentavos + proposedSurplusCentavos, unfundedRequiredCentavos: Math.max(0, required - proposedRequiredCentavos) };
}

// Deposits recorded this month for one goal; malformed or negative totals count as nothing.
function recordedCentavosFor(paidCentavos: Record<string, number>, goalId: string): number {
  const paid = paidCentavos[`savings:${goalId}`];
  if (typeof paid !== "number" || !Number.isFinite(paid)) return 0;
  return Math.max(0, Math.trunc(paid));
}
