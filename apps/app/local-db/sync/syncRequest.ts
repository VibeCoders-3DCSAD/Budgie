import { authorizedFetch, rejectServerSession, trackProtectedRequest } from "../../lib/localAccess";
import { bufferedResponse } from "../../lib/helpers/bufferedResponse";

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const REQUEST_TIMEOUT = 10_000;

// A protected sync request with a deadline. Locking the app cancels it with the other protected requests.
export function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number },
): Promise<Response> {
  const timeout = options.timeout ?? REQUEST_TIMEOUT;
  const controller = new AbortController();
  const release = trackProtectedRequest(controller);
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // authorizedFetch already retried with a refreshed token, so a 401 here is a real rejection.
  // The body is read before the deadline and lock tracking end, so a stalled body is cancelled too.
  return authorizedFetch(url, { ...options, signal: controller.signal }).then((response) => {
    if (response.status === 401) rejectServerSession();
    return bufferedResponse(response);
  }).finally(() => { clearTimeout(timeoutId); release(); });
}

// The stable code in an API error body, or undefined when the body has none or is not JSON.
export async function responseErrorCode(response: Response): Promise<unknown> {
  try {
    const body = await response.json();
    return body?.code;
  } catch {
    return undefined;
  }
}
