import type { SupabaseClient } from "@supabase/supabase-js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface LocalityRecord {
  code: string;
  name: string;
}

interface CacheEntry {
  localities: LocalityRecord[];
  timestamp: number;
}

let cache: CacheEntry | null = null;

async function getCachedLocalities(
  authenticatedSupabase: SupabaseClient,
): Promise<LocalityRecord[]> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.localities;
  }

  const { data, error } = await authenticatedSupabase
    .from("metro_manila_localities")
    .select("code, name");

  if (error) {
    throw error;
  }

  cache = {
    localities: data as LocalityRecord[],
    timestamp: Date.now(),
  };

  return cache.localities;
}

export async function getValidLocalityNames(
  authenticatedSupabase: SupabaseClient,
): Promise<string[]> {
  const localities = await getCachedLocalities(authenticatedSupabase);
  return localities.map((row) => row.name);
}

export function clearLocalitiesCache(): void {
  cache = null;
}
