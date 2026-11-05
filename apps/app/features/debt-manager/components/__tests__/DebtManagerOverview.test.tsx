import React from "react";
import { fireEvent, render, waitFor, within } from "@testing-library/react-native";
import DebtManagerOverview from "../DebtManagerOverview";

const mockListFinancialAccounts = jest.fn();
const mockListDebtAccounts = jest.fn();
const mockListAllDebtPayments = jest.fn();
const mockListCreditCardCycles = jest.fn();
const mockListCreditCardCycleTransactions = jest.fn();
const mockListCreditCardStatements = jest.fn();
const mockListCreditCardPayments = jest.fn();
const mockListCreditCardInstallments = jest.fn();
const mockListCreditCardStrategies = jest.fn();
const mockGetAcceptedFinancialPlanForPeriod = jest.fn();
const mockGetDebtStrategy = jest.fn();
const mockListDebtPriorities = jest.fn();

jest.mock("../../../../local-db/repositories/foundations/financialFoundations", () => ({
  listFinancialAccounts: (...args: unknown[]) => mockListFinancialAccounts(...args),
}));
jest.mock("../../../../local-db/repositories/debts/debtAccounts", () => ({
  listDebtAccounts: (...args: unknown[]) => mockListDebtAccounts(...args),
}));
jest.mock("../../../../local-db/repositories/debts/debtPayments", () => ({
  listAllDebtPayments: (...args: unknown[]) => mockListAllDebtPayments(...args),
}));
jest.mock("../../../../local-db/repositories/credit-cards/creditCardCycles", () => ({
  listCreditCardCycles: (...args: unknown[]) => mockListCreditCardCycles(...args),
  listCreditCardCycleTransactions: (...args: unknown[]) => mockListCreditCardCycleTransactions(...args),
}));
jest.mock("../../../../local-db/repositories/credit-cards/creditCardStatements", () => ({
  listCreditCardStatements: (...args: unknown[]) => mockListCreditCardStatements(...args),
}));
jest.mock("../../../../local-db/repositories/credit-cards/creditCardPayments", () => ({
  listCreditCardPayments: (...args: unknown[]) => mockListCreditCardPayments(...args),
}));
jest.mock("../../../../local-db/repositories/credit-cards/creditCardInstallments", () => ({
  listCreditCardInstallments: (...args: unknown[]) => mockListCreditCardInstallments(...args),
}));
jest.mock("../../../../local-db/repositories/credit-cards/creditCardRepaymentPlans", () => ({
  listCreditCardStrategies: (...args: unknown[]) => mockListCreditCardStrategies(...args),
  statementPaymentTargetCentavos: () => null,
}));
jest.mock("../../../../local-db/repositories/financial-plans/financialPlans", () => ({
  getAcceptedFinancialPlanForPeriod: (...args: unknown[]) => mockGetAcceptedFinancialPlanForPeriod(...args),
  getCurrentFinancialPlanPeriod: () => ({ start: "2026-10-01", end: "2026-10-31" }),
}));
jest.mock("../../../../local-db/repositories/debts/debtRepaymentPlans", () => ({
  getDebtStrategy: (...args: unknown[]) => mockGetDebtStrategy(...args),
  listDebtPriorities: (...args: unknown[]) => mockListDebtPriorities(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockListFinancialAccounts.mockResolvedValue([{
    id: "card-1", name: "Visa", kind: "credit_card", status: "active", creditCardDetails: {
      creditLimitCentavos: 10_000, availableCreditCentavos: 9_000, billingCycleDays: null,
    },
  }]);
  mockListDebtAccounts.mockImplementation((_userId: string, visibility: string) => Promise.resolve(visibility === "active" ? [{
    id: "debt-1", name: "Loan", type: "personal_loan", status: "active", currentBalanceCentavos: 2_000,
    originalBalanceCentavos: 5_000, allowsExtraPayments: true, minimumPaymentCentavos: 500, paymentFrequency: "monthly", nextDueDate: "2026-10-01",
    targetPayoffDate: "2027-01-01", annualInterestRateBps: 0, interestMethod: "no_interest", interestPeriod: "none",
    typeSpecific: { startDate: "2026-09-01", feesCentavos: 0, penaltyInfo: null, termMonths: null },
  }] : []));
  mockListAllDebtPayments.mockResolvedValue([{ debt_account_id: "debt-1", payment_date: "2026-09-10", amount_centavos: 300 }]);
  mockListCreditCardPayments.mockResolvedValue([{ cycle_id: "cycle-1", payment_date: "2026-09-11", amount_centavos: 500 }]);
  mockListCreditCardCycles.mockResolvedValue([{ id: "cycle-1", account_id: "card-1" }]);
  mockListCreditCardCycleTransactions.mockResolvedValue([]);
  mockListCreditCardStatements.mockResolvedValue([]);
  mockListCreditCardInstallments.mockResolvedValue([]);
  mockListCreditCardStrategies.mockResolvedValue([]);
  mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
  mockGetDebtStrategy.mockResolvedValue("avalanche");
  mockListDebtPriorities.mockResolvedValue([]);
});

  it("shows debt paid, progress, and recorded payment trend alongside the total debt trend", async () => {
  const view = render(<DebtManagerOverview userId="user-1" onOpenCreditCards={jest.fn()} onOpenNonCreditDebts={jest.fn()} />);

  await waitFor(() => {
    expect(view.getByText("Debt paid")).toBeTruthy();
    expect(view.getByText("₱8.00")).toBeTruthy();
    expect(view.getByText("REMAINING DEBT")).toBeTruthy();
    expect(within(view.getByLabelText("Debt overview summary")).getByText("₱30.00")).toBeTruthy();
    expect(view.getByText("Recent payments")).toBeTruthy();
    expect(view.getAllByText("Loan").length).toBeGreaterThan(0);
    expect(view.getAllByText("Visa").length).toBeGreaterThan(0);
    expect(view.getByLabelText("2026-09-10, Loan, payment made ₱3.00")).toBeTruthy();
    expect(view.getByText("Total debt trend")).toBeTruthy();
    });
  });

  it("lists cards and loans on the overview and opens each one", async () => {
    const onOpenCard = jest.fn();
    const onOpenDebt = jest.fn();
    const view = render(<DebtManagerOverview userId="user-1" onOpenCreditCards={jest.fn()} onOpenNonCreditDebts={jest.fn()} onOpenCard={onOpenCard} onOpenDebt={onOpenDebt} />);

    await waitFor(() => expect(view.getByText("Credit cards")).toBeTruthy());
    expect(view.getByText("Loans and other debts")).toBeTruthy();
    fireEvent.press(view.getByLabelText(/^Open Visa, /));
    expect(onOpenCard).toHaveBeenCalledWith("card-1");
    fireEvent.press(view.getByLabelText(/^Open Loan, ₱20.00 remaining/));
    expect(onOpenDebt).toHaveBeenCalledWith("debt-1");
  });

  it("shows the selected strategy without a debt budget", async () => {
    const view = render(<DebtManagerOverview userId="user-1" onOpenCreditCards={jest.fn()} onOpenNonCreditDebts={jest.fn()} />);

    await waitFor(() => expect(view.getByText("Avalanche repayment plan")).toBeTruthy());
  });

  it("shows this month's unpaid payments without requiring a Financial Plan", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-21T04:00:00Z"));
    mockListAllDebtPayments.mockResolvedValue([{
      id: "payment-1", debt_account_id: "debt-1", transaction_id: "transaction-1",
      payment_date: "2026-10-10", amount_centavos: 200, principal_centavos: 200,
      interest_centavos: 0, notes: null, version: 1,
    }]);
    try {
      const view = render(<DebtManagerOverview userId="user-1" onOpenCreditCards={jest.fn()} onOpenNonCreditDebts={jest.fn()} />);
      await waitFor(() => expect(view.getByText("Upcoming Payments")).toBeTruthy());
      expect(view.getByLabelText("Loan, due 2026-10-01, ₱3.00 unpaid, overdue")).toBeTruthy();
      expect(view.getByText("₱3.00 remaining this month")).toBeTruthy();
      expect(mockListAllDebtPayments).toHaveBeenCalledWith("user-1");
    } finally {
      jest.useRealTimers();
    }
  });

  it("lists repayments reserved by the accepted Financial Plan", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({
      recommendation: {
        debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 1_000, dueDate: "2026-10-01" }],
      },
    });

    const view = render(<DebtManagerOverview userId="user-1" onOpenCreditCards={jest.fn()} onOpenNonCreditDebts={jest.fn()} />);

    await waitFor(() => {
      expect(view.getByText("Financial Plan repayments")).toBeTruthy();
      expect(view.getByLabelText("Loan, ₱10.00, due 2026-10-01, Not paid, paid ₱0.00 of ₱10.00")).toBeTruthy();
    });
  });

  it("applies this month's loan payments to the earliest plan repayments first", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-21T04:00:00Z"));
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({
      recommendation: { debtReservations: [
        { debtAccountId: "debt-1", amountCentavos: 500, dueDate: "2026-10-20" },
        { debtAccountId: "debt-1", amountCentavos: 500, dueDate: "2026-10-01" },
        { debtAccountId: "debt-1", amountCentavos: 500, dueDate: "2026-10-30" },
      ] },
    });
    const payment = {
      id: "payment-1", debt_account_id: "debt-1", transaction_id: "transaction-1",
      payment_date: "2026-10-10", amount_centavos: 700, principal_centavos: 700,
      interest_centavos: 0, notes: null, version: 1,
    };
    mockListAllDebtPayments.mockResolvedValue([
      payment,
      { ...payment, id: "older", payment_date: "2026-09-30" },
      { ...payment, id: "future", payment_date: "2026-10-22" },
      { ...payment, id: "other-debt", debt_account_id: "other-debt" },
    ]);
    try {
      const view = render(<DebtManagerOverview userId="user-1" onOpenCreditCards={jest.fn()} onOpenNonCreditDebts={jest.fn()} />);
      await waitFor(() => expect(view.getByText("Financial Plan repayments")).toBeTruthy());
      expect(view.getByLabelText("Loan, ₱5.00, due 2026-10-01, Paid, paid ₱5.00 of ₱5.00")).toBeTruthy();
      expect(view.getByLabelText("Loan, ₱5.00, due 2026-10-20, Partially paid, paid ₱2.00 of ₱5.00")).toBeTruthy();
      expect(view.getByLabelText("Loan, ₱5.00, due 2026-10-30, Not paid, paid ₱0.00 of ₱5.00")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("matches card payments to the reserved statement and its original amount due", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-21T04:00:00Z"));
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({
      inputSnapshot: { debtRequirements: { reservations: [{ creditCardStatementId: "statement-1", amountCentavos: 1_000, dueDate: "2026-10-01" }] } },
      recommendation: { debtReservations: [{ creditCardStatementId: "statement-1", amountCentavos: 500, dueDate: "2026-10-01" }] },
    });
    mockListCreditCardStatements.mockResolvedValue([{
      id: "statement-1", cycle_id: "cycle-1", statement_date: "2026-09-15", due_date: "2026-10-01",
      statement_balance_centavos: 1_000, minimum_due_centavos: 100, authoritative: true, deleted: false,
    }]);
    const payment = { cycle_id: "cycle-1", statement_id: "statement-1", payment_date: "2026-09-20", amount_centavos: 600, deleted: false };
    mockListCreditCardPayments.mockResolvedValue([
      payment,
      { ...payment, statement_id: "other-statement" },
      { ...payment, payment_date: "2026-10-22" },
      { ...payment, deleted: true },
    ]);
    try {
      const view = render(<DebtManagerOverview userId="user-1" onOpenCreditCards={jest.fn()} onOpenNonCreditDebts={jest.fn()} />);
      await waitFor(() => expect(view.getByText("Financial Plan repayments")).toBeTruthy());
      expect(view.getByLabelText("Visa statement, ₱5.00, due 2026-10-01, Partially paid, paid ₱6.00 of ₱10.00")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("uses Financial Plan surplus for an unpaid statement before rolling over to loans", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({
      recommendation: { debtReservations: [], debtSurplusCentavos: 3_000 },
    });
    mockListCreditCardStatements.mockResolvedValue([{
      id: "statement-1", cycle_id: "cycle-1", statement_date: "2020-01-01", due_date: "2020-02-01",
      statement_balance_centavos: 1_500, minimum_due_centavos: 100, authoritative: true, deleted: false,
    }]);
    mockListCreditCardPayments.mockResolvedValue([{ cycle_id: "cycle-1", statement_id: "statement-1", payment_date: "2020-01-02", amount_centavos: 500 }]);

    const view = render(<DebtManagerOverview userId="user-1" onOpenCreditCards={jest.fn()} onOpenNonCreditDebts={jest.fn()} />);

    await waitFor(() => {
      expect(view.getByText("Recommended surplus allocation")).toBeTruthy();
      expect(view.getByLabelText("Visa statement, ₱10.00")).toBeTruthy();
      expect(view.getByLabelText("Loan, ₱20.00")).toBeTruthy();
    });
  });

  it("shows this month's whole debt budget from the accepted Financial Plan", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ id: "plan-1", recommendation: {
      debtReservations: [{ debtAccountId: "loan-1", amountCentavos: 4_000 }, { creditCardStatementId: "statement-1", amountCentavos: 6_000 }],
      debtSurplusCentavos: 2_500,
      availableFundsCentavos: 50_000,
    } });

    const view = render(<DebtManagerOverview userId="user-1" onOpenCreditCards={jest.fn()} onOpenNonCreditDebts={jest.fn()} />);

    await waitFor(() => expect(view.getByText("Debt budget this month")).toBeTruthy());
    expect(view.getByText("₱125.00")).toBeTruthy();
    expect(view.getByText("₱60.00")).toBeTruthy();
    expect(view.getByText("₱40.00")).toBeTruthy();
    expect(view.queryByText("Budget remaining this month")).toBeNull();
  });

describe("DebtManagerOverview debt surplus", () => {
  it("sizes surplus after the plan's required payment and shows what no debt can take", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ recommendation: { debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 500 }], debtSurplusCentavos: 5_000 } });

    const view = render(<DebtManagerOverview userId="user-1" onOpenCreditCards={jest.fn()} onOpenNonCreditDebts={jest.fn()} />);

    await waitFor(() => expect(view.getByText("Recommended surplus allocation")).toBeTruthy());
    expect(view.getByLabelText("Loan, ₱15.00")).toBeTruthy();
    expect(view.getByLabelText("Not assigned to a debt, ₱35.00. We suggest adding it to your savings goals.")).toBeTruthy();
  });

  it("shows a plan shortfall without hiding the strategy surplus", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ recommendation: { debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 100 }], debtSurplusCentavos: 1_000 } });

    const view = render(<DebtManagerOverview userId="user-1" onOpenCreditCards={jest.fn()} onOpenNonCreditDebts={jest.fn()} />);

    await waitFor(() => expect(view.getByText("Plan shortfall")).toBeTruthy());
    expect(view.getByText("Strategy surplus")).toBeTruthy();
    expect(view.getByLabelText("Loan, ₱10.00")).toBeTruthy();
  });

  it("counts this month's payments above the required payment toward the surplus", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ recommendation: { debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 500 }], debtSurplusCentavos: 1_000 } });
    mockListAllDebtPayments.mockResolvedValue([{ debt_account_id: "debt-1", payment_date: "2026-10-05", amount_centavos: 1_000, principal_centavos: 1_000, interest_centavos: 0 }]);

    const view = render(<DebtManagerOverview userId="user-1" onOpenCreditCards={jest.fn()} onOpenNonCreditDebts={jest.fn()} />);

    await waitFor(() => expect(view.getByText("Surplus left to pay")).toBeTruthy());
    expect(view.getByLabelText("Loan, ₱10.00, Partially paid, paid ₱5.00 of ₱10.00")).toBeTruthy();
    expect(view.queryByText(/Not assigned to a debt/)).toBeNull();
  });
});

