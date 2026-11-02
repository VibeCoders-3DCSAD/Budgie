import { jest } from "@jest/globals";
import request from "supertest";

jest.mock("../../lib/supabase.js", () => {
  const mockClient = {
    auth: {
      getUser: jest.fn(),
      signOut: jest.fn(),
      admin: { signOut: jest.fn() },
    },
  };

  return {
    supabase: mockClient,
    createAnonAuthClient: () => mockClient,
    createAuthenticatedSupabaseClient: () => mockClient,
  };
});

import app from "../../app.js";
import { supabase } from "../../lib/supabase.js";
import { authHeader, validAccessToken } from "../helpers/fixtures.js";

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockSessionSignOut = supabase.auth.signOut as jest.Mock;
const mockRevoke = supabase.auth.admin.signOut as jest.Mock;

describe("POST /odin/api/auth/logout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-0000-0000-000000000001" } },
      error: null,
    });
  });

  it("revokes the request's own session on the auth server", async () => {
    mockRevoke.mockResolvedValue({ data: null, error: null });

    const response = await request(app)
      .post("/odin/api/auth/logout")
      .set(authHeader())
      .send({ payload: { reason: "user_requested" } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ payload: { logged_out: true } });
    expect(mockRevoke).toHaveBeenCalledWith(validAccessToken, "local");
    // The session-less SDK signOut() makes no server call, so it must not be relied on.
    expect(mockSessionSignOut).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404])("treats a session the server already ended (%i) as logged out", async (status) => {
    mockRevoke.mockResolvedValue({ data: null, error: { status, message: "Session not found" } });

    const response = await request(app)
      .post("/odin/api/auth/logout")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(200);
  });

  it("returns 500 when the revocation fails", async () => {
    mockRevoke.mockResolvedValue({ data: null, error: { status: 500, message: "upstream failure" } });

    const response = await request(app)
      .post("/odin/api/auth/logout")
      .set(authHeader())
      .send({ payload: { reason: "user_requested" } });

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ error: "Internal Server Error" });
  });

  it("returns 500 when the revocation throws", async () => {
    mockRevoke.mockRejectedValue(new Error("Supabase unreachable"));

    const response = await request(app)
      .post("/odin/api/auth/logout")
      .set(authHeader())
      .send({ payload: { reason: "user_requested" } });

    expect(response.status).toBe(500);
  });

  it("returns 401 when authorization header is missing", async () => {
    const response = await request(app)
      .post("/odin/api/auth/logout")
      .send({ payload: {} });

    expect(response.status).toBe(401);
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});
