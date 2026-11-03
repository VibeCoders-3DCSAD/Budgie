import { act, renderHook } from "@testing-library/react-native";
import { useCommitmentDraft } from "../useCommitmentDraft";

const preview = {
  period: { start: "2026-10-01", end: "2026-10-31" },
  debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 10_000, dueDate: "2026-10-20" }],
  savingsReservations: [{ savingsGoalId: "goal-1", amountCentavos: 5_000, dueDate: "2026-10-25" }],
  obligations: [{ scheduledPaymentId: "bill-1", amountCentavos: 2_000, dueDate: "2026-10-22" }],
};
const noSkips = { debtRepayments: false, savingsContributions: false, scheduledPayments: false };

describe("useCommitmentDraft", () => {
  it("has no budgets before a preview is loaded", () => {
    const { result } = renderHook(() => useCommitmentDraft());
    expect(result.current.preview).toBeNull();
    expect(result.current.previewBudgets(noSkips)).toBeNull();
    expect(result.current.draftBudgets(noSkips)).toBeNull();
    expect(result.current.anyManual).toBe(false);
    expect(result.current.hasInvalidCommitments).toBe(false);
  });

  it("starts the draft at every amount due and keeps the preview when amounts are edited", () => {
    const { result } = renderHook(() => useCommitmentDraft());
    act(() => result.current.reset(preview));
    expect(result.current.draftBudgets(noSkips)).toEqual([{ key: "debt:debt-1:2026-10-20", amountCentavos: 10_000 }, { key: "savings:goal-1:2026-10-25", amountCentavos: 5_000 }, { key: "scheduled:bill-1:2026-10-22", amountCentavos: 2_000 }]);

    act(() => result.current.changeAmount("debtReservations", 0, "75.25"));
    act(() => result.current.changeAmount("obligations", 0, "abc"));
    expect(result.current.draftBudgets(noSkips)).toEqual([{ key: "debt:debt-1:2026-10-20", amountCentavos: 7_525 }, { key: "savings:goal-1:2026-10-25", amountCentavos: 5_000 }, { key: "scheduled:bill-1:2026-10-22", amountCentavos: 2_000 }]);
    expect(result.current.previewBudgets(noSkips)).toEqual([{ key: "debt:debt-1:2026-10-20", amountCentavos: 10_000 }, { key: "savings:goal-1:2026-10-25", amountCentavos: 5_000 }, { key: "scheduled:bill-1:2026-10-22", amountCentavos: 2_000 }]);
  });

  it("blocks while any field is invalid and clears validity on request or reset", () => {
    const { result } = renderHook(() => useCommitmentDraft());
    act(() => result.current.reset(preview));
    act(() => { result.current.setValidity("debt", false); result.current.setValidity("savings", false); });
    expect(result.current.hasInvalidCommitments).toBe(true);
    act(() => result.current.setValidity("debt", true));
    expect(result.current.hasInvalidCommitments).toBe(true);
    act(() => result.current.clearValidity());
    expect(result.current.hasInvalidCommitments).toBe(false);
    act(() => result.current.setValidity("debt", false));
    act(() => result.current.reset(preview));
    expect(result.current.hasInvalidCommitments).toBe(false);
  });

  it("empties a type budgeted manually, prefills what was paid, and restores the amount due when unticked", () => {
    const { result } = renderHook(() => useCommitmentDraft());
    act(() => result.current.reset(preview));
    act(() => result.current.changeManual({ ...noSkips, debtRepayments: true }, null));
    expect(result.current.anyManual).toBe(true);
    expect(result.current.draft?.debtReservations[0]?.amountCentavos).toBe(0);
    expect(result.current.draft?.savingsReservations[0]?.amountCentavos).toBe(5_000);

    act(() => result.current.changeManual({ ...noSkips, savingsContributions: true }, { paidCentavos: { "savings:goal-1": 2_000 }, settledKeys: [] }));
    expect(result.current.draft?.debtReservations[0]?.amountCentavos).toBe(10_000);
    expect(result.current.draft?.savingsReservations[0]?.amountCentavos).toBe(2_000);

    act(() => result.current.reset(preview));
    expect(result.current.manual).toEqual(noSkips);
    expect(result.current.anyManual).toBe(false);
  });
});
