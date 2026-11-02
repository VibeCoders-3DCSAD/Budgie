import { applyFinancialPlanPriorityWeights, currentCalendarMonth, excludeUnusualTransactions, financialPlanPriorityGroup, forecastCoversPlanPeriod, isFinancialPlanInfeasible, manilaToday, scheduledReservationDates } from "../../../services/financialPlan/recommendationService.js";

describe("Financial Plan feasibility", () => {
  it("marks a 5,000-peso plan infeasible when required minimums exceed it", () => {
    expect(isFinancialPlanInfeasible(500_000, 750_000)).toBe(true);
  });

  it("keeps a plan feasible when available money exactly covers minimums", () => {
    expect(isFinancialPlanInfeasible(500_000, 500_000)).toBe(false);
  });
});

describe("Financial Plan allocation priority", () => {
  it("classifies only the configured HFCE essentials as essential", () => {
    expect(financialPlanPriorityGroup("food")).toBe("ESSENTIAL");
    expect(financialPlanPriorityGroup("recreation_culture")).toBe("NON_ESSENTIAL");
    expect(financialPlanPriorityGroup(undefined)).toBe("NON_ESSENTIAL");
  });

  it("uses clean spending shares and ignores categories whose spend was removed as unusual", () => {
    const weighted = applyFinancialPlanPriorityWeights([
      { id: "food", target: "category", priorityGroup: "ESSENTIAL", priorityWeight: 1, rule: "FLEXIBLE", floorCentavos: 0, ceilingCentavos: 1_000_000, forecastCentavos: 800_000 },
      { id: "housing", target: "category", priorityGroup: "ESSENTIAL", priorityWeight: 1, rule: "FLEXIBLE", floorCentavos: 0, ceilingCentavos: 1_000_000, forecastCentavos: 600_000 },
    ], new Map([["food", 800_000], ["housing", 0]]));

    expect(weighted.map((category) => category.priorityWeight)).toEqual([1, 0]);
  });

  it("excludes an unusual transaction before deriving category baselines", () => {
    const cleanTransactions = excludeUnusualTransactions([
      { id: "normal-food", amountCentavos: 8_000 },
      { id: "unusual-food", amountCentavos: 100_000 },
    ], new Set(["unusual-food"]));

    expect(cleanTransactions).toEqual([{ id: "normal-food", amountCentavos: 8_000 }]);
  });
});

describe("Financial Plan commitment reservations", () => {
  it("rolls a stale monthly schedule forward into the plan month", () => {
    expect(scheduledReservationDates("2026-09-15", "monthly", { start: "2026-11-01", end: "2026-11-30" })).toEqual(["2026-11-15"]);
  });

  it("keeps the selected monthly date after February", () => {
    expect(scheduledReservationDates("2027-01-31", "monthly", { start: "2027-02-01", end: "2027-03-31" }, { dayOfMonth: 31 })).toEqual(["2027-02-28", "2027-03-31"]);
  });

  it("keeps the selected quarterly date after a 30-day month", () => {
    expect(scheduledReservationDates("2027-01-31", "quarterly", { start: "2027-04-01", end: "2027-07-31" }, { dayOfMonth: 31 })).toEqual(["2027-04-30", "2027-07-31"]);
  });

  it("includes every weekly contribution due in the plan month", () => {
    expect(scheduledReservationDates("2026-10-28", "weekly", { start: "2026-11-01", end: "2026-11-30" })).toEqual(["2026-11-04", "2026-11-11", "2026-11-18", "2026-11-25"]);
  });

  it.each([
    { frequency: "weekly", next: "2026-10-23", schedule: {}, dates: ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"] },
    { frequency: "monthly", next: "2026-11-20", schedule: {}, dates: ["2026-10-20"] },
    { frequency: "semi_monthly", next: "2026-10-30", schedule: { semiMonthlyDays: [15, 30] as [number, number] }, dates: ["2026-10-15", "2026-10-30"] },
    { frequency: "custom", next: "2026-10-25", schedule: { customIntervalDays: 10 }, dates: ["2026-10-05", "2026-10-15", "2026-10-25"] },
  ])("includes $frequency occurrences earlier in the month than the next date", ({ frequency, next, schedule, dates }) => {
    expect(scheduledReservationDates(next, frequency, { start: "2026-10-01", end: "2026-10-31" }, schedule)).toEqual(dates);
  });
});

describe("Financial Plan period", () => {
  it("covers the whole Manila calendar month containing now, including mid-month", () => {
    expect(currentCalendarMonth(new Date("2026-10-15T03:00:00.000Z"))).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(currentCalendarMonth(new Date("2026-10-31T16:30:00.000Z"))).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(currentCalendarMonth(new Date("2028-02-10T00:00:00.000Z"))).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });

  it("uses an ML forecast only when it targets the plan month", () => {
    const forecast = (month: string) => ({ snapshot: { month } }) as Parameters<typeof forecastCoversPlanPeriod>[0];
    expect(forecastCoversPlanPeriod(forecast("2026-10"), { start: "2026-10-01" })).toBe(true);
    expect(forecastCoversPlanPeriod(forecast("2026-11"), { start: "2026-10-01" })).toBe(false);
  });
});

describe("Financial Plan commitment payments", () => {
  it("uses the Manila date for today", () => {
    expect(manilaToday(new Date("2026-10-14T16:30:00.000Z"))).toBe("2026-10-15");
  });
});
