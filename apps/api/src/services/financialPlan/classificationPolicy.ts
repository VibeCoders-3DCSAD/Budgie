type SurplusReasonCode =
  | "DEBT_SIGNAL"
  | "EMERGENCY_FUND_INADEQUATE"
  | "CREDIT_CARD_SIGNAL"
  | "REWARD_YOURSELF"
  | "NEGATIVE_FINANCIAL_MARGIN"
  | "USER_DIRECTED"
  | "ASSESSMENT_UNAVAILABLE"
  | "ASSESSMENT_STALE"
  | "ASSESSMENT_INSUFFICIENT_DATA";

type SurplusDestination =
  | { type: "emergency_fund"; savingsGoalId: string }
  | { type: "debt"; debtAccountId: string }
  | { type: "credit_card"; accountId: string };

type SurplusRecommendation = {
  unallocatedSurplusCentavos: number;
  reasonCode: SurplusReasonCode;
  assessmentStatus: "applied" | "unavailable" | "stale" | "insufficient_data";
  advisoryDestination: SurplusDestination | null;
  assessmentEvidence: Record<string, unknown> | null;
};

type RuleAssessment = { status?: unknown; label?: unknown };
type CardAssessment = RuleAssessment & { account_id?: unknown; reported_duration?: unknown };
type Assessment = {
  id: string;
  assessedAt: string;
  ruleSetVersion: string;
  outputSnapshot: Record<string, unknown>;
};

function rule(snapshot: Record<string, unknown>, name: string): RuleAssessment | null {
  const value = snapshot[name];
  return value && typeof value === "object" && !Array.isArray(value) ? value as RuleAssessment : null;
}

function isSuccessful(assessment: RuleAssessment | null): boolean {
  return assessment?.status === "SUCCESS";
}

// How badly a card carries a balance: 0 means it is paid in full (or there is no card).
function cardSeverity(card: CardAssessment): number {
  if (!isSuccessful(card)) return 0;
  if (card.reported_duration === "no_credit_card" || card.reported_duration === "always_before_due") return 0;
  if (card.reported_duration === "over_a_year" || card.label === "HEAVY_REVOLVER") return 3;
  if (card.reported_duration === "1_to_11_months" || card.label === "REVOLVER") return 2;
  return card.label === "TRANSACTOR" ? 0 : 1;
}

// The card that carries a balance most often among the cards that allow extra payments.
// A self-reported answer has no account, so it points at the first eligible card.
function selectCreditCard(snapshot: Record<string, unknown>, eligibleCardIds: string[]): string | null {
  const cards = Array.isArray(snapshot.credit_card_behavior) ? snapshot.credit_card_behavior as CardAssessment[] : [];
  let best: { accountId: string; severity: number } | null = null;
  for (const card of cards) {
    const severity = cardSeverity(card);
    const accountId = typeof card.account_id === "string" && card.account_id !== "self_reported" ? card.account_id : eligibleCardIds[0];
    if (severity === 0 || !accountId || !eligibleCardIds.includes(accountId)) continue;
    if (!best || severity > best.severity) best = { accountId, severity };
  }
  return best?.accountId ?? null;
}

export function deriveSurplusRecommendation({
  unallocatedSurplusCentavos,
  assessment,
  sourceUpdatedAt,
  eligibleEmergencyGoalId,
  eligibleDebtId,
  eligibleCardIds = [],
}: {
  unallocatedSurplusCentavos: number;
  assessment: Assessment | null;
  sourceUpdatedAt: string | null;
  eligibleEmergencyGoalId: string | null;
  eligibleDebtId: string | null;
  eligibleCardIds?: string[];
}): SurplusRecommendation {
  const surplus = Math.max(0, Math.trunc(unallocatedSurplusCentavos));
  const evidence = assessment ? {
    assessmentId: assessment.id,
    assessedAt: assessment.assessedAt,
    ruleSetVersion: assessment.ruleSetVersion,
    outputSnapshot: assessment.outputSnapshot,
  } : null;
  const result = (reasonCode: SurplusReasonCode, assessmentStatus: SurplusRecommendation["assessmentStatus"], advisoryDestination: SurplusDestination | null = null): SurplusRecommendation =>
    ({ unallocatedSurplusCentavos: surplus, reasonCode, assessmentStatus, advisoryDestination, assessmentEvidence: evidence });

  if (!assessment) return result("ASSESSMENT_UNAVAILABLE", "unavailable");
  if (sourceUpdatedAt && new Date(sourceUpdatedAt).getTime() > new Date(assessment.assessedAt).getTime()) {
    return result("ASSESSMENT_STALE", "stale");
  }

  // Each check stands alone: a row without enough data is skipped instead of blocking the others.
  const debtBurden = rule(assessment.outputSnapshot, "debt_burden");
  const emergencySavings = rule(assessment.outputSnapshot, "emergency_savings");
  const financialMargin = rule(assessment.outputSnapshot, "financial_margin");
  if (isSuccessful(debtBurden) && debtBurden?.label === "FINANCIALLY_OVERBURDENED" && eligibleDebtId) {
    return result("DEBT_SIGNAL", "applied", { type: "debt", debtAccountId: eligibleDebtId });
  }
  if (isSuccessful(emergencySavings) && emergencySavings?.label === "EMERGENCY_FUND_INADEQUATE" && eligibleEmergencyGoalId) {
    return result("EMERGENCY_FUND_INADEQUATE", "applied", { type: "emergency_fund", savingsGoalId: eligibleEmergencyGoalId });
  }
  const cardId = selectCreditCard(assessment.outputSnapshot, eligibleCardIds);
  if (cardId) return result("CREDIT_CARD_SIGNAL", "applied", { type: "credit_card", accountId: cardId });
  // A missing payment destination does not resolve the profile's warning.
  // Preserve actionable suggestions above, but never turn unresolved warnings into a reward.
  if (isSuccessful(debtBurden) && debtBurden?.label === "FINANCIALLY_OVERBURDENED") return result("DEBT_SIGNAL", "applied");
  if (isSuccessful(emergencySavings) && emergencySavings?.label === "EMERGENCY_FUND_INADEQUATE") return result("EMERGENCY_FUND_INADEQUATE", "applied");
  const cards = Array.isArray(assessment.outputSnapshot.credit_card_behavior) ? assessment.outputSnapshot.credit_card_behavior as CardAssessment[] : [];
  if (cards.some((card) => cardSeverity(card) > 0)) return result("CREDIT_CARD_SIGNAL", "applied");
  if (isSuccessful(financialMargin)) {
    if (financialMargin?.label !== "NEGATIVE_FINANCIAL_MARGIN") return result("REWARD_YOURSELF", "applied");
    // A tight month still leaves money in this plan: debt comes first, then the emergency fund.
    const destination: SurplusDestination | null = eligibleDebtId
      ? { type: "debt", debtAccountId: eligibleDebtId }
      : eligibleCardIds[0]
        ? { type: "credit_card", accountId: eligibleCardIds[0] }
        : eligibleEmergencyGoalId ? { type: "emergency_fund", savingsGoalId: eligibleEmergencyGoalId } : null;
    return result("NEGATIVE_FINANCIAL_MARGIN", "applied", destination);
  }
  return result("ASSESSMENT_INSUFFICIENT_DATA", "insufficient_data");
}
