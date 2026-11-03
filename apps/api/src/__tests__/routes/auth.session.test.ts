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
import { createMockQuery } from "../helpers/supabase.js";
import type { MockQueryResult } from "../helpers/supabase.js";
import {
  validUserId,
  validRefreshToken,
  authHeader,
} from "../helpers/fixtures.js";

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

describe("POST /odin/api/auth/session", () => {
  function mockSuccess() {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId, email_confirmed_at: "2026-01-01T00:00:00.000Z" } },
      error: null,
    });

    const profileResult: MockQueryResult = {
      data: { user_id: validUserId },
      error: null,
    };
    const privacyResult: MockQueryResult = {
      data: { personalization_enabled: true },
      error: null,
    };
    const onboardingResult: MockQueryResult = {
      data: { status: "in_progress" },
      error: null,
    };
    const deletionCancellationResult: MockQueryResult = {
      data: null,
      error: null,
    };

    mockFrom
      .mockReturnValueOnce(createMockQuery(profileResult))
      .mockReturnValueOnce(createMockQuery(privacyResult))
      .mockReturnValueOnce(createMockQuery(deletionCancellationResult))
      .mockReturnValueOnce(createMockQuery(onboardingResult));
  }

  it("returns 200 with user, profile, onboarding, and privacy", async () => {
    mockSuccess();

    const response = await request(app)
      .post("/odin/api/auth/session")
      .set(authHeader())
      .send({ payload: { refresh_token: validRefreshToken } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      payload: {
        user: { id: validUserId },
        onboarding: { status: "in_progress" },
        privacy_settings: { personalization_enabled: true },
        verified_at: expect.any(String),
        offline_access_expires_at: expect.any(String),
      },
    });
    expect(Date.parse(response.body.payload.offline_access_expires_at)
      - Date.parse(response.body.payload.verified_at)).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("returns 200 and bootstraps profile idempotently", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId, email_confirmed_at: "2026-01-01T00:00:00.000Z" } },
      error: null,
    });

    const newProfileResult = { user_id: validUserId };
    const privacyResult = { personalization_enabled: true };
    const onboardingResult = { status: "in_progress" };

    mockFrom
      .mockReturnValueOnce(createMockQuery({ data: newProfileResult, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: privacyResult, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: null, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: onboardingResult, error: null }));

    const response = await request(app)
      .post("/odin/api/auth/session")
      .set(authHeader())
      .send({ payload: { refresh_token: validRefreshToken } });

    expect(response.status).toBe(200);
    expect(response.body.payload.profile).toBeUndefined();
    expect(mockFrom).toHaveBeenNthCalledWith(1, "profiles");
  });

  it("returns 200 and bootstraps privacy settings idempotently", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId, email_confirmed_at: "2026-01-01T00:00:00.000Z" } },
      error: null,
    });

    const profileResult = { user_id: validUserId };
    const newPrivacyResult = { personalization_enabled: true };
    const onboardingResult = { status: "in_progress" };

    mockFrom
      .mockReturnValueOnce(createMockQuery({ data: profileResult, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: newPrivacyResult, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: null, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: onboardingResult, error: null }));

    const response = await request(app)
      .post("/odin/api/auth/session")
      .set(authHeader())
      .send({ payload: { refresh_token: validRefreshToken } });

    expect(response.status).toBe(200);
    expect(response.body.payload.privacy_settings.personalization_enabled).toBe(true);
  });

  it("returns 200 with default onboarding when no onboarding row exists", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId, email_confirmed_at: "2026-01-01T00:00:00.000Z" } },
      error: null,
    });

    mockFrom
      .mockReturnValueOnce(createMockQuery({ data: { user_id: validUserId }, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: { personalization_enabled: true }, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: null, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: null, error: null }));

    const response = await request(app)
      .post("/odin/api/auth/session")
      .set(authHeader())
      .send({ payload: { refresh_token: validRefreshToken } });

    expect(response.status).toBe(200);
    expect(response.body.payload.onboarding.status).toBe("in_progress");
  });

  it("returns 500 when onboarding query fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId, email_confirmed_at: "2026-01-01T00:00:00.000Z" } },
      error: null,
    });

    mockFrom
      .mockReturnValueOnce(createMockQuery({ data: { user_id: validUserId }, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: { personalization_enabled: true }, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: null, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: null, error: { message: "DB error" } }));

    const response = await request(app)
      .post("/odin/api/auth/session")
      .set(authHeader())
      .send({ payload: { refresh_token: validRefreshToken } });

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      message: "Failed to bootstrap user profile.",
    });
  });

  it("returns 500 when profile creation fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId, email_confirmed_at: "2026-01-01T00:00:00.000Z" } },
      error: null,
    });

    mockFrom
      .mockReturnValueOnce(createMockQuery({ data: null, error: { message: "Insert failed" } }));
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(app)
      .post("/odin/api/auth/session")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith("[auth/session] user bootstrap failed", expect.objectContaining({ user_id: validUserId }));
    consoleError.mockRestore();
    expect(response.body).toMatchObject({
      message: expect.stringMatching(/bootstrap/i),
    });
  });

  it("returns 400 when authorization header is missing", async () => {
    const response = await request(app)
      .post("/odin/api/auth/session")
      .send({ payload: {} });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      message: expect.stringMatching(/authorization/i),
    });
  });

  it("returns 400 when authorization is not Bearer", async () => {
    const response = await request(app)
      .post("/odin/api/auth/session")
      .set({ authorization: "Basic dXNlcjpwYXNz" })
      .send({ payload: {} });

    expect(response.status).toBe(400);
  });

  it("returns 400 when token is empty after Bearer", async () => {
    const response = await request(app)
      .post("/odin/api/auth/session")
      .set({ authorization: "Bearer " })
      .send({ payload: {} });

    expect(response.status).toBe(400);
  });

  it("returns 401 when token is invalid", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid token" },
    });

    const response = await request(app)
      .post("/odin/api/auth/session")
      .set(authHeader("invalid-token"))
      .send({ payload: {} });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: "Unauthorized" });
  });

  it("returns an email-unverified state without bootstrapping the session", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId, email_confirmed_at: null } },
      error: null,
    });

    const response = await request(app)
      .post("/odin/api/auth/session")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "email_unverified" });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects a session when Supabase omits the confirmation timestamp", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: validUserId } }, error: null });

    const response = await request(app)
      .post("/odin/api/auth/session")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "email_unverified" });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 500 when getUser throws", async () => {
    mockGetUser.mockRejectedValue(new Error("Supabase unreachable"));

    const response = await request(app)
      .post("/odin/api/auth/session")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(500);
  });

  it("returns 500 when getUser succeeds but profile query throws", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId, email_confirmed_at: "2026-01-01T00:00:00.000Z" } },
      error: null,
    });

    const mockMaybeSingle = jest.fn(() => { throw new Error("DB connection lost"); });
    const mockEq = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });

    const response = await request(app)
      .post("/odin/api/auth/session")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(500);
  });
});
