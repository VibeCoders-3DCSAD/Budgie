import { practiceFetch, usePracticeModeStore } from "../services/practiceMode";

// Installed by the native auth controller. Web retains its existing session flow.
type AccessGuard = (userId: string) => Promise<string>;
// Returns the token to send; `rejected` means the server refused `usedToken`.
type TokenResolver = (usedToken: string, rejected: boolean) => Promise<string>;
let guard: AccessGuard | null = null;
let resolveToken: TokenResolver | null = null;
let isAllowed: (() => boolean) | null = null;
let invalidated: (() => void) | null = null;
const requests = new Set<AbortController>();

export function configureLocalAccess(next: AccessGuard, allowed?: () => boolean, onInvalidated?: () => void): void {
  guard = next;
  isAllowed = allowed ?? null;
  invalidated = onInvalidated ?? null;
}

export async function authorizeLocalRequest(userId: string, accessToken: string): Promise<string> {
  return guard ? guard(userId) : accessToken;
}

export function configureTokenResolver(next: TokenResolver | null): void {
  resolveToken = next;
}

/** fetch with a current bearer token: refreshed ahead of expiry, and once more if the server rejects it. */
export async function authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (usePracticeModeStore.getState().active) return practiceFetch(url, init);
  return authorizedServerFetch(url, init);
}

/** authorizedFetch without the Practice Mode check, for the few reads the tour passes through to the server. */
export async function authorizedServerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const supplied = headers.get("Authorization")?.replace(/^Bearer /, "");
  const resolve = resolveToken;
  if (!resolve || !supplied) return fetch(url, init);
  const send = (token: string) => {
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
  const token = await resolve(supplied, false).catch(() => supplied);
  const response = await send(token);
  if (response.status !== 401) return response;
  const retry = await resolve(token, true).catch(() => null);
  return retry ? send(retry) : response;
}

export function trackProtectedRequest(controller: AbortController): () => void {
  if (isAllowed && !isAllowed()) throw new Error("Unlock and verify Budgie before syncing.");
  requests.add(controller);
  return () => { requests.delete(controller); };
}

export function abortProtectedRequests(): void {
  for (const controller of requests) controller.abort();
  requests.clear();
}

export function rejectServerSession(): void { invalidated?.(); }
