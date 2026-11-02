import { createHmac } from "node:crypto";
import { jest } from "@jest/globals";
import { ForecastUnavailableError, ForecastUpstreamError, ForecastValidationError, forecastMonths, getMlForecast, getMlQuarterlyForecast, mapMlForecast, parseForecastRequest } from "../../../services/forecast/forecastService";

const transaction = {
  transactionId: "b9df3d82-b64a-4b25-b8aa-dd36f70a42be",
  date: "2026-06-04",
  amount: 245.5,
  category: "food",
  transactionType: "expense",
};

const currentQuarterTransaction = {
  ...transaction,
  transactionId: "a9df3d82-b64a-4b25-b8aa-dd36f70a42be",
  date: "2026-09-04",
};

const currentOnlyCategoryTransaction = {
  ...currentQuarterTransaction,
  transactionId: "c9df3d82-b64a-4b25-b8aa-dd36f70a42be",
  category: "health",
};

const mlResponse = {
  response_id: "response-1",
  request_id: "user-1",
  user_id: "user-1",
  forecasts: [{ category: "food", month: "2026-10", quarter: "2026Q4", amount: 8500.25, user_baseline_amount: 7000, hfce_multiplier: 1.214321, hfce_forecast_amount_million_php: 12345.67, explanation: "Personalized food forecast.", baseline_method: "same_period_last_year", seasonal_uncertainty: false }],
  snapshot: { month: "2026-10", total_amount: 8500.25, category_forecasts: [{ category: "food", amount: 8500.25 }], model_version: "hfce-sarima-v4-category-quarterly", generated_at: "2026-09-29T00:00:00Z", quality: "PERSONALIZED" },
  model_version: "hfce-sarima-v4-category-quarterly",
  status: "SUCCESS",
  metadata: { processing_time_ms: 4.2, model_version: "hfce-sarima-v4-category-quarterly", strategy_used: "user_quarterly_baseline_times_hfce_category_multiplier" },
};

describe("forecast ML adapter", () => {
  afterEach(() => { delete process.env.FORECASTING_ML_BASE_URL; delete process.env.ODIN_TRUSTED_HISTORY_SHARED_SECRET; jest.useRealTimers(); });

  it("preserves fractional-centavo forecast amounts for recommendations", () => {
    const amount = 8500.123456789;
    const result = mapMlForecast({ ...mlResponse,
      forecasts: mlResponse.forecasts.map((point) => ({ ...point, amount })),
      snapshot: { ...mlResponse.snapshot, total_amount: amount, category_forecasts: [{ category: "food", amount }] },
    });
    expect(result.forecasts[0]?.amountCentavos).toBe(amount * 100);
    expect(result.snapshot.totalAmountCentavos).toBe(amount * 100);
    expect(result.snapshot.categoryForecasts[0]?.amountCentavos).toBe(amount * 100);
  });

  it("accepts a two-decimal total that differs from the category sum by float error", () => {
    const result = mapMlForecast({ ...mlResponse,
      snapshot: { ...mlResponse.snapshot, total_amount: 0.3, category_forecasts: [{ category: "food", amount: 0.1 }, { category: "transport", amount: 0.2 }] },
    });
    expect(result.snapshot.totalAmountCentavos).toBeCloseTo(30);
    expect(() => mapMlForecast({ ...mlResponse,
      snapshot: { ...mlResponse.snapshot, total_amount: 0.32, category_forecasts: [{ category: "food", amount: 0.1 }, { category: "transport", amount: 0.2 }] },
    })).toThrow(ForecastUpstreamError);
  });

  it("validates transaction history without the retired horizon and level controls", () => {
    expect(parseForecastRequest({ historicalTransactions: [transaction] })).toEqual({ historicalTransactions: [transaction] });
    expect(() => parseForecastRequest({ historicalTransactions: [] })).toThrow(ForecastValidationError);
  });

  it("derives supported categories and maps the HFCE quarterly response", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-30T12:00:00.000Z"));
    process.env.FORECASTING_ML_BASE_URL = "http://ml.internal/";
    process.env.ODIN_TRUSTED_HISTORY_SHARED_SECRET = "test-secret";
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => mlResponse });
    const result = await getMlForecast("user-1", { historicalTransactions: [transaction, currentQuarterTransaction, currentOnlyCategoryTransaction] }, fetcher);
    expect(fetcher).toHaveBeenCalledWith("http://ml.internal/api/v1/forecast/predict", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-Odin-User-Id": "user-1", "X-Odin-History-Source": "odin_api" }) }));
    const requestBody = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(requestBody).toEqual(expect.objectContaining({ user_id: "user-1", categories: ["food"] }));
    expect(requestBody.historical_transactions).toEqual(expect.arrayContaining([expect.objectContaining({ transaction_id: transaction.transactionId, category: "food" })]));
    expect(fetcher.mock.calls[0]![1].headers["X-Odin-History-Signature"]).toBe(createHmac("sha256", "test-secret").update(`odin_api:user-1:${fetcher.mock.calls[0]![1].body}`).digest("hex"));
    expect(result).toEqual(expect.objectContaining({ status: "SUCCESS", forecasts: [{ category: "food", month: "2026-10", quarter: "2026Q4", amountCentavos: 850025, userBaselineCentavos: 700000, hfceMultiplier: 1.214321, hfceForecastAmountMillionPhp: 12345.67, explanation: "Personalized food forecast.", baselineMethod: "same_period_last_year", seasonalUncertainty: false }] }));
  });

  it("passes a yearly payment's recurrence to odin-ml and rejects any other recurrence", async () => {
    const tuition = { ...currentQuarterTransaction, recurrence: "yearly" as const };
    expect(parseForecastRequest({ historicalTransactions: [tuition] }).historicalTransactions[0]).toEqual(tuition);
    expect(() => parseForecastRequest({ historicalTransactions: [{ ...transaction, recurrence: "monthly" }] })).toThrow("recurrence is invalid");

    jest.useFakeTimers().setSystemTime(new Date("2026-10-18T12:00:00.000Z"));
    process.env.FORECASTING_ML_BASE_URL = "http://ml.internal";
    process.env.ODIN_TRUSTED_HISTORY_SHARED_SECRET = "test-secret";
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => mlResponse });
    await getMlForecast("user-1", { historicalTransactions: [tuition, transaction] }, fetcher);
    const [sentTuition, sentOther] = JSON.parse(fetcher.mock.calls[0]![1].body).historical_transactions;
    expect(sentTuition).toMatchObject({ recurrence: "yearly" });
    expect(sentOther).not.toHaveProperty("recurrence");
  });

  it("asks for the requested target month and omits it otherwise", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-18T12:00:00.000Z"));
    process.env.FORECASTING_ML_BASE_URL = "http://ml.internal";
    process.env.ODIN_TRUSTED_HISTORY_SHARED_SECRET = "test-secret";
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => mlResponse });
    await getMlForecast("user-1", { historicalTransactions: [currentQuarterTransaction], targetMonth: "2026-10" }, fetcher);
    await getMlForecast("user-1", { historicalTransactions: [currentQuarterTransaction] }, fetcher);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).target_month).toBe("2026-10");
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).not.toHaveProperty("target_month");
  });

  it("forecasts in January from last year's completed months", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2027-01-05T12:00:00.000Z"));
    process.env.FORECASTING_ML_BASE_URL = "http://ml.internal";
    process.env.ODIN_TRUSTED_HISTORY_SHARED_SECRET = "test-secret";
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => mlResponse });
    await getMlForecast("user-1", { historicalTransactions: [{ ...transaction, date: "2026-12-04" }] }, fetcher);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).categories).toEqual(["food"]);
  });

  it("skips categories last bought six or more months ago", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-07T12:00:00.000Z"));
    process.env.FORECASTING_ML_BASE_URL = "http://ml.internal";
    process.env.ODIN_TRUSTED_HISTORY_SHARED_SECRET = "test-secret";
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => mlResponse });
    const staleHealth = { ...currentOnlyCategoryTransaction, date: "2026-04-28" };
    const recentFood = { ...transaction, date: "2026-05-01" };
    await getMlForecast("user-1", { historicalTransactions: [staleHealth, recentFood] }, fetcher);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).categories).toEqual(["food"]);
    await expect(getMlForecast("user-1", { historicalTransactions: [staleHealth] }, fetcher)).rejects.toMatchObject({ reason: "NO_RECENT_SPENDING" });
  });

  it("keeps a yearly category once the history reaches back a full year", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-07T12:00:00.000Z"));
    process.env.FORECASTING_ML_BASE_URL = "http://ml.internal";
    process.env.ODIN_TRUSTED_HISTORY_SHARED_SECRET = "test-secret";
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => mlResponse });
    const christmasHealth = { ...currentOnlyCategoryTransaction, date: "2025-12-20" };
    const yearAgoFood = { ...transaction, date: "2025-10-03" };
    await getMlForecast("user-1", { historicalTransactions: [yearAgoFood, christmasHealth, { ...transaction, date: "2026-09-01" }] }, fetcher);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).categories).toEqual(["food", "health"]);
  });

  it("explains that a forecast needs a completed month when only current-month spend exists", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-07T12:00:00.000Z"));
    process.env.FORECASTING_ML_BASE_URL = "http://ml.internal";
    process.env.ODIN_TRUSTED_HISTORY_SHARED_SECRET = "test-secret";
    const fetcher = jest.fn();
    const error = await getMlForecast("user-1", { historicalTransactions: [{ ...transaction, date: "2026-10-02" }] }, fetcher).catch((caught) => caught);
    expect(error).toBeInstanceOf(ForecastUnavailableError);
    expect(error).toMatchObject({ reason: "NO_COMPLETED_MONTH", message: expect.stringContaining("first full month") });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects malformed upstream responses and upstream errors", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-30T12:00:00.000Z"));
    expect(() => mapMlForecast({ ...mlResponse, status: "FAILURE" })).toThrow(ForecastUpstreamError);
    process.env.FORECASTING_ML_BASE_URL = "http://ml.internal";
    process.env.ODIN_TRUSTED_HISTORY_SHARED_SECRET = "test-secret";
    await expect(getMlForecast("user-1", { historicalTransactions: [transaction, currentQuarterTransaction] }, jest.fn().mockResolvedValue({ ok: false, status: 422 }))).rejects.toMatchObject({ status: 422 });
    await expect(getMlForecast("user-1", { historicalTransactions: [transaction, currentQuarterTransaction] }, jest.fn().mockRejectedValue(new Error("offline")))).rejects.toMatchObject({ status: 503 });
  });

  it("targets the current month through the end of the third quarter after next month's", () => {
    expect(forecastMonths(new Date("2026-10-18T12:00:00.000Z"))).toEqual(["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09"]);
    expect(forecastMonths(new Date("2026-11-30T12:00:00.000Z"))).toHaveLength(11);
    // 12:30 AM on December 1 in Manila is still November 30 in UTC.
    expect(forecastMonths(new Date("2026-11-30T16:30:00.000Z"))[0]).toBe("2026-12");
    expect(forecastMonths(new Date("2026-12-05T12:00:00.000Z"))).toEqual(["2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09", "2027-10", "2027-11", "2027-12"]);
  });

  it("forecasts every month in one call and totals each quarter from its months", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-18T12:00:00.000Z"));
    process.env.FORECASTING_ML_BASE_URL = "http://ml.internal";
    process.env.ODIN_TRUSTED_HISTORY_SHARED_SECRET = "test-secret";
    const months = forecastMonths();
    // A full year of history: December carries last year's Christmas spending.
    const amountFor = (month: string) => month === "2026-12" ? 3_000 : 1_000;
    const point = mlResponse.forecasts[0]!;
    const response = { ...mlResponse,
      forecasts: months.map((month) => ({ ...point, month, quarter: `${month.slice(0, 4)}Q${Math.ceil(Number(month.slice(5)) / 3)}`, amount: amountFor(month) })),
      snapshot: { ...mlResponse.snapshot, month: "2026-11", total_amount: 1_000, category_forecasts: [{ category: "food", amount: 1_000 }] },
    };
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => response });
    const result = await getMlQuarterlyForecast("user-1", { historicalTransactions: [currentQuarterTransaction] }, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).target_months).toEqual(months);
    expect(result.months.slice(0, 4)).toEqual([
      { month: "2026-10", totalCentavos: 100_000, categories: [{ category: "food", amountCentavos: 100_000 }] },
      { month: "2026-11", totalCentavos: 100_000, categories: [{ category: "food", amountCentavos: 100_000 }] },
      { month: "2026-12", totalCentavos: 300_000, categories: [{ category: "food", amountCentavos: 300_000 }] },
      { month: "2027-01", totalCentavos: 100_000, categories: [{ category: "food", amountCentavos: 100_000 }] },
    ]);
    expect(result.quarters.map((quarter) => quarter.quarter)).toEqual(["2026Q4", "2027Q1", "2027Q2", "2027Q3"]);
    // October, November, and December make up all of Q4: 1,000 + 1,000 + 3,000.
    expect(result.quarters[0]).toEqual({ quarter: "2026Q4", totalCentavos: 500_000, categories: [{ category: "food", amountCentavos: 500_000 }] });
    expect(result.quarters[1]!.totalCentavos).toBe(300_000);
    expect(result).toMatchObject({ modelVersion: "hfce-sarima-v4-category-quarterly", baselineMethod: "same_period_last_year", seasonalUncertainty: false, quality: "PERSONALIZED" });
  });
  it("forecasts as of a past day from the spending before it, starting at that day's month", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-18T12:00:00.000Z"));
    process.env.FORECASTING_ML_BASE_URL = "http://ml.internal";
    process.env.ODIN_TRUSTED_HISTORY_SHARED_SECRET = "test-secret";
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => mlResponse });
    const request = parseForecastRequest({ historicalTransactions: [transaction, currentQuarterTransaction], asOf: "2026-09-01" });
    const result = await getMlQuarterlyForecast("user-1", request, fetcher);
    const body = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(body).toMatchObject({ as_of: "2026-09-01", target_months: forecastMonths(new Date("2026-09-01T00:00:00+08:00")), categories: ["food"] });
    expect(body.target_months[0]).toBe("2026-09");
    // September's own spending came after the forecast date.
    expect(body.historical_transactions.map((point: { date: string }) => point.date)).toEqual(["2026-06-04"]);
    expect(result.months[0]!.month).toBe("2026-09");
  });

  it("rejects an asOf day that is malformed or still ahead in Manila", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-18T12:00:00.000Z"));
    expect(() => parseForecastRequest({ historicalTransactions: [transaction], asOf: "2026-9-1" })).toThrow("asOf is invalid");
    expect(() => parseForecastRequest({ historicalTransactions: [transaction], asOf: "2026-10-19" })).toThrow("asOf cannot be in the future");
  });

  it("has no past forecast without spending before the asOf day", async () => {
    process.env.FORECASTING_ML_BASE_URL = "http://ml.internal";
    const fetcher = jest.fn();
    await expect(getMlQuarterlyForecast("user-1", { historicalTransactions: [currentQuarterTransaction], asOf: "2026-09-01" }, fetcher)).rejects.toMatchObject({ reason: "NO_COMPLETED_MONTH" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
