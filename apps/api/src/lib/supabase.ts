import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { bufferedResponse } from "./http/bufferedResponse.js";
import { withTimeout } from "./http/withTimeout.js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";

// The deadline covers reading the body: the SDK reads it after fetch resolves, so it is buffered here first.
// A caller's own abort signal still cancels the request.
export const fetchWithTimeout: typeof fetch = (input, init) => withTimeout(30_000, async (timeoutSignal) => {
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return bufferedResponse(await fetch(input, { ...init, signal }));
});

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: { fetch: fetchWithTimeout },
});

let serviceRoleClientInstance: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient {
  if (!serviceRoleClientInstance) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for server-only operations");
    }
    serviceRoleClientInstance = createClient(supabaseUrl, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: { fetch: fetchWithTimeout },
    });
  }
  return serviceRoleClientInstance;
}

// Sign-in and sign-up store the new session on the client that made the call. A fresh client per
// request keeps one user's session out of the shared module client used by every other request.
export function createAnonAuthClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: { fetch: fetchWithTimeout },
  });
}

export function createAuthenticatedSupabaseClient(
  accessToken: string,
): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: fetchWithTimeout,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
