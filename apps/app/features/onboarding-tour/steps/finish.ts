import { ROUTES } from "../../../routes";
import { TOUR_MESSAGES } from "../messages";
import type { TourStepDef } from "../types";

const stage = "Replay and Finish" as const;

export const finishSteps: TourStepDef[] = [
  { id: "replay", stage, route: ROUTES.settings, target: "settings-replay", title: "Take the tour again", body: `${TOUR_MESSAGES.replay} Resume tutorial appears there when a tour is unfinished.` },
  { id: "finish", stage, route: ROUTES.dashboard, title: "You're ready!", body: "Finish to leave Andrea's sample data and return to your own Dashboard." },
];
