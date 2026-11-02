import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";

describe("subcategory budget configuration sync validation", () => {
  it("accepts a nullable non-negative minimum amount update", async () => {
    await expect(prepareOperation({} as never, "user-1", {
      operation_id: "operation-1",
      entity: "subcategories",
      record_id: "subcategory-1",
      operation_type: "update",
      base_version: 1,
      changed_fields: ["minimum_amount_centavos"],
      payload: { minimum_amount_centavos: 5_000 },
    })).resolves.toMatchObject({ payload: { minimum_amount_centavos: 5_000 } });
  });

  it("accepts always-in-budget and fixed amount updates", async () => {
    await expect(prepareOperation({} as never, "user-1", {
      operation_id: "operation-2",
      entity: "subcategories",
      record_id: "subcategory-1",
      operation_type: "update",
      base_version: 1,
      changed_fields: ["always_in_budget", "fixed_amount_centavos"],
      payload: { always_in_budget: true, fixed_amount_centavos: 5_000 },
    })).resolves.toMatchObject({ payload: { always_in_budget: true, fixed_amount_centavos: 5_000 } });
  });

  it.each(["bowl-food","wine","t-shirt","house","armchair","first-aid","car","device-mobile","game-controller","graduation-cap","fork-knife","sparkle","tag","airplane","bank","basket","bus","camera","coffee","credit-card","dog","gift","heart","laptop","music-note","storefront","carrot","fish","bread","egg","cookie","orange","pill","stethoscope","tooth","eye","test-tube","hospital","heartbeat","shield-check","cake","ice-cream","hamburger","pizza","cooking-pot","tea-bag","beer-bottle","beer-stein","martini","cigarette","champagne","brandy","pants","dress","hoodie","sock","sneaker","baseball-cap","handbag","watch","lightning","drop","flame","wifi-high","key","wrench","plug","bed","washing-machine","broom","fan","oven","potted-plant","lightbulb","toolbox","syringe","thermometer","wheelchair","bandaids","brain","ambulance","bicycle","train","gas-pump","motorcycle","taxi","steering-wheel","truck","boat","phone","envelope","globe","sim-card","chat-circle","headphones","film-slate","ticket","palette","barbell","book-open","trophy","tent","pencil","notebook","calculator","certificate","backpack","student","scissors","paw-print","baby","diamond","scales","identification-card","wallet","coat-hanger"])("accepts a %s icon and color update", async (iconKey) => {
    await expect(prepareOperation({} as never, "user-1", {
      operation_id: "operation-visuals",
      entity: "subcategories",
      record_id: "subcategory-1",
      operation_type: "update",
      base_version: 1,
      changed_fields: ["icon_key", "color_hex"],
      payload: { icon_key: iconKey, color_hex: "#C2410C" },
    })).resolves.toMatchObject({ payload: { icon_key: iconKey, color_hex: "#C2410C" } });
  });

  it("rejects an unsupported icon", async () => {
    await expect(prepareOperation({} as never, "user-1", {
      operation_id: "operation-invalid-visual",
      entity: "subcategories",
      record_id: "subcategory-1",
      operation_type: "update",
      base_version: 1,
      changed_fields: ["icon_key"],
      payload: { icon_key: "not-an-icon" },
    })).rejects.toThrow("icon_key is invalid");
  });

  it("accepts clearing every saved Financial Plan rule value", async () => {
    await expect(prepareOperation({} as never, "user-1", {
      operation_id: "operation-3",
      entity: "subcategories",
      record_id: "subcategory-1",
      operation_type: "update",
      base_version: 1,
      changed_fields: ["minimum_amount_centavos", "fixed_amount_centavos", "always_in_budget"],
      payload: { minimum_amount_centavos: null, fixed_amount_centavos: null, always_in_budget: false },
    })).resolves.toMatchObject({ payload: { minimum_amount_centavos: null, fixed_amount_centavos: null, always_in_budget: false } });
  });
});
