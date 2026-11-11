import { router } from "expo-router";
import type { SpotlightTour } from "react-native-spotlight-tour";
import { ROUTES } from "../../../routes";
import { TOUR_STEPS, firstStepOfStage, stepIndex } from "../steps";
import { useTourStore } from "../stores/useTourStore";
import { waitForTarget } from "../stores/useTourTargets";
import type { TourProgress, TourStage, TourStatus, TourStepDef } from "../types";
import { enterPracticeMode, exitPracticeMode } from "./practiceSession";
import { scrollTargetIntoView } from "./targetVisibility";
import { writeTourProgress } from "./tourProgress";

// How long a step waits for its screen and highlighted control before offering recovery. Generous: the Financial
// Plan rebuilds itself when the tour returns from Past plans, which can take several seconds.
export const TARGET_TIMEOUT_MS = 10_000;
const LAYOUT_RETRY_MS = 100;

type TourHandle = Pick<SpotlightTour, "goTo" | "stop">;
let getHandle: () => TourHandle | null = () => null;

// The tour host hands over the spotlight provider, so the actions below can drive it from anywhere.
export function attachTourHandle(next: () => TourHandle | null): () => void {
  getHandle = next;
  return () => { getHandle = () => null; };
}

// Runs before a step is shown: opens its screen, waits for its target, and scrolls it into view. Never rejects
// (the spotlight library does not catch it); an unreachable target is flagged so the step offers recovery.
export async function prepareStep(step: TourStepDef, index: number): Promise<void> {
  useTourStore.setState({ unavailableIndex: null });
  try {
    if (step.route) router.navigate(typeof step.route === "function" ? step.route() : step.route);
    if (!step.target) return;
    const deadline = Date.now() + TARGET_TIMEOUT_MS;
    const ready = await waitForTarget(step.target, TARGET_TIMEOUT_MS) && await waitForLayout(step.target, deadline);
    if (!ready) useTourStore.setState({ unavailableIndex: index });
  } catch {
    useTourStore.setState({ unavailableIndex: index });
  }
}

// A target that has just mounted measures as nothing until its first layout, so keep trying until the deadline.
async function waitForLayout(target: string, deadline: number): Promise<boolean> {
  while (await scrollTargetIntoView(target) === null) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, LAYOUT_RETRY_MS));
  }
  return true;
}

// Shows a step. Explanations use the spotlight; a tap step closes it and lets the hint layer wait for the
// user's own tap, falling back to the spotlight's recovery card when its control cannot be shown.
export async function showStep(index: number): Promise<void> {
  const step = TOUR_STEPS[index];
  if (!step) return;
  useTourStore.setState({ stepIndex: index, tapIndex: null });
  if (step.action !== "tap") return getHandle()?.goTo(index);
  getHandle()?.stop();
  await prepareStep(step, index);
  if (useTourStore.getState().stepIndex !== index) return;
  if (useTourStore.getState().unavailableIndex === index) return getHandle()?.goTo(index);
  useTourStore.setState({ tapIndex: index });
}

export async function nextStep(userId: string): Promise<void> {
  const current = useTourStore.getState().stepIndex ?? -1;
  if (current >= TOUR_STEPS.length - 1) return finishTour(userId);
  await showStep(current + 1);
}

export async function previousStep(): Promise<void> {
  const current = useTourStore.getState().stepIndex ?? 0;
  if (current > 0) await showStep(current - 1);
}

// A TourTarget was pressed. When it is the control a tap step is waiting for, the tour moves on once the
// press has had its effect (usually opening another screen).
export function notifyTargetPress(id: string): void {
  const { tapIndex, userId } = useTourStore.getState();
  if (tapIndex === null || !userId || TOUR_STEPS[tapIndex]?.target !== id) return;
  useTourStore.setState({ tapIndex: null });
  setTimeout(() => { void nextStep(userId); }, 0);
}

// Switches to practice data and shows the first step (start, replay), the saved one (resume), or the first step
// of a stage (the developer replay in Settings).
export async function startTour(userId: string, from: "start" | "resume" | "replay", stage?: TourStage): Promise<boolean> {
  const { phase, progress } = useTourStore.getState();
  if (!getHandle() || phase !== "idle") return false;
  useTourStore.setState({ phase: "starting", loadFailed: false, saveFailed: false, unavailableIndex: null });
  try {
    await enterPracticeMode(userId);
  } catch {
    useTourStore.setState({ phase: "idle", loadFailed: true });
    return false;
  }
  useTourStore.setState({ phase: "running", userId });
  if (stage) {
    // Some stages open with a tab-bar tap, which needs a tab page in front rather than Settings.
    router.navigate(ROUTES.dashboard);
    await showStep(firstStepOfStage(stage));
    return true;
  }
  await showStep(from === "resume" ? stepIndex(progress?.stepId ?? null) : 0);
  return true;
}

// Saves the step on screen, so a lock or a closed app resumes here.
export function recordStep(userId: string, stepId: string): Promise<void> {
  return save(userId, "active", stepId);
}

export async function continueLater(userId: string): Promise<void> {
  const current = useTourStore.getState().stepIndex;
  await endRun(userId, "paused", current === null ? null : TOUR_STEPS[current]?.id ?? null);
}

export function finishTour(userId: string): Promise<void> {
  return endRun(userId, "completed", null);
}

// The offer's "Skip for now": nothing to tear down, the tour never started.
export function skipTour(userId: string): Promise<void> {
  return save(userId, "skipped", null);
}

export function retryStep(): void {
  const { unavailableIndex } = useTourStore.getState();
  if (unavailableIndex !== null) void showStep(unavailableIndex);
}

export function skipStep(userId: string): Promise<void> {
  return nextStep(userId);
}

async function endRun(userId: string, status: TourStatus, stepId: string | null): Promise<void> {
  getHandle()?.stop();
  useTourStore.setState({ phase: "idle", userId: null, stepIndex: null, tapIndex: null, unavailableIndex: null });
  await Promise.all([save(userId, status, stepId), exitPracticeMode()]);
}

async function save(userId: string, status: TourStatus, stepId: string | null): Promise<void> {
  const progress: TourProgress = { status, stepId, updatedAt: new Date().toISOString() };
  useTourStore.setState({ progress });
  try {
    await writeTourProgress(userId, progress);
    useTourStore.setState({ saveFailed: false });
  } catch {
    useTourStore.setState({ saveFailed: true });
  }
}
