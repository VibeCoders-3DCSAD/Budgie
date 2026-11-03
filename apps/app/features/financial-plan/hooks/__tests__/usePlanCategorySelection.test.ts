import { act, renderHook } from "@testing-library/react-native";
import { usePlanCategorySelection } from "../usePlanCategorySelection";

const mockUpdateCategory = jest.fn();
const mockUpdateSubcategory = jest.fn();

jest.mock("../../../../local-db/repositories/ledger/taxonomy", () => ({
  updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
  updateSubcategory: (...args: unknown[]) => mockUpdateSubcategory(...args),
}));

const food = { id: "food", label: "Food", fixed_amount_centavos: null, minimum_amount_centavos: null };
const transport = { id: "transport", label: "Transport", fixed_amount_centavos: null, minimum_amount_centavos: 5_000 };
const groceries = { id: "groceries", category_id: "food", label: "Groceries", fixed_amount_centavos: null, minimum_amount_centavos: null };
const dining = { id: "dining", category_id: "food", label: "Dining", fixed_amount_centavos: null, minimum_amount_centavos: null };
const rent = { id: "rent", category_id: null, label: "Rent", fixed_amount_centavos: 20_000, minimum_amount_centavos: null };
const recommendations = {
  subcategoryIds: ["groceries", "deleted-subcategory"], categoryIds: ["deleted-category"],
  historySubcategoryIds: ["groceries"], historyCategoryIds: ["food"], seasonal: true,
  expectedSpend: { subcategories: { groceries: 3_000 }, categories: {} },
};

function renderInitialized() {
  const hook = renderHook(() => usePlanCategorySelection("user-1", "device-1"));
  let initial!: ReturnType<typeof hook.result.current.initialize>;
  act(() => { initial = hook.result.current.initialize([food, transport] as never, [groceries, dining, rent] as never, recommendations); });
  return { ...hook, initial };
}

describe("usePlanCategorySelection", () => {
  beforeEach(() => jest.clearAllMocks());

  it("starts with required and still-existing recommended categories and drops IDs that no longer exist", () => {
    const { result, initial } = renderInitialized();

    expect([...initial.includedIds]).toEqual(["rent", "groceries"]);
    expect([...initial.includedCategoryIds]).toEqual(["transport"]);
    expect(result.current.includedIds).toEqual(initial.includedIds);
    expect(result.current.includedCategoryIds).toEqual(initial.includedCategoryIds);
    expect([...result.current.recommendedIds]).toEqual(["groceries"]);
    expect([...result.current.recommendedCategoryIds]).toEqual(["food"]);
    expect([...result.current.historyCategoryIds]).toEqual(["food"]);
    expect(result.current.seasonalRecommendations).toBe(true);
    expect(result.current.expectedSpend).toEqual(recommendations.expectedSpend);
  });

  it("removes the parent category when one of its subcategories is toggled", () => {
    const { result } = renderInitialized();
    act(() => result.current.toggleTopLevelCategory("food"));
    expect(result.current.includedCategoryIds.has("food")).toBe(true);

    act(() => result.current.toggleSubcategory("dining"));
    expect(result.current.includedIds.has("dining")).toBe(true);
    expect(result.current.includedCategoryIds.has("food")).toBe(false);
  });

  it("drops a category's subcategories when the whole category is toggled", () => {
    const { result } = renderInitialized();
    act(() => result.current.toggleSubcategory("dining"));
    expect([...result.current.includedIds]).toEqual(["rent", "groceries", "dining"]);

    act(() => result.current.toggleTopLevelCategory("food"));
    expect([...result.current.includedIds]).toEqual(["rent"]);
    expect(result.current.includedCategoryIds.has("food")).toBe(true);
  });

  it("adds a category to the plan when a fixed or minimum rule is saved, but not a flexible one", async () => {
    const { result } = renderInitialized();
    const savedDining = { ...dining, minimum_amount_centavos: 1_000 };
    mockUpdateSubcategory.mockResolvedValue({ subcategory: savedDining });

    await act(() => result.current.saveCategoryRule(dining as never, { rule: "MINIMUM", minimumAmountCentavos: 1_000, fixedAmountCentavos: null }));
    expect(mockUpdateSubcategory).toHaveBeenCalledWith("user-1", "device-1", "dining", { minimum_amount_centavos: 1_000, fixed_amount_centavos: null, always_in_budget: true });
    expect(result.current.includedIds.has("dining")).toBe(true);
    expect(result.current.categories.find((item) => item.id === "dining")).toEqual(savedDining);

    mockUpdateCategory.mockResolvedValue({ category: food });
    await act(() => result.current.saveTopLevelCategoryRule(food as never, { rule: "FLEXIBLE", minimumAmountCentavos: null, fixedAmountCentavos: null }));
    expect(mockUpdateCategory).toHaveBeenCalledWith("user-1", "device-1", "food", { minimum_amount_centavos: null, fixed_amount_centavos: null, always_in_budget: false });
    expect(result.current.includedCategoryIds.has("food")).toBe(false);
  });
});
