import type { TourStepDef } from "../types";
import { TOUR_STAGES } from "../types";
import { dashboardSteps } from "./dashboard";
import { debtSteps } from "./debts";
import { finishSteps } from "./finish";
import { moneySteps } from "./money";
import { planSteps } from "./plan";
import { reportSteps } from "./reports";
import { savingsSteps } from "./savings";
import { settingsSteps } from "./settings";
import { syncSteps } from "./sync";
import { transactionSteps } from "./transactions";

// Every step in order, one file per stage.
export const TOUR_STEPS: TourStepDef[] = [
  ...dashboardSteps, ...moneySteps, ...transactionSteps, ...savingsSteps, ...debtSteps,
  ...planSteps, ...reportSteps, ...settingsSteps, ...syncSteps, ...finishSteps,
];

export function stepIndex(id: string | null): number {
  const index = TOUR_STEPS.findIndex((step) => step.id === id);
  return index < 0 ? 0 : index;
}

export function stageNumber(step: TourStepDef): number {
  return TOUR_STAGES.indexOf(step.stage) + 1;
}
