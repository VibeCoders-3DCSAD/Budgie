import { jest } from "@jest/globals";
import { createSqliteHarness } from "../../__tests__/sqliteHarness";
import type { ScheduledPaymentInput } from "../scheduledPayments";

const mockInitDatabase = jest.fn<() => Promise<unknown>>();
jest.mock("../../../client", () => ({ initDatabase: () => mockInitDatabase() }));

const rent: ScheduledPaymentInput = {
  name: "Rent", subcategoryId: "sub-rent", sourceAccountId: "acct-cash", amountCentavos: 1_200_000,
  frequency: "monthly", dueDayOfMonth: 1, dueSecondDayOfMonth: null, dueDayOfWeek: null, dueMonth: null,
  startsOn: "2026-09-01", endsOn: null, autoPost: false, isFamilySupport: false, isDependentSupport: false, protectedByDefault: true, notes: null,
};

let harness: ReturnType<typeof createSqliteHarness>;

async function repos() {
  return { ...(await import("../scheduledPayments")), ...(await import("../../ledger/ledger")) };
}

function balance() {
  return (harness.sqlite.prepare("SELECT current_balance_centavos AS balance FROM financial_accounts WHERE id = 'acct-cash'").get() as { balance: number }).balance;
}

function liveRecords() {
  return harness.sqlite.prepare("SELECT id, transaction_id, occurrence_date, amount_centavos, source FROM scheduled_payment_records WHERE deleted = 0 ORDER BY occurrence_date").all();
}

beforeEach(async () => {
  jest.resetModules();
  harness = createSqliteHarness();
  await harness.migrateAll();
  harness.sqlite.exec(`
    INSERT INTO categories (id, user_id, slug, label, description, created_at, updated_at) VALUES ('cat-housing', 'user-1', 'housing', 'Housing', 'Housing', 'now', 'now');
    INSERT INTO subcategories (id, user_id, category_id, kind, slug, label, description, created_at, updated_at) VALUES ('sub-rent', 'user-1', 'cat-housing', 'expense', 'rent', 'Rent', 'Rent', 'now', 'now');
    INSERT INTO financial_accounts (id, user_id, name, kind, opening_balance_centavos, current_balance_centavos, created_at, updated_at) VALUES ('acct-cash', 'user-1', 'Wallet', 'cash', 5000000, 5000000, 'now', 'now');
  `);
  mockInitDatabase.mockResolvedValue(harness.db);
});

afterEach(() => harness.sqlite.close());

describe("recording a scheduled payment", () => {
  it("creates the expense and the payment record together and shows the occurrence as partially paid", async () => {
    const { createScheduledPayment, recordScheduledPayment, listScheduledPaymentSummaries } = await repos();
    const payment = await createScheduledPayment("user-1", "device-1", { ...rent, startsOn: "2026-10-15" });
    await recordScheduledPayment("user-1", "device-1", { scheduledPaymentId: payment.id, occurrenceDate: "2026-11-01", amountCentavos: 500_000, paymentDate: "2026-10-30", sourceAccountId: "acct-cash", notes: " first half " });

    expect(balance()).toBe(4_500_000);
    const [record] = liveRecords() as { transaction_id: string }[];
    expect(record).toMatchObject({ occurrence_date: "2026-11-01", amount_centavos: 500_000, source: "manual" });
    expect(harness.sqlite.prepare("SELECT transaction_type, subcategory_id, merchant_name, notes FROM transactions WHERE id = ?").get(record!.transaction_id))
      .toEqual({ transaction_type: "expense", subcategory_id: "sub-rent", merchant_name: "Rent", notes: "first half" });
    const [summary] = await listScheduledPaymentSummaries("user-1", "active", "2026-10-31");
    expect(summary!.current).toMatchObject({ dueDate: "2026-11-01", paidCentavos: 500_000, remainingCentavos: 700_000, status: "partially_paid" });
  });

  it("records a resubmitted payment only once", async () => {
    const { createScheduledPayment, recordScheduledPayment } = await repos();
    const payment = await createScheduledPayment("user-1", "device-1", rent);
    const entry = { id: "record-fixed", scheduledPaymentId: payment.id, occurrenceDate: "2026-11-01", amountCentavos: 500_000, paymentDate: "2026-10-30", sourceAccountId: "acct-cash", notes: null };
    await recordScheduledPayment("user-1", "device-1", entry);
    await recordScheduledPayment("user-1", "device-1", entry);

    expect(liveRecords()).toHaveLength(1);
    expect(balance()).toBe(4_500_000);
  });

  it("refuses payments against an archived scheduled payment", async () => {
    const { createScheduledPayment, setScheduledPaymentArchived, recordScheduledPayment } = await repos();
    const payment = await createScheduledPayment("user-1", "device-1", rent);
    await setScheduledPaymentArchived("user-1", "device-1", payment.id, true);

    await expect(recordScheduledPayment("user-1", "device-1", { scheduledPaymentId: payment.id, occurrenceDate: "2026-11-01", amountCentavos: 100, paymentDate: "2026-10-30", sourceAccountId: "acct-cash", notes: null }))
      .rejects.toThrow("This obligation is no longer available for payments.");
    expect(balance()).toBe(5_000_000);
  });

  it("blocks editing the payment's transaction and removes the record when the transaction is deleted", async () => {
    const { createScheduledPayment, recordScheduledPayment, updateTransaction, deleteScheduledPaymentRecord } = await repos();
    const payment = await createScheduledPayment("user-1", "device-1", rent);
    await recordScheduledPayment("user-1", "device-1", { scheduledPaymentId: payment.id, occurrenceDate: "2026-11-01", amountCentavos: 500_000, paymentDate: "2026-10-30", sourceAccountId: "acct-cash", notes: null });
    const [record] = liveRecords() as { id: string; transaction_id: string }[];

    await expect(updateTransaction("user-1", "device-1", record!.transaction_id, { amount_centavos: 1 })).rejects.toThrow("This transaction pays a biller or remittance.");
    await deleteScheduledPaymentRecord("user-1", "device-1", record!.transaction_id);
    expect(liveRecords()).toEqual([]);
    expect(balance()).toBe(5_000_000);
    expect(harness.queued("scheduled_payment_records").map((operation) => operation.operation_type)).toEqual(["create", "delete"]);
  });
});

describe("uncategorized billers", () => {
  it("post an uncategorized expense named after the biller that the transaction list flags", async () => {
    const { createScheduledPayment, postDueScheduledPayments, listTransactions } = await repos();
    await createScheduledPayment("user-1", "device-1", { ...rent, name: "Padala kay Nanay", subcategoryId: null, autoPost: true }, "2026-10-01");

    expect(await postDueScheduledPayments("user-1", "device-1", "2026-10-01")).toBe(1);
    const [transaction] = await listTransactions("user-1");
    expect(transaction).toMatchObject({ name: "Padala kay Nanay", transaction_type: "expense", category_label: null, is_scheduled_payment: 1 });
    expect(harness.queued("transactions")[0]!.payload).toMatchObject({ entry_source: "recurring", subcategory_id: null, merchant_name: "Padala kay Nanay", client_mutation_id: expect.stringMatching(/^scheduled-payment:.+:2026-10-01$/) });
  });

  it("mark manual payments as biller payments too", async () => {
    const { createScheduledPayment, recordScheduledPayment } = await repos();
    const payment = await createScheduledPayment("user-1", "device-1", { ...rent, subcategoryId: null });
    await recordScheduledPayment("user-1", "device-1", { id: "record-1", scheduledPaymentId: payment.id, occurrenceDate: "2026-10-01", amountCentavos: 1000, paymentDate: "2026-09-30", sourceAccountId: "acct-cash", notes: null });

    expect(harness.queued("transactions")[0]!.payload).toMatchObject({ subcategory_id: null, client_mutation_id: `scheduled-payment:${payment.id}:record:record-1` });
    expect(harness.queued("transactions")[0]!.payload).not.toHaveProperty("entry_source");
  });

  it("the ledger still rejects any other uncategorized expense", async () => {
    const { createExpense } = await repos();
    await expect(createExpense("user-1", "device-1", { amount_centavos: 1000, source_account_id: "acct-cash", subcategory_id: null as never, transaction_date: "2026-10-01" }))
      .rejects.toThrow("subcategory_id is required for expense");
  });
});

describe("postDueScheduledPayments", () => {
  it("posts a daily payment once per day", async () => {
    const { createScheduledPayment, postDueScheduledPayments } = await repos();
    await createScheduledPayment("user-1", "device-1", { ...rent, frequency: "daily", dueDayOfMonth: null, amountCentavos: 10_000, autoPost: true }, "2026-10-01");

    expect(await postDueScheduledPayments("user-1", "device-1", "2026-10-03")).toBe(3);
    expect(await postDueScheduledPayments("user-1", "device-1", "2026-10-03")).toBe(0);
    expect(await postDueScheduledPayments("user-1", "device-1", "2026-10-04")).toBe(1);
    expect((liveRecords() as { occurrence_date: string }[]).map((record) => record.occurrence_date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  });

  it("posts each unpaid due date since auto-post was turned on, once, with ids derived from the occurrence", async () => {
    const { createScheduledPayment, recordScheduledPayment, postDueScheduledPayments } = await repos();
    const payment = await createScheduledPayment("user-1", "device-1", { ...rent, autoPost: true }, "2026-09-15");
    await recordScheduledPayment("user-1", "device-1", { scheduledPaymentId: payment.id, occurrenceDate: "2026-10-01", amountCentavos: 200_000, paymentDate: "2026-09-28", sourceAccountId: "acct-cash", notes: null });

    expect(await postDueScheduledPayments("user-1", "device-1", "2026-11-01")).toBe(2);
    expect(await postDueScheduledPayments("user-1", "device-1", "2026-11-01")).toBe(0);
    const auto = (liveRecords() as { occurrence_date: string; amount_centavos: number; source: string }[]).filter((record) => record.source === "auto");
    // September 1 predates auto-post; October's partial payment leaves only the remainder to post.
    expect(auto.map(({ occurrence_date, amount_centavos }) => [occurrence_date, amount_centavos])).toEqual([["2026-10-01", 1_000_000], ["2026-11-01", 1_200_000]]);
    expect(balance()).toBe(5_000_000 - 1_200_000 * 2);
  });

  it("does not re-post an auto-posted occurrence the user deleted", async () => {
    const { createScheduledPayment, postDueScheduledPayments, deleteScheduledPaymentRecord } = await repos();
    await createScheduledPayment("user-1", "device-1", { ...rent, autoPost: true }, "2026-10-01");
    await postDueScheduledPayments("user-1", "device-1", "2026-10-01");
    const [record] = liveRecords() as { transaction_id: string }[];
    await deleteScheduledPaymentRecord("user-1", "device-1", record!.transaction_id);

    expect(await postDueScheduledPayments("user-1", "device-1", "2026-10-02")).toBe(0);
  });

  it("uses the ids the server's auto-post job derives", async () => {
    const { createScheduledPayment, postDueScheduledPayments, scheduledPaymentPostIds } = await repos();
    const payment = await createScheduledPayment("user-1", "device-1", { ...rent, autoPost: true }, "2026-10-01");
    await postDueScheduledPayments("user-1", "device-1", "2026-10-01");

    const ids = scheduledPaymentPostIds(payment.id, "2026-10-01");
    expect(liveRecords()).toEqual([expect.objectContaining({ id: ids.recordId, transaction_id: ids.transactionId })]);
  });

  it("does not post an occurrence whose server-posted transaction was pulled before its record", async () => {
    const { createScheduledPayment, postDueScheduledPayments, scheduledPaymentPostIds } = await repos();
    const payment = await createScheduledPayment("user-1", "device-1", { ...rent, autoPost: true }, "2026-10-01");
    harness.sqlite.prepare(`INSERT INTO transactions (id, user_id, transaction_type, transaction_date, amount_centavos, source_account_id, subcategory_id, created_at, updated_at)
      VALUES (?, 'user-1', 'expense', '2026-10-01', 1200000, 'acct-cash', 'sub-rent', 'now', 'now')`).run(scheduledPaymentPostIds(payment.id, "2026-10-01").transactionId);

    expect(await postDueScheduledPayments("user-1", "device-1", "2026-10-01")).toBe(0);
    expect(liveRecords()).toEqual([]);
  });
});

describe("marking an underpaid occurrence as paid", () => {
  async function underpaid() {
    const { createScheduledPayment, recordScheduledPayment } = await repos();
    const payment = await createScheduledPayment("user-1", "device-1", rent);
    await recordScheduledPayment("user-1", "device-1", { scheduledPaymentId: payment.id, occurrenceDate: "2026-10-01", amountCentavos: 1_100_000, paymentDate: "2026-09-30", sourceAccountId: "acct-cash", notes: null });
    return payment;
  }

  it("settles the occurrence, syncs only the flag, and stops it showing as overdue", async () => {
    const { listScheduledPaymentSummaries } = await repos();
    const { settleScheduledPaymentOccurrence, listScheduledPaymentRecords } = await import("../scheduledPaymentRecords");
    const payment = await underpaid();
    expect((await listScheduledPaymentSummaries("user-1", "active", "2026-10-05"))[0]!.current).toMatchObject({ dueDate: "2026-10-01", status: "overdue" });

    await settleScheduledPaymentOccurrence("user-1", "device-1", payment.id, "2026-10-01");

    const [record] = await listScheduledPaymentRecords("user-1", payment.id);
    expect(record).toMatchObject({ amountCentavos: 1_100_000, settlesOccurrence: true, version: 2 });
    expect(harness.queued("scheduled_payment_records").at(-1)).toMatchObject({ record_id: record!.id, operation_type: "update", changed_fields: ["settles_occurrence"], payload: { settles_occurrence: true } });
    expect((await listScheduledPaymentSummaries("user-1", "active", "2026-10-05"))[0]!.current).toMatchObject({ dueDate: "2026-11-01", status: "upcoming" });
    expect(balance()).toBe(3_900_000);
  });

  it("does not auto-post the remainder of a settled occurrence", async () => {
    const { setScheduledPaymentAutoPost, postDueScheduledPayments } = await repos();
    const { settleScheduledPaymentOccurrence } = await import("../scheduledPaymentRecords");
    const payment = await underpaid();
    await setScheduledPaymentAutoPost("user-1", "device-1", payment.id, true, "2026-09-30");
    await settleScheduledPaymentOccurrence("user-1", "device-1", payment.id, "2026-10-01");

    expect(await postDueScheduledPayments("user-1", "device-1", "2026-10-01")).toBe(0);
  });

  it("refuses an occurrence with no payment", async () => {
    const { createScheduledPayment } = await repos();
    const { settleScheduledPaymentOccurrence } = await import("../scheduledPaymentRecords");
    const payment = await createScheduledPayment("user-1", "device-1", rent);

    await expect(settleScheduledPaymentOccurrence("user-1", "device-1", payment.id, "2026-10-01")).rejects.toThrow("Record a payment for this occurrence before marking it as paid.");
  });
});
