import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-key";
const serviceRole = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userId: string;
let accountId: string;
let userClient: ReturnType<typeof createClient>;

async function setupUser() {
  const email = `odin-credit-reconciliation-${Date.now()}@example.com`;
  const password = "test-password-123";
  const { data: created, error: createError } = await serviceRole.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw new Error(`Failed to create test user: ${createError?.message}`);
  userId = created.user.id;
  await serviceRole.from("profiles").upsert({ user_id: userId });

  const { data: session, error: signInError } = await serviceRole.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw new Error(`Failed to sign in test user: ${signInError?.message}`);
  userClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });

  const { data: account, error: accountError } = await serviceRole
    .from("financial_accounts")
    .insert({ user_id: userId, name: "Test card", kind: "credit_card" })
    .select("id")
    .single();
  if (accountError || !account) throw new Error(`Failed to create test card: ${accountError?.message}`);
  accountId = account.id;

  const { error: detailsError } = await serviceRole.from("credit_card_details").insert({
    account_id: accountId,
    user_id: userId,
    credit_limit_centavos: 100_000,
    available_credit_centavos: 50_000,
    cutoff_day: 15,
    statement_day: 20,
  });
  if (detailsError) throw new Error(`Failed to create test card details: ${detailsError.message}`);

  const { error: preferenceError } = await serviceRole.from("credit_card_repayment_preferences").insert({
    account_id: accountId,
    user_id: userId,
    strategy: "pay_in_full",
  });
  if (preferenceError) throw new Error(`Failed to create test repayment preference: ${preferenceError.message}`);
}

async function cleanupUser() {
  if (userId) {
    await serviceRole.from("financial_accounts").delete().eq("user_id", userId);
    await serviceRole.from("profiles").delete().eq("user_id", userId);
    await serviceRole.auth.admin.deleteUser(userId);
  }
}

describe("issuer available-credit reconciliation RPC (integration)", () => {
  if (!process.env.RUN_INTEGRATION_TESTS) {
    it.skip("skipped - set RUN_INTEGRATION_TESTS=true to run", () => {});
    return;
  }

  beforeAll(() => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for integration tests");
    }
  });

  beforeEach(setupUser);
  afterEach(cleanupUser);

  it("rejects available credit above the persisted credit limit", async () => {
    const { error } = await userClient.rpc("apply_credit_card_sync_operation", {
      p_operation_id: crypto.randomUUID(),
      p_device_id: "integration-test-device",
      p_entity: "credit_card_details",
      p_record_id: accountId,
      p_operation_type: "update",
      p_base_version: 1,
      p_changed_fields: ["available_credit_centavos"],
      p_payload: { available_credit_centavos: 100_001 },
    });

    expect(error?.message).toContain("available credit cannot exceed the credit limit");

    const { data: details, error: detailsError } = await serviceRole
      .from("credit_card_details")
      .select("available_credit_centavos, version")
      .eq("account_id", accountId)
      .single();
    expect(detailsError).toBeNull();
    expect(details).toMatchObject({ available_credit_centavos: 50_000, version: 1 });
  }, 15_000);

  it("dispatches repayment-preference updates without evaluating an unavailable JSON function", async () => {
    const { data, error } = await userClient.rpc("apply_credit_card_sync_operation", {
      p_operation_id: crypto.randomUUID(),
      p_device_id: "integration-test-device",
      p_entity: "credit_card_repayment_preferences",
      p_record_id: accountId,
      p_operation_type: "update",
      p_base_version: 1,
      p_changed_fields: ["strategy"],
      p_payload: { strategy: "pay_minimum" },
    });

    expect(error).toBeNull();
    expect(data).toEqual([expect.objectContaining({ status: "applied", current_version: 2 })]);
  }, 15_000);
});
