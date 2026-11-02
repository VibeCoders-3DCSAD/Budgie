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

describe("POST /odin/api/consents", () => {
  function mockAuth() {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
  }

  it("records a consent", async () => {
    mockAuth();

    const mockSingle = jest.fn().mockReturnValue({
      data: { consent_kind: "terms", status: "granted", version: "2026-06", recorded_at: "2026-07-06T12:00:00Z" },
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert });

    const response = await request(app)
      .post("/odin/api/consents")
      .set(authHeader())
      .send({ payload: { consent_kind: "terms", status: "granted", version: "2026-06" } });

    expect(response.status).toBe(201);
    expect(response.body.payload.consent).toEqual({
      consent_kind: "terms",
      status: "granted",
      version: "2026-06",
      recorded_at: "2026-07-06T12:00:00Z",
    });
  });

  it("scopes consent by user_id", async () => {
    mockAuth();

    let insertData: Record<string, unknown> | undefined;
    const mockSingle = jest.fn().mockReturnValue({
      data: { consent_kind: "terms", status: "granted", version: "2026-06", recorded_at: "2026-07-06T12:00:00Z" },
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = jest.fn().mockImplementation((data) => {
      insertData = data as Record<string, unknown>;
      return { select: mockSelect };
    });
    mockFrom.mockReturnValue({ insert: mockInsert });

    await request(app)
      .post("/odin/api/consents")
      .set(authHeader())
      .send({ payload: { consent_kind: "terms", status: "granted", version: "2026-06" } });

    expect(insertData).toMatchObject({ user_id: validUserId });
  });

  it("records a withdrawal with a server-set withdrawal time", async () => {
    mockAuth();

    let insertData: Record<string, unknown> | undefined;
    const mockSingle = jest.fn().mockReturnValue({
      data: { consent_kind: "terms", status: "withdrawn", version: "2026-06", recorded_at: "2026-07-06T12:00:00Z" },
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = jest.fn().mockImplementation((data) => {
      insertData = data as Record<string, unknown>;
      return { select: mockSelect };
    });
    mockFrom.mockReturnValue({ insert: mockInsert });

    const response = await request(app)
      .post("/odin/api/consents")
      .set(authHeader())
      .send({ payload: { consent_kind: "terms", status: "withdrawn", version: "2026-06", withdrawn_at: "2000-01-01T00:00:00Z" } });

    expect(response.status).toBe(201);
    expect(insertData?.status).toBe("withdrawn");
    expect(typeof insertData?.withdrawn_at).toBe("string");
    expect(insertData?.withdrawn_at).not.toBe("2000-01-01T00:00:00Z");
    expect(Number.isNaN(Date.parse(insertData?.withdrawn_at as string))).toBe(false);
  });

  it("leaves the withdrawal time empty on a grant", async () => {
    mockAuth();

    let insertData: Record<string, unknown> | undefined;
    const mockSingle = jest.fn().mockReturnValue({ data: {}, error: null });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = jest.fn().mockImplementation((data) => {
      insertData = data as Record<string, unknown>;
      return { select: mockSelect };
    });
    mockFrom.mockReturnValue({ insert: mockInsert });

    await request(app)
      .post("/odin/api/consents")
      .set(authHeader())
      .send({ payload: { consent_kind: "terms", status: "granted", version: "2026-06" } });

    expect(insertData?.withdrawn_at).toBeNull();
  });

  it("returns 400 for missing payload", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/consents")
      .set(authHeader())
      .send({});

    expect(response.status).toBe(400);
  });

  it("returns 400 for array payload", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/consents")
      .set(authHeader())
      .send({ payload: ["terms", "granted"] });

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid consent_kind", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/consents")
      .set(authHeader())
      .send({ payload: { consent_kind: "invalid_kind", status: "granted", version: "2026-06" } });

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid status", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/consents")
      .set(authHeader())
      .send({ payload: { consent_kind: "terms", status: "invalid_status", version: "2026-06" } });

    expect(response.status).toBe(400);
  });

  it("returns 400 for empty version", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/consents")
      .set(authHeader())
      .send({ payload: { consent_kind: "terms", status: "granted", version: "" } });

    expect(response.status).toBe(400);
  });

  it("returns 401 without authorization header", async () => {
    const response = await request(app)
      .post("/odin/api/consents")
      .send({ payload: { consent_kind: "terms", status: "granted", version: "2026-06" } });

    expect(response.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid token" },
    });

    const response = await request(app)
      .post("/odin/api/consents")
      .set(authHeader("bad-token"))
      .send({ payload: { consent_kind: "terms", status: "granted", version: "2026-06" } });

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
    mockFrom.mockReturnValue({ insert: mockInsert });

    const response = await request(app)
      .post("/odin/api/consents")
      .set(authHeader())
      .send({ payload: { consent_kind: "terms", status: "granted", version: "2026-06" } });

    expect(response.status).toBe(500);
  });
});
