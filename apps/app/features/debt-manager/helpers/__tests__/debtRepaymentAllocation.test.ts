import { allocateDebtRepayments } from "../debtRepaymentAllocation";

const debts = [
  { id: "small", status: "active" as const, currentBalanceCentavos: 5_000, minimumPaymentCentavos: 1_000, annualInterestRateBps: 500, allowsExtraPayments: true },
  { id: "high-rate", status: "active" as const, currentBalanceCentavos: 20_000, minimumPaymentCentavos: 1_000, annualInterestRateBps: 2_000, allowsExtraPayments: true },
];

describe("allocateDebtRepayments", () => {
  it("uses the selected Snowball strategy after required payments", () => {
    const result = allocateDebtRepayments({ debts, debtBudgetCentavos: 7_000, strategy: "snowball" });
    expect(result.requiredPaymentCentavos).toBe(2_000);
    expect(result.allocations).toEqual(new Map([["small", 5_000], ["high-rate", 2_000]]));
  });

  it("uses the selected Avalanche strategy after required payments", () => {
    const result = allocateDebtRepayments({ debts, debtBudgetCentavos: 7_000, strategy: "avalanche" });
    expect(result.allocations).toEqual(new Map([["small", 1_000], ["high-rate", 6_000]]));
  });

  it("uses explicit priority before the selected strategy", () => {
    const result = allocateDebtRepayments({ debts, debtBudgetCentavos: 7_000, strategy: "snowball", priorities: [{ debtAccountId: "high-rate", priorityRank: 1 }] });
    expect(result.allocations).toEqual(new Map([["small", 1_000], ["high-rate", 6_000]]));
  });

  it("keeps salary-loan required payments but excludes them from surplus allocation", () => {
    const result = allocateDebtRepayments({ debts: [
      { id: "salary", type: "salary_loan", status: "active", currentBalanceCentavos: 5_000, minimumPaymentCentavos: 1_000, annualInterestRateBps: 9_999, allowsExtraPayments: true },
      { id: "loan", type: "personal_loan", status: "active", currentBalanceCentavos: 5_000, minimumPaymentCentavos: 1_000, annualInterestRateBps: 100, allowsExtraPayments: true },
    ], debtBudgetCentavos: 7_000, strategy: "avalanche" });

    expect(result.allocations).toEqual(new Map([["salary", 1_000], ["loan", 5_000]]));
  });

  it("does not direct surplus to debts that do not allow extra payments", () => {
    const result = allocateDebtRepayments({ debts: debts.map((debt) => debt.id === "small" ? { ...debt, allowsExtraPayments: false } : debt), debtBudgetCentavos: 7_000, strategy: "snowball" });

    expect(result.allocations).toEqual(new Map([["small", 1_000], ["high-rate", 6_000]]));
  });
});
