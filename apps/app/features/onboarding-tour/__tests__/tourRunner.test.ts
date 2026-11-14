jest.mock("expo-secure-store", () => {
  const values = new Map();
  return { WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device",
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { values.set(key, value); }) };
});
import { router } from "expo-router";
import { TOUR_STEPS } from "../steps";
import { resetTourStore, useTourStore } from "../stores/useTourStore";
import { registerTarget } from "../stores/useTourTargets";
import { readTourProgress } from "../services/tourProgress";
import * as runner from "../services/tourRunner";

const mockEnter = jest.fn(async (_userId: string) => {});
const mockExit = jest.fn(async () => {});
jest.mock("../services/practiceSession", () => ({ enterPracticeMode: (userId: string) => mockEnter(userId), exitPracticeMode: () => mockExit() }));

const user = "11111111-2222-4333-8444-555555555555";
const handle = { goTo: jest.fn(), stop: jest.fn() };
let detach: () => void;
const tapIndex = TOUR_STEPS.findIndex((step) => step.action === "tap");

beforeEach(() => {
  resetTourStore();
  useTourStore.setState({ progress: { status: "not_started", stepId: null, updatedAt: "" } });
  jest.clearAllMocks();
  detach = runner.attachTourHandle(() => handle);
});
afterEach(() => detach());

it("switches to practice data and shows the first step", async () => {
  await expect(runner.startTour(user, "start")).resolves.toBe("started");
  expect(mockEnter).toHaveBeenCalledWith(user);
  expect(handle.goTo).toHaveBeenCalledWith(0);
  expect(useTourStore.getState()).toMatchObject({ phase: "running", userId: user, stepIndex: 0 });
  await expect(runner.startTour(user, "start")).resolves.toBe("failed");
});

it("resumes at the saved step", async () => {
  const last = TOUR_STEPS.length - 1;
  useTourStore.setState({ progress: { status: "paused", stepId: TOUR_STEPS[last]!.id, updatedAt: "" } });
  await runner.startTour(user, "resume");
  expect(handle.goTo).toHaveBeenCalledWith(last);
});

it("stays on the user's data when practice data cannot load", async () => {
  mockEnter.mockRejectedValueOnce(new Error("no database"));
  await expect(runner.startTour(user, "start")).resolves.toBe("failed");
  expect(useTourStore.getState()).toMatchObject({ phase: "idle", loadFailed: true });
  expect(handle.goTo).not.toHaveBeenCalled();
});

it("cancels while practice data loads, leaving saved progress as it was", async () => {
  let finishEntering = () => {};
  mockEnter.mockImplementationOnce(() => new Promise<void>((resolve) => { finishEntering = resolve; }));
  const starting = runner.startTour(user, "start");
  expect(useTourStore.getState().preparing).toBe(true);
  const cancelling = runner.cancelStart();
  finishEntering();
  await expect(starting).resolves.toBe("cancelled");
  await cancelling;
  expect(mockExit).toHaveBeenCalled();
  expect(handle.goTo).not.toHaveBeenCalled();
  expect(useTourStore.getState()).toMatchObject({ phase: "idle", preparing: false, progress: { status: "not_started" } });
});

it("pauses at the current step and returns to the user's data", async () => {
  await runner.startTour(user, "start");
  await runner.continueLater(user);
  expect(handle.stop).toHaveBeenCalled();
  expect(mockExit).toHaveBeenCalled();
  expect(await readTourProgress(user)).toMatchObject({ status: "paused", stepId: TOUR_STEPS[0]!.id });
  expect(useTourStore.getState()).toMatchObject({ phase: "idle", userId: null, stepIndex: null });
});

it("finishes, skips, and records each step it shows", async () => {
  await runner.recordStep(user, "welcome");
  expect(await readTourProgress(user)).toMatchObject({ status: "paused", stepId: "welcome" });
  await runner.finishTour(user);
  expect(await readTourProgress(user)).toMatchObject({ status: "completed" });
  await runner.skipTour(user);
  expect(useTourStore.getState().progress).toMatchObject({ status: "skipped" });
});

it("moves forward and back, and finishes after the last step", async () => {
  await runner.showStep(1);
  await runner.previousStep();
  expect(handle.goTo).toHaveBeenLastCalledWith(0);
  await runner.nextStep(user);
  expect(handle.goTo).toHaveBeenLastCalledWith(1);
  useTourStore.setState({ stepIndex: TOUR_STEPS.length - 1 });
  await runner.skipStep(user);
  expect(await readTourProgress(user)).toMatchObject({ status: "completed" });
});

it("waits for the user's own tap on a tap step, then moves on", async () => {
  jest.useFakeTimers();
  const step = TOUR_STEPS[tapIndex]!;
  const unregister = registerTarget(step.target!, { measure: async () => ({ x: 10, y: 300, width: 40, height: 40 }), page: null });
  useTourStore.setState({ userId: user });
  await runner.showStep(tapIndex);
  expect(handle.stop).toHaveBeenCalled();
  expect(useTourStore.getState()).toMatchObject({ tapIndex, stepIndex: tapIndex });
  runner.notifyTargetPress("some-other-control");
  expect(useTourStore.getState().tapIndex).toBe(tapIndex);
  runner.notifyTargetPress(step.target!);
  expect(useTourStore.getState().tapIndex).toBeNull();
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  await new Promise((resolve) => setImmediate(resolve));
  expect(useTourStore.getState().stepIndex).toBe(tapIndex + 1);
  unregister();
});

it("moves a fill step on when the app reports its event, not when its control is pressed", async () => {
  jest.useFakeTimers();
  const index = TOUR_STEPS.findIndex((step) => step.until === "transaction-created");
  const step = TOUR_STEPS[index]!;
  const unregister = registerTarget(step.target!, { measure: async () => ({ x: 10, y: 300, width: 40, height: 40 }), page: null });
  useTourStore.setState({ userId: user });
  await runner.showStep(index);
  expect(useTourStore.getState()).toMatchObject({ tapIndex: index, stepIndex: index });
  runner.notifyTargetPress(step.target!);
  expect(useTourStore.getState().tapIndex).toBe(index);
  runner.notifyTourEvent("transaction-created");
  expect(useTourStore.getState().tapIndex).toBeNull();
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  await new Promise((resolve) => setImmediate(resolve));
  expect(useTourStore.getState().stepIndex).toBe(index + 1);
  unregister();
});

it("opens the step's screen and flags a target that never appears, without rejecting", async () => {
  jest.useFakeTimers();
  const preparing = runner.prepareStep({ id: "x", stage: "Money", title: "", body: "", route: "/money", target: "money-tab" }, 3);
  jest.advanceTimersByTime(runner.TARGET_TIMEOUT_MS);
  await expect(preparing).resolves.toBeUndefined();
  jest.useRealTimers();
  expect(router.navigate).toHaveBeenCalledWith("/money");
  expect(useTourStore.getState().unavailableIndex).toBe(3);
  const unregister = registerTarget("money-tab", { measure: async () => ({ x: 0, y: 200, width: 10, height: 10 }), page: null });
  await runner.prepareStep({ id: "x", stage: "Money", title: "", body: "", target: "money-tab" }, 3);
  expect(useTourStore.getState().unavailableIndex).toBeNull();
  unregister();
});

it("scrolls a target below the fold into view before showing it", async () => {
  let scrollY = 0;
  const page = { getScrollY: () => scrollY, scrollTo: jest.fn((y: number) => { scrollY = y; }) };
  const unregister = registerTarget("low", { measure: async () => ({ x: 0, y: 2_000 - scrollY, width: 100, height: 40 }), page });
  global.requestAnimationFrame = ((callback: () => void) => setTimeout(callback, 0)) as never;
  await runner.prepareStep({ id: "x", stage: "Money", title: "", body: "", target: "low" }, 4);
  expect(page.scrollTo).toHaveBeenCalledTimes(1);
  expect(useTourStore.getState().unavailableIndex).toBeNull();
  unregister();
});

it("starts at the first step of a stage, from a tab page", async () => {
  const first = TOUR_STEPS.findIndex((step) => step.stage === "Transactions");
  const target = TOUR_STEPS[first]!.target!;
  const unregister = registerTarget(target, { measure: async () => ({ x: 0, y: 200, width: 80, height: 40 }), page: null });
  await expect(runner.startTour(user, "replay", "Transactions")).resolves.toBe("started");
  expect(router.navigate).toHaveBeenCalledWith("/dashboard");
  expect(useTourStore.getState()).toMatchObject({ phase: "running", stepIndex: first });
  unregister();
});
