import { buildDebtSurplusCandidates, planDebtSurplus, type DebtSurplusCandidate } from "../debtSurplusPlan";
import type { DebtAccount } from "../../../../local-db/repositories/debts/debtAccounts";

const loan = (overrides: Partial<DebtSurplusCandidate> = {}): DebtSurplusCandidate => ({
  id: "loan", label: "Loan", kind: "loan", type: "personal_loan", status: "active", allowsExtraPayments: true,
  annualInterestRateBps: 1_200, startBalanceCentavos: 1_000_000, reservedCentavos: 200_000, paidThisPeriodCentavos: 0, ...overrides,
});
const statement = (overrides: Partial<DebtSurplusCandidate> = {}): DebtSurplusCandidate => ({
  id: "card:card-1", label: "Visa statement", kind: "credit_card_statement", status: "active", allowsExtraPayments: true,
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

    expect(plan.recommendations.map((row) => row.id)).toEqual(["card:card-1", "high", "low"]);
  });

  it("orders Snowball by the smallest balance left after required payments", () => {
    const plan = planDebtSurplus({ candidates: [loan({ id: "big" }), loan({ id: "small", startBalanceCentavos: 300_000 }), statement({ startBalanceCentavos: 700_000 })], surplusCentavos: 3_000_000, strategy: "snowball" });

    expect(plan.recommendations.map((row) => row.id)).toEqual(["small", "card:card-1", "big"]);
  });

  it("applies the user's priorities first and leaves out debts that cannot take extra payments", () => {
    const plan = planDebtSurplus({
      candidates: [statement(), loan({ id: "first" }), loan({ id: "salary", type: "salary_loan" }), loan({ id: "fixed", allowsExtraPayments: false }), loan({ id: "archived", status: "archived" })],
      surplusCentavos: 3_000_000, strategy: "avalanche",
      priorities: [{ debtAccountId: "first", priorityRank: 1 }, { debtAccountId: "first", priorityRank: 2 }, { debtAccountId: "salary", priorityRank: 3 }],
    });

    expect(plan.recommendations.map((row) => row.id)).toEqual(["first", "card:card-1"]);
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

    expect(candidate).toMatchObject({ id: "card:card-1", label: "Visa statement", kind: "credit_card_statement", startBalanceCentavos: 400_000, reservedCentavos: 150_000, paidThisPeriodCentavos: 200_000 });
  });

  describe("a statement issued after the plan month began", () => {
    const base = {
      debts: [], debtPayments: [], period, today: "2026-10-28",
      cards: [{ id: "card-1", name: "Visa" }] as never,
      cycles: [{ id: "cycle-1", account_id: "card-1" }, { id: "cycle-2", account_id: "card-1" }] as never,
      statements: [
        { id: "sept", cycle_id: "cycle-1", statement_date: "2026-09-25", statement_balance_centavos: 500_000, authoritative: true, deleted: false },
        { id: "oct", cycle_id: "cycle-2", statement_date: "2026-10-25", statement_balance_centavos: 900_000, authoritative: true, deleted: false },
      ] as never,
    };

    it("keeps the card's surplus on the statement the plan reserved for and counts every payment to the card", () => {
      const [candidate] = buildDebtSurplusCandidates({ ...base,
        cardPayments: [{ statement_id: "sept", cycle_id: "cycle-1", payment_date: "2026-10-10", amount_centavos: 200_000 }, { statement_id: "oct", cycle_id: "cycle-2", payment_date: "2026-10-27", amount_centavos: 150_000 }] as never,
        reservations: [{ creditCardStatementId: "sept", amountCentavos: 200_000 }],
      });

      expect(candidate).toMatchObject({ id: "card:card-1", startBalanceCentavos: 500_000, reservedCentavos: 200_000, paidThisPeriodCentavos: 350_000 });
      expect(planDebtSurplus({ candidates: [candidate!], surplusCentavos: 300_000, strategy: "avalanche" }).recommendations[0]).toMatchObject({ plannedCentavos: 300_000, paidCentavos: 150_000, remainingCentavos: 150_000 });
    });

    it("uses the statement issued before the month began when the plan reserved nothing for the card", () => {
      const [candidate] = buildDebtSurplusCandidates({ ...base, cardPayments: [], reservations: [] });

      expect(candidate).toMatchObject({ startBalanceCentavos: 500_000, reservedCentavos: 0 });
    });
  });
});

