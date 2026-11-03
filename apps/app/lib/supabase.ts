import { createClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "./helpers/fetchWithTimeout";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Same deadline as the native client, so web auth and database calls cannot hang until the browser gives up.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchWithTimeout } });
