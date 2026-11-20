import { followTarget, IDLE_CHECK_MS, SETTLE_FRAMES } from "../services/targetFollower";
import { notifyTourLayout, registerTarget, type TargetRect } from "../stores/useTourTargets";

const flush = () => new Promise((resolve) => jest.requireActual<typeof import("timers")>("timers").setImmediate(resolve));

// Runs one animation frame at a time, letting each frame's measurement settle before the next.
async function frames(count: number) {
  for (let index = 0; index < count; index += 1) {
    jest.advanceTimersByTime(17);
    await flush();
  }
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("follows a moving target every frame, then stops measuring once it holds still", async () => {
  let rect: TargetRect = { x: 0, y: 500, width: 40, height: 40 };
  const measure = jest.fn(async () => rect);
  const unregister = registerTarget("moving", { measure, page: null });
  const seen: (TargetRect | null)[] = [];
  const stop = followTarget("moving", (next) => seen.push(next));
  await flush();
  for (const y of [400, 300, 200]) {
    rect = { ...rect, y };
    await frames(1);
  }
  expect(seen.map((item) => item?.y)).toEqual([500, 400, 300, 200]);
  await frames(SETTLE_FRAMES + 2);
  const settled = measure.mock.calls.length;
  await frames(10);
  expect(measure.mock.calls.length).toBe(settled);
  stop();
  unregister();
});

it("measures again on a scroll or layout signal, and catches a quiet move on its idle check", async () => {
  let rect: TargetRect = { x: 0, y: 100, width: 40, height: 40 };
  const unregister = registerTarget("still", { measure: async () => rect, page: null });
  const seen: (TargetRect | null)[] = [];
  const stop = followTarget("still", (next) => seen.push(next));
  await flush();
  await frames(SETTLE_FRAMES + 2);
  rect = { ...rect, y: 50 };
  notifyTourLayout();
  await flush();
  expect(seen.at(-1)?.y).toBe(50);
  await frames(SETTLE_FRAMES + 2);
  rect = { ...rect, y: 80 };
  jest.advanceTimersByTime(IDLE_CHECK_MS);
  await flush();
  expect(seen.at(-1)?.y).toBe(80);
  stop();
  unregister();
});

it("reports null for a target that is not on screen, and stops when cancelled", async () => {
  const seen: (TargetRect | null)[] = [];
  const stop = followTarget("missing", (next) => seen.push(next));
  await flush();
  expect(seen).toEqual([null]);
  stop();
  const unregister = registerTarget("missing", { measure: async () => ({ x: 1, y: 1, width: 1, height: 1 }), page: null });
  notifyTourLayout();
  await frames(3);
  expect(seen).toEqual([null]);
  unregister();
});
