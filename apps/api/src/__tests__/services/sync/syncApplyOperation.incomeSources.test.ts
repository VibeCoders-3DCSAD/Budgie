import { prepareOperation } from "../../../services/sync/syncApplyOperation";

const incomeSource = {
  operation_id: "operation-1",
  entity: "income_sources",
  record_id: "income-1",
  operation_type: "create" as const,
  base_version: null,
  changed_fields: [],
  payload: {
    name: "Salary",
    frequency: "semi_monthly",
    destination_account_id: "account-1",
    subcategory_id: "subcategory-1",
    expected_amount_centavos: 2_500_000,
    payday_day_of_month: 15,
    payday_second_day_of_month: 30,
  },
};

function create(payload: Record<string, unknown>) {
  return { ...incomeSource, payload: { ...incomeSource.payload, ...payload } };
}

function update(payload: Record<string, unknown>) {
  return { ...incomeSource, operation_type: "update" as const, base_version: 1, changed_fields: Object.keys(payload), payload };
}

describe("income source sync validation", () => {
  it.each(["biweekly", "irregular", "custom"])("rejects the removed %s frequency", async (frequency) => {
    await expect(prepareOperation({} as never, "user-1", create({ frequency }))).rejects.toThrow("frequency must be one of: daily, weekly, semi_monthly, monthly");
    await expect(prepareOperation({} as never, "user-1", update({ frequency }))).rejects.toThrow("frequency must be a valid income frequency");
  });

  it("rejects the removed variable-income fields", async () => {
    for (const field of ["income_type", "min_amount_centavos", "max_amount_centavos", "estimated_interval_days", "payday_second_day_of_week"]) {
      await expect(prepareOperation({} as never, "user-1", create({ [field]: 1 }))).rejects.toThrow();
      await expect(prepareOperation({} as never, "user-1", update({ [field]: 1 }))).rejects.toThrow();
    }
  });

  it("requires a positive expected amount", async () => {
    await expect(prepareOperation({} as never, "user-1", create({ expected_amount_centavos: null }))).rejects.toThrow("expected_amount_centavos must be a positive integer");
    await expect(prepareOperation({} as never, "user-1", update({ expected_amount_centavos: 0 }))).rejects.toThrow("expected_amount_centavos must be a positive integer");
  });

  it("accepts daily income on update", async () => {
    await expect(prepareOperation({} as never, "user-1", update({ frequency: "daily" }))).resolves.toMatchObject({ payload: { frequency: "daily" } });
  });
});
