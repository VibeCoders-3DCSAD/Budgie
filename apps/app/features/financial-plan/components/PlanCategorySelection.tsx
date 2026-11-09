import { memo, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { CaretDown, Check, DotsThreeVertical } from "phosphor-react-native";
import type { Category, Subcategory } from "../../../local-db/repositories/ledger/taxonomy";
import type { ManualPlanAllocation } from "../api";
import type { PlanRecommendations } from "../../../local-db/repositories/forecast/forecastTransactions";
import { formatPeso } from "../helpers/financialPlanPresentation";
import type { CommitmentPreview } from "../helpers/commitmentBudget";
import { recommendPlanAmount } from "../helpers/planAmountRecommendation";
import { PlanCategoryRuleEditor, type PlanCategoryRuleUpdate } from "./PlanCategoryRuleEditor";
import { TourTarget } from "../../onboarding-tour/components/TourTarget";

type Props = {
  topLevelCategories: Category[];
  subcategories: Subcategory[];
  includedCategoryIds?: Set<string>;
  includedIds: Set<string>;
  recommendedCategoryIds?: Set<string>;
  recommendedIds: Set<string>;
  // Categories with spending in the past twelve months, which the plan budgets from that history.
  historyCategoryIds?: Set<string>;
  historyIds?: Set<string>;
  // Recommendations follow last year's seasons once there is a full year of history.
  seasonalRecommendations?: boolean;
  onToggle: (id: string) => void;
  onToggleCategory: (id: string) => void;
  onSaveCategoryRule?: (category: Category, update: PlanCategoryRuleUpdate) => Promise<void>;
  onSaveRule: (subcategory: Subcategory, update: PlanCategoryRuleUpdate) => Promise<void>;
  plannedAmount: string;
  availableMoneyCentavos: number;
  planningAmountError: string | null;
  onPlannedAmountChange: (amount: string) => void;
  onContinue: (manualAllocations: ManualPlanAllocation[]) => void;
  initialManualAllocations?: ManualPlanAllocation[];
  commitmentSection?: ReactNode;
  // With expected spending, a recommended planning amount is shown under the amount field.
  commitments?: CommitmentPreview | null;
  expectedSpend?: PlanRecommendations["expectedSpend"];
  forecast?: Record<string, number> | null;
};

type EditingTarget = { target: ManualPlanAllocation["target"]; id: string };

const EMPTY_IDS = new Set<string>();
const saveNothing = async () => {};

function requirement(category: { fixed_amount_centavos?: number | null; minimum_amount_centavos?: number | null }): "Fixed" | "Minimum" | null {
  if (category.fixed_amount_centavos != null) return "Fixed";
  if (category.minimum_amount_centavos != null) return "Minimum";
  return null;
}

type RowHandlers = {
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onManualAmountChange: (key: string, value: string) => void;
};

const checkbox = (selected: boolean, size = 20) => <View style={{ width: size, height: size, borderRadius: 5, borderWidth: 2, borderColor: selected ? "#0E6D46" : "#A8B0AA", backgroundColor: selected ? "#0E6D46" : "#FFFFFF", alignItems: "center", justifyContent: "center" }}>{selected ? <Check size={size - 8} color="#FFFFFF" weight="bold" /> : null}</View>;

function parseManualAmount(value: string): number | null {
  const trimmed = value.trim();
  return /^\d+(\.\d{1,2})?$/.test(trimmed) ? Math.round(Number(trimmed) * 100) : null;
}

function ManualAmountField({ label, amountKey, value, onChange }: { label: string; amountKey: string; value: string; onChange: RowHandlers["onManualAmountChange"] }) {
  return <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}><Text style={{ color: "#416153", fontFamily: "Manrope", fontSize: 11 }}>You haven't used {label} before. How much do you want to set aside?</Text><TextInput accessibilityLabel={`One-time plan amount for ${label} in pesos`} value={value} onChangeText={(next) => onChange(amountKey, next)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#8A938C" style={{ height: 40, marginTop: 6, backgroundColor: "#FFFFFF", borderColor: (parseManualAmount(value) ?? 0) <= 0 ? "#D7DDD8" : "#0E6D46", borderRadius: 9, borderWidth: 1, color: "#1B1C1A", fontFamily: "Manrope", fontSize: 13, paddingHorizontal: 11 }} /></View>;
}

function RuleButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Configure Financial Plan rule for ${label}`} onPress={onPress} hitSlop={8} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}><DotsThreeVertical size={20} color="#6B7A6F" weight="bold" /></Pressable>;
}

// Rows are memoized with primitive props and stable handlers: a plan can list well over a hundred
// subcategories, and re-rendering all of them on every toggle or keystroke took seconds on device.
const SubcategoryRow = memo(function SubcategoryRow({ subcategory, selected, recommended, recommendedNote, needsAmount, manualAmount, first, handlers }: { subcategory: Subcategory; selected: boolean; recommended: boolean; recommendedNote: string; needsAmount: boolean; manualAmount: string; first: boolean; handlers: RowHandlers }) {
  const rule = requirement(subcategory);
  const locked = rule !== null;
  return <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: "#EFEEE8" }}>
    <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 4 }}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: locked }} accessibilityLabel={`Include ${subcategory.label} in Financial Plan`} disabled={locked} onPress={() => handlers.onToggle(subcategory.id)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingLeft: 12, opacity: locked ? 0.8 : 1 }}>
        {checkbox(selected, 18)}
        <View style={{ flex: 1 }}><Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13, color: "#1B1C1A" }}>{subcategory.label}</Text>{locked ? <Text style={{ fontFamily: "Manrope", fontSize: 11, color: "#416153", marginTop: 1 }}>{rule} requirement</Text> : recommended ? <Text style={{ fontFamily: "Manrope", fontSize: 11, color: "#416153", marginTop: 1 }}>{recommendedNote}</Text> : null}</View>
      </Pressable>
      <RuleButton label={subcategory.label} onPress={() => handlers.onEdit(subcategory.id)} />
    </View>
    {selected && !locked && needsAmount ? <ManualAmountField label={subcategory.label} amountKey={`subcategory:${subcategory.id}`} value={manualAmount} onChange={handlers.onManualAmountChange} /> : null}
  </View>;
});

function GroupHeading({ title, includedCount }: { title: string; includedCount: number }) {
  return <View accessibilityRole="header" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
    <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 12, letterSpacing: 0.6, color: "#416153" }}>{title.toUpperCase()}</Text>
    <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11, color: includedCount ? "#0E6D46" : "#8A938C" }}>{includedCount} included</Text>
  </View>;
}

export function PlanCategorySelection({ topLevelCategories, subcategories, includedCategoryIds = EMPTY_IDS, includedIds, recommendedCategoryIds = EMPTY_IDS, recommendedIds, historyCategoryIds = EMPTY_IDS, historyIds = EMPTY_IDS, seasonalRecommendations = false, onToggle, onToggleCategory, onSaveCategoryRule = saveNothing, onSaveRule, plannedAmount, availableMoneyCentavos, planningAmountError, onPlannedAmountChange, onContinue, initialManualAllocations = [], commitmentSection, commitments = null, expectedSpend, forecast = null }: Props) {
  const uncategorizedSubcategories = subcategories.filter((subcategory) => !subcategory.category_id);
  // The editor stays mounted with its last target so it can animate closed.
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>(() => Object.fromEntries(initialManualAllocations.map(({ target, id, amountCentavos }) => [`${target}:${id}`, (amountCentavos / 100).toFixed(2)])));

  // The parent passes new callbacks every render; rows read the latest ones through this ref so their
  // handlers stay stable and memoization holds.
  const latest = useRef({ onToggle });
  latest.current = { onToggle };
  const subcategoryHandlers = useMemo<RowHandlers>(() => ({
    onToggle: (id) => latest.current.onToggle(id),
    onEdit: (id) => { setEditing({ target: "subcategory", id }); setEditorOpen(true); },
    onManualAmountChange: (key, value) => setManualAmounts((current) => ({ ...current, [key]: value })),
  }), []);
  const childrenByCategory = useMemo(() => {
    const groups = new Map<string, Subcategory[]>();
    for (const subcategory of subcategories) {
      if (!subcategory.category_id) continue;
      const group = groups.get(subcategory.category_id);
      if (group) group.push(subcategory);
      else groups.set(subcategory.category_id, [subcategory]);
    }
    return groups;
  }, [subcategories]);

  const recommendedNote = seasonalRecommendations ? "Recommended from this time last year and your past 12 months" : "Recommended from your past 6 months";
  // Only a category the plan has no spending for needs a one-time amount.
  const subcategoryNeedsAmount = (id: string) => !recommendedIds.has(id) && !historyIds.has(id);
  const categoryNeedsAmount = (id: string) => !recommendedCategoryIds.has(id) && !historyCategoryIds.has(id);
  const manualAmount = (target: ManualPlanAllocation["target"], id: string) => manualAmounts[`${target}:${id}`] ?? "";
  const parsedManualAmount = (target: ManualPlanAllocation["target"], id: string) => parseManualAmount(manualAmount(target, id));
  const subcategoryAsksAmount = (subcategory: Subcategory) => includedIds.has(subcategory.id) && requirement(subcategory) === null && subcategoryNeedsAmount(subcategory.id);
  const manualAllocations = (): ManualPlanAllocation[] => [
    ...subcategories.filter(subcategoryAsksAmount).map((subcategory) => ({ target: "subcategory" as const, id: subcategory.id, amountCentavos: parsedManualAmount("subcategory", subcategory.id) ?? 0 })),
    ...topLevelCategories.filter((category) => includedCategoryIds.has(category.id) && requirement(category) === null && categoryNeedsAmount(category.id)).map((category) => ({ target: "category" as const, id: category.id, amountCentavos: parsedManualAmount("category", category.id) ?? 0 })),
  ];
  const hasInvalidManualAmount = manualAllocations().some((allocation) => allocation.amountCentavos <= 0);
  const includedCount = includedIds.size + includedCategoryIds.size;
  const cannotContinue = includedCount === 0 || planningAmountError !== null || hasInvalidManualAmount;
  const recommendation = expectedSpend ? recommendPlanAmount({ commitments, topLevelCategories, subcategories, includedCategoryIds, includedIds, expectedSpend, manualAllocations: manualAllocations(), forecast }) : null;
  const recommendedCentavos = recommendation ? Math.min(recommendation.totalCentavos, availableMoneyCentavos) : 0;

  const visibleCategories = topLevelCategories.filter((category) => childrenByCategory.has(category.id));
  const essentials = visibleCategories.filter((category) => category.classification === "essential");
  const nonEssentials = visibleCategories.filter((category) => category.classification !== "essential");
  const categoryIncluded = (category: Category) => includedCategoryIds.has(category.id) || (childrenByCategory.get(category.id) ?? []).some((subcategory) => includedIds.has(subcategory.id));

  const toggleExpanded = (id: string) => setExpandedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  function renderSubcategory(subcategory: Subcategory, index: number) {
    return <SubcategoryRow key={subcategory.id} subcategory={subcategory} selected={includedIds.has(subcategory.id)} recommended={recommendedIds.has(subcategory.id)} recommendedNote={recommendedNote} needsAmount={subcategoryNeedsAmount(subcategory.id)} manualAmount={manualAmount("subcategory", subcategory.id)} first={index === 0} handlers={subcategoryHandlers} />;
  }

  function renderCategory(category: Category) {
    const children = childrenByCategory.get(category.id) ?? [];
    const selected = includedCategoryIds.has(category.id);
    const rule = requirement(category);
    const locked = rule !== null;
    const recommended = recommendedCategoryIds.has(category.id);
    const selectedChildren = children.filter((subcategory) => includedIds.has(subcategory.id)).length;
    // A subcategory waiting for its one-time amount keeps the category open so the field stays reachable.
    const pinnedOpen = children.some(subcategoryAsksAmount);
    const expanded = pinnedOpen || expandedIds.has(category.id);
    const summary = locked
      ? `${rule} requirement`
      : selected
        ? recommended ? "Whole category · recommended from spending" : "Whole category"
        : selectedChildren
          ? `${selectedChildren} of ${children.length} subcategories`
          : recommended ? "Recommended from category spending" : "Not included";
    const highlighted = selected || selectedChildren > 0;
    return <View key={category.id} style={{ marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: highlighted ? "#9FCDB5" : "#EAEAE6", backgroundColor: "#FFFFFF", overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 4, backgroundColor: selected ? "#EEFFF8" : "#FFFFFF" }}>
        <TourTarget id={`plan-category-${category.slug}`} style={{ flex: 1 }}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: locked }} accessibilityLabel={`Include ${category.label} in Financial Plan`} disabled={locked} onPress={() => onToggleCategory(category.id)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, paddingLeft: 12, opacity: locked ? 0.8 : 1 }}>
          {checkbox(selected)}
          <View style={{ flex: 1 }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 14, color: "#1B1C1A" }}>{category.label}</Text><Text style={{ fontFamily: "Manrope", fontSize: 11, color: highlighted || locked ? "#416153" : "#8A938C", marginTop: 2 }}>{summary}</Text></View>
        </Pressable>
        </TourTarget>
        <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? "Hide" : "Show"} subcategories for ${category.label}`} accessibilityState={{ expanded, disabled: pinnedOpen }} disabled={pinnedOpen} onPress={() => toggleExpanded(category.id)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 3, height: 32, paddingHorizontal: 8, opacity: pinnedOpen ? 0.4 : 1 }}>
          <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11, color: "#6B7A6F" }}>{children.length}</Text>
          <CaretDown size={14} color="#6B7A6F" weight="bold" style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }} />
        </Pressable>
        <RuleButton label={category.label} onPress={() => { setEditing({ target: "category", id: category.id }); setEditorOpen(true); }} />
      </View>
      {selected && !locked && categoryNeedsAmount(category.id) ? <View style={{ backgroundColor: "#EEFFF8", paddingTop: 2 }}><ManualAmountField label={category.label} amountKey={`category:${category.id}`} value={manualAmount("category", category.id)} onChange={subcategoryHandlers.onManualAmountChange} /></View> : null}
      {expanded ? <View style={{ borderTopWidth: 1, borderTopColor: "#EAEAE6", backgroundColor: "#FCFBF7" }}>{children.map(renderSubcategory)}</View> : null}
    </View>;
  }

  const editingCategory = editing?.target === "category" ? topLevelCategories.find((category) => category.id === editing.id) : undefined;
  const editingSubcategory = editing?.target === "subcategory" ? subcategories.find((subcategory) => subcategory.id === editing.id) : undefined;
  const closeEditor = () => setEditorOpen(false);

  return (
    <View style={{ paddingBottom: 28 }}>
      <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 20, color: "#1B1C1A" }}>Financial Plan</Text>
      <Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#6B7A6F", marginTop: 4, lineHeight: 18 }}>Set an amount, then pick what to budget. Fixed and minimum categories are always included.</Text>

      <TourTarget id="plan-amount" fill>
      <View style={{ marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: "#EAEAE6", backgroundColor: "#FFFFFF", padding: 14 }}>
        <Text style={{ color: "#1B1C1A", fontFamily: "Manrope", fontSize: 13, fontWeight: "800" }}>How much should we plan?</Text>
        <TextInput accessibilityLabel="How much should we plan in pesos" value={plannedAmount} onChangeText={onPlannedAmountChange} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#8A938C" style={{ backgroundColor: "#FCF8F0", borderColor: planningAmountError ? "#D9001F" : "#D7DDD8", borderRadius: 12, borderWidth: 1, color: "#1B1C1A", fontFamily: "Manrope", fontSize: 18, fontWeight: "700", marginTop: 8, paddingHorizontal: 13, paddingVertical: 11 }} />
        {planningAmountError ? <Text accessibilityRole="alert" style={{ color: "#D9001F", fontFamily: "Manrope", fontSize: 11, marginTop: 5 }}>{planningAmountError}</Text> : null}
        <Text style={{ color: "#416153", fontFamily: "Manrope", fontSize: 11, marginTop: 6 }}>Available money: {formatPeso(availableMoneyCentavos)}</Text>
        {recommendation && recommendation.totalCentavos > 0 ? <View style={{ marginTop: 10, borderRadius: 11, backgroundColor: "#F0F7F3", paddingVertical: 9, paddingLeft: 11, paddingRight: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ flex: 1, color: "#1B1C1A", fontFamily: "Manrope", fontSize: 12, fontWeight: "800" }}>Recommended Minimum: {formatPeso(recommendedCentavos)}</Text>
            <TourTarget id="plan-use-recommended"><Pressable accessibilityRole="button" accessibilityLabel="Use the recommended minimum planning amount" onPress={() => onPlannedAmountChange((recommendedCentavos / 100).toFixed(2))} style={{ paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: "#0E6D46", fontFamily: "Manrope", fontSize: 12, fontWeight: "800" }}>Use this</Text></Pressable></TourTarget>
          </View>
          <Text style={{ color: "#6B7A6F", fontFamily: "Manrope", fontSize: 11, marginTop: 1 }}>{formatPeso(recommendation.commitmentsCentavos)} commitments + {formatPeso(recommendation.spendingCentavos)} expected spending</Text>
          {recommendation.totalCentavos > availableMoneyCentavos ? <Text style={{ color: "#B45309", fontFamily: "Manrope", fontSize: 11, marginTop: 2 }}>Your available money is {formatPeso(recommendation.totalCentavos - availableMoneyCentavos)} short of this month's needs.</Text> : null}
        </View> : null}
      </View>
      </TourTarget>

      {commitmentSection}

      <Text accessibilityRole="header" style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 16, color: "#1B1C1A", marginTop: 24 }}>Categories</Text>
      <Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#6B7A6F", marginTop: 2, lineHeight: 18 }}>Check a category to budget it as a whole, or open it to pick specific subcategories. They are planned separately.</Text>
      {essentials.length ? <><GroupHeading title="Essentials" includedCount={essentials.filter(categoryIncluded).length} />{essentials.map(renderCategory)}</> : null}
      {nonEssentials.length ? <><GroupHeading title="Non-essentials" includedCount={nonEssentials.filter(categoryIncluded).length} />{nonEssentials.map(renderCategory)}</> : null}
      {uncategorizedSubcategories.length ? <>
        <GroupHeading title="Other expense categories" includedCount={uncategorizedSubcategories.filter((subcategory) => includedIds.has(subcategory.id)).length} />
        <View style={{ marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: "#EAEAE6", backgroundColor: "#FFFFFF", overflow: "hidden" }}>{uncategorizedSubcategories.map(renderSubcategory)}</View>
      </> : null}

      <View style={{ marginTop: 22, borderTopWidth: 1, borderTopColor: "#EAEAE6", paddingTop: 14 }}>
        <Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#6B7A6F", textAlign: "center" }}>{includedCount} {includedCount === 1 ? "category" : "categories"} included</Text>
        {hasInvalidManualAmount ? <Text accessibilityRole="alert" style={{ color: "#D9001F", fontFamily: "Manrope", fontSize: 11, marginTop: 6, textAlign: "center" }}>Enter an amount greater than zero for each new category.</Text> : null}
        <TourTarget id="plan-continue" fill><Pressable accessibilityRole="button" accessibilityLabel="Continue to Plan" disabled={cannotContinue} onPress={() => onContinue(manualAllocations())} style={{ backgroundColor: "#013220", borderRadius: 14, padding: 14, marginTop: 10, opacity: cannotContinue ? 0.5 : 1 }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", color: "#FFFFFF", textAlign: "center" }}>Continue to Plan</Text></Pressable></TourTarget>
      </View>

      {editingCategory ? <PlanCategoryRuleEditor visible={editorOpen} category={editingCategory} onClose={closeEditor} onSave={async (update) => { await onSaveCategoryRule(editingCategory, update); closeEditor(); }} /> : null}
      {editingSubcategory ? <PlanCategoryRuleEditor visible={editorOpen} category={editingSubcategory} onClose={closeEditor} onSave={async (update) => { await onSaveRule(editingSubcategory, update); closeEditor(); }} /> : null}
    </View>
  );
}
