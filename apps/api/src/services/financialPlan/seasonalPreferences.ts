import { normalizeCustomEvents, eventMonthLabel } from "@odin/spending-insights/seasons.js";
import type { FinancialPlanEvidence } from "./explanationService.js";

// Plan explanations name seasons in their own, longer wording ("Back-to-School Season", "June to August"),
// unlike the questionnaire presets in @odin/spending-insights, and also cover the legacy quarter answers.
const SEASONAL_LABELS: Record<string, string> = { q1: "January–March", q2: "April–June", q3: "July–September", q4: "October–December", rainy_season: "Rainy Season", back_to_school: "Back-to-School Season", undas: "Undas / All Souls' Day", christmas_ber_months: "Christmas and Ber Months", new_year: "New Year", summer: "Summer", annual_payments: "Tax and Annual-Payment Season", family_celebrations: "Birthday and Family-Celebration Months" };
const SEASONAL_WINDOWS: Record<string, string> = { q1: "January to March", q2: "April to June", q3: "July to September", q4: "October to December", rainy_season: "June to November", back_to_school: "June to August", undas: "October to November", christmas_ber_months: "September to December", new_year: "January", summer: "March to May", annual_payments: "January to April", family_celebrations: "varies by the selected month" };
const SEASONAL_MONTHS: Record<string, number[]> = { q1: [1, 2, 3], q2: [4, 5, 6], q3: [7, 8, 9], q4: [10, 11, 12], rainy_season: [6, 7, 8, 9, 10, 11], back_to_school: [6, 7, 8], undas: [10, 11], christmas_ber_months: [9, 10, 11, 12], new_year: [1], summer: [3, 4, 5], annual_payments: [1, 2, 3, 4], family_celebrations: [] };

export function seasonalPreferencesFromAnswers(answers: Record<string, unknown>, periodStart: string): FinancialPlanEvidence["seasonalPreferences"] {
  const month = Number(periodStart.slice(5, 7));
  const customEvents = new Map(normalizeCustomEvents(answers.custom_seasonal_events).map((event) => [event.id, event]));
  const higher = Array.isArray(answers.high_expense_seasons) ? answers.high_expense_seasons : [];
  const preferences = { saving_seasons: "saving", high_expense_seasons: "higher_expense", low_expense_seasons: "lower_expense" } as const;
  return (Object.keys(preferences) as Array<keyof typeof preferences>).flatMap((key) => {
    const selections = answers[key];
    if (!Array.isArray(selections)) return [];
    return [...new Set(selections)].flatMap((value) => {
      if (typeof value !== "string") return [];
      const custom = customEvents.get(value);
      if (custom) {
        if (!custom.months.includes(month) || (key === "low_expense_seasons" && higher.includes(value))) return [];
        return [{ evidenceId: `${key}:${value}`, season: custom.name, seasonWindow: eventMonthLabel(custom.months), preference: preferences[key] }];
      }
      if (!SEASONAL_LABELS[value] || !SEASONAL_MONTHS[value]?.includes(month)) return [];
      if (key === "low_expense_seasons" && higher.includes(value)) return [];
      return [{ evidenceId: `${key}:${value}`, season: SEASONAL_LABELS[value]!, seasonWindow: SEASONAL_WINDOWS[value]!, preference: preferences[key] }];
    });
  });
}
