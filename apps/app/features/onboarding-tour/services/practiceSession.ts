import { manilaToday } from "../../../lib/dates";
import { authorizedServerFetch } from "../../../lib/localAccess";
import { initDatabase, loadMigrations, openMigratedDatabase } from "../../../local-db/client";
import { waitForSyncIdle } from "../../../local-db/sync/runSync";
import { endPracticeMode, startPracticeMode, usePracticeModeStore } from "../../../services/practiceMode";
import { resetShellState } from "../../shell/helpers/resetShellState";
import { applyPracticeSeed } from "../practice/applyPracticeSeed";
import { createPracticeResponder } from "../practice/respond";
import { buildPracticeSeed } from "../practice/seed";
import { readTaxonomy, subcategoryLookup } from "../practice/taxonomy";

let entering: Promise<void> | null = null;

// Switches the app onto a fresh copy of the tour's practice data. The user's categories are copied so the
// tour shows their own taxonomy; nothing is written to their database.
export function enterPracticeMode(userId: string): Promise<void> {
  if (usePracticeModeStore.getState().active) return Promise.resolve();
  entering ??= openPractice(userId).finally(() => { entering = null; });
  return entering;
}

// Returns to the user's own data. Safe to call when the tour is not running.
export async function exitPracticeMode(): Promise<void> {
  await entering?.catch(() => {});
  if (!usePracticeModeStore.getState().active) return;
  await endPracticeMode();
  resetShellState();
}

async function openPractice(userId: string): Promise<void> {
  const today = manilaToday();
  const taxonomy = await readTaxonomy(await initDatabase(), userId);
  const seed = buildPracticeSeed({ userId, today, subcategoryId: subcategoryLookup(taxonomy) });
  const database = await openMigratedDatabase(":memory:", await loadMigrations());
  try {
    await applyPracticeSeed(database, userId, taxonomy, seed);
    // Seeding is the slow part; waiting for sync right before the switch keeps a running sync on the user's data.
    await waitForSyncIdle();
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
  startPracticeMode(database, createPracticeResponder({ today, seed, taxonomy }, authorizedServerFetch));
  resetShellState();
}
