import { create } from "zustand";
import type { TourProgress } from "../types";

// The running tour, shared by the host, its tooltip, and the entry points in Settings and the offer.
interface TourState {
  // The signed-in user's saved progress; null until loaded.
  progress: TourProgress | null;
  // starting: switching to practice data. running: a step is on screen.
  phase: "idle" | "starting" | "running";
  // From Start, Resume, or Replay until the first step is on screen: practice data is seeded and the step's
  // screen opened, which can take a few seconds, so a loading overlay covers it.
  preparing: boolean;
  // Whose tour is running; null when none is.
  userId: string | null;
  // The step on screen. The runner owns it, since a tap step closes the spotlight while it waits.
  stepIndex: number | null;
  // The tap step waiting for the user to press its highlighted control.
  tapIndex: number | null;
  // The step whose target could not be shown; it is offered retry, skip, or continue later.
  unavailableIndex: number | null;
  saveFailed: boolean;
  loadFailed: boolean;
}

export const useTourStore = create<TourState>(() => ({
  progress: null,
  phase: "idle",
  preparing: false,
  userId: null,
  stepIndex: null,
  tapIndex: null,
  unavailableIndex: null,
  saveFailed: false,
  loadFailed: false,
}));

export function resetTourStore(): void {
  useTourStore.setState({ progress: null, phase: "idle", preparing: false, userId: null, stepIndex: null, tapIndex: null, unavailableIndex: null, saveFailed: false, loadFailed: false });
}
