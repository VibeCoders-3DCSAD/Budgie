// babel-preset-expo rewrites EXPO_PUBLIC_* reads into this ESM module, which Jest does not transform.
jest.mock("expo/virtual/env", () => ({ env: process.env }));
jest.mock("expo-secure-store", () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device", getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}) }));
import { registerTarget, waitForTarget } from "../stores/useTourTargets";
import { CENTER_TARGET, spotTarget } from "../components/TourTarget";
import { TOUR_STEPS } from "../steps";

afterEach(() => jest.useRealTimers());

it("waits for a target to appear, and gives up after the timeout", async () => {
  jest.useFakeTimers();
  const appearing = waitForTarget("tab-money", 4_000);
  const unregister = registerTarget("tab-money");
  await expect(appearing).resolves.toBe(true);
  await expect(waitForTarget("tab-money", 4_000)).resolves.toBe(true);
  unregister();
  const missing = waitForTarget("tab-money", 4_000);
  jest.advanceTimersByTime(4_000);
  await expect(missing).resolves.toBe(false);
});

it("counts a target that is mounted twice until both are gone", async () => {
  const first = registerTarget("twice");
  const second = registerTarget("twice");
  first();
  await expect(waitForTarget("twice", 0)).resolves.toBe(true);
  second();
});

it("moves an unavailable step from its target to the centre of the screen", () => {
  const targeted = TOUR_STEPS.findIndex((step) => step.target);
  const untargeted = TOUR_STEPS.findIndex((step) => !step.target);
  expect(spotTarget(targeted, null)).toBe(TOUR_STEPS[targeted]?.target);
  expect(spotTarget(targeted, targeted)).toBe(CENTER_TARGET);
  expect(spotTarget(untargeted, null)).toBe(CENTER_TARGET);
});
