import type { Href } from "expo-router";

// The tour's stages, in order (spec 04 §4.2, as agreed for the practice-data tour).
export const TOUR_STAGES = [
  "Dashboard", "Money", "Transactions", "Debts", "Savings", "Financial Plan",
  "Financial Reports", "Settings", "Offline & Sync", "Replay and Finish",
] as const;
export type TourStage = typeof TOUR_STAGES[number];

export type TourStepDef = {
  id: string;
  stage: TourStage;
  title: string;
  body: string;
  // Where the step happens; the tour navigates here before showing it. A function when the link depends on
  // today's practice data (a record id).
  route?: Href | (() => Href);
  // The TourTarget id to highlight. Without one, the step shows in the middle of the screen.
  target?: string;
  // "tap": the user taps the highlighted control itself (it really runs) and the tour moves on.
  action?: "tap";
};

// not_started: never offered or answered. paused: left with Continue later, or interrupted by a lock.
export type TourStatus = "not_started" | "skipped" | "active" | "paused" | "completed";
export type TourProgress = { status: TourStatus; stepId: string | null; updatedAt: string };
