import { Sparkle } from "phosphor-react-native";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { manilaToday } from "../../lib/dates";
import { planObligations, requirementReservations } from "./helpers/commitmentBudget";
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
import { formatPeso, remainingUnallocatedCentavos } from "./helpers/financialPlanPresentation";
import { useCommitmentDraft } from "./hooks/useCommitmentDraft";
import { useFinancialPlanController } from "./hooks/useFinancialPlanController";
import { usePlanCategorySelection } from "./hooks/usePlanCategorySelection";

type Props = { userId: string; deviceId: string; accessToken: string; syncVersion: number; onSyncRequested?: () => Promise<void>; onOpenPastPlans?: () => void };

export default function FinancialPlanScreen({ userId, deviceId, accessToken, syncVersion, onSyncRequested, onOpenPastPlans }: Props) {
  const commitments = useCommitmentDraft();
  const { preview: commitmentPreview, draft: commitmentDraft, manual: manualCommitments, anyManual: anyManualCommitments, hasInvalidCommitments, setValidity: setCommitmentValidity } = commitments;
  const categorySelection = usePlanCategorySelection(userId, deviceId);
  const controller = useFinancialPlanController({ userId, deviceId, accessToken, syncVersion, onSyncRequested, commitments, categorySelection });
  const { plan, state, error, planSpentCentavos, commitmentPaymentsPaid, savedPlanId, commitmentsEdited, acceptConfirmOpen, reservationSkips, manualAllocations, selectedMonth, isDevPreview, plannedAmount, setPlannedAmount, plannedAmountCentavos, planningAmountError, loadRecommendation } = controller;

  const resetPlan = () => {
    if (!savedPlanId) return;
    Alert.alert("Reset Financial Plan?", "This permanently removes this plan's allocations, debt reservations, savings reservations, biller and remittance reservations, and forecast data. You can create a new plan afterward, but this action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reset plan", style: "destructive", onPress: () => controller.resetSavedPlan(savedPlanId) },
    ]);
  };

  const confirmReservationSkip = (type: "debtRepayments" | "savingsContributions", regenerate = true) => {
    const debtRepayments = type === "debtRepayments" ? plan?.recommendation.debtReservations ?? [] : [];
    const message = type === "debtRepayments"
      ? `Debt payments are underfunded and may result in missed payments. ${debtRepayments.length} debt payment${debtRepayments.length === 1 ? "" : "s"} will be excluded from this plan.`
      : "Savings contributions will be excluded from this plan. Missing a contribution may delay when your savings goals are met.";
    Alert.alert(type === "debtRepayments" ? "Skip debt repayments?" : "Skip savings contributions?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Skip for this plan", style: "destructive", onPress: () => controller.skipReservation(type, regenerate) },
    ]);
  };

  const advancedSettings = __DEV__ && state !== "saving" && state !== "saved" ? <DevPlanMonthSettings month={selectedMonth} onChange={controller.changeDevPlanMonth} /> : null;

  if (state === "generating") return <PlanGeneratingScreen />;
  if (state === "loading") return <View style={{ paddingTop: 32, alignItems: "center" }}><ActivityIndicator color="#0E6D46" /><Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#6B7A6F", marginTop: 10 }}>Preparing your plan...</Text></View>;
  const pastPlansAction = onOpenPastPlans ? <Pressable accessibilityRole="button" accessibilityLabel="View past Financial Plans" onPress={onOpenPastPlans} style={{ alignSelf: "flex-end", paddingVertical: 4 }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 12, color: "#0E6D46" }}>Past plans</Text></Pressable> : null;
  if (state === "selecting") return <View>{pastPlansAction}{advancedSettings}<PlanCategorySelection topLevelCategories={categorySelection.topLevelCategories} subcategories={categorySelection.categories} includedCategoryIds={categorySelection.includedCategoryIds} includedIds={categorySelection.includedIds} recommendedCategoryIds={categorySelection.recommendedCategoryIds} recommendedIds={categorySelection.recommendedIds} historyCategoryIds={categorySelection.historyCategoryIds} historyIds={categorySelection.historyIds} seasonalRecommendations={categorySelection.seasonalRecommendations} onToggle={categorySelection.toggleSubcategory} onToggleCategory={categorySelection.toggleTopLevelCategory} onSaveCategoryRule={categorySelection.saveTopLevelCategoryRule} onSaveRule={categorySelection.saveCategoryRule} plannedAmount={plannedAmount} availableMoneyCentavos={controller.availableMoneyCentavos} planningAmountError={planningAmountError} onPlannedAmountChange={setPlannedAmount} initialManualAllocations={manualAllocations} commitments={commitmentPreview} expectedSpend={categorySelection.expectedSpend} forecast={controller.planForecast} commitmentSection={<PlanCommitmentChoices manual={manualCommitments} onChange={(next) => commitments.changeManual(next, commitmentPaymentsPaid)} />} onContinue={controller.continueFromSelection} /></View>;
  if ((state === "budgeting" || (state === "error" && !plan && anyManualCommitments)) && commitmentPreview && commitmentDraft) {
    return <View>{pastPlansAction}{advancedSettings}<PlanCommitmentReview requirements={commitmentPreview} draft={commitmentDraft} skips={reservationSkips} payments={commitmentPaymentsPaid ?? undefined} plannedAmountCentavos={plannedAmountCentavos ?? 0} invalid={hasInvalidCommitments || planningAmountError !== null} error={error} onAmountChange={commitments.changeAmount} onValidityChange={setCommitmentValidity} onBack={controller.leaveCommitmentReview} onAllocate={controller.allocateCommitmentDraft} /></View>;
  }
  if (!plan) return <View style={{ marginTop: 16, backgroundColor: "#FBE9E7", borderRadius: 16, padding: 16 }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 15, color: "#D9001F" }}>Plan unavailable</Text><Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#414942", marginTop: 5 }}>{error ?? "Your Financial Plan could not be generated."}</Text>{advancedSettings}<Pressable accessibilityRole="button" accessibilityLabel="Retry Financial Plan" onPress={controller.retry} style={{ marginTop: 12 }}><Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 12, color: "#0E6D46" }}>Try again</Text></Pressable></View>;

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
      : planSpendingInsights({ allocations: recommendation.allocations, spentCentavos: planSpentCentavos, period: plan.period, today: manilaToday(), funds: { remainingCentavos: remainingUnallocated, commitmentsCentavos } })
    : plan.explanations;
  const categoriesCentavos = sumAmounts(recommendation.allocations.map((allocation) => ({ amountCentavos: allocation.allocatedAmountCentavos })));
  const canRecalculate = state === "ready" || state === "infeasible";
  const recalculateAction = canRecalculate ? <Pressable accessibilityRole="button" accessibilityLabel="Calculate Allocations" disabled={hasInvalidCommitments} onPress={() => void loadRecommendation()} style={{ borderColor: "#013220", borderRadius: 999, borderWidth: 1, backgroundColor: commitmentsEdited ? "#013220" : "transparent", paddingHorizontal: 12, paddingVertical: 6, opacity: hasInvalidCommitments ? 0.5 : 1 }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 12, color: commitmentsEdited ? "#FFFFFF" : "#013220" }}>Recalculate</Text></Pressable> : null;
  const hasAllocationRows = groupPlanAllocations(recommendation.allocations, plan.inputSnapshot.restrictions).length > 0;
  return (
    <View style={{ paddingBottom: 28 }}>
       <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 32 }}>
         {state !== "saved" && state !== "saving" ? <PlanBackLink onPress={controller.backToSetup} /> : <View />}
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
          {showSavingsCommitments ? <PlanReservations title="Savings contributions" description="Your planned contributions and scheduled amounts for this month." collapsible={editableCommitments} defaultOpen={state === "infeasible"} requirements={requirementReservations(plan.inputSnapshot.savingsRequirements)} showUnderfundedWarnings={state === "saved"} reservations={recommendation.savingsReservations} payments={state === "saved" ? commitmentPaymentsPaid ?? undefined : undefined} surplusCentavos={recommendation.savingsSurplusCentavos} onReservationAmountChange={editableCommitments ? (index, amount) => controller.updateReservationAmount("savingsReservations", index, amount) : undefined} onValidityChange={setCommitmentValidity} onSurplusAmountChange={editableCommitments ? (amount) => controller.updateSurplus("savingsSurplusCentavos", amount) : undefined} /> : null}
          {showDebtCommitments ? <PlanReservations title="Debt repayments" description="Your planned repayments and original amounts due for this month." collapsible={editableCommitments} defaultOpen={state === "infeasible"} requirements={requirementReservations(plan.inputSnapshot.debtRequirements)} showUnderfundedWarnings={state === "saved"} reservations={recommendation.debtReservations} payments={state === "saved" ? commitmentPaymentsPaid ?? undefined : undefined} surplusCentavos={recommendation.debtSurplusCentavos} onReservationAmountChange={editableCommitments ? (index, amount) => controller.updateReservationAmount("debtReservations", index, amount) : undefined} onValidityChange={setCommitmentValidity} onSurplusAmountChange={editableCommitments ? (amount) => controller.updateSurplus("debtSurplusCentavos", amount) : undefined} /> : null}
          {showScheduledPayments ? <PlanScheduledPayments obligations={plan.inputSnapshot.obligations} collapsible={editableCommitments} defaultOpen={state === "infeasible"} showUnderfundedWarnings={state === "saved"} payments={state === "saved" ? commitmentPaymentsPaid ?? undefined : undefined} onValidityChange={setCommitmentValidity} onReservationAmountChange={editableCommitments ? (index, amount) => controller.updateReservationAmount("obligations", index, amount) : undefined} /> : null}
        {commitmentsEdited && canRecalculate ? <View style={{ backgroundColor: "#F0F7F3", borderColor: "#C8E2D4", borderRadius: 14, borderWidth: 1, marginTop: 16, padding: 12 }}><Text style={{ fontFamily: "Manrope", fontSize: 12, lineHeight: 18, color: "#414942" }}>Your savings, debt, or bill amounts changed. Tap Recalculate to re-balance your categories, or adjust them yourself.</Text></View> : null}
        <PlanAllocations onValidityChange={setCommitmentValidity} headerAction={recalculateAction} allocations={recommendation.allocations} restrictions={plan.inputSnapshot.restrictions} showSpendingProgress={state === "saved" && planSpentCentavos !== null} readOnly={state === "saved" || state === "saving" || state === "stale"} onFlexibleAmountChange={controller.changeFlexibleAmount} onWeightChange={controller.changeWeight} />
        {!hasAllocationRows && recalculateAction ? <View style={{ alignItems: "flex-start", marginTop: 16 }}>{recalculateAction}</View> : null}
       <View style={{ marginTop: 22, borderTopWidth: 1, borderTopColor: "#EAEAE6", paddingTop: 4 }}>
       {state === "stale" ? <Text accessibilityRole="alert" style={{ fontFamily: "Manrope", fontSize: 12, color: "#B45309", marginTop: 12 }}>Your source data changed. Refresh this unaccepted recommendation before saving.</Text> : null}
       {overAllocated && state !== "saved" ? <Text accessibilityRole="alert" style={{ fontFamily: "Manrope", fontSize: 12, color: "#D9001F", marginTop: 12 }}>Reduce allocations or surplus amounts before saving this plan.</Text> : null}
       {error ? <Text accessibilityRole="alert" style={{ fontFamily: "Manrope", fontSize: 12, color: "#D9001F", marginTop: 12 }}>{error}</Text> : null}
       <UnderfundedCommitmentsDialog visible={acceptConfirmOpen} onCancel={controller.cancelAccept} onConfirm={controller.confirmAccept} />
       {state !== "infeasible" && state !== "saved" && (!isDevPreview || state === "stale") ? <Pressable accessibilityRole="button" accessibilityLabel={state === "stale" ? "Refresh Financial Plan recommendation" : "Accept and save Financial Plan"} disabled={state === "saving" || overAllocated || hasInvalidCommitments} onPress={() => state === "stale" ? void loadRecommendation() : controller.acceptPlan()} style={{ backgroundColor: "#013220", borderRadius: 14, padding: 14, marginTop: 12, opacity: state === "saving" || overAllocated || hasInvalidCommitments ? 0.6 : 1 }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", color: "#FFFFFF", textAlign: "center" }}>{state === "saving" ? "Saving..." : state === "stale" ? "Refresh recommendation" : "Accept and save plan"}</Text></Pressable> : null}
       </View>
    </View>
  );
}
