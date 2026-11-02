import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";

describe("debt repayment-plan sync validation", () => {
  it("accepts a Snowball strategy update", async () => {
    await expect(prepareOperation({} as never, "user-1", {
      operation_id: "operation-1",
      entity: "debt_strategy_preferences",
      record_id: "user-1",
      operation_type: "update",
      base_version: 1,
      changed_fields: ["strategy"],
      payload: { strategy: "snowball" },
    })).resolves.toMatchObject({ payload: { strategy: "snowball" } });
  });

  it("accepts a debt-payment update containing only changed fields", async () => {
    await expect(prepareOperation({} as never, "user-1", {
      operation_id: "operation-2",
      entity: "debt_payments",
      record_id: "payment-1",
      operation_type: "update",
      base_version: 1,
      changed_fields: ["amount_centavos", "principal_centavos", "payment_date", "notes"],
      payload: {
        debt_account_id: "debt-1",
        transaction_id: "transaction-1",
        source: "transaction",
        payment_date: "2026-09-10",
        amount_centavos: 1_000,
        principal_centavos: 1_000,
        interest_centavos: 0,
        notes: null,
        linked_transaction_type: "expense",
        linked_source_account_id: "account-1",
        linked_subcategory_id: "subcategory-1",
      },
    })).resolves.toMatchObject({
      payload: {
        amount_centavos: 1_000,
        principal_centavos: 1_000,
        payment_date: "2026-09-10",
        notes: null,
      },
    });
  });

  it("rejects a salary loan without a recognized provider", async () => {
    await expect(prepareOperation({} as never, "user-1", {
      operation_id: "operation-3",
      entity: "debt_accounts",
      record_id: "debt-1",
      operation_type: "create",
      base_version: null,
      changed_fields: [],
      payload: {
        name: "Government salary loan", preset_key: "salary_loan", status: "active",
        original_balance_centavos: 100_000, current_balance_centavos: 100_000,
        annual_interest_rate_bps: 600, minimum_payment_centavos: 5_000,
        payment_frequency: "monthly", next_due_date: "2026-11-01",
        preset_data: { salaryLoan: { provider: "invalid", linkedIncomeSourceId: "income-1", repaymentMethod: "payroll_deduction", deductionAmountCentavos: 5_000, deductionSchedule: "monthly" } },
      },
    })).rejects.toThrow("salary loan provider is invalid");
  });

  it("accepts an extra-payment preference update", async () => {
    await expect(prepareOperation({} as never, "user-1", {
      operation_id: "operation-4",
      entity: "debt_accounts",
      record_id: "debt-1",
      operation_type: "update",
      base_version: 1,
      changed_fields: ["allows_extra_payments"],
      payload: { allows_extra_payments: true },
    })).resolves.toMatchObject({ payload: { allows_extra_payments: true } });
  });
});
