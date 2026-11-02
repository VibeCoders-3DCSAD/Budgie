import { STEPS, type StepConfig } from "../types";

export function isStepComplete(step: StepConfig, answers: Record<string, unknown>) {
  const value = answers[step.questionKey];
  if (step.kind === "review") return true;
  if (step.kind === "card_multi_select") return Array.isArray(value) && value.length > 0;
  if (step.options) return step.options.some((option) => option.key === value);
  return typeof value === "string" && value.trim() !== "";
}

export function isStepVisible(step: StepConfig, answers: Record<string, unknown>) {
  if (!step.visibleWhen) return true;
  const answer = answers[step.visibleWhen.questionKey];
  const { value } = step.visibleWhen;
  return typeof value === "string" ? answer === value : typeof answer === "string" && value.includes(answer);
}

export function nextVisibleStepIndex(startIndex: number, direction: 1 | -1, answers: Record<string, unknown>) {
  for (let index = startIndex + direction; index >= 0 && index < STEPS.length; index += direction) {
    const step = STEPS[index];
    if (step && isStepVisible(step, answers)) return index;
  }
  return -1;
}
