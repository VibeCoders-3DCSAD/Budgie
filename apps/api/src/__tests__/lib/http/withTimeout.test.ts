import { isAbortError, withTimeout } from "../../../lib/http/withTimeout.js";

describe("withTimeout", () => {
  afterEach(() => jest.useRealTimers());

  it("aborts the signal once the time runs out", async () => {
    jest.useFakeTimers();
    const pending = withTimeout(5_000, (signal) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    jest.advanceTimersByTime(5_000);
    const error = await pending.catch((caught: unknown) => caught);
    expect(isAbortError(error)).toBe(true);
  });

  it("clears the timer when the request settles", async () => {
    jest.useFakeTimers();
    await expect(withTimeout(5_000, async () => "done")).resolves.toBe("done");
    expect(jest.getTimerCount()).toBe(0);
  });
});
