import { prepareOperation } from "../../../services/sync/syncApplyOperation";

const operation = {
  operation_id: "operation-1",
  entity: "anomaly_evaluations",
  record_id: "evaluation-1",
  operation_type: "create" as const,
  base_version: null,
  changed_fields: [],
  payload: {
    transaction_id: "transaction-1",
    subcategory_id: "subcategory-1",
    amount_centavos: 100_000,
    usable_history_count: 6,
    usual_spending_centavos: 12_500,
    lower_bound_centavos: 7_500,
    upper_bound_centavos: 20_000,
    severity: 1.2,
    model_version: "personal-transaction-iqr-local-v1",
    evaluated_at: "2026-10-30T12:00:00.000Z",
  },
};

describe("anomaly evaluation sync validation", () => {
  it("accepts the immutable local IQR evaluation payload", async () => {
    await expect(prepareOperation({} as never, "user-1", operation)).resolves.toMatchObject({ payload: operation.payload });
  });

  it("rejects attempts to update evaluation scores", async () => {
    await expect(prepareOperation({} as never, "user-1", { ...operation, operation_type: "update" as const, base_version: 1, changed_fields: ["severity"], payload: { severity: 2 } })).rejects.toThrow();
  });

  it("accepts the user's recurring-spending confirmation", async () => {
    const payload = { confirmed_recurring_at: "2026-10-31T08:00:00.000Z" };
    await expect(prepareOperation({} as never, "user-1", { ...operation, operation_type: "update" as const, base_version: 1, changed_fields: ["confirmed_recurring_at"], payload })).resolves.toMatchObject({ payload });
  });

  it("rejects a recurring-spending confirmation without a timestamp", async () => {
    await expect(prepareOperation({} as never, "user-1", { ...operation, operation_type: "update" as const, base_version: 1, changed_fields: ["confirmed_recurring_at"], payload: { confirmed_recurring_at: "yes" } })).rejects.toThrow("confirmed_recurring_at must be an ISO-8601 timestamp");
  });

  const answer = (payload: Record<string, unknown>) => prepareOperation({} as never, "user-1", { ...operation, operation_type: "update" as const, base_version: 1, changed_fields: Object.keys(payload), payload });

  it.each([
    { recurrence: "frequent", confirmed_recurring_at: "2026-10-31T08:00:00.000Z" },
    { recurrence: "yearly" },
    { recurrence: "yearly", recurrence_months: [6, 11] },
    { recurrence: "one_time" },
  ])("accepts the user's answer %o", async (payload) => {
    await expect(answer(payload)).resolves.toMatchObject({ payload });
  });

  it("rejects an unknown answer", async () => {
    await expect(answer({ recurrence: "monthly" })).rejects.toThrow("recurrence must be one_time, frequent, or yearly");
  });

  it("requires a confirmation time for a frequent answer and refuses one otherwise", async () => {
    await expect(answer({ recurrence: "frequent" })).rejects.toThrow("confirmed_recurring_at must be an ISO-8601 timestamp");
    await expect(answer({ recurrence: "yearly", confirmed_recurring_at: "2026-10-31T08:00:00.000Z" })).rejects.toThrow("confirmed_recurring_at is only recorded for frequent spending");
  });

  it("puts chosen months in calendar order", async () => {
    await expect(answer({ recurrence: "yearly", recurrence_months: [11, 6] })).resolves.toMatchObject({ payload: { recurrence_months: [6, 11] } });
  });

  it.each([
    { recurrence: "one_time", recurrence_months: [6] },
    { confirmed_recurring_at: "2026-10-31T08:00:00.000Z", recurrence_months: [6] },
    { recurrence: "yearly", recurrence_months: [] },
    { recurrence: "yearly", recurrence_months: [0] },
    { recurrence: "yearly", recurrence_months: [13] },
    { recurrence: "yearly", recurrence_months: [6, 6] },
    { recurrence: "yearly", recurrence_months: [6.5] },
    { recurrence: "yearly", recurrence_months: "6" },
  ])("rejects months %o", async (payload) => {
    await expect(answer(payload)).rejects.toThrow("recurrence_months must be distinct months from 1 to 12 on a yearly answer");
  });
});
