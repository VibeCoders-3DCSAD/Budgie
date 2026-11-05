import { buildDebtSurplusCandidates, planDebtSurplus, type DebtSurplusCandidate } from "../debtSurplusPlan";
import type { DebtAccount } from "../../../../local-db/repositories/debts/debtAccounts";

const loan = (overrides: Partial<DebtSurplusCandidate> = {}): DebtSurplusCandidate => ({
  id: "loan", label: "Loan", kind: "loan", type: "personal_loan", status: "active", allowsExtraPayments: true,
  annualInterestRateBps: 1_200, startBalanceCentavos: 1_000_000, reservedCentavos: 200_000, paidThisPeriodCentavos: 0, ...overrides,
});
const statement = (overrides: Partial<DebtSurplusCandidate> = {}): DebtSurplusCandidate => ({
  id: "statement:s1", label: "Visa statement", kind: "credit_card_statement", status: "active", allowsExtraPayments: true,
  annualInterestRateBps: 0, startBalanceCentavos: 800_000, reservedCentavos: 0, paidThisPeriodCentavos: 0, ...overrides,
});

describe("planDebtSurplus", () => {
  it("sizes surplus after each debt's required payment and reports what no debt can take", () => {
    const plan = planDebtSurplus({ candidates: [loan(), statement({ reservedCentavos: 800_000 })], surplusCentavos: 1_500_000, strategy: "avalanche" });

    expect(plan.recommendations).toEqual([{ id: "loan", label: "Loan", plannedCentavos: 800_000, paidCentavos: 0, remainingCentavos: 800_000 }]);
    expect(plan).toMatchObject({ surplusCentavos: 1_500_000, unassignedCentavos: 700_000, remainingSurplusCentavos: 800_000 });
  });

  it("counts payments above the required payment toward the planned surplus and keeps the plan stable", () => {
    const before = planDebtSurplus({ candidates: [loan()], surplusCentavos: 500_000, strategy: "avalanche" });
    const after = planDebtSurplus({ candidates: [loan({ paidThisPeriodCentavos: 500_000 })], surplusCentavos: 500_000, strategy: "avalanche" });
    const paidInFull = planDebtSurplus({ candidates: [loan({ paidThisPeriodCentavos: 900_000 })], surplusCentavos: 500_000, strategy: "avalanche" });

    expect(before.recommendations[0]).toMatchObject({ plannedCentavos: 500_000, remainingCentavos: 500_000 });
    expect(after.recommendations[0]).toMatchObject({ plannedCentavos: 500_000, paidCentavos: 300_000, remainingCentavos: 200_000 });
    expect(after.remainingSurplusCentavos).toBe(200_000);
    expect(paidInFull).toMatchObject({ remainingSurplusCentavos: 0, recommendations: [expect.objectContaining({ paidCentavos: 500_000, remainingCentavos: 0 })] });
  });

  it("puts card statements ahead of loans under Avalanche, then the highest rate", () => {
    const plan = planDebtSurplus({ candidates: [loan({ id: "high", annualInterestRateBps: 3_000 }), loan({ id: "low", annualInterestRateBps: 500 }), statement()], surplusCentavos: 3_000_000, strategy: "avalanche" });

    expect(plan.recommendations.map((row) => row.id)).toEqual(["statement:s1", "high", "low"]);
  });

  it("orders Snowball by the smallest balance left after required payments", () => {
    const plan = planDebtSurplus({ candidates: [loan({ id: "big" }), loan({ id: "small", startBalanceCentavos: 300_000 }), statement({ startBalanceCentavos: 700_000 })], surplusCentavos: 3_000_000, strategy: "snowball" });

    expect(plan.recommendations.map((row) => row.id)).toEqual(["small", "statement:s1", "big"]);
  });

  it("applies the user's priorities first and leaves out debts that cannot take extra payments", () => {
    const plan = planDebtSurplus({
      candidates: [statement(), loan({ id: "first" }), loan({ id: "salary", type: "salary_loan" }), loan({ id: "fixed", allowsExtraPayments: false }), loan({ id: "archived", status: "archived" })],
      surplusCentavos: 3_000_000, strategy: "avalanche",
      priorities: [{ debtAccountId: "first", priorityRank: 1 }, { debtAccountId: "first", priorityRank: 2 }, { debtAccountId: "salary", priorityRank: 3 }],
    });

    expect(plan.recommendations.map((row) => row.id)).toEqual(["first", "statement:s1"]);
  });

  it("treats non-finite and fractional amounts as safe whole centavos", () => {
    const plan = planDebtSurplus({ candidates: [loan({ startBalanceCentavos: 1_000.9, reservedCentavos: Number.NaN, paidThisPeriodCentavos: -5 })], surplusCentavos: 600.7, strategy: "avalanche" });

    expect(plan).toMatchObject({ surplusCentavos: 600, unassignedCentavos: 0, recommendations: [expect.objectContaining({ plannedCentavos: 600, paidCentavos: 0 })] });
    expect(planDebtSurplus({ candidates: [loan()], surplusCentavos: Number.POSITIVE_INFINITY, strategy: "avalanche" }).surplusCentavos).toBe(0);
  });
});

describe("buildDebtSurplusCandidates", () => {
  const period = { start: "2026-10-01", end: "2026-10-31" };
  const debt = { id: "loan-1", name: "Loan", type: "personal_loan", status: "active", currentBalanceCentavos: 400_000, annualInterestRateBps: 1_200, allowsExtraPayments: true } as DebtAccount;

  it("rebuilds the start-of-month balance from this month's principal and matches reservations", () => {
    const [candidate] = buildDebtSurplusCandidates({
      debts: [debt], cards: [], cycles: [], statements: [], cardPayments: [],
      debtPayments: [
        { id: "p1", debt_account_id: "loan-1", payment_date: "2026-09-30", amount_centavos: 100_000, principal_centavos: 90_000 },
        { id: "p2", debt_account_id: "loan-1", payment_date: "2026-10-05", amount_centavos: 250_000, principal_centavos: 200_000 },
        { id: "p3", debt_account_id: "loan-1", payment_date: "2026-10-20", amount_centavos: 50_000, principal_centavos: 50_000 },
      ] as never,
      reservations: [{ debtAccountId: "loan-1", amountCentavos: 150_000 }, { debtAccountId: "other", amountCentavos: 1 }],
      period, today: "2026-10-15",
    });

    expect(candidate).toMatchObject({ id: "loan-1", kind: "loan", startBalanceCentavos: 600_000, reservedCentavos: 150_000, paidThisPeriodCentavos: 250_000 });
  });

  it("uses each card's latest statement, less what was paid before the month", () => {
    const [candidate] = buildDebtSurplusCandidates({
      debts: [], debtPayments: [], period, today: "2026-10-15",
      cards: [{ id: "card-1", name: "Visa" }] as never,
      cycles: [{ id: "cycle-1", account_id: "card-1" }] as never,
      statements: [
        { id: "old", cycle_id: "cycle-1", statement_date: "2026-08-25", statement_balance_centavos: 9_999, authoritative: true, deleted: false },
        { id: "s1", cycle_id: "cycle-1", statement_date: "2026-09-25", statement_balance_centavos: 500_000, authoritative: true, deleted: false },
      ] as never,
      cardPayments: [
        { statement_id: "s1", payment_date: "2026-09-28", amount_centavos: 100_000 },
        { statement_id: "s1", payment_date: "2026-10-03", amount_centavos: 200_000 },
      ] as never,
      reservations: [{ creditCardStatementId: "s1", amountCentavos: 150_000 }],
    });

    expect(candidate).toMatchObject({ id: "statement:s1", label: "Visa statement", kind: "credit_card_statement", startBalanceCentavos: 400_000, reservedCentavos: 150_000, paidThisPeriodCentavos: 200_000 });
  });
});
