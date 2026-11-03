import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/helpers/apiFetch";

// ponytail: fire-and-forget trigger, cron is the source of truth —
// this just accelerates catch-up when the user opens the app.
export async function triggerRecurringEngine(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await apiFetch(session.access_token, "/odin/api/recurring/run/me", { method: "POST" });
  } catch {
    // swallow errors — cron catches anything missed
  }
}
