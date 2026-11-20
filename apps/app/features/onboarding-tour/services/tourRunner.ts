import { router } from "expo-router";
import type { SpotlightTour } from "react-native-spotlight-tour";
import { ROUTES } from "../../../routes";
import { TOUR_STEPS, firstStepOfStage, stepIndex } from "../steps";
import { useTourStore } from "../stores/useTourStore";
import { waitForTarget } from "../stores/useTourTargets";
import type { TourEvent, TourProgress, TourStage, TourStatus, TourStepDef } from "../types";
import { discardPreparedPractice, enterPracticeMode, exitPracticeMode } from "./practiceSession";
import { nextFrame, scrollTargetIntoView } from "./targetVisibility";
import { writeTourProgress } from "./tourProgress";

// How long a step waits for its screen and highlighted control before offering recovery. Generous: the Financial
// Plan rebuilds itself when the tour returns from Past plans, which can take several seconds.
export const TARGET_TIMEOUT_MS = 10_000;

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
// It tries again on the next frame rather than after a fixed delay, so a step shows as soon as it can.
async function waitForLayout(target: string, deadline: number): Promise<boolean> {
  while (await scrollTargetIntoView(target) === null) {
    if (Date.now() >= deadline) return false;
    await nextFrame();
  }
  return true;
}

// Shows a step. Explanations use the spotlight; a tap or fill step closes it and lets the hint layer wait for
// the user, falling back to the spotlight's recovery card when its control cannot be shown.
export async function showStep(index: number): Promise<void> {
  const step = TOUR_STEPS[index];
  if (!step) return;
  useTourStore.setState({ stepIndex: index, tapIndex: null });
  if (startsStage(index)) void saveCurrentStep();
  if (!step.action) return getHandle()?.goTo(index);
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
  advanceWhen((step) => step.action === "tap" && step.target === id);
}

// The app reported an event, such as a saved transaction, that a fill step may be waiting for.
export function notifyTourEvent(event: TourEvent): void {
  advanceWhen((step) => step.until === event);
}

function advanceWhen(matches: (step: TourStepDef) => boolean): void {
  const { tapIndex, userId } = useTourStore.getState();
  const step = tapIndex === null ? undefined : TOUR_STEPS[tapIndex];
  if (!step || !userId || !matches(step)) return;
  useTourStore.setState({ tapIndex: null });
  setTimeout(() => { void nextStep(userId); }, 0);
}

// Switches to practice data and shows the first step (start, replay), the saved one (resume), or the first step
// of a stage (the developer replay in Settings).
// Resolves "cancelled" when the user backs out from the preparing overlay before the first step shows.
export async function startTour(userId: string, from: "start" | "resume" | "replay", stage?: TourStage): Promise<StartResult> {
  const { phase, progress } = useTourStore.getState();
  if (!getHandle() || phase !== "idle") return "failed";
  useTourStore.setState({ phase: "starting", preparing: true, loadFailed: false, saveFailed: false, unavailableIndex: null });
  try {
    await enterPracticeMode(userId);
  } catch {
    if (!useTourStore.getState().preparing) return "cancelled";
    useTourStore.setState({ phase: "idle", preparing: false, loadFailed: true });
    return "failed";
  }
  if (!useTourStore.getState().preparing) return "cancelled";
  useTourStore.setState({ phase: "running", userId });
  if (stage) {
    // Some stages open with a tab-bar tap, which needs a tab page in front rather than Settings.
    router.navigate(ROUTES.dashboard);
    await showStep(firstStepOfStage(stage));
  } else {
    await showStep(from === "resume" ? stepIndex(progress?.stepId ?? null) : 0);
  }
  return useTourStore.getState().phase === "idle" ? "cancelled" : "started";
}

export type StartResult = "started" | "cancelled" | "failed";

// The preparing overlay's Cancel: back to the user's own data, with their saved progress left as it was (the
// offer comes back for a first start; Resume stays available for a paused tour).
export async function cancelStart(): Promise<void> {
  if (!useTourStore.getState().preparing) return;
  getHandle()?.stop();
  useTourStore.setState({ phase: "idle", preparing: false, userId: null, stepIndex: null, tapIndex: null, unavailableIndex: null });
  await exitPracticeMode();
}

// Progress is saved when a stage is finished (as the next one opens), on pause and finish, and when the app
// goes to the background or the tour is torn down, rather than on every step: each save is an encrypted
// SecureStore write. A tour closed mid-stage resumes at the start of that stage.
function startsStage(index: number): boolean {
  const step = TOUR_STEPS[index];
  return !!step && TOUR_STEPS[index - 1]?.stage !== step.stage;
}

// Saves the step on screen as the place to resume. Does nothing when no tour is running.
export function saveCurrentStep(): Promise<void> {
  const { phase, userId, stepIndex } = useTourStore.getState();
  const step = stepIndex === null ? undefined : TOUR_STEPS[stepIndex];
  if (phase !== "running" || !userId || !step) return Promise.resolve();
  return save(userId, "active", step.id);
}

export async function continueLater(userId: string): Promise<void> {
  const current = useTourStore.getState().stepIndex;
  await endRun(userId, "paused", current === null ? null : TOUR_STEPS[current]?.id ?? null);
}

export function finishTour(userId: string): Promise<void> {
  return endRun(userId, "completed", null);
}

// The offer's "Skip for now": nothing to tear down, the tour never started.
export async function skipTour(userId: string): Promise<void> {
  await Promise.all([save(userId, "skipped", null), discardPreparedPractice()]);
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
  useTourStore.setState({ phase: "idle", preparing: false, userId: null, stepIndex: null, tapIndex: null, unavailableIndex: null });
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
