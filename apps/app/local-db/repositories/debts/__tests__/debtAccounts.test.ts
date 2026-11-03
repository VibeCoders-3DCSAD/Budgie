import { jest } from "@jest/globals";
import { deriveDebtProgress } from "../debtAccounts";
import { getDebtRepaymentForecast } from "../../../../features/debt-manager/forecast/helpers/debtForecast";

const debt = {
  currentBalanceCentavos: 1_000_00,
  minimumPaymentCentavos: 10_000,
  nextDueDate: "2026-10-01",
  paymentFrequency: "monthly" as const,
  targetPayoffDate: "2027-07-01",
  status: "active" as const,
};

describe("getDebtRepaymentForecast", () => {
  it("marks a payment above the target requirement as advanced", () => {
    expect(getDebtRepaymentForecast({ ...debt, minimumPaymentCentavos: 12_000 })).toEqual({
      status: "advanced",
      estimatedPayoffDate: "2027-06-01",
    });
  });

  it("marks the payment needed by the target date as on track", () => {
    expect(getDebtRepaymentForecast(debt)).toEqual({
      status: "on_track",
      estimatedPayoffDate: "2027-07-01",
    });
  });

  it("marks an insufficient payment as underpaid", () => {
    expect(getDebtRepaymentForecast({ ...debt, minimumPaymentCentavos: 9_000 })).toEqual({
      status: "underpaid",
      estimatedPayoffDate: "2027-09-01",
    });
  });

  it("does not forecast a debt without a payoff target", () => {
    expect(getDebtRepaymentForecast({ ...debt, targetPayoffDate: null })).toEqual({
      status: "not_in_schedule",
      estimatedPayoffDate: null,
    });
  });
});

describe("deriveDebtProgress", () => {
  afterEach(() => jest.useRealTimers());

  it("marks a debt behind once its due day has ended in Manila", () => {
    // 16:30 UTC on Oct 1 is already Oct 2 in Manila.
    jest.useFakeTimers().setSystemTime(new Date("2026-10-01T16:30:00.000Z"));
    expect(deriveDebtProgress(debt)).toBe("behind");
    jest.setSystemTime(new Date("2026-10-01T15:30:00.000Z"));
    expect(deriveDebtProgress(debt)).toBe("on_schedule");
  });
});
