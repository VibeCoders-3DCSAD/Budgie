// Runs `request` with a signal that aborts after `ms`. The timer covers the whole callback, including
// reading the response body, and is cleared once the callback settles.
export async function withTimeout<T>(ms: number, request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

// Checks the name only: fetch rejects with a DOMException, which can come from another realm.
export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}
