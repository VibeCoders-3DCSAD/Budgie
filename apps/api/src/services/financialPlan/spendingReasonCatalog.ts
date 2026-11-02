// Candidate explanations supplied in the Philippine Monthly Spending Reference.
// These are applicability rules, never forecasting coefficients or household facts.
export const HFCE_CATEGORY_SLUGS = [
  "food", "alcohol_tobacco", "clothing_footwear", "housing_water_utilities",
  "furnishings_household", "health", "transport", "communication",
  "recreation_culture", "education", "restaurants_hotels", "miscellaneous_goods_services",
] as const;
export type HfceCategorySlug = typeof HFCE_CATEGORY_SLUGS[number];

type MonthlySpendingReference = {
  month: number;
  higher: readonly HfceCategorySlug[];
  lower: readonly HfceCategorySlug[];
  candidates: readonly string[];
};

// Category lists retrieve candidates only. They do not establish applicability.
export const MONTHLY_SPENDING_REFERENCE: readonly MonthlySpendingReference[] = [
  { month: 1, higher: ["food", "transport", "restaurants_hotels", "education", "miscellaneous_goods_services"], lower: ["food", "restaurants_hotels", "recreation_culture", "transport", "alcohol_tobacco"], candidates: ["new_year", "return_travel", "school_payments", "completed_celebrations"] },
  { month: 2, higher: ["food", "alcohol_tobacco", "transport", "restaurants_hotels", "recreation_culture", "miscellaneous_goods_services"], lower: ["recreation_culture", "restaurants_hotels", "transport"], candidates: ["valentines_day", "chinese_new_year", "completed_travel"] },
  { month: 3, higher: ["food", "housing_water_utilities", "health", "transport", "recreation_culture", "education", "restaurants_hotels"], lower: [], candidates: ["summer", "school_payments"] },
  { month: 4, higher: ["food", "housing_water_utilities", "transport", "recreation_culture", "education", "restaurants_hotels"], lower: ["transport", "education", "restaurants_hotels", "recreation_culture"], candidates: ["summer", "holy_week", "confirmed_break", "completed_travel"] },
  { month: 5, higher: ["clothing_footwear", "housing_water_utilities", "furnishings_household", "transport", "recreation_culture", "education", "restaurants_hotels", "miscellaneous_goods_services"], lower: ["transport", "restaurants_hotels", "recreation_culture", "housing_water_utilities"], candidates: ["summer", "school_preparation", "mothers_day", "completed_travel"] },
  { month: 6, higher: ["food", "clothing_footwear", "housing_water_utilities", "furnishings_household", "transport", "education"], lower: ["transport", "restaurants_hotels", "recreation_culture", "housing_water_utilities"], candidates: ["back_to_school", "rainy_season", "completed_travel"] },
  { month: 7, higher: ["housing_water_utilities", "furnishings_household", "health", "transport", "education"], lower: ["recreation_culture", "restaurants_hotels", "housing_water_utilities"], candidates: ["rainy_season", "school_payments", "canceled_outings"] },
  { month: 8, higher: ["food", "furnishings_household", "transport", "education", "restaurants_hotels"], lower: ["transport", "restaurants_hotels", "recreation_culture"], candidates: ["rainy_season", "back_to_school", "holiday_travel", "completed_travel"] },
  { month: 9, higher: ["food", "furnishings_household", "transport", "education", "recreation_culture", "miscellaneous_goods_services"], lower: ["recreation_culture", "restaurants_hotels", "transport"], candidates: ["rainy_season", "christmas_ber_months", "school_payments", "local_festival"] },
  { month: 10, higher: ["food", "furnishings_household", "transport", "education", "recreation_culture", "miscellaneous_goods_services"], lower: ["recreation_culture", "restaurants_hotels", "transport"], candidates: ["undas", "rainy_season", "christmas_ber_months", "halloween", "confirmed_break"] },
  { month: 11, higher: ["food", "clothing_footwear", "furnishings_household", "transport", "recreation_culture", "restaurants_hotels", "miscellaneous_goods_services"], lower: ["transport", "restaurants_hotels", "recreation_culture", "furnishings_household"], candidates: ["undas", "christmas_ber_months", "rainy_season", "completed_travel", "completed_repairs"] },
  { month: 12, higher: ["food", "alcohol_tobacco", "clothing_footwear", "housing_water_utilities", "transport", "recreation_culture", "restaurants_hotels", "miscellaneous_goods_services"], lower: ["transport", "education", "restaurants_hotels"], candidates: ["christmas_ber_months", "confirmed_break", "completed_travel"] },
];

export const SEASON_CATEGORY_RULES: Readonly<Record<string, { months: readonly number[]; categories: readonly HfceCategorySlug[] }>> = {
  new_year: { months: [1], categories: ["food", "alcohol_tobacco", "transport", "restaurants_hotels", "recreation_culture", "miscellaneous_goods_services"] },
  summer: { months: [3, 4, 5], categories: ["food", "housing_water_utilities", "health", "transport", "recreation_culture", "restaurants_hotels"] },
  back_to_school: { months: [6, 7, 8], categories: ["food", "clothing_footwear", "transport", "education"] },
  rainy_season: { months: [6, 7, 8, 9, 10, 11], categories: ["housing_water_utilities", "furnishings_household", "health", "transport", "recreation_culture", "restaurants_hotels"] },
  undas: { months: [10, 11], categories: ["food", "transport", "restaurants_hotels"] },
  christmas_ber_months: { months: [9, 10, 11, 12], categories: ["food", "alcohol_tobacco", "clothing_footwear", "housing_water_utilities", "transport", "recreation_culture", "restaurants_hotels", "miscellaneous_goods_services"] },
};
