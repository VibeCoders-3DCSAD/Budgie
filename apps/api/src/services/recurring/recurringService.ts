import { getServiceRoleClient } from "../../lib/supabase.js";

export async function runEngine(
  asOf?: string,
  limit?: number,
  userId?: string,
): Promise<{ engineResults: unknown[] }> {
  const client = getServiceRoleClient();
  const { data, error } = await client.rpc("run_recurring_transaction_engine", {
    ...(asOf ? { p_as_of: asOf } : {}),
    ...(limit ? { p_limit: limit } : {}),
    ...(userId ? { p_user_id: userId } : {}),
  });

  if (error) throw error;

  return { engineResults: data ?? [] };
}

export const ENGINE_ERRORS = {
  cron_secret_mismatch: "Invalid cron secret.",
  user_session_rejected: "User sessions are not allowed on this endpoint. Use the cron secret.",
  no_cron_secret: "RECURRING_CRON_SECRET is not configured.",
} as const;
