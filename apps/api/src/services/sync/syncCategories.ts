import { SYNC_RPCS } from "./constants/entities.js";
import {
  CATEGORY_CREATE_FIELDS,
  CATEGORY_UPDATE_FIELDS,
  COLOR_HEX_PATTERN,
  SUBCATEGORY_CREATE_FIELDS,
  SUBCATEGORY_UPDATE_FIELDS,
  TAXONOMY_ICON_KEYS,
} from "./constants/taxonomy.js";
import {
  allowedPayload,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireString,
  validateUpdateFieldTypes,
  type EntitySyncTable,
  type Payload,
  type SyncContext,
} from "./syncValidation.js";

function validateTaxonomyVisuals(payload: Payload): void {
  if (payload.icon_key !== undefined && (typeof payload.icon_key !== "string" || !TAXONOMY_ICON_KEYS.has(payload.icon_key))) {
    throw new Error("icon_key is invalid");
  }
  if (payload.color_hex !== undefined && (typeof payload.color_hex !== "string" || !COLOR_HEX_PATTERN.test(payload.color_hex))) {
    throw new Error("color_hex must be a six-digit hex color");
  }
}

function validateNonNegative(payload: Payload, fields: string[]): void {
  for (const field of fields) {
    const val = payload[field];
    if (val !== undefined && val !== null && typeof val === "number" && val < 0) {
      throw new Error(`${field} must be >= 0`);
    }
  }
}

function validateMinMaxOrdering(payload: Payload, minField: string, maxField: string): void {
  const minVal = payload[minField] as number | undefined;
  const maxVal = payload[maxField] as number | undefined;
  if (minVal !== undefined && minVal !== null && maxVal !== undefined && maxVal !== null && minVal > maxVal) {
    throw new Error(`${minField} must be <= ${maxField}`);
  }
}

// Fields shared by category and subcategory creates.
function validateTaxonomyFields(sanitized: Payload): void {
  requireString(sanitized, "slug");
  requireString(sanitized, "label");
  requireString(sanitized, "description");
  optionalString(sanitized, "short_label");
  validateTaxonomyVisuals(sanitized);
  optionalBoolean(sanitized, "is_filipino_context");
}

function validateBudgetAmounts(sanitized: Payload): void {
  optionalNumber(sanitized, "minimum_amount_centavos");
  optionalBoolean(sanitized, "always_in_budget");
  optionalNumber(sanitized, "fixed_amount_centavos");
  validateNonNegative(sanitized, ["minimum_amount_centavos", "fixed_amount_centavos"]);
  validateMinMaxOrdering(sanitized, "minimum_amount_centavos", "fixed_amount_centavos");
  optionalNumber(sanitized, "sort_order");
}

function validateCategoryCreate(payload: Payload): Payload {
  const sanitized = allowedPayload(payload, CATEGORY_CREATE_FIELDS);
  validateTaxonomyFields(sanitized);
  validateBudgetAmounts(sanitized);
  return sanitized;
}

async function validateSubcategoryCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, SUBCATEGORY_CREATE_FIELDS);
  requireString(sanitized, "kind");
  if (!["income", "expense", "transfer_adjustment"].includes(sanitized.kind as string)) {
    throw new Error("kind must be income, expense, or transfer_adjustment");
  }
  validateTaxonomyFields(sanitized);
  optionalBoolean(sanitized, "is_protected");
  validateBudgetAmounts(sanitized);

  if (sanitized.kind === "expense") {
    requireString(sanitized, "category_id");
    const { data: category, error } = await supabase
      .from("categories")
      .select("id")
      .eq("id", sanitized.category_id as string)
      .eq("deleted", false)
      .eq("is_active", true)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`category_id validation failed: ${error.message}`);
    if (!category) throw new Error("category_id does not reference an accessible active category");
  } else if (sanitized.category_id !== undefined && sanitized.category_id !== null) {
    throw new Error("category_id must not be set for non-expense subcategories");
  }

  sanitized.category_id = sanitized.kind === "expense" ? sanitized.category_id : null;
  return sanitized;
}

function validateTaxonomyUpdate(payload: Payload, fields: Set<string>): Payload {
  const sanitized = allowedPayload(payload, fields);
  validateTaxonomyVisuals(sanitized);
  validateUpdateFieldTypes(sanitized);
  return sanitized;
}

export const syncCategories: EntitySyncTable = {
  categories: {
    rpc: SYNC_RPCS.default,
    create: (_ctx, payload) => validateCategoryCreate(payload),
    update: (_ctx, payload) => validateTaxonomyUpdate(payload, CATEGORY_UPDATE_FIELDS),
  },
  subcategories: {
    rpc: SYNC_RPCS.default,
    create: validateSubcategoryCreate,
    update: (_ctx, payload) => validateTaxonomyUpdate(payload, SUBCATEGORY_UPDATE_FIELDS),
  },
};
