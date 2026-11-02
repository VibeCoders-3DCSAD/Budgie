import { createClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "./helpers/fetchWithTimeout";
import { sdkSessionStorage } from "./sdkSessionStorage";

// The auth feature owns one SecureStore account record, including rotated tokens.
// The SDK only keeps a session in memory (cleared on lock), so automatic SDK storage or
// sign-out can never erase offline access on a network error.
export const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    global: { fetch: fetchWithTimeout },
    auth: { storage: sdkSessionStorage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  });
