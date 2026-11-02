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
