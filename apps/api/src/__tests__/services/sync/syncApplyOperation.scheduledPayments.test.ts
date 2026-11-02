import { prepareOperation } from "../../../services/sync/syncApplyOperation";

const scheduledPayment = {
  operation_id: "operation-1",
  entity: "scheduled_payments",
  record_id: "payment-1",
  operation_type: "create" as const,
  base_version: null,
  changed_fields: [],
  payload: {
    name: "Meralco",
    subcategory_id: "subcategory-1",
    source_account_id: "account-1",
    amount_centavos: 234_000,
    frequency: "monthly",
    due_day_of_month: 5,
    starts_on: "2026-09-01",
    auto_post: true,
    auto_post_from: "2026-10-17",
  },
};

const record = {
  ...scheduledPayment,
  entity: "scheduled_payment_records",
  record_id: "record-1",
  payload: {
    scheduled_payment_id: "payment-1",
    transaction_id: "transaction-1",
    occurrence_date: "2026-11-05",
    payment_date: "2026-11-04",
    amount_centavos: 234_000,
    source: "manual",
  },
};

function update(payload: Record<string, unknown>) {
  return { ...scheduledPayment, operation_type: "update" as const, base_version: 1, changed_fields: Object.keys(payload), payload };
}

describe("scheduled payment sync validation", () => {
  it("accepts a new scheduled payment", async () => {
    await expect(prepareOperation({} as never, "user-1", scheduledPayment)).resolves.toMatchObject({ payload: scheduledPayment.payload });
  });

  it("accepts a daily, uncategorized payment", async () => {
    const payload = { ...scheduledPayment.payload, subcategory_id: null, frequency: "daily", due_day_of_month: null };
    await expect(prepareOperation({} as never, "user-1", { ...scheduledPayment, payload })).resolves.toMatchObject({ payload: { subcategory_id: null, frequency: "daily" } });
  });

  it("rejects a schedule the app does not support", async () => {
    await expect(prepareOperation({} as never, "user-1", { ...scheduledPayment, payload: { ...scheduledPayment.payload, frequency: "hourly" } })).rejects.toThrow("frequency is not a supported schedule");
  });

  it("rejects a non-positive amount and an out-of-range due day", async () => {
    await expect(prepareOperation({} as never, "user-1", { ...scheduledPayment, payload: { ...scheduledPayment.payload, amount_centavos: 0 } })).rejects.toThrow("amount_centavos must be a positive integer");
    await expect(prepareOperation({} as never, "user-1", update({ due_day_of_month: 45 }))).rejects.toThrow("due_day_of_month must be between 1 and 31");
  });

  it("accepts archiving and rejects any other status", async () => {
    await expect(prepareOperation({} as never, "user-1", update({ status: "archived" }))).resolves.toMatchObject({ payload: { status: "archived" } });
    await expect(prepareOperation({} as never, "user-1", update({ status: "deleted" }))).rejects.toThrow("status must be active or archived");
  });

  it("rejects fields that are not syncable", async () => {
    await expect(prepareOperation({} as never, "user-1", update({ recurring_template_id: "template-1" }))).rejects.toThrow("recurring_template_id is not syncable");
  });

  it("accepts a payment record and rejects updating anything but its settlement", async () => {
    const recordUpdate = (payload: Record<string, unknown>) => ({ ...record, operation_type: "update" as const, base_version: 1, changed_fields: Object.keys(payload), payload });
    await expect(prepareOperation({} as never, "user-1", record)).resolves.toMatchObject({ payload: record.payload });
    await expect(prepareOperation({} as never, "user-1", recordUpdate({ settles_occurrence: true }))).resolves.toMatchObject({ payload: { settles_occurrence: true } });
    await expect(prepareOperation({} as never, "user-1", recordUpdate({ notes: "x" }))).rejects.toThrow("payment records only update settles_occurrence");
    await expect(prepareOperation({} as never, "user-1", recordUpdate({ settles_occurrence: true, amount_centavos: 1 }))).rejects.toThrow("payment records only update settles_occurrence");
    await expect(prepareOperation({} as never, "user-1", recordUpdate({ settles_occurrence: "yes" }))).rejects.toThrow("payment records only update settles_occurrence");
  });

  it("rejects a payment record without a valid occurrence date", async () => {
    await expect(prepareOperation({} as never, "user-1", { ...record, payload: { ...record.payload, occurrence_date: "2026-02-30" } })).rejects.toThrow("occurrence_date must be a valid calendar date");
  });
});
