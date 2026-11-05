-- DFD-aligned physical ERD source. Do not run against the application database.
-- This is a focused subset of the public schema. Table names match
-- supabase/public-schema.sql; key columns are readability aliases that identify
-- the singular referenced table. D1-D14 comments map tables to DFD stores.
-- For page-sized diagrams grouped by workflow, see core-financial-erd-views.md.

CREATE TABLE auth.users (
  user_id uuid PRIMARY KEY
);

-- D1: User Accounts and Settings
CREATE TABLE profiles (
  profile_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(user_id),
  display_name text,
  lifecycle_status text NOT NULL
);

CREATE TABLE user_privacy_settings (
  user_id uuid PRIMARY KEY REFERENCES profiles(user_id),
  personalization_enabled boolean NOT NULL,
  notifications_opt_in boolean NOT NULL,
  data_retention_days integer
);

-- D2: Income Sources and Accounts
CREATE TABLE financial_accounts (
  financial_account_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  name text NOT NULL,
  kind text NOT NULL,
  current_balance_centavos bigint NOT NULL
);

CREATE TABLE savings_account_details (
  financial_account_id uuid PRIMARY KEY REFERENCES financial_accounts(financial_account_id),
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  account_type text NOT NULL,
  interest_rate_bps integer
);

CREATE TABLE credit_card_details (
  financial_account_id uuid PRIMARY KEY REFERENCES financial_accounts(financial_account_id),
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  credit_limit_centavos bigint NOT NULL,
  available_credit_centavos bigint
);

-- D4: Income and Expense Categories
CREATE TABLE categories (
  category_id uuid PRIMARY KEY,
  user_id uuid REFERENCES profiles(user_id),
  slug text NOT NULL,
  label text NOT NULL
);

CREATE TABLE subcategories (
  subcategory_id uuid PRIMARY KEY,
  category_id uuid REFERENCES categories(category_id),
  user_id uuid REFERENCES profiles(user_id),
  slug text NOT NULL,
  kind text NOT NULL
);

-- D6: Bills and Remittances
CREATE TABLE recurring_transaction_templates (
  recurring_transaction_template_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  subcategory_id uuid REFERENCES subcategories(subcategory_id),
  source_financial_account_id uuid REFERENCES financial_accounts(financial_account_id),
  destination_financial_account_id uuid REFERENCES financial_accounts(financial_account_id),
  transaction_type text NOT NULL,
  amount_centavos bigint NOT NULL
);

-- D2: Income Sources and Accounts (income-source records)
CREATE TABLE income_sources (
  income_source_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  recurring_transaction_template_id uuid REFERENCES recurring_transaction_templates(recurring_transaction_template_id),
  destination_financial_account_id uuid REFERENCES financial_accounts(financial_account_id),
  subcategory_id uuid REFERENCES subcategories(subcategory_id),
  name text NOT NULL,
  expected_amount_centavos bigint
);

CREATE TABLE financial_obligations (
  financial_obligation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  subcategory_id uuid NOT NULL REFERENCES subcategories(subcategory_id),
  recurring_transaction_template_id uuid REFERENCES recurring_transaction_templates(recurring_transaction_template_id),
  name text NOT NULL,
  amount_centavos bigint NOT NULL
);

-- D3 and D5: Income Transactions and Expense Transactions
-- Income and expense are rows in one ledger, distinguished by transaction_type.
CREATE TABLE transactions (
  transaction_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  category_id uuid REFERENCES categories(category_id),
  subcategory_id uuid REFERENCES subcategories(subcategory_id),
  source_financial_account_id uuid REFERENCES financial_accounts(financial_account_id),
  destination_financial_account_id uuid REFERENCES financial_accounts(financial_account_id),
  recurring_transaction_template_id uuid REFERENCES recurring_transaction_templates(recurring_transaction_template_id),
  transaction_type text NOT NULL,
  amount_centavos bigint NOT NULL
);

-- D7: Savings Goals
CREATE TABLE savings_goals (
  savings_goal_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  linked_financial_account_id uuid REFERENCES financial_accounts(financial_account_id),
  linked_subcategory_id uuid REFERENCES subcategories(subcategory_id),
  name text NOT NULL,
  is_emergency_fund boolean NOT NULL DEFAULT false,
  target_amount_centavos bigint NOT NULL
);

-- D8: Savings Contributions and Preferences
CREATE TABLE savings_goal_activities (
  savings_goal_activity_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(user_id),
  savings_goal_id uuid NOT NULL REFERENCES savings_goals(savings_goal_id),
  transaction_id uuid NOT NULL REFERENCES transactions(transaction_id),
  activity_kind text NOT NULL,
  amount_centavos bigint NOT NULL
);

CREATE TABLE savings_allocation_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(user_id),
  strategy text NOT NULL
);

-- D9: Debt Accounts
CREATE TABLE debt_accounts (
  debt_account_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  linked_financial_account_id uuid REFERENCES financial_accounts(financial_account_id),
  name text NOT NULL,
  current_balance_centavos bigint NOT NULL
);

-- D10: Debt Payments and Repayment Preferences
CREATE TABLE debt_payments (
  debt_payment_id uuid PRIMARY KEY,
  debt_account_id uuid NOT NULL REFERENCES debt_accounts(debt_account_id),
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  transaction_id uuid REFERENCES transactions(transaction_id),
  amount_centavos bigint NOT NULL
);

CREATE TABLE debt_strategy_preferences (
  user_id uuid PRIMARY KEY REFERENCES profiles(user_id),
  strategy text NOT NULL,
  extra_payment_centavos bigint NOT NULL
);

CREATE TABLE credit_card_repayment_preferences (
  financial_account_id uuid PRIMARY KEY REFERENCES financial_accounts(financial_account_id),
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  strategy text NOT NULL,
  custom_amount_centavos bigint,
  percentage_bps integer
);

CREATE TABLE credit_card_cycles (
  credit_card_cycle_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  financial_account_id uuid NOT NULL REFERENCES financial_accounts(financial_account_id),
  cycle_start_date date NOT NULL,
  cutoff_date date NOT NULL
);

CREATE TABLE credit_card_statements (
  credit_card_statement_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  credit_card_cycle_id uuid NOT NULL REFERENCES credit_card_cycles(credit_card_cycle_id),
  statement_balance_centavos bigint NOT NULL,
  minimum_due_centavos bigint NOT NULL
);

CREATE TABLE credit_card_payments (
  credit_card_payment_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  credit_card_cycle_id uuid NOT NULL REFERENCES credit_card_cycles(credit_card_cycle_id),
  credit_card_statement_id uuid REFERENCES credit_card_statements(credit_card_statement_id),
  transaction_id uuid REFERENCES transactions(transaction_id),
  source_financial_account_id uuid REFERENCES financial_accounts(financial_account_id),
  payment_date date NOT NULL,
  amount_centavos bigint NOT NULL
);

-- D11: Financial Plans
CREATE TABLE financial_plans (
  financial_plan_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(user_id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL,
  forecast_month text NOT NULL,
  forecast_total_centavos bigint NOT NULL,
  forecast_model_version text NOT NULL,
  forecast_generated_at timestamp with time zone NOT NULL,
  forecast_quality text NOT NULL,
  available_funds_centavos bigint NOT NULL,
  required_funds_centavos bigint,
  shortfall_centavos bigint,
  classification_status text,
  classification_rule_set_version text,
  classification_assessed_at timestamp with time zone
);

CREATE TABLE financial_plan_allocations (
  financial_plan_allocation_id uuid PRIMARY KEY,
  financial_plan_id uuid NOT NULL REFERENCES financial_plans(financial_plan_id),
  category_id uuid REFERENCES categories(category_id),
  subcategory_id uuid REFERENCES subcategories(subcategory_id),
  allocated_amount_centavos bigint NOT NULL
);

CREATE TABLE financial_plan_debt_reservations (
  financial_plan_debt_reservation_id uuid PRIMARY KEY,
  financial_plan_id uuid NOT NULL REFERENCES financial_plans(financial_plan_id),
  debt_account_id uuid REFERENCES debt_accounts(debt_account_id),
  credit_card_statement_id uuid REFERENCES credit_card_statements(credit_card_statement_id),
  amount_centavos bigint NOT NULL
);

CREATE TABLE financial_plan_savings_reservations (
  financial_plan_savings_reservation_id uuid PRIMARY KEY,
  financial_plan_id uuid NOT NULL REFERENCES financial_plans(financial_plan_id),
  savings_goal_id uuid NOT NULL REFERENCES savings_goals(savings_goal_id),
  amount_centavos bigint NOT NULL
);

-- D14: Forecast History
-- Forecast totals and provenance are immutable attributes of an accepted plan;
-- category-level forecast history is retained in financial_plan_forecast_points.
CREATE TABLE financial_plan_forecast_points (
  financial_plan_id uuid NOT NULL REFERENCES financial_plans(financial_plan_id),
  category_key text NOT NULL,
  amount_centavos bigint NOT NULL,
  PRIMARY KEY (financial_plan_id, category_key)
);

-- D12: Savings and Debt Profile Classifications
-- Each row is an immutable assessment result. Snapshots persist both the inputs
-- evaluated and the rule output; plans retain only classification provenance.
CREATE TABLE financial_condition_assessments (
  financial_condition_assessment_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  assessed_at timestamp with time zone NOT NULL,
  rule_set_version text NOT NULL,
  input_snapshot jsonb NOT NULL,
  output_snapshot jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL
);

-- D13: Unusual Expense Alerts
CREATE TABLE anomaly_evaluations (
  anomaly_evaluation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  transaction_id uuid NOT NULL REFERENCES transactions(transaction_id),
  subcategory_id uuid NOT NULL REFERENCES subcategories(subcategory_id),
  is_anomaly boolean NOT NULL
);

CREATE TABLE overspending_evaluations (
  overspending_evaluation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  category_id uuid REFERENCES categories(category_id),
  subcategory_id uuid REFERENCES subcategories(subcategory_id),
  overspent_amount_centavos bigint NOT NULL
);

CREATE TABLE alerts (
  alert_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  transaction_id uuid REFERENCES transactions(transaction_id),
  subcategory_id uuid REFERENCES subcategories(subcategory_id),
  debt_account_id uuid REFERENCES debt_accounts(debt_account_id),
  savings_goal_id uuid REFERENCES savings_goals(savings_goal_id),
  anomaly_evaluation_id uuid REFERENCES anomaly_evaluations(anomaly_evaluation_id),
  overspending_evaluation_id uuid REFERENCES overspending_evaluations(overspending_evaluation_id),
  category text NOT NULL,
  status text NOT NULL
);
