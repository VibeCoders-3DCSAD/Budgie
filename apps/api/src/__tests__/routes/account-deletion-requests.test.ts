import { jest } from "@jest/globals";
import request from "supertest";

jest.mock("../../lib/supabase.js", () => {
  const mockClient = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  };

  return {
    supabase: mockClient,
    createAnonAuthClient: () => mockClient,
    createAuthenticatedSupabaseClient: () => mockClient,
  };
});

import app from "../../app.js";
import { supabase } from "../../lib/supabase.js";
import { authHeader, validAccessToken, validUserId } from "../helpers/fixtures.js";

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

function createActiveChain(data?: unknown[], error: unknown = null) {
  const limit = jest.fn().mockResolvedValue({ data: error ? null : data ?? [], error });
  const in_ = jest.fn().mockReturnValue({ limit });
  const eq = jest.fn().mockReturnValue({ in: in_ });
  const select = jest.fn().mockReturnValue({ eq });
  return { select, eq, in: in_, limit };
}

function mockActive(data?: unknown[]) {
  const chain = createActiveChain(data);
  mockFrom.mockReturnValue({ select: chain.select });
  return chain;
}

function mockActiveThenInsert(insertResult: Record<string, unknown> | null, insertError: unknown = null) {
  const active = createActiveChain();
  const single = jest.fn().mockReturnValue({ data: insertResult, error: insertError });
  const select = jest.fn().mockReturnValue({ single });
  const insert = jest.fn().mockReturnValue({ select });
  mockFrom.mockImplementation((table: string) => {
    if (table === "account_deletion_requests" && active.select.mock.calls.length === 0) {
      return { select: active.select };
    }
    return { insert };
  });
  return { active, insert };
}

describe("POST /odin/api/account-deletion-requests", () => {
  function mockAuth() {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
  }

  it("creates a deletion request with reason", async () => {
    mockAuth();

    const requestId = "00000000-0000-0000-0000-000000000030";
    const scheduledDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const insertResult = { id: requestId, status: "requested", requested_at: new Date().toISOString(), scheduled_delete_at: scheduledDate };

    mockActiveThenInsert(insertResult);

    const response = await request(app)
      .post("/odin/api/account-deletion-requests")
      .set(authHeader())
      .send({ payload: { reason: "moving on" } });

    expect(response.status).toBe(201);
    expect(response.body.payload.request).toMatchObject({
      id: requestId,
      status: "requested",
    });
  });

  it("creates a minimal deletion request without reason", async () => {
    mockAuth();

    const requestId = "00000000-0000-0000-0000-000000000031";
    const scheduledDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const insertResult = { id: requestId, status: "requested", requested_at: new Date().toISOString(), scheduled_delete_at: scheduledDate };

    mockActiveThenInsert(insertResult);

    const response = await request(app)
      .post("/odin/api/account-deletion-requests")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(201);
  });

  it("rejects duplicate active deletion request", async () => {
    mockAuth();

    mockActive([{ id: "existing-id" }]);

    const response = await request(app)
      .post("/odin/api/account-deletion-requests")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Conflict");
  });

  it("answers 409 when a concurrent submission created the active request first", async () => {
    mockAuth();
    mockActiveThenInsert(null, { code: "23505", message: "duplicate key value violates unique constraint" });

    const response = await request(app)
      .post("/odin/api/account-deletion-requests")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Conflict");
  });

  it("does not create a request when the active-request lookup fails", async () => {
    mockAuth();
    const active = createActiveChain(undefined, { code: "57014", message: "canceling statement due to statement timeout" });
    const insert = jest.fn();
    mockFrom.mockImplementation(() => ({ select: active.select, insert }));

    const response = await request(app)
      .post("/odin/api/account-deletion-requests")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(500);
    expect(insert).not.toHaveBeenCalled();
  });

  it("scopes creation by user_id", async () => {
    mockAuth();

    let activeEqUserId: string | undefined;

    const activeLimit = jest.fn().mockResolvedValue({ data: [], error: null });
    const activeIn = jest.fn().mockReturnValue({ limit: activeLimit });
    const activeEq = jest.fn().mockImplementation((_field: string, value: string) => {
      activeEqUserId = value;
      return { in: activeIn };
    });
    const activeSelect = jest.fn().mockReturnValue({ eq: activeEq });

    const single = jest.fn().mockReturnValue({
      data: { id: "id", status: "requested", requested_at: new Date().toISOString(), scheduled_delete_at: new Date().toISOString() },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });

    mockFrom.mockImplementation((table: string) => {
      if (table === "account_deletion_requests" && !activeSelect.mock.calls.length) {
        return { select: activeSelect };
      }
      return { insert };
    });

    await request(app)
      .post("/odin/api/account-deletion-requests")
      .set(authHeader())
      .send({ payload: {} });

    expect(activeEqUserId).toBe(validUserId);
  });

  it("returns 400 for array payload", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/account-deletion-requests")
      .set(authHeader())
      .send({ payload: ["reason"] });

    expect(response.status).toBe(400);
  });

  it("returns 400 for missing payload", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/account-deletion-requests")
      .set(authHeader())
      .send({});

    expect(response.status).toBe(400);
  });

  it("returns 400 for non-string reason", async () => {
    mockAuth();
    mockActive();

    const response = await request(app)
      .post("/odin/api/account-deletion-requests")
      .set(authHeader())
      .send({ payload: { reason: 123 } });

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid scheduled_delete_at", async () => {
    mockAuth();
    mockActive();

    const response = await request(app)
      .post("/odin/api/account-deletion-requests")
      .set(authHeader())
      .send({ payload: { scheduled_delete_at: "not-a-date" } });

    expect(response.status).toBe(400);
  });

  it("returns 400 for scheduled_delete_at less than 30 days", async () => {
    mockAuth();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    mockActive();

    const response = await request(app)
      .post("/odin/api/account-deletion-requests")
      .set(authHeader())
      .send({ payload: { scheduled_delete_at: tomorrow.toISOString() } });

    expect(response.status).toBe(400);
  });

  it("returns 401 without authorization header", async () => {
    const response = await request(app)
      .post("/odin/api/account-deletion-requests")
      .send({ payload: {} });

    expect(response.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid token" },
    });

    const response = await request(app)
      .post("/odin/api/account-deletion-requests")
      .set(authHeader("bad-token"))
      .send({ payload: {} });

    expect(response.status).toBe(401);
  });

  it("returns 500 when database insert fails", async () => {
    mockAuth();

    const active = createActiveChain();
    const single = jest.fn().mockReturnValue({
      data: null,
      error: { message: "Database error" },
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });

    mockFrom.mockImplementation((table: string) => {
      if (table === "account_deletion_requests" && active.select.mock.calls.length === 0) {
        return { select: active.select };
      }
      return { insert };
    });

    const response = await request(app)
      .post("/odin/api/account-deletion-requests")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(500);
  });
});

describe("POST /odin/api/account-deletion-requests/:id/confirm", () => {
  function mockAuth() {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
  }

  it("confirms a deletion request", async () => {
    mockAuth();

    const requestId = "00000000-0000-0000-0000-000000000030";
    const confirmedAt = new Date().toISOString();
    const scheduledDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const mockSingle = jest.fn().mockReturnValue({
      data: { id: requestId, status: "processing", confirmed_at: confirmedAt, scheduled_delete_at: scheduledDate },
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: mockSelect,
          }),
        }),
      }),
    });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const response = await request(app)
      .post(`/odin/api/account-deletion-requests/${requestId}/confirm`)
      .set(authHeader())
      .send({ payload: { confirmation: true } });

    expect(response.status).toBe(200);
    expect(response.body.payload.request).toMatchObject({
      id: requestId,
      status: "processing",
    });
  });

  it("returns 400 when confirmation is not true", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/account-deletion-requests/some-id/confirm")
      .set(authHeader())
      .send({ payload: { confirmation: false } });

    expect(response.status).toBe(400);
  });

  it("returns 400 when confirmation is missing", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/account-deletion-requests/some-id/confirm")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(400);
  });

  it("scopes update by id, user_id, and status", async () => {
    mockAuth();

    const requestId = "test-id";
    const eqFields: string[] = [];

    const mockSingle = jest.fn().mockReturnValue({
      data: { id: requestId, status: "processing", confirmed_at: new Date().toISOString(), scheduled_delete_at: new Date().toISOString() },
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });

    const eqFn = jest.fn((field: string) => {
      eqFields.push(field);
      return { eq: eqFn, select: mockSelect };
    });

    const mockUpdate = jest.fn().mockReturnValue({ eq: eqFn });
    mockFrom.mockReturnValue({ update: mockUpdate });

    await request(app)
      .post(`/odin/api/account-deletion-requests/${requestId}/confirm`)
      .set(authHeader())
      .send({ payload: { confirmation: true } });

    expect(eqFields).toContain("id");
    expect(eqFields).toContain("user_id");
    expect(eqFields).toContain("status");
  });

  it("returns 404 when request not found", async () => {
    mockAuth();

    const mockSingle = jest.fn().mockReturnValue({
      data: null,
      error: { message: "Not found" },
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockEq = jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ select: mockSelect }) }) });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const response = await request(app)
      .post("/odin/api/account-deletion-requests/unknown-id/confirm")
      .set(authHeader())
      .send({ payload: { confirmation: true } });

    expect(response.status).toBe(404);
  });

  it("returns 401 without authorization header", async () => {
    const response = await request(app)
      .post("/odin/api/account-deletion-requests/some-id/confirm")
      .send({ payload: { confirmation: true } });

    expect(response.status).toBe(401);
  });
});

describe("POST /odin/api/account-deletion-requests/:id/cancel", () => {
  function mockAuth() {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
  }

  it("cancels a deletion request with reason", async () => {
    mockAuth();

    const requestId = "00000000-0000-0000-0000-000000000030";
    const cancelledAt = new Date().toISOString();

    const mockSingle = jest.fn().mockReturnValue({
      data: { id: requestId, status: "cancelled", cancelled_at: cancelledAt },
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });

    const mockIn = jest.fn().mockReturnValue({ select: mockSelect });
    const mockEqUserId = jest.fn().mockReturnValue({ in: mockIn });
    const mockEqId = jest.fn().mockReturnValue({ eq: mockEqUserId });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEqId });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const response = await request(app)
      .post(`/odin/api/account-deletion-requests/${requestId}/cancel`)
      .set(authHeader())
      .send({ payload: { reason: "changed my mind" } });

    expect(response.status).toBe(200);
    expect(response.body.payload.request).toMatchObject({
      id: requestId,
      status: "cancelled",
    });
  });

  it("cancels without reason", async () => {
    mockAuth();

    const requestId = "test-id";
    const mockSingle = jest.fn().mockReturnValue({
      data: { id: requestId, status: "cancelled", cancelled_at: new Date().toISOString() },
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockIn = jest.fn().mockReturnValue({ select: mockSelect });
    const mockEqUserId = jest.fn().mockReturnValue({ in: mockIn });
    const mockEqId = jest.fn().mockReturnValue({ eq: mockEqUserId });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEqId });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const response = await request(app)
      .post(`/odin/api/account-deletion-requests/${requestId}/cancel`)
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(200);
  });

  it("scopes cancel by id, user_id, and active statuses", async () => {
    mockAuth();

    const requestId = "test-id";
    const eqCalls: string[] = [];
    let inStatuses: string[] = [];

    const mockSingle = jest.fn().mockReturnValue({
      data: { id: requestId, status: "cancelled", cancelled_at: new Date().toISOString() },
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockIn = jest.fn().mockImplementation((_field: string, values: string[]) => {
      inStatuses = values;
      return { select: mockSelect };
    });
    const mockEqUserId = jest.fn().mockImplementation((field: string, value: string) => {
      eqCalls.push(`${field}=${value}`);
      return { in: mockIn };
    });
    const mockEqId = jest.fn().mockImplementation((field: string, value: string) => {
      eqCalls.push(`${field}=${value}`);
      return { eq: mockEqUserId };
    });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEqId });
    mockFrom.mockReturnValue({ update: mockUpdate });

    await request(app)
      .post(`/odin/api/account-deletion-requests/${requestId}/cancel`)
      .set(authHeader())
      .send({ payload: { reason: "changed my mind" } });

    expect(eqCalls).toContain(`id=${requestId}`);
    expect(eqCalls).toContain(`user_id=${validUserId}`);
    expect(inStatuses).toEqual(["requested", "processing"]);
  });

  it("returns 400 for non-string reason", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/account-deletion-requests/some-id/cancel")
      .set(authHeader())
      .send({ payload: { reason: 123 } });

    expect(response.status).toBe(400);
  });

  it("returns 404 when request not found", async () => {
    mockAuth();

    const mockSingle = jest.fn().mockReturnValue({
      data: null,
      error: { message: "Not found" },
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockIn = jest.fn().mockReturnValue({ select: mockSelect });
    const mockEqUserId = jest.fn().mockReturnValue({ in: mockIn });
    const mockEqId = jest.fn().mockReturnValue({ eq: mockEqUserId });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEqId });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const response = await request(app)
      .post("/odin/api/account-deletion-requests/unknown-id/cancel")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(404);
  });

  it("returns 401 without authorization header", async () => {
    const response = await request(app)
      .post("/odin/api/account-deletion-requests/some-id/cancel")
      .send({ payload: {} });

    expect(response.status).toBe(401);
  });


});
