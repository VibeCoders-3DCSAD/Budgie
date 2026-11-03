import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useCommitmentDraft } from "../useCommitmentDraft";
import { useFinancialPlanController } from "../useFinancialPlanController";
import { usePlanCategorySelection } from "../usePlanCategorySelection";

const mockGetAcceptedFinancialPlanForPeriod = jest.fn();
const mockGetFinancialPlanSpending = jest.fn();
const mockRequestFinancialPlanRecommendation = jest.fn();
const mockRequestFinancialPlanExplanations = jest.fn();
const mockRunSync = jest.fn();

jest.mock("../../../../local-db/repositories/financial-plans/financialPlanCommitmentReview", () => ({
  getPlanCommitmentPayments: () => Promise.resolve({ paidCentavos: {}, settledKeys: [] }),
}));

jest.mock("../../../../local-db/repositories/financial-plans/financialPlans", () => ({
  createFinancialPlan: jest.fn(),
  deleteFinancialPlan: jest.fn(),
  getAcceptedFinancialPlanForPeriod: (...args: unknown[]) => mockGetAcceptedFinancialPlanForPeriod(...args),
  getCurrentFinancialPlanPeriod: (date: string) => ({ start: `${date.slice(0, 7)}-01`, end: new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).toISOString().slice(0, 10) }),
  getFinancialPlanLabels: () => Promise.resolve({ categories: { food: "Food" }, subcategories: { rent: "Rent" }, debtAccounts: {}, savingsGoals: {}, creditCardStatements: {} }),
  getFinancialPlanSpending: (...args: unknown[]) => mockGetFinancialPlanSpending(...args),
}));

jest.mock("../../../../local-db/repositories/forecast/forecastTransactions", () => ({
  listPlanRecommendations: () => Promise.resolve({ subcategoryIds: [], categoryIds: [], historySubcategoryIds: [], historyCategoryIds: [], seasonal: false, expectedSpend: { subcategories: {}, categories: {} } }),
}));

jest.mock("../../../../local-db/repositories/ledger/taxonomy", () => ({
  listCategories: () => Promise.resolve([]),
  listSubcategories: () => Promise.resolve([{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 20_000, fixed_amount_centavos: null }]),
  updateCategory: jest.fn(),
  updateSubcategory: jest.fn(),
}));

jest.mock("../../../../local-db/repositories/foundations/financialFoundations", () => ({
  listFinancialAccounts: () => Promise.resolve([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]),
}));

jest.mock("../../../../local-db/sync/runSync", () => ({
  runSync: (...args: unknown[]) => mockRunSync(...args),
}));

jest.mock("../../../../lib/dates", () => ({ ...jest.requireActual("../../../../lib/dates"), manilaToday: () => "2026-10-15" }));

jest.mock("../../api", () => ({
  requestFinancialPlanCommitments: () => Promise.resolve({ period: { start: "2026-10-01", end: "2026-10-31" }, debtReservations: [], savingsReservations: [] }),
  requestFinancialPlanRecommendation: (...args: unknown[]) => mockRequestFinancialPlanRecommendation(...args),
  requestFinancialPlanExplanations: (...args: unknown[]) => mockRequestFinancialPlanExplanations(...args),
  requestFinancialPlanForecast: () => Promise.resolve(null),
}));

type RecommendationResult = { response: { ok: boolean }; body: { payload: unknown } };

function recommendation(periodStart: string, explanations: string[], explanationRequest?: unknown): RecommendationResult {
  return { response: { ok: true }, body: { payload: {
    status: "RECOMMENDATION_READY", period: { start: periodStart, end: "2026-10-31" }, inputSnapshot: {}, explanations, explanationRequest,
    recommendation: { availableFundsCentavos: 100_000, allocations: [{ subcategoryId: "rent", allocationRule: "MINIMUM", allocatedAmountCentavos: 20_000, floorAmountCentavos: 20_000 }], debtReservations: [], savingsReservations: [] },
  } } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const savedPlan = {
  id: "plan-1", periodStart: "2026-10-01", periodEnd: "2026-10-31", inputSnapshot: {},
  recommendation: { availableFundsCentavos: 100_000, allocations: [{ allocationRule: "FLEXIBLE", allocatedAmountCentavos: 60_000, floorAmountCentavos: 0, categoryId: "food" }], debtReservations: [], savingsReservations: [] },
};

async function renderSelectingController() {
  const hook = renderHook(() => {
    const commitments = useCommitmentDraft();
    const categorySelection = usePlanCategorySelection("user-1", "device-1");
    return useFinancialPlanController({ userId: "user-1", deviceId: "device-1", accessToken: "token", syncVersion: 0, commitments, categorySelection });
  });
  await waitFor(() => expect(hook.result.current.state).toBe("selecting"));
  expect(hook.result.current.planningAmountError).toBeNull();
  return hook;
}

describe("useFinancialPlanController", () => {
  beforeEach(() => {
    mockGetAcceptedFinancialPlanForPeriod.mockReset().mockResolvedValue(null);
    mockGetFinancialPlanSpending.mockReset().mockResolvedValue({ allocationSpending: {}, spentCentavos: 0 });
    mockRequestFinancialPlanRecommendation.mockReset();
    mockRequestFinancialPlanExplanations.mockReset().mockResolvedValue(null);
    mockRunSync.mockReset().mockResolvedValue({ successful: true });
  });

  it("does not request a plan while the push-only sync leaves changes unsynced", async () => {
    mockRunSync.mockResolvedValue({ successful: false });
    const { result } = await renderSelectingController();
    await act(async () => { await result.current.loadRecommendation(); });
    expect(mockRunSync).toHaveBeenCalledWith("user-1", "device-1", "token", { pull: false });
    expect(mockRequestFinancialPlanRecommendation).not.toHaveBeenCalled();
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("Some of your changes have not synced yet. Sync them before generating a Financial Plan.");
    expect(result.current.plan).toBeNull();
  });

  it("opens the month's saved plan when generation fails and one now exists", async () => {
    const { result } = await renderSelectingController();
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(savedPlan);
    mockRequestFinancialPlanRecommendation.mockRejectedValue(new Error("Server unavailable."));
    await act(async () => { await result.current.loadRecommendation(); });
    expect(result.current.state).toBe("saved");
    expect(result.current.savedPlanId).toBe("plan-1");
    expect(result.current.error).toBeNull();
    expect(result.current.plan?.recommendation.allocations[0]?.label).toBe("Food");
    expect(mockGetAcceptedFinancialPlanForPeriod).toHaveBeenLastCalledWith("user-1", "2026-10-01", "2026-10-31");
    expect(mockGetFinancialPlanSpending).toHaveBeenCalledWith("user-1", "plan-1");
  });

  it("aborts the in-flight request when a new one starts and ignores its late reply", async () => {
    const requests: { signal: AbortSignal; reply: ReturnType<typeof deferred<RecommendationResult>> }[] = [];
    mockRequestFinancialPlanRecommendation.mockImplementation((...args: unknown[]) => {
      const reply = deferred<RecommendationResult>();
      requests.push({ signal: args[6] as AbortSignal, reply });
      return reply.promise;
    });
    const { result } = await renderSelectingController();
    act(() => { void result.current.loadRecommendation(); });
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => { void result.current.loadRecommendation(); });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]!.signal.aborted).toBe(true);
    expect(requests[1]!.signal.aborted).toBe(false);

    await act(async () => { requests[0]!.reply.resolve(recommendation("2026-10-02", ["Superseded."])); });
    expect(result.current.plan).toBeNull();
    expect(result.current.state).toBe("generating");
    await act(async () => { requests[1]!.reply.resolve(recommendation("2026-10-01", ["Current."])); });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.plan?.explanations).toEqual(["Current."]);
  });

  it("aborts the in-flight request on unmount", async () => {
    const signals: AbortSignal[] = [];
    mockRequestFinancialPlanRecommendation.mockImplementation((...args: unknown[]) => {
      signals.push(args[6] as AbortSignal);
      return new Promise(() => {});
    });
    const { result, unmount } = await renderSelectingController();
    act(() => { void result.current.loadRecommendation(); });
    await waitFor(() => expect(signals).toHaveLength(1));
    expect(signals[0]!.aborted).toBe(false);
    unmount();
    expect(signals[0]!.aborted).toBe(true);
  });

  it("keeps a newer plan's explanations when an older plan's AI explanations arrive late", async () => {
    const olderRequest = { evidence: { plan: "older" } };
    const newerRequest = { evidence: { plan: "newer" } };
    const lateExplanations = deferred<string[]>();
    mockRequestFinancialPlanExplanations.mockImplementation((_token: string, request: unknown) => request === olderRequest ? lateExplanations.promise : Promise.resolve(null));
    mockRequestFinancialPlanRecommendation
      .mockResolvedValueOnce(recommendation("2026-10-01", ["Older built-in."], olderRequest))
      .mockResolvedValueOnce(recommendation("2026-10-01", ["Newer built-in."], newerRequest));
    const { result } = await renderSelectingController();
    await act(async () => { await result.current.loadRecommendation(); });
    expect(result.current.plan?.explanations).toEqual(["Older built-in."]);
    await act(async () => { await result.current.loadRecommendation(); });
    expect(result.current.plan?.explanations).toEqual(["Newer built-in."]);

    await act(async () => { lateExplanations.resolve(["Older AI explanation."]); });
    expect(result.current.plan?.explanations).toEqual(["Newer built-in."]);
    expect(mockRequestFinancialPlanExplanations).toHaveBeenCalledWith("token", olderRequest);
    expect(mockRequestFinancialPlanExplanations).toHaveBeenCalledWith("token", newerRequest);
  });
});
