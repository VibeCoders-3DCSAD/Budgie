import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";

function createSupabaseStub() {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: { id: "card-1", transaction_type: "expense", source_account_id: "card-1" }, error: null }),
  };
  return { from: () => query } as never;
}

it("preserves transaction_id when preparing a credit-card relationship", async () => {
  const prepared = await prepareOperation(createSupabaseStub(), "user-1", {
    operation_id: "operation-1",
    entity: "credit_card_transactions",
    record_id: "transaction-1",
    operation_type: "create",
    base_version: null,
    changed_fields: ["transaction_id", "account_id", "cycle_id", "purchase_type", "forecast_recorded_at"],
    payload: {
      transaction_id: "transaction-1",
      account_id: "card-1",
      cycle_id: "cycle-1",
      purchase_type: "regular",
      forecast_recorded_at: "2026-09-10T12:00:00.000Z",
    },
  });

  expect(prepared.payload).toMatchObject({
    transaction_id: "transaction-1",
    account_id: "card-1",
    cycle_id: "cycle-1",
    purchase_type: "regular",
    forecast_recorded_at: "2026-09-10T12:00:00.000Z",
  });
});

it("prepares a backfilled installment linked to the user-owned credit-card expense", async () => {
  const prepared = await prepareOperation(createSupabaseStub(), "user-1", {
    operation_id: "operation-installment", entity: "credit_card_installments", record_id: "installment-1",
    operation_type: "create", base_version: null, changed_fields: [],
    payload: {
      account_id: "card-1", transaction_id: "transaction-1", description: "Laptop",
      original_principal_centavos: 120000, remaining_principal_centavos: 70000,
      term_months: 12, remaining_months: 7, monthly_amortization_centavos: 10000,
      interest_rate_bps: 0, interest_type: "zero_interest", settlement_status: "active",
    },
  });

  expect(prepared.payload).toMatchObject({
    account_id: "card-1", transaction_id: "transaction-1", interest_type: "zero_interest",
    remaining_principal_centavos: 70000, remaining_months: 7,
    settlement_status: "active",
  });
});

it("accepts the canonical completed installment lifecycle value", async () => {
  const prepared = await prepareOperation(createSupabaseStub(), "user-1", {
    operation_id: "operation-completed-installment", entity: "credit_card_installments", record_id: "installment-2",
    operation_type: "create", base_version: null, changed_fields: [],
    payload: {
      account_id: "card-1", transaction_id: "transaction-1", description: "Closed installment",
      original_principal_centavos: 120000, remaining_principal_centavos: 0,
      term_months: 12, remaining_months: 0, monthly_amortization_centavos: 10000,
      interest_rate_bps: 0, interest_type: "zero_interest", settlement_status: "completed",
    },
  });

  expect(prepared.payload).toMatchObject({ settlement_status: "completed", remaining_months: 0 });
});

it("prepares every editable credit-card detail field for updates", async () => {
  const prepared = await prepareOperation(createSupabaseStub(), "user-1", {
    operation_id: "operation-2",
    entity: "credit_card_details",
    record_id: "card-1",
    operation_type: "update",
    base_version: 1,
    changed_fields: [
      "issuer", "credit_limit_centavos",
      "cutoff_day", "statement_day", "notes", "billing_cycle_days",
      "alert_threshold_percent",
    ],
    payload: {
      issuer: "Visa",
      credit_limit_centavos: 250000,
      cutoff_day: 15,
      statement_day: 5,
      notes: "Primary card",
      billing_cycle_days: 30,
      alert_threshold_percent: 80,
    },
  });

  expect(prepared.payload).toEqual({
    issuer: "Visa",
    credit_limit_centavos: 250000,
    cutoff_day: 15,
    statement_day: 5,
    notes: "Primary card",
    billing_cycle_days: 30,
    alert_threshold_percent: 80,
  });
});

it("accepts issuer-reconciled available credit updates", async () => {
  const prepared = await prepareOperation(createSupabaseStub(), "user-1", {
    operation_id: "operation-reconcile-credit", entity: "credit_card_details", record_id: "card-1",
    operation_type: "update", base_version: 1,
    changed_fields: ["available_credit_centavos", "reconciled_available_credit_centavos", "pre_reconciliation_available_credit_centavos", "available_credit_reconciled_at"],
    payload: { available_credit_centavos: 50_000, reconciled_available_credit_centavos: 50_000, pre_reconciliation_available_credit_centavos: 60_000, available_credit_reconciled_at: "2026-09-10T12:00:00.000Z" },
  });

  expect(prepared.payload).toEqual({ available_credit_centavos: 50_000, reconciled_available_credit_centavos: 50_000, pre_reconciliation_available_credit_centavos: 60_000, available_credit_reconciled_at: "2026-09-10T12:00:00.000Z" });
});
