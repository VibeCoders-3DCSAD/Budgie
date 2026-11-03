import { useCallback, useState } from "react";
import type { PlanRecommendations } from "../../../local-db/repositories/forecast/forecastTransactions";
import { updateCategory, updateSubcategory, type Category, type Subcategory } from "../../../local-db/repositories/ledger/taxonomy";
import type { PlanCategoryRuleUpdate } from "../components/PlanCategoryRuleEditor";

type InitialSelection = { includedIds: Set<string>; includedCategoryIds: Set<string> };

// The expense categories and subcategories a plan covers, which of them are recommended or have
// history, and their budget rules. A whole category and its own subcategories are never both included.
export function usePlanCategorySelection(userId: string, deviceId: string) {
  const [categories, setCategories] = useState<Subcategory[]>([]);
  const [topLevelCategories, setTopLevelCategories] = useState<Category[]>([]);
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());
  const [includedCategoryIds, setIncludedCategoryIds] = useState<Set<string>>(new Set());
  const [recommendedIds, setRecommendedIds] = useState<Set<string>>(new Set());
  const [recommendedCategoryIds, setRecommendedCategoryIds] = useState<Set<string>>(new Set());
  const [historyIds, setHistoryIds] = useState<Set<string>>(new Set());
  const [historyCategoryIds, setHistoryCategoryIds] = useState<Set<string>>(new Set());
  const [seasonalRecommendations, setSeasonalRecommendations] = useState(false);
  const [expectedSpend, setExpectedSpend] = useState<PlanRecommendations["expectedSpend"]>();

  // Starts the selection at every category with a fixed or minimum amount plus the recommended ones
  // that still exist. Returns that starting selection for the planning-amount recommendation.
  const initialize = useCallback((topLevel: Category[], subcategories: Subcategory[], recommendations: PlanRecommendations): InitialSelection => {
    setTopLevelCategories(topLevel);
    setCategories(subcategories);
    const validRecentIds = new Set(recommendations.subcategoryIds.filter((id) => subcategories.some((category) => category.id === id)));
    const requiredIds = subcategories.filter((category) => category.fixed_amount_centavos !== null || category.minimum_amount_centavos !== null).map((category) => category.id);
    const validRecentCategoryIds = new Set(recommendations.categoryIds.filter((id) => topLevel.some((category) => category.id === id)));
    const requiredCategoryIds = topLevel.filter((category) => category.fixed_amount_centavos != null || category.minimum_amount_centavos != null).map((category) => category.id);
    setRecommendedIds(validRecentIds);
    setHistoryIds(new Set(recommendations.historySubcategoryIds));
    setHistoryCategoryIds(new Set(recommendations.historyCategoryIds));
    setSeasonalRecommendations(recommendations.seasonal);
    const parentIdsWithHistory = subcategories.filter((subcategory) => validRecentIds.has(subcategory.id)).flatMap((subcategory) => subcategory.category_id ? [subcategory.category_id] : []);
    setRecommendedCategoryIds(new Set([...validRecentCategoryIds, ...parentIdsWithHistory]));
    const initial = { includedIds: new Set([...requiredIds, ...validRecentIds]), includedCategoryIds: new Set([...requiredCategoryIds, ...validRecentCategoryIds]) };
    setIncludedIds(initial.includedIds);
    setIncludedCategoryIds(initial.includedCategoryIds);
    setExpectedSpend(recommendations.expectedSpend);
    return initial;
  }, []);

  // Choosing a subcategory replaces its whole category in the plan.
  const toggleSubcategory = (id: string) => {
    setIncludedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    const categoryId = categories.find((category) => category.id === id)?.category_id;
    if (categoryId) setIncludedCategoryIds((current) => { const next = new Set(current); next.delete(categoryId); return next; });
  };

  // Choosing a whole category replaces its subcategories in the plan.
  const toggleTopLevelCategory = (id: string) => {
    setIncludedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setIncludedIds((current) => new Set([...current].filter((subcategoryId) => categories.find((category) => category.id === subcategoryId)?.category_id !== id)));
  };

  // A fixed or minimum amount always belongs in the budget, so it adds the category to the plan.
  const saveCategoryRule = async (subcategory: Subcategory, update: PlanCategoryRuleUpdate) => {
    const { subcategory: saved } = await updateSubcategory(userId, deviceId, subcategory.id, {
      minimum_amount_centavos: update.minimumAmountCentavos,
      fixed_amount_centavos: update.fixedAmountCentavos,
      always_in_budget: update.rule !== "FLEXIBLE",
    });
    setCategories((current) => current.map((item) => item.id === saved.id ? saved : item));
    if (update.rule !== "FLEXIBLE") setIncludedIds((current) => new Set([...current, saved.id]));
  };

  const saveTopLevelCategoryRule = async (category: Category, update: PlanCategoryRuleUpdate) => {
    const { category: saved } = await updateCategory(userId, deviceId, category.id, {
      minimum_amount_centavos: update.minimumAmountCentavos,
      fixed_amount_centavos: update.fixedAmountCentavos,
      always_in_budget: update.rule !== "FLEXIBLE",
    });
    setTopLevelCategories((current) => current.map((item) => item.id === saved.id ? saved : item));
    if (update.rule !== "FLEXIBLE") setIncludedCategoryIds((current) => new Set([...current, saved.id]));
  };

  return {
    categories, topLevelCategories, includedIds, includedCategoryIds, recommendedIds, recommendedCategoryIds, historyIds, historyCategoryIds, seasonalRecommendations, expectedSpend,
    initialize, toggleSubcategory, toggleTopLevelCategory, saveCategoryRule, saveTopLevelCategoryRule,
  };
}

export type PlanCategorySelection = ReturnType<typeof usePlanCategorySelection>;
