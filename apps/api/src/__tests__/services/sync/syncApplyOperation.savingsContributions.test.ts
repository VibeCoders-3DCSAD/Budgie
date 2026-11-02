import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";
const contribution = { savings_goal_id: "7c000000-0000-4000-8000-0000000000c1", activity_id: "7c000000-0000-4000-8000-0000000000d1" };
const query = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: { id: "linked", transaction_type: "transfer" }, error: null }) };
const supabase = { from: jest.fn(() => query) };
const operation = { operation_id: "operation", entity: "transactions", record_id: "record", operation_type: "create" as const, base_version: null, changed_fields: [], payload: { transaction_type: "transfer", transaction_date: "2026-10-21", amount_centavos: 10000, source_account_id: "linked", destination_account_id: "linked", savings_goal_contribution: contribution } };
describe("goal contribution transaction sync", () => {
  beforeEach(() => { supabase.from.mockReturnValue(query); query.select.mockReturnThis(); query.eq.mockReturnThis(); query.maybeSingle.mockResolvedValue({ data: { id: "linked", transaction_type: "transfer" }, error: null }); });
  it("accepts a marked allocation in the linked account and preserves its activity identity", async () => {
    await expect(prepareOperation(supabase as never, "user", operation)).resolves.toMatchObject({ payload: { savings_goal_contribution: contribution, source_account_id: "linked", destination_account_id: "linked" } });
  });
  it("retains the distinct-account requirement for ordinary transfers", async () => {
    const { savings_goal_contribution: _ignored, ...payload } = operation.payload;
    await expect(prepareOperation(supabase as never, "user", { ...operation, payload })).rejects.toThrow("source and destination accounts must differ");
  });
  it("rejects malformed identities and contribution markers on an expense", async () => {
    await expect(prepareOperation(supabase as never, "user", { ...operation, payload: { ...operation.payload, savings_goal_contribution: { ...contribution, unexpected: true } } })).rejects.toThrow("invalid savings goal contribution");
    await expect(prepareOperation(supabase as never, "user", { ...operation, payload: { ...operation.payload, transaction_type: "expense" } })).rejects.toThrow("savings contribution requires a transfer");
  });
  it("preserves the expense withdrawal split when updating the expense amount", async () => {
    query.maybeSingle.mockResolvedValue({ data: { id: "expense", transaction_type: "expense" }, error: null });
    const withdrawals = [{ id: contribution.activity_id, savings_goal_id: contribution.savings_goal_id, amount_centavos: 10000 }];
    await expect(prepareOperation(supabase as never, "user", { ...operation, operation_type: "update", base_version: 1, changed_fields: ["amount_centavos"], payload: { amount_centavos: 20000, savings_goal_withdrawals: withdrawals } })).resolves.toMatchObject({ payload: { savings_goal_withdrawals: withdrawals } });
  });
  it("accepts the contribution identity alongside an update", async () => {
    await expect(prepareOperation(supabase as never, "user", { ...operation, operation_type: "update", base_version: 1, changed_fields: ["amount_centavos"], payload: { amount_centavos: 20000, savings_goal_contribution: contribution } })).resolves.toMatchObject({ payload: { savings_goal_contribution: contribution } });
  });
});
