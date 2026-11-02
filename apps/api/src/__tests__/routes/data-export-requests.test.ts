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

function mockAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: validUserId } },
    error: null,
  });
}

function mockInsertChain(result: object) {
  const mockSingle = jest.fn().mockReturnValue({ data: result, error: null });
  const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
  return jest.fn().mockReturnValue({ select: mockSelect });
}

function mockUpdateChain(result?: object) {
  const mockIn = jest.fn().mockReturnValue(result ?? {});
  const mockEq = jest.fn().mockReturnValue({ in: mockIn });
  return jest.fn().mockReturnValue({ eq: mockEq });
}

describe("GET /odin/api/data-export-requests", () => {
  it("returns the user's export requests", async () => {
    mockAuth();

    const requests = [
      { id: "id-1", status: "requested", requested_at: "2026-07-06T12:00:00Z" },
    ];
    const mockLimit = jest.fn().mockReturnValue({ data: requests, error: null });
    const mockOrder = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockEq = jest.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });

    const response = await request(app)
      .get("/odin/api/data-export-requests")
      .set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body.payload.requests).toEqual(requests);
  });

  it("returns 401 without authorization", async () => {
    const response = await request(app).get("/odin/api/data-export-requests");
    expect(response.status).toBe(401);
  });
});

describe("POST /odin/api/data-export-requests", () => {
  it("creates a data export request", async () => {
    mockAuth();

    const requestId = "00000000-0000-0000-0000-000000000020";
    const mockInsert = mockInsertChain({ id: requestId, status: "requested" });
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdateChain() });

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: { format: "json", reason: "user_request" } });

    expect(response.status).toBe(201);
    expect(response.body.payload.request).toEqual({
      id: requestId,
      status: "requested",
    });
  });

  it("cancels pending requests before creating a new one", async () => {
    mockAuth();

    let updateData: Record<string, unknown> | undefined;
    let updateFilter: Record<string, unknown> | undefined;
    let updateStatusFilter: string[] | undefined;

    const mockIn = jest.fn().mockImplementation((_col, values) => {
      updateStatusFilter = values as string[];
      return {};
    });
    const mockEq = jest.fn().mockImplementation((col, value) => {
      updateFilter = { [col]: value };
      return { in: mockIn };
    });
    const mockUpdate = jest.fn().mockImplementation((data) => {
      updateData = data as Record<string, unknown>;
      return { eq: mockEq };
    });

    const mockInsert = mockInsertChain({ id: "new-id", status: "requested" });
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate });

    await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: {} });

    expect(updateData).toEqual({ status: "cancelled" });
    expect(updateFilter).toEqual({ user_id: validUserId });
    expect(updateStatusFilter).toEqual(["requested", "processing"]);
  });

  it("creates a minimal export request without optional fields", async () => {
    mockAuth();

    const mockInsert = mockInsertChain({ id: "id", status: "requested" });
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdateChain() });

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(201);
  });

  it("returns 500 when cancel update fails", async () => {
    mockAuth();

    mockFrom.mockReturnValue({ update: mockUpdateChain({ error: { message: "Cancel failed" } }) });

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(500);
  });

  it("scopes creation by user_id", async () => {
    mockAuth();

    let insertData: Record<string, unknown> | undefined;
    const mockSingle = jest.fn().mockReturnValue({
      data: { id: "id", status: "requested" },
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = jest.fn().mockImplementation((data) => {
      insertData = data as Record<string, unknown>;
      return { select: mockSelect };
    });
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdateChain() });

    await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: {} });

    expect(insertData).toMatchObject({ user_id: validUserId });
  });

  it("returns 400 for array payload", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: ["format", "json"] });

    expect(response.status).toBe(400);
  });

  it("returns 400 for missing payload", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({});

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid format", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: { format: "xml" } });

    expect(response.status).toBe(400);
  });

  it("returns 400 for non-string reason", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: { reason: 123 } });

    expect(response.status).toBe(400);
  });

  it("returns 401 without authorization header", async () => {
    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .send({ payload: {} });

    expect(response.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid token" },
    });

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader("bad-token"))
      .send({ payload: {} });

    expect(response.status).toBe(401);
  });

  it("returns 500 when database insert fails", async () => {
    mockAuth();

    const mockSingle = jest.fn().mockReturnValue({
      data: null,
      error: { message: "Database error" },
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdateChain() });

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(500);
  });
});
