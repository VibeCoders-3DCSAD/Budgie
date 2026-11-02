import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkle } from "phosphor-react-native";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { createFinancialPlan, deleteFinancialPlan, getAcceptedFinancialPlanForPeriod, getCurrentFinancialPlanPeriod, getFinancialPlanLabels, getFinancialPlanSpending, type AcceptedFinancialPlan } from "../../local-db/repositories/financial-plans/financialPlans";
import { getPlanCommitmentPayments } from "../../local-db/repositories/financial-plans/financialPlanCommitmentReview";
import { listPlanRecommendations, type PlanRecommendations } from "../../local-db/repositories/forecast/forecastTransactions";
import { listCategories, listSubcategories, updateCategory, updateSubcategory, type Category, type Subcategory } from "../../local-db/repositories/ledger/taxonomy";
import { listFinancialAccounts } from "../../local-db/repositories/foundations/financialFoundations";
import { runSync } from "../../local-db/sync/runSync";
import { getPhilippineToday } from "../debt-manager/forecast/helpers/debtTrendRange";
import { requestFinancialPlanCommitments, requestFinancialPlanExplanations, requestFinancialPlanForecast, requestFinancialPlanRecommendation, type ManualPlanAllocation, type ReservationSkips } from "./api";
import { hasUnderfundedReservation, manualCommitmentDraft, parseBudgetAmount, planCommitmentBudgets, planObligations, requirementReservations, selectedCommitmentBudgets, updateCommitmentBudget, type CommitmentKind, type CommitmentPreview, type CommitmentSkips } from "./helpers/commitmentBudget";
import { previewPaidCentavos, type PlanCommitmentPayments } from "./helpers/commitmentPayments";
import { recommendPlanAmount } from "./helpers/planAmountRecommendation";
import { planSpendingInsights } from "./helpers/planSpendingInsights";
import { planCommitmentStatusInsights } from "./helpers/planCommitmentStatusInsights";
import { planSpendableFundsCentavos } from "./helpers/planSpendableFunds";
import { surplusGuidanceMessage } from "./helpers/surplusGuidance";
import { DevPlanMonthSettings } from "./components/DevPlanMonthSettings";
import { PlanAllocations } from "./components/PlanAllocations";
import { PlanEssentialShortfall } from "./components/PlanEssentialShortfall";
import { PlanCategorySelection } from "./components/PlanCategorySelection";
import { PlanCommitmentChoices } from "./components/PlanCommitmentChoices";
import { PlanCommitmentReview } from "./components/PlanCommitmentReview";
import { UnderfundedCommitmentsDialog } from "./components/UnderfundedCommitmentsDialog";
import { PlanScheduledPayments } from "./components/PlanScheduledPayments";
import { PlanReservations } from "./components/PlanReservations";
import { PlanBackLink } from "./components/PlanBackLink";
import { PlanGeneratingScreen } from "./PlanGeneratingScreen";
import { groupPlanAllocations } from "./helpers/groupPlanAllocations";
import { applyFinancialPlanLabels, applyFinancialPlanSpending, formatPeso, remainingUnallocatedCentavos, toCentavos } from "./helpers/financialPlanPresentation";
import type { FinancialPlanAllocation, FinancialPlanRecommendation } from "./types";
import type { PlanCategoryRuleUpdate } from "./components/PlanCategoryRuleEditor";

type Props = { userId: string; deviceId: string; accessToken: string; syncVersion: number; onSyncRequested?: () => Promise<void>; onOpenPastPlans?: () => void };
type State = "loading" | "generating" | "selecting" | "budgeting" | "ready" | "infeasible" | "stale" | "saving" | "saved" | "error";

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

async function loadSavedPlanView(userId: string, savedPlan: AcceptedFinancialPlan): Promise<{ plan: FinancialPlanRecommendation; spentCentavos: number; payments: PlanCommitmentPayments | null }> {
  const savedRecommendation = savedPlanToRecommendation(savedPlan);
  const [labels, { allocationSpending, spentCentavos }, payments] = await Promise.all([getFinancialPlanLabels(userId, savedPlan), getFinancialPlanSpending(userId, savedPlan.id), loadCommitmentPayments(userId, savedRecommendation.period)]);
  return {
    payments,
    plan: { ...savedRecommendation, recommendation: applyFinancialPlanLabels({ ...savedRecommendation.recommendation, allocations: applyFinancialPlanSpending(savedRecommendation.recommendation.allocations, allocationSpending) }, labels) },
    spentCentavos,
  };
}

export default function FinancialPlanScreen({ userId, deviceId, accessToken, syncVersion, onSyncRequested, onOpenPastPlans }: Props) {
  const [plan, setPlan] = useState<FinancialPlanRecommendation | null>(null);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [planSpentCentavos, setPlanSpentCentavos] = useState<number | null>(null);
  const [commitmentPaymentsPaid, setCommitmentPaymentsPaid] = useState<PlanCommitmentPayments | null>(null);
  const [categories, setCategories] = useState<Subcategory[]>([]);
  const [topLevelCategories, setTopLevelCategories] = useState<Category[]>([]);
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());
  const [includedCategoryIds, setIncludedCategoryIds] = useState<Set<string>>(new Set());
  const [recommendedIds, setRecommendedIds] = useState<Set<string>>(new Set());
  const [recommendedCategoryIds, setRecommendedCategoryIds] = useState<Set<string>>(new Set());
  const [historyIds, setHistoryIds] = useState<Set<string>>(new Set());
  const [historyCategoryIds, setHistoryCategoryIds] = useState<Set<string>>(new Set());
  const [seasonalRecommendations, setSeasonalRecommendations] = useState(false);
  const [expectedSpend, setExpectedSpend] = useState<PlanRecommendations["expectedSpend"]>();
  const [planForecast, setPlanForecast] = useState<Record<string, number> | null>(null);
  const [availableMoneyCentavos, setAvailableMoneyCentavos] = useState(0);
  const [plannedAmount, setPlannedAmount] = useState("");
  const [manualAllocations, setManualAllocations] = useState<ManualPlanAllocation[]>([]);
  const [reservationSkips, setReservationSkips] = useState<ReservationSkips>({ debtRepayments: false, savingsContributions: false, scheduledPayments: false });
  // Commitment types the user budgets by hand on the review step instead of setting aside their amount due.
  const [manualCommitments, setManualCommitments] = useState<CommitmentSkips>({ debtRepayments: false, savingsContributions: false, scheduledPayments: false });
  const anyManualCommitments = manualCommitments.debtRepayments || manualCommitments.savingsContributions || manualCommitments.scheduledPayments;
  // Savings and debt edits after allocation only change the remaining money; insights describing the earlier allocation are hidden.
  const [commitmentsEdited, setCommitmentsEdited] = useState(false);
  const [acceptConfirmOpen, setAcceptConfirmOpen] = useState(false);
  const [commitmentPreview, setCommitmentPreview] = useState<CommitmentPreview | null>(null);
  const [commitmentDraft, setCommitmentDraft] = useState<CommitmentPreview | null>(null);
  const [invalidCommitmentFields, setInvalidCommitmentFields] = useState<Record<string, boolean>>({});
  const hasInvalidCommitments = Object.values(invalidCommitmentFields).some(Boolean);
  const setCommitmentValidity = (key: string, valid: boolean) => setInvalidCommitmentFields((current) => ({ ...current, [key]: !valid }));
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [devPlanMonth, setDevPlanMonth] = useState<string | undefined>();
  const selectedMonth = __DEV__ && devPlanMonth ? devPlanMonth : getPhilippineToday().slice(0, 7);
  const isDevPreview = __DEV__ && selectedMonth !== getPhilippineToday().slice(0, 7);
  const [reloadKey, setReloadKey] = useState(0);
  const requestAbort = useRef<AbortController | null>(null);
  const observedSyncVersion = useRef(syncVersion);

  const plannedAmountCentavos = toCentavos(plannedAmount);
  const planningAmountError = plannedAmountCentavos === null || plannedAmountCentavos <= 0
    ? "Enter an amount greater than zero."
    : plannedAmountCentavos > availableMoneyCentavos
      ? "Your planning amount cannot exceed available money."
      : null;

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
        setPlan(view.plan);
        setPlanSpentCentavos(view.spentCentavos);
        setCommitmentPaymentsPaid(view.payments);
        setSavedPlanId(savedPlan.id);
        setCommitmentsEdited(false);
        setState("saved");
        return;
      }
      const timedOut = cause instanceof Error && cause.name === "AbortError";
      setError(timedOut ? "Your Financial Plan took too long to generate. Try again." : cause instanceof Error ? cause.message : "Your Financial Plan could not be generated.");
      setState("error");
    } finally {
      if (requestAbort.current === controller) requestAbort.current = null;
    }
  }, [accessToken, deviceId, includedCategoryIds, includedIds, manualAllocations, plannedAmountCentavos, planningAmountError, reservationSkips, selectedMonth, devPlanMonth, userId, hasInvalidCommitments]);

  useEffect(() => {
    let active = true;
    void Promise.all([listCategories(userId), listSubcategories(userId, undefined, "expense"), listPlanRecommendations(userId, selectedMonth), getCurrentPeriodPlan(userId, selectedMonth), listFinancialAccounts(userId)]).then(async ([topLevelResult, result, recommendations, savedPlan, accounts]) => {
      if (!active) return;
      if (savedPlan) {
        const view = await loadSavedPlanView(userId, savedPlan);
        if (!active) return;
        setPlan(view.plan);
        setPlanSpentCentavos(view.spentCentavos);
        setCommitmentPaymentsPaid(view.payments);
        setSavedPlanId(savedPlan.id);
        setCommitmentsEdited(false);
        setState("saved");
        return;
      }
      const [preview, forecast] = await Promise.all([requestFinancialPlanCommitments(accessToken, __DEV__ ? devPlanMonth : undefined), requestFinancialPlanForecast(accessToken, __DEV__ ? devPlanMonth : undefined)]);
      const [previewLabels, previewPayments] = await Promise.all([getFinancialPlanLabels(userId, { recommendation: { allocations: [], ...preview } }), loadCommitmentPayments(userId, preview.period)]);
      if (!active) return;
      setCommitmentPaymentsPaid(previewPayments);
      const labeled = applyFinancialPlanLabels({ allocations: [], ...preview }, previewLabels);
      setCommitmentPreview(labeled);
      setCommitmentDraft(labeled);
      setInvalidCommitmentFields({});
      setTopLevelCategories(topLevelResult);
      setCategories(result);
      const validRecentIds = new Set(recommendations.subcategoryIds.filter((id) => result.some((category) => category.id === id)));
      const requiredIds = result.filter((category) => category.fixed_amount_centavos !== null || category.minimum_amount_centavos !== null).map((category) => category.id);
      const validRecentCategoryIds = new Set(recommendations.categoryIds.filter((id) => topLevelResult.some((category) => category.id === id)));
      const requiredCategoryIds = topLevelResult.filter((category) => category.fixed_amount_centavos != null || category.minimum_amount_centavos != null).map((category) => category.id);
      setRecommendedIds(validRecentIds);
      setHistoryIds(new Set(recommendations.historySubcategoryIds));
      setHistoryCategoryIds(new Set(recommendations.historyCategoryIds));
      setSeasonalRecommendations(recommendations.seasonal);
      const parentIdsWithHistory = result.filter((subcategory) => validRecentIds.has(subcategory.id)).flatMap((subcategory) => subcategory.category_id ? [subcategory.category_id] : []);
      setRecommendedCategoryIds(new Set([...validRecentCategoryIds, ...parentIdsWithHistory]));
      const initialIds = new Set([...requiredIds, ...validRecentIds]);
      const initialCategoryIds = new Set([...requiredCategoryIds, ...validRecentCategoryIds]);
       setIncludedIds(initialIds);
       setIncludedCategoryIds(initialCategoryIds);
      setExpectedSpend(recommendations.expectedSpend);
      setPlanForecast(forecast);
        setManualAllocations([]);
       setReservationSkips({ debtRepayments: false, savingsContributions: false, scheduledPayments: false });
      setManualCommitments({ debtRepayments: false, savingsContributions: false, scheduledPayments: false });
      setCommitmentsEdited(false);
      const available = accounts
        .filter((account) => account.status === "active" && account.kind !== "savings" && account.kind !== "credit_card")
        .reduce((sum, account) => sum + account.currentBalanceCentavos, 0);
      setAvailableMoneyCentavos(available);
      // Starts at what the month needs, never more than the money available.
      const recommended = recommendPlanAmount({ commitments: labeled, topLevelCategories: topLevelResult, subcategories: result, includedCategoryIds: initialCategoryIds, includedIds: initialIds, expectedSpend: recommendations.expectedSpend, forecast }).totalCentavos;
      setPlannedAmount((current) => current || ((recommended > 0 ? Math.min(recommended, available) : available) / 100).toFixed(2));
      setState("selecting");
    }).catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Your expense categories could not be loaded.");
      setState("error");
    });
    return () => { active = false; requestAbort.current?.abort(); };
  }, [reloadKey, selectedMonth, userId, accessToken, devPlanMonth]);

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
      setPlan(view.plan);
      setPlanSpentCentavos(view.spentCentavos);
      setCommitmentPaymentsPaid(view.payments);
      setSavedPlanId(savedPlan.id);
    }).catch(() => {});
    return () => { active = false; };
  }, [state, syncVersion, selectedMonth, userId]);

  const updateAllocation = (index: number, change: Partial<FinancialPlanAllocation>) => {
    if (!plan || state === "infeasible" || state === "saved" || state === "stale") return;
    const allocations = plan.recommendation.allocations.map((allocation, allocationIndex) => allocationIndex === index ? { ...allocation, ...change } : allocation);
    setError(null);
    setPlan({ ...plan, recommendation: { ...plan.recommendation, allocations } });
    setState("ready");
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

  const toggleSubcategory = (id: string) => {
    setIncludedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    const categoryId = categories.find((category) => category.id === id)?.category_id;
    if (categoryId) setIncludedCategoryIds((current) => { const next = new Set(current); next.delete(categoryId); return next; });
  };

  const toggleTopLevelCategory = (id: string) => {
    setIncludedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setIncludedIds((current) => new Set([...current].filter((subcategoryId) => categories.find((category) => category.id === subcategoryId)?.category_id !== id)));
  };

  const saveCategoryRule = async (subcategory: Subcategory, update: PlanCategoryRuleUpdate) => {
    const { subcategory: saved } = await updateSubcategory(userId, deviceId, subcategory.id, {
      minimum_amount_centavos: update.minimumAmountCentavos,
      fixed_amount_centavos: update.fixedAmountCentavos,
      always_in_budget: update.rule !== "FLEXIBLE",
    });
    setCategories((current) => current.map((item) => item.id === saved.id ? saved : item));
    if (update.rule !== "FLEXIBLE") setIncludedIds((current) => new Set([...current, saved.id]));
  };

  const saveTopLevelCategoryRule = async (category: Category, update: PlanCategoryRuleUpdate) => {
    const { category: saved } = await updateCategory(userId, deviceId, category.id, {
      minimum_amount_centavos: update.minimumAmountCentavos,
      fixed_amount_centavos: update.fixedAmountCentavos,
      always_in_budget: update.rule !== "FLEXIBLE",
    });
    setTopLevelCategories((current) => current.map((item) => item.id === saved.id ? saved : item));
    if (update.rule !== "FLEXIBLE") setIncludedCategoryIds((current) => new Set([...current, saved.id]));
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

  const resetPlan = () => {
    if (!savedPlanId) return;
    Alert.alert("Reset Financial Plan?", "This permanently removes this plan's allocations, debt reservations, savings reservations, biller and remittance reservations, and forecast data. You can create a new plan afterward, but this action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset plan",
        style: "destructive",
        onPress: () => {
          void deleteFinancialPlan(userId, deviceId, savedPlanId)
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
        },
      },
    ]);
  };

  const confirmReservationSkip = (type: "debtRepayments" | "savingsContributions", regenerate = true) => {
    const debtRepayments = type === "debtRepayments" ? plan?.recommendation.debtReservations ?? [] : [];
    const message = type === "debtRepayments"
      ? `Debt payments are underfunded and may result in missed payments. ${debtRepayments.length} debt payment${debtRepayments.length === 1 ? "" : "s"} will be excluded from this plan.`
      : "Savings contributions will be excluded from this plan. Missing a contribution may delay when your savings goals are met.";
    Alert.alert(type === "debtRepayments" ? "Skip debt repayments?" : "Skip savings contributions?", message, [
      { text: "Cancel", style: "cancel" },
       { text: "Skip for this plan", style: "destructive", onPress: () => {
         const nextReservationSkips = { ...reservationSkips, [type]: true };
         setReservationSkips(nextReservationSkips);
         if (regenerate) void loadRecommendation(manualAllocations, nextReservationSkips);
       } },
    ]);
  };

  const advancedSettings = __DEV__ && state !== "saving" && state !== "saved" ? <DevPlanMonthSettings month={selectedMonth} onChange={(month) => {
    requestAbort.current?.abort();
    setPlan(null);
    setSavedPlanId(null);
    setPlanSpentCentavos(0);
    setError(null);
    setState("loading");
    setDevPlanMonth(month);
  }} /> : null;

  if (state === "generating") return <PlanGeneratingScreen />;
  if (state === "loading") return <View style={{ paddingTop: 32, alignItems: "center" }}><ActivityIndicator color="#0E6D46" /><Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#6B7A6F", marginTop: 10 }}>Preparing your plan...</Text></View>;
  const pastPlansAction = onOpenPastPlans ? <Pressable accessibilityRole="button" accessibilityLabel="View past Financial Plans" onPress={onOpenPastPlans} style={{ alignSelf: "flex-end", paddingVertical: 4 }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 12, color: "#0E6D46" }}>Past plans</Text></Pressable> : null;
  if (state === "selecting") return <View>{pastPlansAction}{advancedSettings}<PlanCategorySelection topLevelCategories={topLevelCategories} subcategories={categories} includedCategoryIds={includedCategoryIds} includedIds={includedIds} recommendedCategoryIds={recommendedCategoryIds} recommendedIds={recommendedIds} historyCategoryIds={historyCategoryIds} historyIds={historyIds} seasonalRecommendations={seasonalRecommendations} onToggle={toggleSubcategory} onToggleCategory={toggleTopLevelCategory} onSaveCategoryRule={saveTopLevelCategoryRule} onSaveRule={saveCategoryRule} plannedAmount={plannedAmount} availableMoneyCentavos={availableMoneyCentavos} planningAmountError={planningAmountError} onPlannedAmountChange={setPlannedAmount} initialManualAllocations={manualAllocations} commitments={commitmentPreview} expectedSpend={expectedSpend} forecast={planForecast} commitmentSection={<PlanCommitmentChoices manual={manualCommitments} onChange={(next) => { setCommitmentDraft((current) => current && commitmentPreview ? manualCommitmentDraft(current, commitmentPreview, manualCommitments, next, previewPaidCentavos(commitmentPreview, commitmentPaymentsPaid)) : current); setManualCommitments(next); }} />} onContinue={(allocations) => {
    setManualAllocations(allocations);
    setError(null);
    // Without manual types, each commitment starts at its amount due and the plan is generated right away;
    // the user can still adjust those amounts on the plan. Budgeting any type manually opens the review step.
    if (!anyManualCommitments && commitmentPreview) {
      const nextReservationSkips = { ...reservationSkips, commitmentBudgets: selectedCommitmentBudgets(commitmentPreview, reservationSkips) };
      setReservationSkips(nextReservationSkips);
      void loadRecommendation(allocations, nextReservationSkips);
    } else setState("budgeting");
  }} /></View>;
  if ((state === "budgeting" || (state === "error" && !plan && anyManualCommitments)) && commitmentPreview && commitmentDraft) {
    return <View>{pastPlansAction}{advancedSettings}<PlanCommitmentReview requirements={commitmentPreview} draft={commitmentDraft} skips={reservationSkips} payments={commitmentPaymentsPaid ?? undefined} plannedAmountCentavos={plannedAmountCentavos ?? 0} invalid={hasInvalidCommitments || planningAmountError !== null} error={error} onAmountChange={(kind, index, amount) => {
      const amountCentavos = parseBudgetAmount(amount);
      if (amountCentavos === null) return;
      setCommitmentDraft((current) => current ? { ...current, [kind]: (current[kind] ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, amountCentavos } : row) } : current);
    }} onValidityChange={setCommitmentValidity} onBack={() => { setInvalidCommitmentFields({}); setError(null); setState("selecting"); }} onAllocate={() => void loadRecommendation(manualAllocations, { ...reservationSkips, commitmentBudgets: selectedCommitmentBudgets(commitmentDraft, reservationSkips) })} /></View>;
  }
  if (!plan) return <View style={{ marginTop: 16, backgroundColor: "#FBE9E7", borderRadius: 16, padding: 16 }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 15, color: "#D9001F" }}>Plan unavailable</Text><Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#414942", marginTop: 5 }}>{error ?? "Your Financial Plan could not be generated."}</Text>{advancedSettings}<Pressable accessibilityRole="button" accessibilityLabel="Retry Financial Plan" onPress={() => { if (commitmentPreview) void loadRecommendation(); else { setState("loading"); setReloadKey((key) => key + 1); } }} style={{ marginTop: 12 }}><Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 12, color: "#0E6D46" }}>Try again</Text></Pressable></View>;

  const { recommendation } = plan;
  const showDebtCommitments = state === "saved" ? plan.inputSnapshot.commitmentSelection?.debtRepayments !== false : !reservationSkips.debtRepayments;
  const showSavingsCommitments = state === "saved" ? plan.inputSnapshot.commitmentSelection?.savingsContributions !== false : !reservationSkips.savingsContributions;
  const showScheduledPayments = state === "saved" ? plan.inputSnapshot.commitmentSelection?.scheduledPayments !== false : !reservationSkips.scheduledPayments;
  const remainingUnallocated = state === "saved" ? planSpentCentavos === null ? null : planSpendableFundsCentavos(recommendation.availableFundsCentavos, recommendation.debtSurplusCentavos, recommendation.savingsSurplusCentavos) - planSpentCentavos : remainingUnallocatedCentavos(recommendation.availableFundsCentavos, recommendation.allocations, recommendation.debtSurplusCentavos, recommendation.savingsSurplusCentavos);
  const overAllocated = remainingUnallocated !== null && remainingUnallocated < 0;
  const surplusGuidance = recommendation.surplusRecommendation;
  const assessmentOutput = surplusGuidance?.assessmentEvidence?.outputSnapshot as Record<string, { value?: unknown }> | undefined;
  const ruleValue = (name: string) => typeof assessmentOutput?.[name]?.value === "number" ? assessmentOutput[name].value as number : null;
  const surplusGuidanceText = surplusGuidanceMessage(surplusGuidance, {
    monthsCovered: ruleValue("emergency_savings"),
    debtShare: ruleValue("debt_burden"),
    margin: ruleValue("financial_margin"),
  });
  const editableCommitments = state !== "saved" && state !== "saving";
  const obligationReservations = planObligations(plan).reservations;
  const sumAmounts = (rows: { amountCentavos: number }[]) => rows.reduce((total, row) => total + row.amountCentavos, 0);
  // availableFundsCentavos is what remains after reservations, so they are added back for the full plan total;
  // surpluses are already inside it.
  const reservedCentavos = (showSavingsCommitments ? sumAmounts(recommendation.savingsReservations) : 0)
    + (showDebtCommitments ? sumAmounts(recommendation.debtReservations) : 0)
    + (showScheduledPayments ? sumAmounts(obligationReservations) : 0);
  const commitmentsCentavos = reservedCentavos + (showSavingsCommitments ? recommendation.savingsSurplusCentavos ?? 0 : 0) + (showDebtCommitments ? recommendation.debtSurplusCentavos ?? 0 : 0);
  const commitmentInsights = state === "saved" ? planCommitmentStatusInsights(plan, commitmentPaymentsPaid) : [];
  const insights = state === "saved"
    ? planSpentCentavos === null || remainingUnallocated === null
      ? ["Your plan is saved. Spending insights are temporarily unavailable."]
      : planSpendingInsights({ allocations: recommendation.allocations, spentCentavos: planSpentCentavos, period: plan.period, today: getPhilippineToday(), funds: { remainingCentavos: remainingUnallocated, commitmentsCentavos } })
    : plan.explanations;
  const categoriesCentavos = sumAmounts(recommendation.allocations.map((allocation) => ({ amountCentavos: allocation.allocatedAmountCentavos })));
  const canRecalculate = state === "ready" || state === "infeasible";
  const recalculateAction = canRecalculate ? <Pressable accessibilityRole="button" accessibilityLabel="Calculate Allocations" disabled={hasInvalidCommitments} onPress={() => void loadRecommendation()} style={{ borderColor: "#013220", borderRadius: 999, borderWidth: 1, backgroundColor: commitmentsEdited ? "#013220" : "transparent", paddingHorizontal: 12, paddingVertical: 6, opacity: hasInvalidCommitments ? 0.5 : 1 }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 12, color: commitmentsEdited ? "#FFFFFF" : "#013220" }}>Recalculate</Text></Pressable> : null;
  const hasAllocationRows = groupPlanAllocations(recommendation.allocations, plan.inputSnapshot.restrictions).length > 0;
  // Returning to setup keeps the category choices and planning amount; continuing generates a fresh plan.
  const backToSetup = () => {
    requestAbort.current?.abort();
    setPlan(null);
    setInvalidCommitmentFields({});
    setCommitmentsEdited(false);
    setError(null);
    setState("selecting");
  };
  return (
    <View style={{ paddingBottom: 28 }}>
       <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 32 }}>
         {state !== "saved" && state !== "saving" ? <PlanBackLink onPress={backToSetup} /> : <View />}
         {pastPlansAction}
       </View>
       {advancedSettings}
       <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
         <View style={{ flex: 1 }}>
           <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 20, color: "#1B1C1A" }}>Financial Plan</Text>
           <Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#6B7A6F", marginTop: 2 }}>Review your plan for {plan.period.start} to {plan.period.end}.</Text>
         </View>
         {state === "saved" ? <Pressable accessibilityRole="button" accessibilityLabel="Reset Financial Plan" onPress={resetPlan} hitSlop={6} style={{ paddingVertical: 4 }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 12, color: "#D9001F" }}>Reset plan</Text></Pressable> : null}
       </View>
       {isDevPreview ? <Text accessibilityRole="alert" style={{ fontFamily: "Manrope", fontSize: 12, color: "#B45309", marginTop: 8 }}>Development preview only. Plans for other months cannot be saved.</Text> : null}
       <View style={{ marginTop: 16, borderRadius: 16, padding: 16, backgroundColor: "#013220" }}>
         <Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#D7EEE2" }}>Remaining Money in Plan</Text>
         <Text accessibilityRole={overAllocated ? "alert" : undefined} style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 25, color: overAllocated ? "#FFB4AB" : "#FFFFFF", marginTop: 2 }}>{remainingUnallocated === null ? "Unavailable" : formatPeso(remainingUnallocated)}</Text>
         <View style={{ flexDirection: "row", gap: 8, marginTop: 14, borderTopWidth: 1, borderTopColor: "#416153", paddingTop: 12 }}>
           {([["Plan total", recommendation.availableFundsCentavos + reservedCentavos], ["Commitments", commitmentsCentavos], ["Categories", categoriesCentavos]] as const).map(([label, amount]) => <View key={label} style={{ flex: 1 }}><Text style={{ fontFamily: "Manrope", fontSize: 11, color: "#9FC2B0" }}>{label}</Text><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 13, color: "#FFFFFF", marginTop: 2 }}>{formatPeso(amount)}</Text></View>)}
         </View>
       </View>
        <PlanEssentialShortfall allocations={recommendation.allocations} restrictions={plan.inputSnapshot.restrictions} />
        {!commitmentsEdited && insights.length ? <View style={{ backgroundColor: "#F0F7F3", borderColor: "#C8E2D4", borderRadius: 14, borderWidth: 1, marginTop: 16, padding: 14 }}>
         <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
           <Sparkle color="#0E6D46" size={18} weight="fill" />
           <Text style={{ color: "#0E6D46", fontFamily: "Manrope", fontSize: 13, fontWeight: "800" }}>Plan insights</Text>
         </View>
         {(commitmentInsights.length ? insights.slice(0, 2) : insights).map((explanation, index) => <Text key={`${explanation}-${index}`} style={{ color: "#414942", fontFamily: "Manrope", fontSize: 11.5, lineHeight: 18, marginTop: 8 }}>{explanation}</Text>)}
         {commitmentInsights.length ? <View style={{ marginTop: 10, gap: 4 }}>
           {commitmentInsights.map((summary) => <Text key={summary} style={{ color: "#414942", fontFamily: "Manrope", fontSize: 11.5, lineHeight: 18 }}>{summary}</Text>)}
         </View> : null}
        </View> : null}
         {state !== "saved" && !commitmentsEdited && surplusGuidance && surplusGuidance.unallocatedSurplusCentavos > 0 ? <View style={{ backgroundColor: "#FFF8E7", borderColor: "#F2D9A3", borderRadius: 14, borderWidth: 1, marginTop: 16, padding: 14 }}><Text style={{ color: "#6F4A00", fontFamily: "Manrope", fontSize: 13, fontWeight: "800" }}>{surplusGuidance.reasonCode === "REWARD_YOURSELF" ? "Reward yourself" : "Your leftover money"}</Text><Text style={{ color: "#414942", fontFamily: "Manrope", fontSize: 11.5, lineHeight: 18, marginTop: 6 }}>{formatPeso(surplusGuidance.unallocatedSurplusCentavos)} is left after your planned payments and budgets. {surplusGuidanceText}</Text></View> : null}
         {state !== "saved" && (reservationSkips.debtRepayments || reservationSkips.savingsContributions || reservationSkips.scheduledPayments) ? <View accessibilityRole="alert" style={{ backgroundColor: "#FFF8E7", borderColor: "#F2D9A3", borderRadius: 14, borderWidth: 1, marginTop: 16, padding: 14 }}><Text style={{ color: "#6F4A00", fontFamily: "Manrope", fontSize: 13, fontWeight: "800" }}>Skipped plan commitments</Text>{reservationSkips.debtRepayments ? <Text style={{ color: "#414942", fontFamily: "Manrope", fontSize: 11.5, lineHeight: 18, marginTop: 6 }}>Debt repayments excluded from this plan. Existing payments are still due.</Text> : null}{reservationSkips.savingsContributions ? <Text style={{ color: "#414942", fontFamily: "Manrope", fontSize: 11.5, lineHeight: 18, marginTop: 6 }}>Savings contributions are not included in this plan. Missing a contribution may delay when your savings goals are met.</Text> : null}{reservationSkips.scheduledPayments ? <Text style={{ color: "#414942", fontFamily: "Manrope", fontSize: 11.5, lineHeight: 18, marginTop: 6 }}>Billers and remittances excluded from this plan. Existing bills are still due.</Text> : null}</View> : null}
          {state === "infeasible" ? <View accessibilityRole="alert" style={{ marginTop: 16, borderRadius: 16, padding: 16, backgroundColor: "#FFF0F2" }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 15, color: "#D9001F" }}>This plan cannot cover all requirements</Text><Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#414942", marginTop: 5 }}>Shortfall: {formatPeso(recommendation.shortfallCentavos ?? 0)}. Fixed and minimum commitments were not reduced.</Text>{!reservationSkips.debtRepayments && recommendation.debtReservations.length ? <Pressable accessibilityRole="button" accessibilityLabel="Skip Debt Repayments" onPress={() => confirmReservationSkip("debtRepayments")} style={{ borderColor: "#B45309", borderRadius: 11, borderWidth: 1, marginTop: 14, padding: 12 }}><Text style={{ color: "#B45309", fontFamily: "Manrope", fontWeight: "800", textAlign: "center" }}>Skip Debt Repayments</Text></Pressable> : null}{!reservationSkips.savingsContributions && recommendation.savingsReservations.length ? <Pressable accessibilityRole="button" accessibilityLabel="Skip Savings Contributions" onPress={() => confirmReservationSkip("savingsContributions")} style={{ borderColor: "#B45309", borderRadius: 11, borderWidth: 1, marginTop: 10, padding: 12 }}><Text style={{ color: "#B45309", fontFamily: "Manrope", fontWeight: "800", textAlign: "center" }}>Skip Savings Contributions</Text></Pressable> : null}<Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 13, color: "#1B1C1A", marginTop: 14 }}>Have another number in mind?</Text><TextInput accessibilityLabel="New planning amount in pesos" value={plannedAmount} onChangeText={setPlannedAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#8A938C" style={{ backgroundColor: "#FFFFFF", borderColor: planningAmountError ? "#D9001F" : "#D7DDD8", borderRadius: 10, borderWidth: 1, color: "#1B1C1A", fontFamily: "Manrope", fontSize: 15, marginTop: 7, padding: 11 }} />{planningAmountError ? <Text accessibilityRole="alert" style={{ color: "#D9001F", fontFamily: "Manrope", fontSize: 11, marginTop: 5 }}>{planningAmountError}</Text> : null}<Pressable accessibilityRole="button" accessibilityLabel="Refresh plan with new amount" disabled={planningAmountError !== null} onPress={() => void loadRecommendation()} style={{ backgroundColor: "#013220", borderRadius: 11, padding: 12, marginTop: 10, opacity: planningAmountError ? 0.5 : 1 }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", color: "#FFFFFF", textAlign: "center" }}>Refresh plan</Text></Pressable></View> : null}
          {showSavingsCommitments || showDebtCommitments || showScheduledPayments ? <View style={{ flexDirection: "row", alignItems: "center", marginTop: 24 }}>
            <Text accessibilityRole="header" style={{ flex: 1, fontFamily: "Manrope", fontWeight: "800", fontSize: 16, color: "#1B1C1A" }}>Commitments</Text>
            <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 14, color: "#1B1C1A" }}>{formatPeso(commitmentsCentavos)}</Text>
          </View> : null}
          {showSavingsCommitments ? <PlanReservations title="Savings contributions" description="Your planned contributions and scheduled amounts for this month." collapsible={editableCommitments} defaultOpen={state === "infeasible"} requirements={requirementReservations(plan.inputSnapshot.savingsRequirements)} showUnderfundedWarnings={state === "saved"} reservations={recommendation.savingsReservations} payments={state === "saved" ? commitmentPaymentsPaid ?? undefined : undefined} surplusCentavos={recommendation.savingsSurplusCentavos} onReservationAmountChange={editableCommitments ? (index, amount) => updateReservationAmount("savingsReservations", index, amount) : undefined} onValidityChange={setCommitmentValidity} onSurplusAmountChange={editableCommitments ? (amount) => updateSurplus("savingsSurplusCentavos", amount) : undefined} /> : null}
          {showDebtCommitments ? <PlanReservations title="Debt repayments" description="Your planned repayments and original amounts due for this month." collapsible={editableCommitments} defaultOpen={state === "infeasible"} requirements={requirementReservations(plan.inputSnapshot.debtRequirements)} showUnderfundedWarnings={state === "saved"} reservations={recommendation.debtReservations} payments={state === "saved" ? commitmentPaymentsPaid ?? undefined : undefined} surplusCentavos={recommendation.debtSurplusCentavos} onReservationAmountChange={editableCommitments ? (index, amount) => updateReservationAmount("debtReservations", index, amount) : undefined} onValidityChange={setCommitmentValidity} onSurplusAmountChange={editableCommitments ? (amount) => updateSurplus("debtSurplusCentavos", amount) : undefined} /> : null}
          {showScheduledPayments ? <PlanScheduledPayments obligations={plan.inputSnapshot.obligations} collapsible={editableCommitments} defaultOpen={state === "infeasible"} showUnderfundedWarnings={state === "saved"} payments={state === "saved" ? commitmentPaymentsPaid ?? undefined : undefined} onValidityChange={setCommitmentValidity} onReservationAmountChange={editableCommitments ? (index, amount) => updateReservationAmount("obligations", index, amount) : undefined} /> : null}
        {commitmentsEdited && canRecalculate ? <View style={{ backgroundColor: "#F0F7F3", borderColor: "#C8E2D4", borderRadius: 14, borderWidth: 1, marginTop: 16, padding: 12 }}><Text style={{ fontFamily: "Manrope", fontSize: 12, lineHeight: 18, color: "#414942" }}>Your savings, debt, or bill amounts changed. Tap Recalculate to re-balance your categories, or adjust them yourself.</Text></View> : null}
        <PlanAllocations onValidityChange={setCommitmentValidity} headerAction={recalculateAction} allocations={recommendation.allocations} restrictions={plan.inputSnapshot.restrictions} showSpendingProgress={state === "saved" && planSpentCentavos !== null} readOnly={state === "saved" || state === "saving" || state === "stale"} onFlexibleAmountChange={(index, amount) => { const value = toCentavos(amount); if (value != null) updateAllocation(index, { allocatedAmountCentavos: value }); }} onWeightChange={(index, weight) => { const value = Number(weight); if (Number.isFinite(value) && value >= 0 && value <= 100) updateAllocation(index, { subcategoryWeightBps: Math.round(value * 100) }); }} />
        {!hasAllocationRows && recalculateAction ? <View style={{ alignItems: "flex-start", marginTop: 16 }}>{recalculateAction}</View> : null}
       <View style={{ marginTop: 22, borderTopWidth: 1, borderTopColor: "#EAEAE6", paddingTop: 4 }}>
       {state === "stale" ? <Text accessibilityRole="alert" style={{ fontFamily: "Manrope", fontSize: 12, color: "#B45309", marginTop: 12 }}>Your source data changed. Refresh this unaccepted recommendation before saving.</Text> : null}
       {overAllocated && state !== "saved" ? <Text accessibilityRole="alert" style={{ fontFamily: "Manrope", fontSize: 12, color: "#D9001F", marginTop: 12 }}>Reduce allocations or surplus amounts before saving this plan.</Text> : null}
       {error ? <Text accessibilityRole="alert" style={{ fontFamily: "Manrope", fontSize: 12, color: "#D9001F", marginTop: 12 }}>{error}</Text> : null}
       <UnderfundedCommitmentsDialog visible={acceptConfirmOpen} onCancel={() => setAcceptConfirmOpen(false)} onConfirm={() => { setAcceptConfirmOpen(false); void savePlan(); }} />
       {state !== "infeasible" && state !== "saved" && (!isDevPreview || state === "stale") ? <Pressable accessibilityRole="button" accessibilityLabel={state === "stale" ? "Refresh Financial Plan recommendation" : "Accept and save Financial Plan"} disabled={state === "saving" || overAllocated || hasInvalidCommitments} onPress={() => state === "stale" ? void loadRecommendation() : acceptPlan()} style={{ backgroundColor: "#013220", borderRadius: 14, padding: 14, marginTop: 12, opacity: state === "saving" || overAllocated || hasInvalidCommitments ? 0.6 : 1 }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", color: "#FFFFFF", textAlign: "center" }}>{state === "saving" ? "Saving..." : state === "stale" ? "Refresh recommendation" : "Accept and save plan"}</Text></Pressable> : null}
       </View>
    </View>
  );
}
