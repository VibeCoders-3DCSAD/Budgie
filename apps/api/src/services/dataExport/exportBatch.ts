import type { SupabaseClient } from "@supabase/supabase-js";
import { UUID_PATTERN } from "../../lib/uuid.js";
import { findExportDataset } from "./exportDatasets.js";
import type { ExportDataset } from "./exportDatasets.js";

export const DEFAULT_BATCH_SIZE = 500;
export const MAX_BATCH_SIZE = 1000;

export type BatchQuery = { dataset: ExportDataset; after: string | null; limit: number };

export type ExportBatch = { rows: Record<string, unknown>[]; nextCursor: string | null };

// Validates the dataset, cursor, and size of one export batch request.
export function parseBatchQuery(query: Record<string, unknown>): BatchQuery | { error: string } {
  const dataset = findExportDataset(query.dataset);
  if (!dataset) return { error: "dataset is not a known export dataset" };

  const after = query.after;
  if (after !== undefined && (typeof after !== "string" || !UUID_PATTERN.test(after))) {
    return { error: "after must be a record id" };
  }

  let limit = DEFAULT_BATCH_SIZE;
  if (query.limit !== undefined) {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH_SIZE) {
      return { error: `limit must be a whole number from 1 to ${MAX_BATCH_SIZE}` };
    }
  }

  return { dataset, after: (after as string | undefined) ?? null, limit };
}

// Reads the next page of the user's rows in id order. The cursor is the last id of the previous page,
// so rows added during the export cannot shift pages and repeat or skip rows.
export async function fetchExportBatch(
  supabase: SupabaseClient,
  userId: string,
  { dataset, after, limit }: BatchQuery,
): Promise<ExportBatch> {
  let query = supabase.from(dataset.table).select(dataset.columns.join(","));
  // userId comes from the verified session, never from the request, so it is safe inside the filter string.
  query = dataset.includeShared ? query.or(`user_id.eq.${userId},user_id.is.null`) : query.eq("user_id", userId);
  if (dataset.softDelete) query = query.eq("deleted", false);
  if (after) query = query.gt("id", after);

  const { data, error } = await query.order("id", { ascending: true }).limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const lastRow = rows.at(-1);
  const nextCursor = rows.length === limit && lastRow ? String(lastRow.id) : null;
  return { rows, nextCursor };
}
