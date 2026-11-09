import type { SQLiteDatabase } from "expo-sqlite";
import { create } from "zustand";

// Practice Mode: while the guided tour runs, the real screens read a seeded practice database and
// answer API calls from fixtures, so the user's records and the server are never touched.
export type PracticeResponder = (url: string, init: RequestInit) => Promise<Response>;

interface PracticeModeState {
  active: boolean;
  database: SQLiteDatabase | null;
  respond: PracticeResponder | null;
}

export const usePracticeModeStore = create<PracticeModeState>(() => ({
  active: false,
  database: null,
  respond: null,
}));

export function startPracticeMode(database: SQLiteDatabase, respond: PracticeResponder): void {
  usePracticeModeStore.setState({ active: true, database, respond });
}

// Returns the practice database so the caller can close it.
export function stopPracticeMode(): SQLiteDatabase | null {
  const { database } = usePracticeModeStore.getState();
  usePracticeModeStore.setState({ active: false, database: null, respond: null });
  return database;
}

export function practiceFetch(url: string, init: RequestInit): Promise<Response> {
  const { respond } = usePracticeModeStore.getState();
  if (!respond) throw new Error("Practice Mode is not active.");
  return respond(url, init);
}

// Turns Practice Mode off and closes its database. Safe to call when it is already off.
export async function endPracticeMode(): Promise<void> {
  await stopPracticeMode()?.closeAsync();
}
