export const TAXONOMY_ICON_KEYS = new Set([
  "bowl-food", "wine", "t-shirt", "house", "armchair", "first-aid",
  "car", "device-mobile", "game-controller", "graduation-cap", "fork-knife",
  "sparkle", "tag", "airplane", "bank", "basket", "bus", "camera", "coffee",
  "credit-card", "dog", "gift", "heart", "laptop", "music-note", "storefront",
  "carrot", "fish", "bread", "egg", "cookie", "orange", "pill", "stethoscope", "tooth",
  "eye", "test-tube", "hospital", "heartbeat", "shield-check",
  "cake", "ice-cream", "hamburger", "pizza", "cooking-pot", "tea-bag",
  "beer-bottle", "beer-stein", "martini", "cigarette", "champagne", "brandy",
  "pants", "dress", "hoodie", "sock", "sneaker", "baseball-cap",
  "handbag", "watch", "lightning", "drop", "flame", "wifi-high",
  "key", "wrench", "plug", "bed", "washing-machine", "broom",
  "fan", "oven", "potted-plant", "lightbulb", "toolbox", "syringe",
  "thermometer", "wheelchair", "bandaids", "brain", "ambulance", "bicycle",
  "train", "gas-pump", "motorcycle", "taxi", "steering-wheel", "truck",
  "boat", "phone", "envelope", "globe", "sim-card", "chat-circle",
  "headphones", "film-slate", "ticket", "palette", "barbell", "book-open",
  "trophy", "tent", "pencil", "notebook", "calculator", "certificate",
  "backpack", "student", "scissors", "paw-print", "baby", "diamond",
  "scales", "identification-card", "wallet", "coat-hanger",
]);

export const COLOR_HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export const CATEGORY_CREATE_FIELDS = new Set([
  "slug",
  "label",
  "short_label",
  "description",
  "icon_key",
  "color_hex",
  "is_filipino_context",
  "minimum_amount_centavos",
  "always_in_budget",
  "fixed_amount_centavos",
  "sort_order",
]);

export const CATEGORY_UPDATE_FIELDS = new Set([
  "label",
  "short_label",
  "description",
  "icon_key",
  "color_hex",
  "is_filipino_context",
  "minimum_amount_centavos",
  "always_in_budget",
  "fixed_amount_centavos",
  "sort_order",
  "is_active",
]);

export const SUBCATEGORY_CREATE_FIELDS = new Set([
  "category_id",
  "slug",
  "kind",
  "label",
  "short_label",
  "description",
  "icon_key",
  "color_hex",
  "is_filipino_context",
  "is_protected",
  "minimum_amount_centavos",
  "always_in_budget",
  "fixed_amount_centavos",
  "sort_order",
]);

export const SUBCATEGORY_UPDATE_FIELDS = new Set([
  "label",
  "slug",
  "short_label",
  "description",
  "icon_key",
  "color_hex",
  "is_filipino_context",
  "is_protected",
  "minimum_amount_centavos",
  "always_in_budget",
  "fixed_amount_centavos",
  "is_active",
]);
