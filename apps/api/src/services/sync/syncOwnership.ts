import type { SupabaseClient } from "@supabase/supabase-js";

// Also matches deleted accounts, so historical transactions still sync after their account is deleted.
export async function verifyOwnedAccount(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`account validation failed: ${error.message}`);
  if (!data) throw new Error("account not found or inaccessible");
}

export async function verifyAccountOwnership(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("deleted", false)
    .maybeSingle();
  if (error) throw new Error(`account validation failed: ${error.message}`);
  if (!data) throw new Error("account not found or inaccessible");
}

export async function verifyCategoryOwnership(
  supabase: SupabaseClient,
  userId: string,
  categoryId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("deleted", false)
    .eq("is_active", true)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`category validation failed: ${error.message}`);
  if (!data) throw new Error("category not found or inaccessible");
}

export async function verifySubcategoryOwnership(
  supabase: SupabaseClient,
  userId: string,
  subcategoryId: string,
  kind?: string,
): Promise<void> {
  let query = supabase
    .from("subcategories")
    .select("id")
    .eq("id", subcategoryId)
    .eq("deleted", false)
    .eq("is_active", true)
    .eq("user_id", userId);

  if (kind) {
    query = query.eq("kind", kind);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`subcategory validation failed: ${error.message}`);
  if (!data) throw new Error("subcategory not found or inaccessible");
}
