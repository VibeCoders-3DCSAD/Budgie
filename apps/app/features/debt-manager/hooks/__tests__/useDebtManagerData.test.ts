import { renderHook, waitFor } from "@testing-library/react-native";
import { useDebtManagerData } from "../useDebtManagerData";

const mockListFinancialAccounts = jest.fn();
const mockEnsureCurrentCreditCardCycles = jest.fn();
const mockListCreditCardCycles = jest.fn();
const mockListCreditCardStatements = jest.fn();

jest.mock("../../../../local-db/repositories/foundations/financialFoundations", () => ({
  listFinancialAccounts: (...args: unknown[]) => mockListFinancialAccounts(...args),
}));
jest.mock("../../../../local-db/repositories/credit-cards/creditCardCycles", () => ({
  ensureCurrentCreditCardCycles: (...args: unknown[]) => mockEnsureCurrentCreditCardCycles(...args),
  listCreditCardCycles: (...args: unknown[]) => mockListCreditCardCycles(...args),
  listCreditCardCycleTransactions: async () => [],
}));
jest.mock("../../../../local-db/repositories/credit-cards/creditCardStatements", () => ({
  listCreditCardStatements: (...args: unknown[]) => mockListCreditCardStatements(...args),
}));
jest.mock("../../../../local-db/repositories/credit-cards/creditCardInstallments", () => ({ listCreditCardInstallments: async () => [] }));
jest.mock("../../../../local-db/repositories/credit-cards/creditCardPayments", () => ({ listCreditCardPayments: async () => [] }));
jest.mock("../../../../local-db/repositories/credit-cards/creditCardRepaymentPlans", () => ({ listCreditCardStrategies: async () => [] }));
jest.mock("../../../../local-db/repositories/credit-cards/creditCardSettlements", () => ({ listCreditCardSettlements: async () => [] }));

const card = { id: "card-1", name: "Visa", kind: "credit_card", status: "active" };
const cycle = { id: "cycle-1", account_id: "card-1", cycle_start_date: "2026-10-01", cutoff_date: "2026-10-31" };

describe("useDebtManagerData", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockListFinancialAccounts.mockResolvedValue([card]);
    mockEnsureCurrentCreditCardCycles.mockResolvedValue(undefined);
    mockListCreditCardCycles.mockResolvedValue([cycle]);
    mockListCreditCardStatements.mockResolvedValue([]);
  });

  afterEach(() => consoleError.mockRestore());

  it("loads only active credit cards and their records", async () => {
    const { result } = renderHook(() => useDebtManagerData("user-1", "device-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockListFinancialAccounts).toHaveBeenCalledWith("user-1", { kind: "credit_card", status: "active" });
    expect(mockEnsureCurrentCreditCardCycles).toHaveBeenCalledWith("user-1", "device-1");
    expect(result.current).toMatchObject({ accounts: [card], cycles: [cycle], error: false, stale: false });
  });

  it("still shows the stored cycles when the cycle catch-up fails", async () => {
    mockEnsureCurrentCreditCardCycles.mockRejectedValue(new Error("catch-up failed"));
    const { result } = renderHook(() => useDebtManagerData("user-1", "device-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ accounts: [card], cycles: [cycle], error: true, stale: true });
  });

  it("keeps the earlier data and marks it stale when a later load fails", async () => {
    const { result } = renderHook(() => useDebtManagerData("user-1", "device-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockListCreditCardStatements.mockRejectedValue(new Error("read failed"));
    mockListCreditCardCycles.mockResolvedValue([]);
    await result.current.load();

    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current).toMatchObject({ cycles: [cycle], error: true, loading: false });
  });

  it("reports an error without stale data when the first load fails", async () => {
    mockListFinancialAccounts.mockRejectedValue(new Error("read failed"));
    const { result } = renderHook(() => useDebtManagerData("user-1", "device-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ accounts: [], error: true, stale: false });
  });
});
