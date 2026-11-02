import { jest } from "@jest/globals";
import request from "supertest";

jest.mock("../../lib/supabase.js", () => {
  const mockClient = {
    auth: {
      getUser: jest.fn(),
      setSession: jest.fn(),
      updateUser: jest.fn(),
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
import {
  validAccessToken,
  validRefreshToken,
  validUserId,
  validPasswordUpdatePayload,
  authHeader,
} from "../helpers/fixtures.js";

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockSetSession = supabase.auth.setSession as jest.Mock;
const mockUpdateUser = supabase.auth.updateUser as jest.Mock;

describe("POST /odin/api/auth/password-update", () => {
  it("returns 200 with updated:true when password update succeeds", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
    mockSetSession.mockResolvedValue({ data: { session: {} }, error: null });
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });

    const response = await request(app)
      .post("/odin/api/auth/password-update")
      .set(authHeader())
      .send(validPasswordUpdatePayload());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ payload: { updated: true } });
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: validAccessToken,
      refresh_token: validRefreshToken,
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({
      password: "NewStr0ng!Pass",
    });
  });

  it("returns 400 when password is missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
    mockSetSession.mockResolvedValue({ data: { session: {} }, error: null });

    const response = await request(app)
      .post("/odin/api/auth/password-update")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Bad Request",
      message: expect.stringMatching(/password/i),
    });
  });

  it("returns 400 when password is empty", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
    mockSetSession.mockResolvedValue({ data: { session: {} }, error: null });

    const response = await request(app)
      .post("/odin/api/auth/password-update")
      .set(authHeader())
      .send({ payload: { password: "" } });

    expect(response.status).toBe(400);
  });

  it("returns 400 when password misses required character classes", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: validUserId } }, error: null });

    const response = await request(app)
      .post("/odin/api/auth/password-update")
      .set(authHeader())
      .send(validPasswordUpdatePayload({ password: "alllowercase" }));

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/uppercase/i);
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("returns 400 when payload wrapper is missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
    mockSetSession.mockResolvedValue({ data: { session: {} }, error: null });

    const response = await request(app)
      .post("/odin/api/auth/password-update")
      .set(authHeader())
      .send({});

    expect(response.status).toBe(400);
  });

  it("returns 401 when no auth header is provided", async () => {
    const response = await request(app)
      .post("/odin/api/auth/password-update")
      .send(validPasswordUpdatePayload());

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: "Unauthorized",
      message: expect.stringMatching(/authorization/i),
    });
  });

  it("returns 401 when token is invalid", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid token" },
    });

    const response = await request(app)
      .post("/odin/api/auth/password-update")
      .set(authHeader("invalid-token"))
      .send(validPasswordUpdatePayload());

    expect(response.status).toBe(401);
  });

  it("returns 400 when refresh token is missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });

    const response = await request(app)
      .post("/odin/api/auth/password-update")
      .set(authHeader())
      .send(validPasswordUpdatePayload({ refresh_token: undefined }));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Bad Request",
      message: expect.stringMatching(/token/i),
    });
  });

  it("returns 401 when recovery session cannot be restored", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
    mockSetSession.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid refresh token" },
    });

    const response = await request(app)
      .post("/odin/api/auth/password-update")
      .set(authHeader())
      .send(validPasswordUpdatePayload());

    expect(response.status).toBe(401);
  });

  it("returns 500 when Supabase update fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
    mockSetSession.mockResolvedValue({ data: { session: {} }, error: null });
    mockUpdateUser.mockResolvedValue({
      data: {},
      error: { message: "Password too weak" },
    });

    const response = await request(app)
      .post("/odin/api/auth/password-update")
      .set(authHeader())
      .send(validPasswordUpdatePayload());

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      error: "Internal Server Error",
    });
  });

  it("returns 500 when updateUser throws", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
    mockSetSession.mockResolvedValue({ data: { session: {} }, error: null });
    mockUpdateUser.mockRejectedValue(new Error("Supabase unreachable"));

    const response = await request(app)
      .post("/odin/api/auth/password-update")
      .set(authHeader())
      .send(validPasswordUpdatePayload());

    expect(response.status).toBe(500);
  });
});
