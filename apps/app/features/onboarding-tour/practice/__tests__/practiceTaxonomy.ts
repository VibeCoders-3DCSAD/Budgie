import type { Taxonomy } from "../taxonomy";

export const PRACTICE_USER = "5b0c6f0e-1d2a-4c3b-8e4f-9a0b1c2d3e4f";

// Every system subcategory the practice data uses, grouped under a parent category named by its prefix.
const SLUGS = [
  "income_salary", "income_freelance", "housing_rent", "housing_electricity", "housing_internet", "communication_mobile_postpaid",
  "misc_other", "food_groceries", "transport_public", "restaurants_fast_food", "clothing_womens", "restaurants_casual_dining",
  "household_kitchenware", "recreation_streaming", "clothing_accessories", "transport_ride_hailing", "communication_device",
];

export function practiceTaxonomy(): Taxonomy {
  const stamp = { description: "", short_label: null, icon_key: "tag", color_hex: "#888888", is_filipino_context: 0, minimum_amount_centavos: 0, always_in_budget: 0, fixed_amount_centavos: null, metadata: "{}", user_id: PRACTICE_USER, version: 1, deleted: 0, created_at: "2026-01-01", updated_at: "2026-01-01", last_synced_at: "2026-01-01" };
  const parents = [...new Set(SLUGS.map((slug) => slug.split("_")[0]!))];
  return {
    categories: parents.map((prefix, index) => ({ ...stamp, id: `cat-${prefix}`, slug: prefix, label: prefix === "food" ? "Food and Groceries" : prefix, classification: "essential", sort_order: index, is_active: 1, is_system: 1 })),
    subcategories: SLUGS.map((slug, index) => ({ ...stamp, id: `sub-${slug}`, slug, label: slug, kind: slug.startsWith("income_") ? "income" : "expense", category_id: `cat-${slug.split("_")[0]}`, sort_order: index, is_active: 1, is_system: 1 })),
  };
}
