import { useCallback, useEffect, useRef, useState } from "react";
import { createFinancialPlan, deleteFinancialPlan, getAcceptedFinancialPlanForPeriod, getCurrentFinancialPlanPeriod, getFinancialPlanLabels, getFinancialPlanSpending, type AcceptedFinancialPlan } from "../../../local-db/repositories/financial-plans/financialPlans";
import { getPlanCommitmentPayments } from "../../../local-db/repositories/financial-plans/financialPlanCommitmentReview";
import { listPlanRecommendations } from "../../../local-db/repositories/forecast/forecastTransactions";
import { listCategories, listSubcategories } from "../../../local-db/repositories/ledger/taxonomy";
import { listFinancialAccounts } from "../../../local-db/repositories/foundations/financialFoundations";
import { runSync } from "../../../local-db/sync/runSync";
import { getPhilippineToday } from "../../debt-manager/forecast/helpers/debtTrendRange";
import { requestFinancialPlanCommitments, requestFinancialPlanExplanations, requestFinancialPlanForecast, requestFinancialPlanRecommendation, type ManualPlanAllocation, type ReservationSkips } from "../api";
import { hasUnderfundedReservation, parseBudgetAmount, planCommitmentBudgets, planObligations, requirementReservations, updateCommitmentBudget, type CommitmentKind } from "../helpers/commitmentBudget";
import type { PlanCommitmentPayments } from "../helpers/commitmentPayments";
import { recommendPlanAmount } from "../helpers/planAmountRecommendation";
import { applyFinancialPlanLabels, applyFinancialPlanSpending, remainingUnallocatedCentavos, toCentavos } from "../helpers/financialPlanPresentation";
import type { FinancialPlanAllocation, FinancialPlanRecommendation } from "../types";
import type { CommitmentDraft } from "./useCommitmentDraft";
import type { PlanCategorySelection } from "./usePlanCategorySelection";

export type FinancialPlanState = "loading" | "generating" | "selecting" | "budgeting" | "ready" | "infeasible" | "stale" | "saving" | "saved" | "error";

type Options = {
  userId: string;
  deviceId: string;
  accessToken: string;
  syncVersion: number;
  onSyncRequested?: () => Promise<void>;
  commitments: CommitmentDraft;
  categorySelection: PlanCategorySelection;
};

function getCurrentPeriodPlan(userId: string, planMonth?: string): Promise<AcceptedFinancialPlan | null> {
  const period = getCurrentFinancialPlanPeriod(planMonth ? `${planMonth}-01` : getPhilippineToday());
  return getAcceptedFinancialPlanForPeriod(userId, period.start, period.end);
}

function savedPlanToRecommendation(savedPlan: AcceptedFinancialPlan): FinancialPlanRecommendation {
  return {
    status: "RECOMMENDATION_READY",
    period: { start: savedPlan.periodStart, end: savedPlan.periodEnd },
    inputSnapshot: savedPlan.inputSnapshot as FinancialPlanRecommendation["inputSnapshot"],
    recommendation: savedPlan.recommendation as FinancialPlanRecommendation["recommendation"],
    explanations: [],
  };
}

function planHasUnderfundedCommitments(plan: FinancialPlanRecommendation): boolean {
  const obligations = planObligations(plan);
  const requirements = [...requirementReservations(plan.inputSnapshot.debtRequirements), ...requirementReservations(plan.inputSnapshot.savingsRequirements), ...obligations.requirements];
  return hasUnderfundedReservation(requirements, [...plan.recommendation.debtReservations, ...plan.recommendation.savingsReservations, ...obligations.reservations]);
}

// Payment statuses are optional on the saved plan, so a failed lookup hides them instead of failing the view.
function loadCommitmentPayments(userId: string, period: { start: string; end: string }): Promise<PlanCommitmentPayments | null> {
  return getPlanCommitmentPayments(userId, period).catch(() => null);
}

type SavedPlanView = { plan: FinancialPlanRecommendation; spentCentavos: number; payments: PlanCommitmentPayments | null };

async function loadSavedPlanView(userId: string, savedPlan: AcceptedFinancialPlan): Promise<SavedPlanView> {
  const savedRecommendation = savedPlanToRecommendation(savedPlan);
  const [labels, { allocationSpending, spentCentavos }, payments] = await Promise.all([getFinancialPlanLabels(userId, savedPlan), getFinancialPlanSpending(userId, savedPlan.id), loadCommitmentPayments(userId, savedRecommendation.period)]);
  return {
    payments,
    plan: { ...savedRecommendation, recommendation: applyFinancialPlanLabels({ ...savedRecommendation.recommendation, allocations: applyFinancialPlanSpending(savedRecommendation.recommendation.allocations, allocationSpending) }, labels) },
    spentCentavos,
  };
}

// Loads the month's plan inputs or its saved plan, generates recommendations, and saves or resets the accepted plan.
export function useFinancialPlanController({ userId, deviceId, accessToken, syncVersion, onSyncRequested, commitments, categorySelection }: Options) {
  const { reset: resetCommitments, clearValidity, hasInvalidCommitments } = commitments;
  const { initialize: initializeCategories, includedIds, includedCategoryIds } = categorySelection;
  const [plan, setPlan] = useState<FinancialPlanRecommendation | null>(null);
  const [state, setState] = useState<FinancialPlanState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [planSpentCentavos, setPlanSpentCentavos] = useState<number | null>(null);
  const [commitmentPaymentsPaid, setCommitmentPaymentsPaid] = useState<PlanCommitmentPayments | null>(null);
  const [planForecast, setPlanForecast] = useState<Record<string, number> | null>(null);
  const [availableMoneyCentavos, setAvailableMoneyCentavos] = useState(0);
  const [plannedAmount, setPlannedAmount] = useState("");
  const [manualAllocations, setManualAllocations] = useState<ManualPlanAllocation[]>([]);
  const [reservationSkips, setReservationSkips] = useState<ReservationSkips>({ debtRepayments: false, savingsContributions: false, scheduledPayments: false });
  // Savings and debt edits after allocation only change the remaining money; insights describing the earlier allocation are hidden.
  const [commitmentsEdited, setCommitmentsEdited] = useState(false);
  const [acceptConfirmOpen, setAcceptConfirmOpen] = useState(false);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [devPlanMonth, setDevPlanMonth] = useState<string | undefined>();
  const selectedMonth = __DEV__ && devPlanMonth ? devPlanMonth : getPhilippineToday().slice(0, 7);
  const isDevPreview = __DEV__ && selectedMonth !== getPhilippineToday().slice(0, 7);
  const [reloadKey, setReloadKey] = useState(0);
  const requestAbort = useRef<AbortController | null>(null);
  const observedSyncVersion = useRef(syncVersion);

  // Shows a loaded saved plan; callers check their own cancellation and set the screen state.
  const showSavedPlan = useCallback((view: SavedPlanView, planId: string) => {
    setPlan(view.plan);
    setPlanSpentCentavos(view.spentCentavos);
    setCommitmentPaymentsPaid(view.payments);
    setSavedPlanId(planId);
  }, []);

  const plannedAmountCentavos = toCentavos(plannedAmount);
  let planningAmountError: string | null = null;
  if (plannedAmountCentavos === null || plannedAmountCentavos <= 0) planningAmountError = "Enter an amount greater than zero.";
  else if (plannedAmountCentavos > availableMoneyCentavos) planningAmountError = "Your planning amount cannot exceed available money.";

  const loadRecommendation = useCallback(async (nextManualAllocations: ManualPlanAllocation[] = manualAllocations, nextReservationSkips: ReservationSkips = reservationSkips) => {
    if (plannedAmountCentavos === null || planningAmountError || hasInvalidCommitments) return;
    requestAbort.current?.abort();
    const controller = new AbortController();
    requestAbort.current = controller;
    setState("generating");
    setError(null);
    try {
      // The server plan excludes synced unusual-spending evaluations from its forecast history,
      // so every local change must reach it first; pulling the server's changes back is not needed here.
      // A push-only sync succeeds only when nothing queued before it is left unsynced.
      const syncResult = await runSync(userId, deviceId, accessToken, { pull: false });
      if (controller.signal.aborted) return;
      if (!syncResult.successful) throw new Error("Some of your changes have not synced yet. Sync them before generating a Financial Plan.");
      const { response, body } = await requestFinancialPlanRecommendation(accessToken, [...includedIds], [...includedCategoryIds], plannedAmountCentavos, nextManualAllocations, nextReservationSkips, controller.signal, __DEV__ ? devPlanMonth : undefined);
      if (controller.signal.aborted) return;
      if (!response.ok || !body.payload) throw new Error(body.message ?? "Your Financial Plan could not be generated.");
      const labels = await getFinancialPlanLabels(userId, { recommendation: body.payload.recommendation });
      if (controller.signal.aborted) return;
      setManualAllocations(nextManualAllocations);
      setReservationSkips(nextReservationSkips);
      setCommitmentsEdited(false);
      setPlan({ ...body.payload, recommendation: applyFinancialPlanLabels(body.payload.recommendation, labels) });
      const explanationRequest = body.payload.explanationRequest;
      if (explanationRequest) {
        // Edits keep the same explanationRequest object, while a newer recommendation replaces it, so a late reply never lands on the wrong plan.
        void requestFinancialPlanExplanations(accessToken, explanationRequest).then((explanations) => {
          if (explanations?.length) setPlan((current) => current?.explanationRequest === explanationRequest ? { ...current, explanations } : current);
        });
      }
      setState(body.payload.status === "INFEASIBLE" ? "infeasible" : "ready");
    } catch (cause) {
      // Only a superseded or unmounted request is ignored; a request timeout still has to leave the loading state.
      if (controller.signal.aborted) return;
      const savedPlan = await getCurrentPeriodPlan(userId, selectedMonth);
      if (controller.signal.aborted) return;
      if (savedPlan) {
        const view = await loadSavedPlanView(userId, savedPlan);
        if (controller.signal.aborted) return;
        showSavedPlan(view, savedPlan.id);
        setCommitmentsEdited(false);
        setState("saved");
        return;
      }
      setError(recommendationErrorMessage(cause));
      setState("error");
    } finally {
      if (requestAbort.current === controller) requestAbort.current = null;
    }
  }, [accessToken, deviceId, includedCategoryIds, includedIds, manualAllocations, plannedAmountCentavos, planningAmountError, reservationSkips, selectedMonth, devPlanMonth, userId, hasInvalidCommitments, showSavedPlan]);

  useEffect(() => {
    let active = true;
    void Promise.all([listCategories(userId), listSubcategories(userId, undefined, "expense"), listPlanRecommendations(userId, selectedMonth), getCurrentPeriodPlan(userId, selectedMonth), listFinancialAccounts(userId)]).then(async ([topLevelResult, result, recommendations, savedPlan, accounts]) => {
      if (!active) return;
      if (savedPlan) {
        const view = await loadSavedPlanView(userId, savedPlan);
        if (!active) return;
        showSavedPlan(view, savedPlan.id);
        setCommitmentsEdited(false);
        setState("saved");
        return;
      }
      const [preview, forecast] = await Promise.all([requestFinancialPlanCommitments(accessToken, __DEV__ ? devPlanMonth : undefined), requestFinancialPlanForecast(accessToken, __DEV__ ? devPlanMonth : undefined)]);
      const [previewLabels, previewPayments] = await Promise.all([getFinancialPlanLabels(userId, { recommendation: { allocations: [], ...preview } }), loadCommitmentPayments(userId, preview.period)]);
      if (!active) return;
      setCommitmentPaymentsPaid(previewPayments);
      const labeled = applyFinancialPlanLabels({ allocations: [], ...preview }, previewLabels);
      resetCommitments(labeled);
      const initialSelection = initializeCategories(topLevelResult, result, recommendations);
      setPlanForecast(forecast);
      setManualAllocations([]);
      setReservationSkips({ debtRepayments: false, savingsContributions: false, scheduledPayments: false });
      setCommitmentsEdited(false);
      const available = accounts
        .filter((account) => account.status === "active" && account.kind !== "savings" && account.kind !== "credit_card")
        .reduce((sum, account) => sum + account.currentBalanceCentavos, 0);
      setAvailableMoneyCentavos(available);
      // Starts at what the month needs, never more than the money available.
      const recommended = recommendPlanAmount({ commitments: labeled, topLevelCategories: topLevelResult, subcategories: result, includedCategoryIds: initialSelection.includedCategoryIds, includedIds: initialSelection.includedIds, expectedSpend: recommendations.expectedSpend, forecast }).totalCentavos;
      setPlannedAmount((current) => current || ((recommended > 0 ? Math.min(recommended, available) : available) / 100).toFixed(2));
      setState("selecting");
    }).catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Your expense categories could not be loaded.");
      setState("error");
    });
    return () => { active = false; requestAbort.current?.abort(); };
  }, [reloadKey, selectedMonth, userId, accessToken, devPlanMonth, resetCommitments, initializeCategories, showSavedPlan]);

  useEffect(() => {
    if (observedSyncVersion.current === syncVersion) return;
    observedSyncVersion.current = syncVersion;
    if (state !== "saved") {
      setState((current) => current === "ready" ? "stale" : current);
      return;
    }
    let active = true;
    void getCurrentPeriodPlan(userId, selectedMonth).then(async (savedPlan) => {
      if (!savedPlan) return;
      const view = await loadSavedPlanView(userId, savedPlan);
      if (!active) return;
      showSavedPlan(view, savedPlan.id);
    }).catch(() => {});
    return () => { active = false; };
  }, [state, syncVersion, selectedMonth, userId, showSavedPlan]);

  const updateAllocation = (index: number, change: Partial<FinancialPlanAllocation>) => {
    if (!plan || state === "infeasible" || state === "saved" || state === "stale") return;
    const allocations = plan.recommendation.allocations.map((allocation, allocationIndex) => allocationIndex === index ? { ...allocation, ...change } : allocation);
    setError(null);
    setPlan({ ...plan, recommendation: { ...plan.recommendation, allocations } });
    setState("ready");
  };

  const changeFlexibleAmount = (index: number, amount: string) => {
    const value = toCentavos(amount);
    if (value != null) updateAllocation(index, { allocatedAmountCentavos: value });
  };

  const changeWeight = (index: number, weight: string) => {
    const value = Number(weight);
    if (Number.isFinite(value) && value >= 0 && value <= 100) updateAllocation(index, { subcategoryWeightBps: Math.round(value * 100) });
  };

  const updateSurplus = (field: "debtSurplusCentavos" | "savingsSurplusCentavos", amount: string) => {
    if (!plan || state === "infeasible" || state === "saved") return;
    const value = toCentavos(amount);
    if (value == null) return;
    setError(null);
    setPlan({ ...plan, recommendation: { ...plan.recommendation, [field]: value } });
    if (state !== "stale") setState("ready");
  };

  const updateReservationAmount = (kind: CommitmentKind, index: number, amount: string) => {
    if (!plan || state === "saved" || state === "saving") return;
    const value = parseBudgetAmount(amount);
    const rows = kind === "obligations" ? planObligations(plan).reservations : plan.recommendation[kind];
    if (value == null || rows[index]?.amountCentavos === value) return;
    const updated = updateCommitmentBudget(plan, kind, index, value);
    setPlan(updated);
    setCommitmentsEdited(true);
    if (state !== "stale") setState(updated.status === "INFEASIBLE" ? "infeasible" : "ready");
    setReservationSkips((current) => ({ ...current, commitmentBudgets: planCommitmentBudgets(updated) }));
  };

  const savePlan = async () => {
    if (!plan || state !== "ready" || isDevPreview || hasInvalidCommitments || remainingUnallocatedCentavos(plan.recommendation.availableFundsCentavos, plan.recommendation.allocations, plan.recommendation.debtSurplusCentavos, plan.recommendation.savingsSurplusCentavos) < 0) return;
    setState("saving");
    setError(null);
    try {
      const allocations = plan.recommendation.allocations.map(({ label: _label, ...allocation }) => allocation);
      const debtReservations = plan.recommendation.debtReservations.map(({ debtAccountId, creditCardStatementId, amountCentavos, dueDate }) => ({ debtAccountId, creditCardStatementId, amountCentavos, dueDate }));
      const savingsReservations = plan.recommendation.savingsReservations.filter((reservation) => reservation.savingsGoalId).map(({ savingsGoalId, amountCentavos, dueDate }) => ({ savingsGoalId: savingsGoalId!, amountCentavos, dueDate }));
      const { id } = await createFinancialPlan(userId, deviceId, {
        periodStart: plan.period.start,
        periodEnd: plan.period.end,
        inputSnapshot: plan.inputSnapshot,
        recommendation: { ...plan.recommendation, allocations, debtReservations, savingsReservations },
        allocations,
        debtReservations,
        savingsReservations,
      });
      try { await onSyncRequested?.(); } catch {}
      setSavedPlanId(id);
      setPlanSpentCentavos(null);
      setCommitmentPaymentsPaid(await loadCommitmentPayments(userId, plan.period));
      try {
        const { allocationSpending, spentCentavos } = await getFinancialPlanSpending(userId, id);
        setPlan((current) => current ? { ...current, recommendation: { ...current.recommendation, allocations: applyFinancialPlanSpending(current.recommendation.allocations, allocationSpending) } } : current);
        setPlanSpentCentavos(spentCentavos);
      } catch {
        setError("Your plan was saved, but spending could not be loaded. Reopen the plan to refresh it.");
      }
      setState("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your Financial Plan could not be saved.");
      setState("error");
    }
  };

  // Underfunded commitments are confirmed in a dialog before the plan is saved.
  const acceptPlan = () => {
    if (!plan) return;
    if (planHasUnderfundedCommitments(plan)) setAcceptConfirmOpen(true);
    else void savePlan();
  };

  const cancelAccept = () => setAcceptConfirmOpen(false);

  const confirmAccept = () => {
    setAcceptConfirmOpen(false);
    void savePlan();
  };

  // Called once the user has confirmed the reset.
  const resetSavedPlan = (planId: string) => {
    void deleteFinancialPlan(userId, deviceId, planId)
      .then(async () => {
        try { await onSyncRequested?.(); } catch {}
        setPlan(null);
        setPlanSpentCentavos(0);
        setSavedPlanId(null);
        setError(null);
        setState("loading");
        setReloadKey((current) => current + 1);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Your Financial Plan could not be reset."));
  };

  // Called once the user has confirmed the skip.
  const skipReservation = (type: "debtRepayments" | "savingsContributions", regenerate = true) => {
    const nextReservationSkips = { ...reservationSkips, [type]: true };
    setReservationSkips(nextReservationSkips);
    if (regenerate) void loadRecommendation(manualAllocations, nextReservationSkips);
  };

  const changeDevPlanMonth = (month: string) => {
    requestAbort.current?.abort();
    setPlan(null);
    setSavedPlanId(null);
    setPlanSpentCentavos(0);
    setError(null);
    setState("loading");
    setDevPlanMonth(month);
  };

  const continueFromSelection = (allocations: ManualPlanAllocation[]) => {
    setManualAllocations(allocations);
    setError(null);
    // Without manual types, each commitment starts at its amount due and the plan is generated right away;
    // the user can still adjust those amounts on the plan. Budgeting any type manually opens the review step.
    const commitmentBudgets = commitments.anyManual ? null : commitments.previewBudgets(reservationSkips);
    if (!commitmentBudgets) {
      setState("budgeting");
      return;
    }
    const nextReservationSkips = { ...reservationSkips, commitmentBudgets };
    setReservationSkips(nextReservationSkips);
    void loadRecommendation(allocations, nextReservationSkips);
  };

  const allocateCommitmentDraft = () => {
    const commitmentBudgets = commitments.draftBudgets(reservationSkips);
    if (!commitmentBudgets) return;
    void loadRecommendation(manualAllocations, { ...reservationSkips, commitmentBudgets });
  };

  const leaveCommitmentReview = () => {
    clearValidity();
    setError(null);
    setState("selecting");
  };

  // Returning to setup keeps the category choices and planning amount; continuing generates a fresh plan.
  const backToSetup = () => {
    requestAbort.current?.abort();
    setPlan(null);
    clearValidity();
    setCommitmentsEdited(false);
    setError(null);
    setState("selecting");
  };

  const retry = () => {
    if (commitments.preview) {
      void loadRecommendation();
      return;
    }
    setState("loading");
    setReloadKey((key) => key + 1);
  };

  return {
    plan, state, error, planSpentCentavos, commitmentPaymentsPaid, savedPlanId, commitmentsEdited, acceptConfirmOpen, reservationSkips, manualAllocations,
    selectedMonth, isDevPreview, changeDevPlanMonth,
    planForecast,
    availableMoneyCentavos, plannedAmount, setPlannedAmount, plannedAmountCentavos, planningAmountError,
    loadRecommendation, continueFromSelection, allocateCommitmentDraft, leaveCommitmentReview, backToSetup, retry, skipReservation,
    changeFlexibleAmount, changeWeight, updateSurplus, updateReservationAmount,
    acceptPlan, cancelAccept, confirmAccept, resetSavedPlan,
  };
}

function recommendationErrorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.name === "AbortError") return "Your Financial Plan took too long to generate. Try again.";
  if (cause instanceof Error) return cause.message;
  return "Your Financial Plan could not be generated.";
}
