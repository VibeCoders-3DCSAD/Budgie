import { jest } from "@jest/globals";
import request from "supertest";

jest.mock("../../lib/supabase.js", () => {
  const mockRpc = jest.fn<() => Promise<{ data: unknown; error: unknown }>>();
  const mockGetUser = jest.fn();
  const mockClient = {
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  };

  return {
    supabase: mockClient,
    createAnonAuthClient: () => mockClient,
    createAuthenticatedSupabaseClient: () => mockClient,
    getServiceRoleClient: () => mockClient,
  };
});

import app from "../../app.js";
import { supabase } from "../../lib/supabase.js";

const mockRpc = supabase.rpc as jest.Mock;
const mockGetUser = supabase.auth.getUser as jest.Mock;

const cronSecret = "test-cron-secret-123";

describe("POST /odin/api/recurring/run", () => {
  beforeEach(() => {
    process.env.RECURRING_CRON_SECRET = cronSecret;
    mockRpc.mockReset();
  });

  afterAll(() => {
    delete process.env.RECURRING_CRON_SECRET;
  });

  it("returns 200 and engine results with valid cron secret", async () => {
    mockRpc.mockResolvedValue({
      data: [
        { out_user_id: "u1", out_occ_date: "2024-01-15", out_status: "posted" },
      ],
      error: null,
    });

    const response = await request(app)
      .post("/odin/api/recurring/run")
      .set("x-cron-secret", cronSecret)
      .send({ payload: { as_of: "2024-01-15", limit: 50 } });

    expect(response.status).toBe(200);
    expect(response.body.payload.engineResults).toHaveLength(1);
    expect(response.body.payload.engineResults[0]).toMatchObject({
      out_occ_date: "2024-01-15",
      out_status: "posted",
    });
  });

  it("returns 403 when x-cron-secret is missing", async () => {
    const response = await request(app).post("/odin/api/recurring/run");

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/secret/i);
  });

  it("returns 403 when x-cron-secret is wrong", async () => {
    const response = await request(app)
      .post("/odin/api/recurring/run")
      .set("x-cron-secret", "wrong-secret");

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/secret/i);
  });

  it("returns 403 when user Bearer token is used instead of cron secret", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-id" } },
      error: null,
    });

    const response = await request(app)
      .post("/odin/api/recurring/run")
      .set("authorization", "Bearer valid-user-token")
      .set("x-cron-secret", cronSecret);

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/user session/i);
  });

  it("returns 500 when RECURRING_CRON_SECRET is not configured", async () => {
    delete process.env.RECURRING_CRON_SECRET;

    const response = await request(app)
      .post("/odin/api/recurring/run")
      .set("x-cron-secret", cronSecret);

    expect(response.status).toBe(500);
    expect(response.body.message).toMatch(/not configured/i);
  });

  it("returns 500 when the RPC call fails", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error("RPC timeout"),
    });

    const response = await request(app)
      .post("/odin/api/recurring/run")
      .set("x-cron-secret", cronSecret)
      .send({ payload: { as_of: "2024-01-15" } });

    expect(response.status).toBe(500);
  });

  it("calls the RPC with correct parameters", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await request(app)
      .post("/odin/api/recurring/run")
      .set("x-cron-secret", cronSecret)
      .send({ payload: { as_of: "2024-01-15", limit: 100 } });

    expect(mockRpc).toHaveBeenCalledWith("run_recurring_transaction_engine", {
      p_as_of: "2024-01-15",
      p_limit: 100,
    });
  });

  it("accepts empty payload with defaults", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await request(app)
      .post("/odin/api/recurring/run")
      .set("x-cron-secret", cronSecret);

    expect(mockRpc).toHaveBeenCalledWith("run_recurring_transaction_engine", {});
  });
});

describe("POST /odin/api/recurring/run/me", () => {
  const validUserId = "00000000-0000-0000-0000-000000000001";

  beforeEach(() => {
    mockRpc.mockReset();
    mockGetUser.mockReset();
  });

  it("returns 200 and scoped engine results for valid Bearer token", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: [
        { out_user_id: validUserId, out_occ_date: "2024-01-15", out_status: "posted" },
      ],
      error: null,
    });

    const response = await request(app)
      .post("/odin/api/recurring/run/me")
      .set("authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.payload.engineResults).toHaveLength(1);
    expect(response.body.payload.engineResults[0]).toMatchObject({
      out_user_id: validUserId,
      out_occ_date: "2024-01-15",
      out_status: "posted",
    });
  });

  it("returns 401 when no Bearer token", async () => {
    const response = await request(app).post("/odin/api/recurring/run/me");

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/authorization header/i);
  });

  it("returns 401 when Bearer token is empty", async () => {
    const response = await request(app)
      .post("/odin/api/recurring/run/me")
      .set("authorization", "Bearer ");

    expect(response.status).toBe(401);
  });

  it("returns 401 when token is invalid or expired", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await request(app)
      .post("/odin/api/recurring/run/me")
      .set("authorization", "Bearer expired-token");

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/invalid|expired/i);
  });

  it("scopes RPC call to the authenticated user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
    mockRpc.mockResolvedValue({ data: [], error: null });

    await request(app)
      .post("/odin/api/recurring/run/me")
      .set("authorization", "Bearer valid-token");

    expect(mockRpc).toHaveBeenCalledWith("run_recurring_transaction_engine", {
      p_user_id: validUserId,
    });
  });

  it("returns 500 when the RPC call fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error("RPC timeout"),
    });

    const response = await request(app)
      .post("/odin/api/recurring/run/me")
      .set("authorization", "Bearer valid-token");

    expect(response.status).toBe(500);
  });
});
