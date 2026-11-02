import { CUSTOM_EVENT_ID, customEventsError, normalizeCustomEvents, SEASON_PRESETS, LEGACY_SEASON_LABELS, type SeasonalPreferences } from "@odin/spending-insights/seasons.js";

// Every season a questionnaire answer may name, besides custom events.
export const SEASON_ANSWER_KEYS: readonly string[] = [...SEASON_PRESETS.map((preset) => preset.key), ...Object.keys(LEGACY_SEASON_LABELS), "none"];

// Settings exposes only seasonal preferences, never the classification answers.
export function savedSeasonalPreferences(value: unknown): SeasonalPreferences {
  const answers = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const events = normalizeCustomEvents(answers.custom_seasonal_events);
  const allowed = new Set([...SEASON_ANSWER_KEYS, ...events.map((event) => event.id)]);
  const selections = (key: string): string[] => {
    const values = answers[key];
    return Array.isArray(values) ? [...new Set(values.filter((item): item is string => typeof item === "string" && allowed.has(item)))].slice(0, 40) : [];
  };
  return { high_expense_seasons: selections("high_expense_seasons"), low_expense_seasons: selections("low_expense_seasons"), saving_seasons: selections("saving_seasons"), custom_seasonal_events: events };
}

export function validateSeasonalAnswers(answers: Record<string, unknown>, checkReferences = true): string | null {
  if (answers.custom_seasonal_events !== undefined) {
    const error = customEventsError(answers.custom_seasonal_events);
    if (error) return error;
  }
  const events = normalizeCustomEvents(answers.custom_seasonal_events);
  const ids = new Set(events.map((event) => event.id));
  for (const key of ["high_expense_seasons", "low_expense_seasons", "saving_seasons"]) {
    const selections = answers[key];
    if (!Array.isArray(selections)) continue;
    if (selections.length > 40 || new Set(selections).size !== selections.length) return "Seasonal selections must be bounded and unique.";
    if (checkReferences && selections.some((selection) => typeof selection === "string" && CUSTOM_EVENT_ID.test(selection) && !ids.has(selection))) return "Select a custom event saved in your questionnaire.";
  }
  return null;
}

export function normalizeSeasonalAnswers(answers: Record<string, unknown>): Record<string, unknown> {
  const next = { ...answers };
  if (next.custom_seasonal_events !== undefined) next.custom_seasonal_events = normalizeCustomEvents(next.custom_seasonal_events);
  return next;
}
