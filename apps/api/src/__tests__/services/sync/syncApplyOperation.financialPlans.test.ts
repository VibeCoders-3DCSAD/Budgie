import { jest } from "@jest/globals";
import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";

function currentMonthPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")!.value);
  const month = Number(parts.find((part) => part.type === "month")!.value);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
}

function financialPlanOperation() {
  const period = currentMonthPeriod();
  return {
    operation_id: "operation-1", entity: "financial_plans", record_id: "plan-1", operation_type: "create" as const,
    base_version: null, changed_fields: [],
    payload: {
      period_start: period.start, period_end: period.end, status: "accepted",
      input_snapshot: { forecast: { version: "v1" }, restrictions: { version: "v1" }, obligations: { items: [] }, debtRequirements: { items: [] }, savingsRequirements: { items: [] }, classification: { version: "v2" } },
      recommendation: { availableFundsCentavos: 0, allocations: [], debtReservations: [], savingsReservations: [] },
    },
  };
}

describe("Financial Plan sync payload", () => {
  it("accepts a complete, current-month immutable plan document", async () => {
    const operation = financialPlanOperation();
    await expect(prepareOperation({} as never, "user-1", operation)).resolves.toMatchObject({ payload: operation.payload });
  });

  it("preserves fractional-centavo allocations while checking their ownership", async () => {
    const operation = financialPlanOperation();
    const allocation = { subcategoryId: "subcategory-1", allocationRule: "FLEXIBLE", allocatedAmountCentavos: 100.6, floorAmountCentavos: 0, ceilingAmountCentavos: 302 };
    const payload = { ...operation.payload, recommendation: { ...operation.payload.recommendation, availableFundsCentavos: 302, allocations: [allocation] } };
    const query = {
      select: jest.fn(() => query), in: jest.fn(() => query), eq: jest.fn(() => query),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [{ id: "subcategory-1", category_id: null }], error: null }).then(resolve),
    };
    const client = { from: jest.fn(() => query) };
    await expect(prepareOperation(client as never, "user-1", { ...operation, payload })).resolves.toMatchObject({ payload });
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("rejects plans outside the current calendar month", async () => {
    const operation = financialPlanOperation();
    await expect(prepareOperation({} as never, "user-1", { ...operation, payload: { ...operation.payload, period_start: "2020-01-01", period_end: "2020-01-31" } })).rejects.toThrow("Financial Plans can only cover the current calendar month");
  });

  it("covers the whole Manila month when a plan is created mid-month", async () => {
    jest.useFakeTimers({ now: new Date("2026-10-15T03:00:00.000Z") });
    try {
      const operation = financialPlanOperation();
      expect(operation.payload).toMatchObject({ period_start: "2026-10-01", period_end: "2026-10-31" });
      await expect(prepareOperation({} as never, "user-1", operation)).resolves.toMatchObject({ payload: operation.payload });
      await expect(prepareOperation({} as never, "user-1", { ...operation, payload: { ...operation.payload, period_start: "2026-11-01", period_end: "2026-11-30" } })).rejects.toThrow("Financial Plans can only cover the current calendar month");
    } finally {
      jest.useRealTimers();
    }
  });

  it("accepts a plan for the month that just ended so offline plans still sync after month end", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-01T01:00:00.000Z") });
    try {
      const operation = financialPlanOperation();
      const octoberPlan = { ...operation, payload: { ...operation.payload, period_start: "2026-10-01", period_end: "2026-10-31" } };
      await expect(prepareOperation({} as never, "user-1", octoberPlan)).resolves.toMatchObject({ payload: octoberPlan.payload });
      await expect(prepareOperation({} as never, "user-1", { ...operation, payload: { ...operation.payload, period_start: "2026-09-01", period_end: "2026-09-30" } })).rejects.toThrow("Financial Plans can only cover the current calendar month");
      await expect(prepareOperation({} as never, "user-1", { ...operation, payload: { ...operation.payload, period_start: "2026-10-01", period_end: "2026-10-30" } })).rejects.toThrow("Financial Plans can only cover the current calendar month");
    } finally {
      jest.useRealTimers();
    }
  });

  it("rejects an incomplete immutable input snapshot", async () => {
    const operation = financialPlanOperation();
    await expect(prepareOperation({} as never, "user-1", { ...operation, payload: { ...operation.payload, input_snapshot: {} } })).rejects.toThrow("input_snapshot.forecast must contain plan input data");
  });

  it("rejects updates because accepted plans are immutable", async () => {
    const operation = financialPlanOperation();
    await expect(prepareOperation({} as never, "user-1", { ...operation, operation_type: "update", base_version: 1, changed_fields: ["status"], payload: { status: "edited" } })).rejects.toThrow("accepted Financial Plans are immutable");
  });

  it("rejects allocations and surplus above available funds", async () => {
    const operation = financialPlanOperation();
    const payload = { ...operation.payload, recommendation: { ...operation.payload.recommendation, availableFundsCentavos: 100, allocations: [{ subcategoryId: "subcategory-1", allocationRule: "FLEXIBLE", allocatedAmountCentavos: 80, floorAmountCentavos: 0 }], debtSurplusCentavos: 21 } };
    await expect(prepareOperation({} as never, "user-1", { ...operation, payload })).rejects.toThrow("Financial Plan allocations and surplus exceed available funds");
  });

  it("rejects commitment edits that leave the old available funds unchanged", async () => {
    const operation = financialPlanOperation();
    const payload = { ...operation.payload, input_snapshot: { ...operation.payload.input_snapshot, plannedAmountCentavos: 100_000 }, recommendation: { ...operation.payload.recommendation, availableFundsCentavos: 90_000, debtReservations: [{ debtAccountId: "loan", amountCentavos: 30_000, dueDate: operation.payload.period_end }] } };
    await expect(prepareOperation({} as never, "user-1", { ...operation, payload })).rejects.toThrow("Financial Plan commitments exceed the planning amount");
  });

  it("rejects duplicate allocation targets before sync", async () => {
    const operation = financialPlanOperation();
    const allocation = { subcategoryId: "subcategory-1", allocationRule: "FLEXIBLE", allocatedAmountCentavos: 0, floorAmountCentavos: 0 };
    const payload = { ...operation.payload, recommendation: { ...operation.payload.recommendation, allocations: [allocation, allocation] } };

    await expect(prepareOperation({} as never, "user-1", { ...operation, payload })).rejects.toThrow("Financial Plan allocations cannot target the same category or subcategory twice");
  });

  it("rejects removed legacy budget sync operations", async () => {
    await expect(prepareOperation({} as never, "user-1", {
      operation_id: "operation-1", entity: "budgets", record_id: "budget-1", operation_type: "create", base_version: null, changed_fields: [], payload: {},
    })).rejects.toThrow("entity 'budgets' is not in the sync allowlist");
  });
});
