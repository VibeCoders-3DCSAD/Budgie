import { ExportHttpError, MAX_ATTEMPTS, createPacer, isRetryable, parseRetryAfter, retryDelayMs, withRetry } from "../retry";

describe("export retries", () => {
  it("retries network failures, 429s, and 5xx, but not other client errors", () => {
    expect(isRetryable(new TypeError("Network request failed"))).toBe(true);
    expect(isRetryable(new ExportHttpError(429, null))).toBe(true);
    expect(isRetryable(new ExportHttpError(503, null))).toBe(true);
    expect(isRetryable(new ExportHttpError(409, null))).toBe(false);
    expect(isRetryable(new ExportHttpError(400, null))).toBe(false);
  });

  it("waits as long as Retry-After asks, capped at 30 seconds", () => {
    expect(parseRetryAfter("12")).toBe(12_000);
    expect(parseRetryAfter("soon")).toBeNull();
    expect(retryDelayMs(1, new ExportHttpError(429, 12_000))).toBe(12_000);
    expect(retryDelayMs(1, new ExportHttpError(429, 600_000))).toBe(30_000);
  });

  it("backs off exponentially with jitter otherwise", () => {
    expect(retryDelayMs(1, new Error("x"), () => 0)).toBe(1_000);
    expect(retryDelayMs(3, new Error("x"), () => 0.5)).toBe(4_500);
  });

  it("returns the first success after retryable failures", async () => {
    const sleeps: number[] = [];
    const task = jest.fn()
      .mockRejectedValueOnce(new ExportHttpError(429, 2_000))
      .mockRejectedValueOnce(new ExportHttpError(502, null))
      .mockResolvedValueOnce("rows");

    await expect(withRetry(task, { sleepFor: async (ms) => { sleeps.push(ms); } })).resolves.toBe("rows");
    expect(task).toHaveBeenCalledTimes(3);
    expect(sleeps[0]).toBe(2_000);
  });

  it("gives up after the last attempt", async () => {
    const task = jest.fn().mockRejectedValue(new ExportHttpError(500, null));

    await expect(withRetry(task, { sleepFor: async () => {} })).rejects.toBeInstanceOf(ExportHttpError);
    expect(task).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("fails at once on an error a retry cannot fix", async () => {
    const task = jest.fn().mockRejectedValue(new ExportHttpError(409, null));

    await expect(withRetry(task, { sleepFor: async () => {} })).rejects.toBeInstanceOf(ExportHttpError);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("paces calls at least the interval apart", async () => {
    let time = 0;
    const sleeps: number[] = [];
    const pace = createPacer(500, () => time, async (ms) => { sleeps.push(ms); time += ms; });

    await pace();
    time += 100;
    await pace();
    time += 700;
    await pace();

    expect(sleeps).toEqual([400]);
  });
});
