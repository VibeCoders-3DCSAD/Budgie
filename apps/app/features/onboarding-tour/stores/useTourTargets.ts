import { create } from "zustand";
import type { TourEvent } from "../types";

export type TargetRect = { x: number; y: number; width: number; height: number };

// What a mounted TourTarget offers the tour: its place on screen, and its page's scroll position.
export type TargetHandle = {
  measure: () => Promise<TargetRect | null>;
  page: { getScrollY: () => number; scrollTo: (y: number) => void } | null;
};

// TourTarget ids currently on screen, so a step can wait for its target before it is shown.
interface TourTargetsState {
  mounted: Record<string, TargetHandle[]>;
}

export const useTourTargets = create<TourTargetsState>(() => ({ mounted: {} }));

export function registerTarget(id: string, handle: TargetHandle = { measure: async () => null, page: null }): () => void {
  useTourTargets.setState((state) => ({ mounted: { ...state.mounted, [id]: [...(state.mounted[id] ?? []), handle] } }));
  return () => useTourTargets.setState((state) => ({ mounted: { ...state.mounted, [id]: (state.mounted[id] ?? []).filter((item) => item !== handle) } }));
}

// The tour host connects presses to the runner, so screens marking targets never load the tour itself.
let pressListener: ((id: string) => void) | null = null;

export function setTargetPressListener(listener: ((id: string) => void) | null): void {
  pressListener = listener;
}

export function pressTarget(id: string): void {
  pressListener?.(id);
}

// Likewise for app events a step waits on, such as a transaction being saved.
let eventListener: ((event: TourEvent) => void) | null = null;

export function setTourEventListener(listener: ((event: TourEvent) => void) | null): void {
  eventListener = listener;
}

export function emitTourEvent(event: TourEvent): void {
  eventListener?.(event);
}

// The most recently mounted handle: the one on the screen in front.
export function targetHandle(id: string): TargetHandle | null {
  return useTourTargets.getState().mounted[id]?.at(-1) ?? null;
}

// Resolves true once the target is on screen, or false after the timeout.
export function waitForTarget(id: string, timeoutMs: number): Promise<boolean> {
  if (targetHandle(id)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { unsubscribe(); resolve(false); }, timeoutMs);
    const unsubscribe = useTourTargets.subscribe((state) => {
      if (!state.mounted[id]?.length) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}

export function sameRect(a: TargetRect | null, b: TargetRect | null): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
