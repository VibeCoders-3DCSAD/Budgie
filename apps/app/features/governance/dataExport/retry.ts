// Retries for export requests. A batch is retried after a network failure, a timeout, a 429, or a 5xx;
// other answers (400, 404, 409) will not change on a retry, so they fail at once.

export const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

export type Sleep = (ms: number) => Promise<void>;

export const sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A request that answered with a status the export cannot use.
export class ExportHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number | null) {
    super(`Export request failed with status ${status}`);
    this.name = "ExportHttpError";
  }
}

// The server answered 429: too many requests in its window.
export function isRateLimited(error: unknown): error is ExportHttpError {
  return error instanceof ExportHttpError && error.status === 429;
}

// The server asked for a longer wait than a retry holds for (the hourly limit on new exports); retrying
// sooner is refused again, so the export stops and tells the user when to come back.
function waitsTooLong(error: unknown): boolean {
  return isRateLimited(error) && error.retryAfterMs !== null && error.retryAfterMs > MAX_DELAY_MS;
}

export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ExportHttpError)) return true;
  return error.status === 429 || error.status >= 500;
}

// Seconds from a Retry-After header, as milliseconds. Null when the header is missing or not a number.
export function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : null;
}

// Exponential backoff with jitter, or the server's Retry-After when it sent one.
export function retryDelayMs(attempt: number, error: unknown, random: () => number = Math.random): number {
  if (error instanceof ExportHttpError && error.retryAfterMs !== null) return Math.min(error.retryAfterMs, MAX_DELAY_MS);
  const backoff = BASE_DELAY_MS * 2 ** (attempt - 1);
  return Math.min(backoff + random() * BASE_DELAY_MS, MAX_DELAY_MS);
}

export async function withRetry<T>(
  task: () => Promise<T>,
  { sleepFor = sleep, isCancelled = () => false, onRetry = () => undefined }: {
    sleepFor?: Sleep;
    isCancelled?: () => boolean;
    // Called before each wait with the error and the wait, so the caller can say why the export is pausing.
    onRetry?: (error: unknown, delayMs: number) => void;
  } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isRetryable(error) || isCancelled() || waitsTooLong(error)) throw error;
      const delayMs = retryDelayMs(attempt, error);
      onRetry(error, delayMs);
      await sleepFor(delayMs);
    }
  }
}

// Spaces calls at least `intervalMs` apart, keeping a long export under the server's per-minute limit.
export function createPacer(intervalMs: number, now: () => number = Date.now, sleepFor: Sleep = sleep) {
  let lastStartedAt: number | null = null;
  return async function pace(): Promise<void> {
    if (lastStartedAt !== null) {
      const wait = lastStartedAt + intervalMs - now();
      if (wait > 0) await sleepFor(wait);
    }
    lastStartedAt = now();
  };
}
