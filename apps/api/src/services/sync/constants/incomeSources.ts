export const INCOME_FREQUENCIES = ["daily", "weekly", "semi_monthly", "monthly"];

export const INCOME_SOURCE_CREATE_FIELDS = new Set([
  "name",
  "frequency",
  "recurring_template_id",
  "destination_account_id",
  "subcategory_id",
  "expected_amount_centavos",
  "payday_day_of_month",
  "payday_second_day_of_month",
  "payday_day_of_week",
  "next_expected_date",
  "is_active",
  "notes",
]);

export const INCOME_SOURCE_UPDATE_FIELDS = new Set([
  "name",
  "frequency",
  "recurring_template_id",
  "destination_account_id",
  "subcategory_id",
  "expected_amount_centavos",
  "payday_day_of_month",
  "payday_second_day_of_month",
  "payday_day_of_week",
  "next_expected_date",
  "is_active",
  "notes",
]);
