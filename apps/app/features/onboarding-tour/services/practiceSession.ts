import type { SQLiteDatabase } from "expo-sqlite";
import { manilaToday } from "../../../lib/dates";
import { authorizedServerFetch } from "../../../lib/localAccess";
import { initDatabase, openSchemaCopy } from "../../../local-db/client";
import { waitForSyncIdle } from "../../../local-db/sync/runSync";
import { endPracticeMode, startPracticeMode, usePracticeModeStore, type PracticeResponder } from "../../../services/practiceMode";
import { resetShellState } from "../../shell/helpers/resetShellState";
import { applyPracticeSeed } from "../practice/applyPracticeSeed";
import { createPracticeResponder } from "../practice/respond";
import { withPastPlans } from "../practice/pastPlans";
import { buildPracticeSeed } from "../practice/seed";
import { readTaxonomy, subcategoryLookup } from "../practice/taxonomy";

type Practice = { database: SQLiteDatabase; respond: PracticeResponder };
type Preparation = { userId: string; today: string; ready: Promise<Practice> };

let entering: Promise<void> | null = null;
// Practice data built ahead of Start (while the tour offer is up), so starting is only the switch.
let prepared: Preparation | null = null;

// Builds the practice data in the background without switching to it. Safe to call repeatedly; a failure
// is left for enterPracticeMode, which builds again and reports it.
export function preparePracticeMode(userId: string): void {
  if (usePracticeModeStore.getState().active) return;
  const today = manilaToday();
  if (prepared && prepared.userId === userId && prepared.today === today) return;
  void discardPreparedPractice();
  const preparation: Preparation = { userId, today, ready: buildPractice(userId, today) };
  preparation.ready.catch(() => { if (prepared === preparation) prepared = null; });
  prepared = preparation;
}

// Drops practice data built ahead of a tour that is not going to start (skipped, logged out, locked),
// closing its database once the build has finished.
export async function discardPreparedPractice(): Promise<void> {
  const preparation = prepared;
  if (!preparation) return;
  prepared = null;
  await close(preparation);
}

function close(preparation: Preparation): Promise<void> {
  return preparation.ready.then((practice) => practice.database.closeAsync(), () => {});
}

// Switches the app onto a fresh copy of the tour's practice data. The user's categories are copied so the
// tour shows their own taxonomy; nothing is written to their database.
export function enterPracticeMode(userId: string): Promise<void> {
  if (usePracticeModeStore.getState().active) return Promise.resolve();
  entering ??= openPractice(userId).finally(() => { entering = null; });
  return entering;
}

// Returns to the user's own data. Safe to call when the tour is not running.
export async function exitPracticeMode(): Promise<void> {
  await discardPreparedPractice();
  await entering?.catch(() => {});
  if (!usePracticeModeStore.getState().active) return;
  await endPracticeMode();
  resetShellState();
}

async function openPractice(userId: string): Promise<void> {
  const { database, respond } = await takePrepared(userId) ?? await buildPractice(userId, manilaToday());
  try {
    // Waiting for sync right before the switch keeps a running sync on the user's data.
    await waitForSyncIdle();
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
  startPracticeMode(database, respond);
  resetShellState();
}

// The prepared practice data when it is this user's and today's, else null (built again by the caller).
async function takePrepared(userId: string): Promise<Practice | null> {
  const preparation = prepared;
  prepared = null;
  if (!preparation) return null;
  if (preparation.userId !== userId || preparation.today !== manilaToday()) {
    void close(preparation);
    return null;
  }
  return preparation.ready.catch(() => null);
}

async function buildPractice(userId: string, today: string): Promise<Practice> {
  const own = await initDatabase();
  const taxonomy = await readTaxonomy(own, userId);
  const ctx = { userId, today, subcategoryId: subcategoryLookup(taxonomy) };
  const seed = withPastPlans(buildPracticeSeed(ctx), taxonomy, ctx);
  const database = await openSchemaCopy(own);
  try {
    await applyPracticeSeed(database, userId, taxonomy, seed);
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
  return { database, respond: createPracticeResponder({ today, seed, taxonomy }, authorizedServerFetch) };
}
