import { useToast } from "../../../components/Toast";
import { TOUR_MESSAGES } from "../messages";
import { startTour } from "../services/tourRunner";
import { useTourStore } from "../stores/useTourStore";
import type { TourStage } from "../types";

// Settings → Help and About: Resume tutorial (only with unfinished progress) and Replay tutorial; dev builds
// can also replay from any stage.
export function useTutorialEntry(userId: string) {
  const canResume = useTourStore((state) => state.progress?.status === "paused" && state.progress.stepId !== null);
  const busy = useTourStore((state) => state.phase !== "idle");
  const { showToast } = useToast();
  const run = (from: "resume" | "replay", stage?: TourStage) => {
    const starting = stage ? startTour(userId, from, stage) : startTour(userId, from);
    void starting.then((result) => {
      if (result === "failed") showToast(TOUR_MESSAGES.error, "danger");
      else if (result === "started" && from === "resume") showToast(TOUR_MESSAGES.resume);
    });
  };
  return { canResume, busy, resume: () => run("resume"), replay: () => run("replay"), replayStage: (stage: TourStage) => run("replay", stage) };
}
