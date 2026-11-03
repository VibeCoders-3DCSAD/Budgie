import { jest } from "@jest/globals";
import { createSqliteHarness } from "../../__tests__/sqliteHarness";
import { applyPullRow, normalizePullRow } from "../../../sync/pullConvergence";

const mockInitDatabase = jest.fn<() => Promise<unknown>>();
jest.mock("../../../client", () => ({ initDatabase: () => mockInitDatabase() }));

let harness: ReturnType<typeof createSqliteHarness>;
beforeEach(async () => {
  jest.resetModules();
  jest.useFakeTimers().setSystemTime(new Date("2026-10-15T03:00:00Z"));
  harness = createSqliteHarness();
  await harness.migrateAll();
  mockInitDatabase.mockResolvedValue(harness.db);
});
afterEach(() => { harness.sqlite.close(); jest.useRealTimers(); });

const obligations = { reservations: [{ scheduledPaymentId: "rent-1", subcategoryId: "rent", label: "Rent at acceptance", amountCentavos: 30_000, dueDate: "2026-10-20" }] };
const inputSnapshot = {
  plannedAmountCentavos: 100_000,
  forecast: { month: "2026-10", totalAmountCentavos: 0, modelVersion: "v1", generatedAt: "2026-10-15T03:00:00Z", quality: "FALLBACK", categoryForecasts: [] },
  restrictions: { allocations: [] }, obligations, debtRequirements: { reservations: [] }, savingsRequirements: { reservations: [] }, classification: { status: "unavailable" },
};
const recommendation = { availableFundsCentavos: 70_000, allocations: [], debtReservations: [], savingsReservations: [], debtSurplusCentavos: 0, savingsSurplusCentavos: 0 };

it("retains the accepted biller amounts and names after reopening offline, independently of live schedules", async () => {
  const { createFinancialPlan } = await import("../financialPlans");
  const { id } = await createFinancialPlan("user-1", "device-1", { periodStart: "2026-10-01", periodEnd: "2026-10-31", inputSnapshot, recommendation, allocations: [], debtReservations: [], savingsReservations: [] });
  jest.resetModules();
  const { getFinancialPlan } = await import("../financialPlans");
  const saved = await getFinancialPlan("user-1", id);
  expect(saved?.inputSnapshot).toEqual(inputSnapshot);
  expect(saved?.recommendation).toEqual(recommendation);
  expect(harness.queued("financial_plans")[0]?.payload.input_snapshot).toEqual(inputSnapshot);
  expect(await getFinancialPlan("user-2", id)).toBeNull();
});

it("persists the original debt amount separately from the user's budget across save and reopen", async () => {
  harness.sqlite.prepare("INSERT INTO debt_accounts (id, user_id, name, current_balance_centavos, created_at, updated_at) VALUES ('loan', 'user-1', 'Loan', 100000, '2026-10-01', '2026-10-01')").run();
  const due = { debtAccountId: "loan", amountCentavos: 10_000, dueDate: "2026-10-20" };
  const budget = { ...due, amountCentavos: 7_500 };
  const snapshot = { ...inputSnapshot, debtRequirements: { reservations: [due] } };
  const planned = { ...recommendation, availableFundsCentavos: 62_500, debtReservations: [budget] };
  const { createFinancialPlan } = await import("../financialPlans");
  const { id } = await createFinancialPlan("user-1", "device-1", { periodStart: "2026-10-01", periodEnd: "2026-10-31", inputSnapshot: snapshot, recommendation: planned, allocations: [], debtReservations: [budget], savingsReservations: [] });
  jest.resetModules();
  const { getFinancialPlan } = await import("../financialPlans");
  const saved = await getFinancialPlan("user-1", id);
  expect(saved?.inputSnapshot.debtRequirements).toEqual({ reservations: [due] });
  expect(saved?.recommendation.debtReservations).toEqual([budget]);
  expect(saved?.recommendation.availableFundsCentavos).toBe(62_500);
  await expect(createFinancialPlan("user-1", "device-1", { periodStart: "2026-10-01", periodEnd: "2026-10-31", inputSnapshot: snapshot, recommendation: { ...planned, availableFundsCentavos: 90_000 }, allocations: [], debtReservations: [budget], savingsReservations: [] })).rejects.toThrow("Financial Plan commitments exceed the planning amount");
});

it("restores a synced plan's full snapshot on another device, including category allocations", async () => {
  const syncedRecommendation = { ...recommendation, allocations: [{ categoryId: "housing", allocationRule: "FLEXIBLE", allocatedAmountCentavos: 40_000, floorAmountCentavos: 0 }], savingsReservations: [{ savingsGoalId: "emergency", amountCentavos: 1_000 }], debtReservations: [{ debtAccountId: "loan", amountCentavos: 2_000 }] };
  const remote = normalizePullRow("financial_plans", {
    id: "synced-plan", user_id: "user-1", period_start: "2026-10-01", period_end: "2026-10-31", status: "accepted", forecast_month: "2026-10", forecast_total_centavos: 0,
    forecast_model_version: "v1", forecast_generated_at: "2026-10-15T03:00:00Z", forecast_quality: "FALLBACK", available_funds_centavos: 70_000, debt_surplus_centavos: 0, savings_surplus_centavos: 0,
    // The server pulls with select("*"), so unset nullable columns arrive as null rather than missing.
    classification_status: null, classification_rule_set_version: null, classification_assessed_at: null, required_funds_centavos: null, shortfall_centavos: null,
    input_snapshot_json: inputSnapshot, recommendation_json: syncedRecommendation, version: 1, deleted: false, updated_at: "2026-10-15T03:00:00Z",
  }, "user-1");
  await applyPullRow(harness.db as never, "financial_plans", remote);
  const { getFinancialPlan } = await import("../financialPlans");
  const saved = await getFinancialPlan("user-1", "synced-plan");
  expect(saved?.inputSnapshot.obligations).toEqual(obligations);
  expect(saved?.recommendation).toEqual(syncedRecommendation);
  const { getPlanSpendingReview } = await import("../financialPlanSpendingReview");
  const { getPlanCommitmentReview } = await import("../financialPlanCommitmentReview");
  expect(await getPlanSpendingReview("user-1", "synced-plan")).toMatchObject({ plannedTotalCentavos: 40_000 });
  expect(await getPlanCommitmentReview("user-1", "synced-plan")).toMatchObject({ totals: { savingsReservedCentavos: 1_000, debtReservedCentavos: 2_000 } });
  // A stale snapshot cannot overwrite the accepted review baseline.
  await applyPullRow(harness.db as never, "financial_plans", { ...remote, recommendation_json: JSON.stringify({ ...syncedRecommendation, allocations: [] }) });
  expect(await getPlanSpendingReview("user-1", "synced-plan")).toMatchObject({ plannedTotalCentavos: 40_000 });
  await applyPullRow(harness.db as never, "financial_plans", { ...remote, version: 2, deleted: true, input_snapshot_json: null, recommendation_json: null });
  expect(await getFinancialPlan("user-1", "synced-plan")).toBeNull();
  expect(harness.sqlite.prepare("SELECT COUNT(*) AS count FROM financial_plan_allocations WHERE plan_id = 'synced-plan'").get()).toEqual({ count: 0 });
  expect(harness.sqlite.prepare("SELECT input_snapshot_json, recommendation_json FROM financial_plans WHERE id = 'synced-plan'").get()).toEqual({ input_snapshot_json: null, recommendation_json: null });
});

it("rolls back a pulled plan when its child snapshot cannot be restored", async () => {
  const { createFinancialPlan, getFinancialPlan } = await import("../financialPlans");
  const { id } = await createFinancialPlan("user-1", "device-1", { periodStart: "2026-10-01", periodEnd: "2026-10-31", inputSnapshot, recommendation, allocations: [], debtReservations: [], savingsReservations: [] });
  const row = harness.sqlite.prepare("SELECT * FROM financial_plans WHERE id = ?").get(id)!;
  // A reservation without a savings goal violates the normalized table's constraint.
  await expect(applyPullRow(harness.db as never, "financial_plans", { ...row, version: 2, recommendation_json: JSON.stringify({ ...recommendation, savingsReservations: [{ amountCentavos: 1_000 }] }) })).rejects.toThrow();
  expect((await getFinancialPlan("user-1", id))?.recommendation).toEqual(recommendation);
  expect(harness.sqlite.prepare("SELECT version FROM financial_plans WHERE id = ?").get(id)).toEqual({ version: 1 });
});

it("clears snapshotted commitments when resetting a plan", async () => {
  const { createFinancialPlan, deleteFinancialPlan, getFinancialPlan } = await import("../financialPlans");
  const { id } = await createFinancialPlan("user-1", "device-1", { periodStart: "2026-10-01", periodEnd: "2026-10-31", inputSnapshot, recommendation, allocations: [], debtReservations: [], savingsReservations: [] });
  await deleteFinancialPlan("user-1", "device-1", id);
  expect(await getFinancialPlan("user-1", id)).toBeNull();
  expect(harness.sqlite.prepare("SELECT input_snapshot_json, recommendation_json FROM financial_plans WHERE id = ?").get(id)).toEqual({ input_snapshot_json: null, recommendation_json: null });
});

it("keeps missing documents null for older server rows so legacy plan reads still work", () => {
  const row = normalizePullRow("financial_plans", { id: "legacy" }, "user-1");
  expect(row.input_snapshot_json).toBeNull();
  expect(row.recommendation_json).toBeNull();
});
