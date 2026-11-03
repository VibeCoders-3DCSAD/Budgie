import { act, renderHook } from "@testing-library/react-native";
import { LocalDbError } from "../../../../local-db/helpers";
import { useCycleEditor } from "../useCycleEditor";

const mockCreateCreditCardCycle = jest.fn();
const mockUpdateCreditCardCycle = jest.fn();

jest.mock("../../../../local-db/repositories/credit-cards/creditCardCycles", () => ({
  createCreditCardCycle: (...args: unknown[]) => mockCreateCreditCardCycle(...args),
  updateCreditCardCycle: (...args: unknown[]) => mockUpdateCreditCardCycle(...args),
}));
jest.mock("../../../../local-db/repositories/credit-cards/creditCardCycleDates", () => ({
  calculateCurrentCreditCardCycle: () => ({ cycle_start_date: "2026-10-16", cutoff_date: "2026-11-15" }),
}));

const card = { id: "card-1", name: "Visa", creditCardDetails: { cutoffDay: 15 } } as never;
const cycle = { id: "cycle-1", account_id: "card-1", cycle_start_date: "2026-09-16", cutoff_date: "2026-10-15" } as never;

describe("useCycleEditor", () => {
  beforeEach(() => jest.clearAllMocks());

  it("starts a new cycle at the card's current cycle and an override at the cycle's dates", () => {
    const { result } = renderHook(() => useCycleEditor("user-1", "device-1", async () => {}));

    act(() => result.current.open(card, null));
    expect(result.current).toMatchObject({ start: "2026-10-16", cutoff: "2026-11-15", error: null });

    act(() => result.current.open(card, cycle));
    expect(result.current).toMatchObject({ editing: { cycle }, start: "2026-09-16", cutoff: "2026-10-15" });
  });

  it("rejects a cut-off before the start without saving, and clears the error when a date changes", async () => {
    const { result } = renderHook(() => useCycleEditor("user-1", "device-1", async () => {}));
    act(() => result.current.open(card, null));
    act(() => result.current.setDate("cutoff", "2026-10-01"));

    await act(() => result.current.save());
    expect(result.current.error).toBe("Some credit-card details are not valid. Check the highlighted fields and try again.");
    expect(mockCreateCreditCardCycle).not.toHaveBeenCalled();

    act(() => result.current.setDate("cutoff", "2026-11-15"));
    expect(result.current.error).toBeNull();
  });

  it("creates a new cycle, closes the form, reloads and shows the saved notice", async () => {
    const onSaved = jest.fn(async () => {});
    mockCreateCreditCardCycle.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCycleEditor("user-1", "device-1", onSaved));
    act(() => result.current.open(card, null));

    await act(() => result.current.save());
    expect(mockCreateCreditCardCycle).toHaveBeenCalledWith("user-1", "device-1", { account_id: "card-1", cycle_start_date: "2026-10-16", cutoff_date: "2026-11-15" });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ editing: null, saving: false, notice: "Your credit-card changes were saved. Review the billing-cycle details before continuing." });
  });

  it("updates an existing cycle and keeps the form open with the repository's message when it is refused", async () => {
    mockUpdateCreditCardCycle.mockRejectedValue(new LocalDbError("VALIDATION_ERROR", "Billing cycles cannot overlap."));
    const { result } = renderHook(() => useCycleEditor("user-1", "device-1", async () => {}));
    act(() => result.current.open(card, cycle));

    await act(() => result.current.save());
    expect(mockUpdateCreditCardCycle).toHaveBeenCalledWith("user-1", "device-1", "cycle-1", { cycle_start_date: "2026-09-16", cutoff_date: "2026-10-15" });
    expect(result.current).toMatchObject({ editing: { cycle }, saving: false, error: "Billing cycles cannot overlap." });
  });
});
