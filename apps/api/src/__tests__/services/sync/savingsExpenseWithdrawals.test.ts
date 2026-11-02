import { validateSavingsExpenseWithdrawalPayload } from "../../../services/sync/savingsExpenseWithdrawals.js";
const entry = { savings_goal_id: "7f000000-0000-4000-8000-000000000001", id: "7f000000-0000-4000-8000-000000000002", amount_centavos: 100 };
describe("expense savings withdrawal boundary", () => {
  it("accepts an omitted split, an empty split, and integer withdrawals", () => {
    for (const value of [undefined, [], [entry]]) expect(() => validateSavingsExpenseWithdrawalPayload(value)).not.toThrow();
  });
  it.each([null, {}, [null], [{ ...entry, amount_centavos: 0 }], [{ ...entry, amount_centavos: 1.5 }], [{ ...entry, amount_centavos: "100" }], [{ ...entry, amount_centavos: Number.MAX_SAFE_INTEGER + 1 }], [{ ...entry, savings_goal_id: "bad" }], [{ ...entry, extra: "bad" }], [entry, entry], Array.from({ length: 101 }, () => entry)].map((value) => [value]))("rejects invalid split %#", (value) => {
    expect(() => validateSavingsExpenseWithdrawalPayload(value)).toThrow();
  });
});
