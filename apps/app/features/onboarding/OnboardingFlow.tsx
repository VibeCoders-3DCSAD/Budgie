import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import KeyboardAvoider from "../../components/KeyboardAvoider";
import { useConnectivityStore } from "../../services/connectivity";
import { useToast } from "../../components/Toast";
import {
  createSession,
  getCurrentSession,
  submitSession,
  updateSession,
} from "./api";
import { STEPS, type SubmitResult } from "./types";
import { currentSeasonalAnswers, withOnboardingAnswer } from "./helpers/seasonalAnswers";
import { isStepComplete, isStepVisible, nextVisibleStepIndex } from "./helpers/stepNavigation";
import { AQUA950, ERROR } from "./colors";
import { OnboardingStatusMessage } from "./components/OnboardingStatusMessage";
import { OnboardingProgressBar } from "./components/OnboardingProgressBar";
import { OnboardingBackButton } from "./components/OnboardingBackButton";
import { OnboardingStepHeader } from "./components/OnboardingStepHeader";
import { OnboardingStepContent } from "./components/OnboardingStepContent";
import { OnboardingFooter } from "./components/OnboardingFooter";
import { ResultScreen } from "./steps/ResultScreen";

type OnboardingFlowProps = {
  accessToken: string;
  userId: string;
  onComplete: () => void;
};

export default function OnboardingFlow({
  accessToken,
  userId: _userId,
  onComplete,
}: OnboardingFlowProps) {
  const online = useConnectivityStore((state) => state.online);
  const { showToast } = useToast();

  const [initializing, setInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [incomeText, setIncomeText] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const onlineRef = useRef(online);
  onlineRef.current = online;

  // ── Session init ──
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    async function init() {
      try {
        const { response, body } = await getCurrentSession(accessToken);
        if (cancelled) return;

        if (response.ok && body.payload?.session) {
          const sess = body.payload.session;
          if (sess.status === "submitted") {
            onComplete();
            return;
          } else {
            setSessionId(sess.id);
            if (sess.raw_answers) {
              const raw = currentSeasonalAnswers(sess.raw_answers);
              setAnswers(raw);
              if (typeof raw.monthly_income === "string") setIncomeText(raw.monthly_income);
            }
            const savedStepKey = sess.current_step_key;
            const idx = STEPS.findIndex((s) => s.key === savedStepKey);
            if (idx >= 0) setStepIndex(idx);
          }
        } else {
          const initialAnswers = { questionnaire_version: "2" };
          const { response: cr, body: cb } = await createSession(accessToken, initialAnswers);
          setAnswers(initialAnswers);
          if (cancelled) return;
          if (cr.ok && cb.payload?.session) {
            setSessionId(cb.payload.session.id);
          } else {
            if (!cancelled) setInitError(cb?.message ?? "Failed to create onboarding session.");
            return;
          }
        }
        if (!cancelled) setInitError(null);
      } catch {
        if (!cancelled && onlineRef.current) setInitError("Failed to load onboarding session. Please check your connection and try again.");
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [accessToken, onComplete, showToast, online]);

  // ── Persist progress on step change ──
  const persistStep = useCallback(
    async (sid: string, stepKey: string, raw: Record<string, unknown>) => {
      try {
        await updateSession(accessToken, sid, {
          current_step_key: stepKey,
          raw_answers: raw,
        });
      } catch {}
    },
    [accessToken],
  );

  // ── Navigation ──
  const goNext = useCallback(() => {
    const currentStep = STEPS[stepIndex];
    if (!currentStep) return;
    if (!isStepComplete(currentStep, answersRef.current)) {
      setFieldErrors({ [currentStep.questionKey]: currentStep.kind === "card_multi_select" ? "Select at least one answer." : "This answer is required." });
      return;
    }
    setFieldErrors({});
    const next = nextVisibleStepIndex(stepIndex, 1, answersRef.current);
    const nextStep = STEPS[next];
    if (!nextStep) return;
    setStepIndex(next);
    if (sessionRef.current)
      persistStep(sessionRef.current, nextStep.key, answersRef.current);
  }, [stepIndex, persistStep]);

  const goBack = useCallback(() => {
    const previous = nextVisibleStepIndex(stepIndex, -1, answersRef.current);
    if (previous >= 0) setStepIndex(previous);
  }, [stepIndex]);

  const saveAnswer = useCallback(
    (key: string, value: unknown) => {
      setAnswers((prev) => withOnboardingAnswer(prev, key, value));
      setFieldErrors((errors) => {
        const { [key]: _, ...remaining } = errors;
        return remaining;
      });
    },
    [],
  );

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid) return;
    const firstIncomplete = STEPS.findIndex((item) => isStepVisible(item, answersRef.current) && !isStepComplete(item, answersRef.current));
    if (firstIncomplete >= 0) {
      setStepIndex(firstIncomplete);
      const missingStep = STEPS[firstIncomplete];
      if (missingStep) setFieldErrors({ [missingStep.questionKey]: "This answer is required." });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { response: updateRes, body: updateBody } = await updateSession(accessToken, sid, {
        current_step_key: "review",
        raw_answers: answersRef.current,
      });
      if (!updateRes.ok) {
        setSubmitError(updateBody?.message ?? "Failed to save answers.");
        setSubmitting(false);
        return;
      }
      const { response, body } = await submitSession(accessToken, sid);
      if (response.ok && body.payload) {
        setSubmitResult(body.payload);
      } else {
        setSubmitError(body.message ?? "Submission failed.");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    }
    setSubmitting(false);
  }, [accessToken, showToast]);

  // ── Offline guard ──
  if (!online) {
    return <OnboardingStatusMessage title="Internet Required" message="Onboarding requires an internet connection. Please connect and try again." />;
  }

  // ── Loading ──
  if (initializing) {
    return (
      <View className="flex-1 items-center justify-center bg-card">
        <ActivityIndicator color={AQUA950} />
      </View>
    );
  }

  // ── Init error ──
  if (initError) {
    return <OnboardingStatusMessage title="Unable to Start" message={initError} />;
  }

  // ── Result screen ──
  if (submitResult) {
    return <ResultScreen accessToken={accessToken} result={submitResult} error={submitError} onContinue={onComplete} />;
  }

  const visibleSteps = STEPS.filter((item) => isStepVisible(item, answers));
  const visibleStepIndex = visibleSteps.indexOf(STEPS[stepIndex]!);
  const step = STEPS[stepIndex];
  if (!step) return null;

  return (
    <KeyboardAvoider>
    <View className="flex-1 bg-card">
      {/* Progress bar */}
      <OnboardingProgressBar visibleSteps={visibleSteps} visibleStepIndex={visibleStepIndex} />

      {/* Back button */}
      {visibleStepIndex > 0 && <OnboardingBackButton onPress={goBack} />}

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Step header */}
        <OnboardingStepHeader step={step} />

        {/* Step content */}
        <OnboardingStepContent
          step={step}
          answers={answers}
          saveAnswer={saveAnswer}
          incomeText={incomeText}
          setIncomeText={setIncomeText}
          onEdit={(idx) => setStepIndex(idx)}
        />

        {fieldErrors[step.questionKey] ? (
          <Text style={{ color: ERROR, fontFamily: "Manrope", fontSize: 13, fontWeight: "600", marginTop: 12 }}>
            {fieldErrors[step.questionKey]}
          </Text>
        ) : null}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom CTA */}
      <OnboardingFooter isReview={step.kind === "review"} submitting={submitting} onSubmit={handleSubmit} onContinue={goNext} />
    </View>
    </KeyboardAvoider>
  );
}
