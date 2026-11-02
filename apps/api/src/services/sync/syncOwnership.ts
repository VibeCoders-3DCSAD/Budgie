import type { SupabaseClient } from "@supabase/supabase-js";

type ColumnValues = Record<string, string | number | boolean>;

export type OwnedRowLookup = {
  table: string;
  // Columns the row must equal, such as its id.
  match: ColumnValues;
  // Columns the row must not equal.
  notMatch?: ColumnValues;
  select?: string;
  // Also match soft-deleted rows. Off by default.
  includeDeleted?: boolean;
  // Start of the error thrown when the query fails: "<errorPrefix> failed: <message>".
  errorPrefix: string;
};

// The user's row matching the lookup, or null when there is none. Throws only when the query fails.
export async function findOwnedRow<T extends object = { id: string }>(supabase: SupabaseClient, userId: string, lookup: OwnedRowLookup): Promise<T | null> {
  let query = supabase.from(lookup.table).select(lookup.select ?? "id").eq("user_id", userId);
  for (const [column, value] of Object.entries(lookup.match)) query = query.eq(column, value);
  for (const [column, value] of Object.entries(lookup.notMatch ?? {})) query = query.neq(column, value);
  if (!lookup.includeDeleted) query = query.eq("deleted", false);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`${lookup.errorPrefix} failed: ${error.message}`);
  return data as T | null;
}

// Like findOwnedRow, but throws `notFound` when the user has no matching row.
export async function requireOwnedRow<T extends object = { id: string }>(supabase: SupabaseClient, userId: string, lookup: OwnedRowLookup & { notFound: string }): Promise<T> {
  const row = await findOwnedRow<T>(supabase, userId, lookup);
  if (!row) throw new Error(lookup.notFound);
  return row;
}

// includeDeleted also matches deleted accounts, so historical transactions still sync after their account
// is deleted.
export async function verifyAccountOwnership(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
): Promise<void> {
  await requireOwnedRow(supabase, userId, { table: "financial_accounts", match: { id: accountId }, includeDeleted, errorPrefix: "account validation", notFound: "account not found or inaccessible" });
}

export async function verifyCategoryOwnership(supabase: SupabaseClient, userId: string, categoryId: string): Promise<void> {
  await requireOwnedRow(supabase, userId, { table: "categories", match: { id: categoryId, is_active: true }, errorPrefix: "category validation", notFound: "category not found or inaccessible" });
}

export async function verifySubcategoryOwnership(supabase: SupabaseClient, userId: string, subcategoryId: string, kind?: string): Promise<void> {
  await requireOwnedRow(supabase, userId, { table: "subcategories", match: { id: subcategoryId, is_active: true, ...(kind ? { kind } : {}) }, errorPrefix: "subcategory validation", notFound: "subcategory not found or inaccessible" });
}
