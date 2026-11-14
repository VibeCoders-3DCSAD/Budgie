import { useEffect, useRef } from "react";
import { TOUR_STEPS } from "../steps";
import { useTourStore } from "../stores/useTourStore";

function stepTarget(index: number | null): string | undefined {
  return index === null ? undefined : TOUR_STEPS[index]?.target;
}

// A menu or sheet the user opened for a tour step (its contents are that step's target) closes when the tour
// leaves the step: Next, Back, or Continue later. It stays open otherwise, so opening it outside the tour, or
// on the tap step just before, is untouched.
export function useCloseWithTour(target: string | undefined, open: boolean, close: () => void): void {
  const latestClose = useRef(close);
  latestClose.current = close;
  useEffect(() => {
    if (!target || !open) return;
    return useTourStore.subscribe((state, previous) => {
      if (state.stepIndex === previous.stepIndex) return;
      if (stepTarget(previous.stepIndex) === target && stepTarget(state.stepIndex) !== target) latestClose.current();
    });
  }, [target, open]);
}
