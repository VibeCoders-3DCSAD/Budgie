import type { SupabaseClient } from "@supabase/supabase-js";

jest.mock("../../../services/forecast/forecastService.js", () => ({
  ...jest.requireActual("../../../services/forecast/forecastService.js"),
  getMlForecast: jest.fn(),
}));
jest.mock("../../../lib/supabase.js", () => ({ getServiceRoleClient: jest.fn() }));

import { ForecastUpstreamError, getMlForecast } from "../../../services/forecast/forecastService.js";
import { getFinancialPlanForecast } from "../../../services/financialPlan/planForecast.js";

describe("Financial Plan forecast", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-18T00:00:00Z"));
    (getMlForecast as jest.Mock).mockReset().mockResolvedValue({
      snapshot: { month: "2026-10", categoryForecasts: [{ category: "communication", amountCentavos: 168_000 }], modelVersion: "test", generatedAt: "2026-10-18T00:00:00Z", quality: "SUCCESS" },
      forecasts: [],
    });
  });

  afterEach(() => jest.useRealTimers());

  function client(rows: Record<string, unknown[]>) {
    return { from: (table: string) => {
      let data = rows[table] ?? [];
      const query: unknown = new Proxy({}, { get: (_, key) => {
        if (key === "range") return (from: number, to: number) => { data = data.slice(from, to + 1); return query; };
        if (key === "then") { const result = Promise.resolve({ data, error: null }); return result.then.bind(result); }
        return () => query;
      } });
      return query;
    } } as SupabaseClient;
  }

  const rows = {
    subcategories: [{ id: "internet", category_id: "communication" }],
    categories: [{ id: "communication", slug: "communication" }],
    transactions: [
      { id: "payment", amount_centavos: 150_000, transaction_date: "2026-09-10", transaction_type: "expense", category_id: "communication", subcategory_id: "internet", anomaly_evaluations: [] },
      { id: "transfer", amount_centavos: 20_000, transaction_date: "2026-09-11", transaction_type: "transfer", category_id: null, subcategory_id: null, anomaly_evaluations: [] },
      { id: "biller", amount_centavos: 99_000, transaction_date: "2026-09-12", transaction_type: "expense", category_id: "communication", subcategory_id: "internet", anomaly_evaluations: [] },
    ],
    scheduled_payment_records: [{ transaction_id: "biller" }],
  };

  it("forecasts the plan month from the same history as the plan, without scheduled payments or transfers", async () => {
    await expect(getFinancialPlanForecast("user", client(rows))).resolves.toEqual({ month: "2026-10", categoryForecasts: [{ category: "communication", amountCentavos: 168_000 }] });
    expect(getMlForecast).toHaveBeenCalledWith("user", { targetMonth: "2026-10", historicalTransactions: [expect.objectContaining({ transactionId: "payment", category: "communication", amount: 1_500 })] });
  });

  it("returns no forecast when there is no history or the forecast is unavailable", async () => {
    await expect(getFinancialPlanForecast("user", client({ ...rows, transactions: [] }))).resolves.toBeNull();
    (getMlForecast as jest.Mock).mockRejectedValue(new ForecastUpstreamError(503, "down", "configuration"));
    await expect(getFinancialPlanForecast("user", client(rows))).resolves.toBeNull();
  });
});
