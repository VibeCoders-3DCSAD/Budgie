import { useState } from "react";
import { Redirect } from "expo-router";
import OnboardingFlow from "../../features/onboarding/OnboardingFlow";
import { useSession } from "../../features/auth/components/AccessProvider";
import { useAuthStore } from "../../features/auth/stores/useAuthStore";
import { ROUTES } from "../../routes";

export default function UserOnboarding() {
  const { accessToken, userId, onboardingStatus } = useSession();
  const [completed, setCompleted] = useState(false);
  // Redirect only after the stored status flips, so the dashboard guard is already open.
  if (completed && onboardingStatus === "submitted") return <Redirect href={ROUTES.dashboard} />;
  return <OnboardingFlow accessToken={accessToken} userId={userId}
    onComplete={() => { void useAuthStore.getState().updateOnboarding().then(() => setCompleted(true)); }} />;
}
