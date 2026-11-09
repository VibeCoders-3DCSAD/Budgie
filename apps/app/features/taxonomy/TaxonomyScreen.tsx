import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CaretRight,
  MagnifyingGlass,
  Plus,
  ArrowLeft,
} from "phosphor-react-native";
import {
  listCategories,
  listSubcategories,
  deleteSubcategory,
  type Category as RepoCategory,
  type Subcategory as RepoSubcategory,
} from "../../local-db/repositories/ledger/taxonomy";
import CategoryFormScreen from "./CategoryFormScreen";
import SubcategoryFormScreen from "./SubcategoryFormScreen";
import KebabTooltip from "../../components/KebabTooltip";
import { DEFAULT_TAXONOMY_COLOR, TaxonomyIcon } from "./taxonomyVisuals";
import { TourTarget } from "../onboarding-tour/components/TourTarget";

type Subcategory = RepoSubcategory;
type Category = RepoCategory & { subcategories?: Subcategory[] };

type TaxonomyScreenProps = {
  userId: string;
  deviceId: string;
  syncVersion?: number;
  onBack: () => void;
  onBackInterceptChange?: (intercept: (() => boolean) | null) => void;
};

const palette = {
  ink: "#1B1C1A",
  mut: "#6B7A6F",
  card: "#FCF8F0",
  line: "#EAEAE6",
  line2: "#EAEAE6",
  aqua50: "#EFFEF7",
  aqua600: "#08B16A",
  aqua700: "#0B8A55",
  aqua800: "#0B8A55",
  sun50: "#FFF8F0",
  sun700: "#C25E00",
  brand: "#013220",
  error: "#D9001F",
} as const;

function CategoryRow({
  category,
  onNavigate,
}: {
  category: Category;
  onNavigate: (cat: Category) => void;
}) {
  const hasProtectedDefault = category.subcategories?.some((s) => s.is_protected) ?? false;
  const subCount = category.subcategories?.length ?? 0;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: palette.line2,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${category.label}, ${subCount} subcategories`}
        onPress={() => onNavigate(category)}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: category.color_hex ?? DEFAULT_TAXONOMY_COLOR, alignItems: "center", justifyContent: "center" }}>
          <TaxonomyIcon iconKey={category.icon_key} size={19} color="#fff" weight="fill" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13.5, color: palette.ink, flexShrink: 1 }}>
              {category.label}
            </Text>
            {hasProtectedDefault && (
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: palette.aqua50 }}>
                <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 9, color: palette.aqua800 }}>
                  DEFAULT PROTECTED
                </Text>
              </View>
            )}
          </View>
          <Text style={{ fontFamily: "Manrope", fontSize: 11, color: palette.mut, marginTop: 2 }}>
            {category.description}
          </Text>
          {subCount > 0 && (
            <Text style={{ fontFamily: "Manrope", fontWeight: "600", fontSize: 11, color: palette.aqua700, marginTop: 2 }}>
              {subCount} subcategor{subCount === 1 ? "y" : "ies"}
            </Text>
          )}
        </View>
      </Pressable>
      <CaretRight size={14} weight="bold" color={palette.mut} />
    </View>
  );
}

function SubcategoryRow({
  sub,
  mutatingId,
  onEdit,
  onDelete,
}: {
  sub: Subcategory;
  mutatingId: string | null;
  onEdit: (s: Subcategory) => void;
  onDelete: (s: Subcategory) => void;
}) {
  const isProtected = sub.is_protected;
  const isMutating = mutatingId === sub.id;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: palette.line2,
      }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: sub.color_hex ?? DEFAULT_TAXONOMY_COLOR, alignItems: "center", justifyContent: "center" }}>
        <TaxonomyIcon iconKey={sub.icon_key} size={17} color="#fff" weight="fill" />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13.5, color: palette.ink, flexShrink: 1 }}>
            {sub.label}
          </Text>
          {isProtected && (
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: palette.aqua50 }}>
              <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 9, color: palette.aqua800 }}>
                PROTECTED
              </Text>
            </View>
          )}
        </View>
        <Text style={{ fontFamily: "Manrope", fontSize: 11, color: palette.mut, marginTop: 2 }}>
          {sub.description}
        </Text>
      </View>
      <KebabTooltip
        kebabDirection="horizontal"
        tooltipLocation="bottomRight"
        disabled={isMutating}
        onEdit={() => onEdit(sub)}
        onDelete={() => onDelete(sub)}
      />
    </View>
  );
}

// Income categories are flat and read-only here: no subcategories, no actions.
function IncomeCategoryRow({ category }: { category: Subcategory }) {
  return (
    <View
      accessibilityLabel={category.label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: palette.line2,
      }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: category.color_hex ?? DEFAULT_TAXONOMY_COLOR, alignItems: "center", justifyContent: "center" }}>
        <TaxonomyIcon iconKey={category.icon_key} size={19} color="#fff" weight="fill" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13.5, color: palette.ink }}>
          {category.label}
        </Text>
        <Text style={{ fontFamily: "Manrope", fontSize: 11, color: palette.mut, marginTop: 2 }}>
          {category.description}
        </Text>
      </View>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11, letterSpacing: 0.6, color: palette.mut }}>
      {children}
    </Text>
  );
}

function assembleNested(
  localCategories: RepoCategory[],
  localSubcategories: RepoSubcategory[],
): Category[] {
  const subsByCat = new Map<string, Subcategory[]>();
  for (const s of localSubcategories) {
    if (!s.category_id) continue;
    const arr = subsByCat.get(s.category_id) ?? [];
    arr.push(s);
    subsByCat.set(s.category_id, arr);
  }

  return localCategories.map((category) => ({ ...category, subcategories: subsByCat.get(category.id) ?? [] }));
}

export default function TaxonomyScreen({ userId, deviceId, syncVersion = 0, onBack, onBackInterceptChange }: TaxonomyScreenProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewingCategoryId, setViewingCategoryId] = useState<string | null>(null);
  const [viewingCategoryLabel, setViewingCategoryLabel] = useState("");

  const [categoryFormVisible, setCategoryFormVisible] = useState(false);

  const [subcategoryFormVisible, setSubcategoryFormVisible] = useState(false);
  const [subcategoryFormMode, setSubcategoryFormMode] = useState<"create" | "edit">("create");
  const [editingSubcategory, setEditingSubcategory] = useState<Subcategory | undefined>(undefined);

  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      const localCats = await listCategories(userId);
      const localSubs = await listSubcategories(userId);
      setCategories(assembleNested(localCats, localSubs));
      setIncomeCategories(localSubs.filter((sub) => sub.kind === "income" && !sub.category_id));
    } catch (error) {
      console.error("[taxonomy] failed to load categories", {
        userId,
        reason: error instanceof Error ? error.message : "unknown error",
      });
      setError("Failed to load categories.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load, syncVersion]);

  useEffect(() => {
    if (!viewingCategoryId) return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      setViewingCategoryId(null);
      setViewingCategoryLabel("");
      return true;
    });
    return () => back.remove();
  }, [viewingCategoryId]);

  useEffect(() => {
    onBackInterceptChange?.(() => {
      if (subcategoryFormVisible) { closeSubcategoryForm(); return true; }
      if (categoryFormVisible) { setCategoryFormVisible(false); return true; }
      if (viewingCategoryId) { goBack(); return true; }
      return false;
    });
  }, [onBackInterceptChange, subcategoryFormVisible, categoryFormVisible, viewingCategoryId]);

  useEffect(() => () => onBackInterceptChange?.(null), [onBackInterceptChange]);

  function navigateToSubcategories(cat: Category) {
    setViewingCategoryId(cat.id);
    setViewingCategoryLabel(cat.label);
  }

  function goBack() {
    setViewingCategoryId(null);
    setViewingCategoryLabel("");
  }

  function openCategoryCreate() {
    setCategoryFormVisible(true);
  }

  function openSubcategoryEdit(sub: Subcategory) {
    setSubcategoryFormMode("edit");
    setEditingSubcategory(sub);
    setSubcategoryFormVisible(true);
  }

  function handleSubcategoryDelete(sub: Subcategory) {
    Alert.alert(
      `Delete "${sub.label}"?`,
      "This subcategory will be hidden. Existing transactions using it are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setMutatingId(sub.id);
            try {
              await deleteSubcategory(userId, deviceId, sub.id);
              load();
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete subcategory");
            } finally {
              setMutatingId(null);
            }
          },
        },
      ],
    );
  }

  function handleSubcategoryFormSaved() {
    setSubcategoryFormVisible(false);
    setEditingSubcategory(undefined);
    load();
  }

  function closeSubcategoryForm() {
    setSubcategoryFormVisible(false);
    setEditingSubcategory(undefined);
  }

  function handleCategoryFormSaved() {
    setCategoryFormVisible(false);
    load();
  }

  const viewingCategory = viewingCategoryId
    ? categories.find((category) => category.id === viewingCategoryId)
    : undefined;
  const viewingSubs = viewingCategory?.subcategories ?? [];

  if (categoryFormVisible) {
    return (
      <CategoryFormScreen
        mode="create"
        userId={userId}
        deviceId={deviceId}
        onSaved={handleCategoryFormSaved}
        onCancel={() => {
          setCategoryFormVisible(false);
        }}
      />
    );
  }

  if (subcategoryFormVisible && viewingCategoryId) {
    return (
      <SubcategoryFormScreen
        mode={subcategoryFormMode}
        subcategory={editingSubcategory}
        categoryId={viewingCategoryId}
        categoryLabel={viewingCategoryLabel}
        categorySlug={viewingCategory?.slug ?? ""}
        categoryColor={viewingCategory?.color_hex}
        userId={userId}
        deviceId={deviceId}
        onSaved={handleSubcategoryFormSaved}
        onCancel={closeSubcategoryForm}
      />
    );
  }

  if (viewingCategoryId) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingTop: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to categories"
              onPress={goBack}
              hitSlop={8}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <ArrowLeft size={18} color={palette.ink} weight="bold" />
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: viewingCategory?.color_hex ?? DEFAULT_TAXONOMY_COLOR, alignItems: "center", justifyContent: "center" }}>
                <TaxonomyIcon iconKey={viewingCategory?.icon_key} size={21} color="#fff" weight="fill" />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 18, color: palette.ink }}>
                  {viewingCategoryLabel}
                </Text>
                <Text style={{ fontFamily: "Manrope", fontSize: 12, color: palette.mut, marginTop: 2 }}>
                  {viewingSubs.length} subcategor{viewingSubs.length === 1 ? "y" : "ies"}
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add subcategory"
              onPress={() => {
                setSubcategoryFormMode("create");
                setEditingSubcategory(undefined);
                setSubcategoryFormVisible(true);
              }}
              style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: palette.brand, alignItems: "center", justifyContent: "center" }}
            >
              <Plus size={18} color="#fff" weight="bold" />
            </Pressable>
          </View>
        </View>

        <View style={{ paddingTop: 20 }}>
          {loading ? (
            <ActivityIndicator color={palette.aqua600} style={{ marginTop: 40 }} />
          ) : viewingSubs.length === 0 ? (
            <Text style={{ fontFamily: "Manrope", color: palette.mut, textAlign: "center", marginTop: 40 }}>
              No subcategories yet
            </Text>
          ) : (
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: palette.line, overflow: "hidden", paddingHorizontal: 14 }}>
              {viewingSubs.map((sub) => (
                <SubcategoryRow
                  key={sub.id}
                  sub={sub}
                  mutatingId={mutatingId}
                  onEdit={openSubcategoryEdit}
                  onDelete={handleSubcategoryDelete}
                />
              ))}
            </View>
          )}
        </View>

      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ paddingTop: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 20, color: palette.ink }}>
          Categories
        </Text>
        <TourTarget id="taxonomy-create">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create category"
            onPress={openCategoryCreate}
            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: palette.brand, alignItems: "center", justifyContent: "center" }}
          >
            <Plus size={18} color="#fff" weight="bold" />
          </Pressable>
        </TourTarget>
      </View>

      <View style={{ paddingTop: 16 }}>
        <View
          style={{
            height: 46,
            borderRadius: 13,
            backgroundColor: "#E7E5DF",
            borderWidth: 1,
            borderColor: palette.line,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
            paddingHorizontal: 14,
          }}
        >
          <MagnifyingGlass size={17} color={palette.mut} />
          <TextInput
            placeholder="Search categories"
            placeholderTextColor={palette.mut}
            style={{ fontFamily: "Manrope", fontWeight: "500", fontSize: 14, color: palette.ink, flex: 1, height: 46 }}
            editable={false}
          />
        </View>
      </View>

      <View style={{ paddingTop: 16, gap: 12 }}>
        {loading ? (
          <ActivityIndicator color={palette.aqua600} style={{ marginTop: 40 }} />
        ) : error ? (
          <View style={{ alignItems: "center", marginTop: 40, gap: 8 }}>
            <Text style={{ fontFamily: "Manrope", color: palette.mut, textAlign: "center" }}>{error}</Text>
            <Pressable
              onPress={() => { load(); }}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: palette.aqua600 }}
            >
              <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13, color: "#fff" }}>Retry</Text>
            </Pressable>
          </View>
        ) : categories.length === 0 && incomeCategories.length === 0 ? (
          <View style={{ alignItems: "center", marginTop: 40 }}>
            <Text style={{ fontFamily: "Manrope", color: palette.mut }}>No categories yet</Text>
          </View>
        ) : (
          <>
            {categories.length > 0 && (
              <View style={{ gap: 8 }}>
                <SectionLabel>EXPENSE</SectionLabel>
                <View style={{ borderRadius: 16, borderWidth: 1, borderColor: palette.line, overflow: "hidden", paddingHorizontal: 14 }}>
                  {categories.map((category) => (
                    <CategoryRow
                      key={category.id}
                      category={category}
                      onNavigate={navigateToSubcategories}
                    />
                  ))}
                </View>
              </View>
            )}
            {incomeCategories.length > 0 && (
              <View style={{ gap: 8, marginTop: 8 }}>
                <SectionLabel>INCOME</SectionLabel>
                <View style={{ borderRadius: 16, borderWidth: 1, borderColor: palette.line, overflow: "hidden", paddingHorizontal: 14 }}>
                  {incomeCategories.map((category) => (
                    <IncomeCategoryRow key={category.id} category={category} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </View>

    </ScrollView>
  );
}
