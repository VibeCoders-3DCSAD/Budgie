import { bufferedResponse } from "./bufferedResponse.js";
import { withTimeout } from "./withTimeout.js";

// fetch for the Supabase SDK clients. The deadline covers reading the body: the SDK reads it after fetch
// resolves, so it is buffered here first. A caller's own abort signal still cancels the request.
export const fetchWithTimeout: typeof fetch = (input, init) => withTimeout(30_000, async (timeoutSignal) => {
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return bufferedResponse(await fetch(input, { ...init, signal }));
});
