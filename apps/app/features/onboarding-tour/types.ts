import type { Href } from "expo-router";

// The tour's stages, in order (spec 04 §4.2, as agreed for the practice-data tour).
export const TOUR_STAGES = [
  "Dashboard", "Money", "Transactions", "Debts", "Savings", "Financial Plan",
  "Financial Reports", "Settings", "Replay and Finish",
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
  // "fill": the highlighted part stays usable so the user can fill it in, then taps Next.
  action?: "tap" | "fill";
  // A fill step that moves on when this happens in the app, rather than on Next.
  until?: TourEvent;
};

// Things the app reports to the tour, for steps that wait on them.
export type TourEvent = "transaction-created";

// not_started: never offered or answered. paused: left with Continue later, or interrupted by a lock.
export type TourStatus = "not_started" | "skipped" | "active" | "paused" | "completed";
export type TourProgress = { status: TourStatus; stepId: string | null; updatedAt: string };
