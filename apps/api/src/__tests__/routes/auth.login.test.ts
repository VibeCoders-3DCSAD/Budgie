import { jest } from "@jest/globals";
import request from "supertest";

jest.mock("../../lib/supabase.js", () => {
  const mockClient = {
    auth: {
      signInWithPassword: jest.fn(),
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
  validAccessToken,
  validRefreshToken,
  validUserId,
  validLoginPayload,
} from "../helpers/fixtures.js";

const mockSignInWithPassword = supabase.auth.signInWithPassword as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

describe("POST /odin/api/auth/login", () => {
  function mockSuccessfulBootstrap() {
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

  function mockSuccessfulPasswordSignIn() {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: validUserId },
        session: {
          access_token: validAccessToken,
          refresh_token: validRefreshToken,
        },
      },
      error: null,
    });
  }

  it("returns 200 with session and bootstrapped user data on valid credentials", async () => {
    mockSuccessfulPasswordSignIn();
    mockSuccessfulBootstrap();

    const response = await request(app)
      .post("/odin/api/auth/login")
      .send(validLoginPayload());

    expect(response.status).toBe(200);
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "StrongP@ss1",
    });
    expect(response.body).toEqual({
      payload: {
        session: {
          access_token: validAccessToken,
          refresh_token: validRefreshToken,
        },
        user: { id: validUserId },
        onboarding: { status: "in_progress" },
        privacy_settings: { personalization_enabled: true },
      },
    });
  });

  it("returns 400 when email is missing", async () => {
    const response = await request(app)
      .post("/odin/api/auth/login")
      .send({ payload: { password: "StrongP@ss1" } });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Bad Request",
      message: expect.stringMatching(/email/i),
    });
  });

  it("returns 400 when email is empty", async () => {
    const response = await request(app)
      .post("/odin/api/auth/login")
      .send({ payload: { email: "", password: "StrongP@ss1" } });

    expect(response.status).toBe(400);
  });

  it("returns 400 when email is malformed", async () => {
    const response = await request(app)
      .post("/odin/api/auth/login")
      .send({ payload: { email: "not-an-email", password: "StrongP@ss1" } });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/valid email/i);
  });

  it("returns 400 when password is missing", async () => {
    const response = await request(app)
      .post("/odin/api/auth/login")
      .send({ payload: { email: "user@example.com" } });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Bad Request",
      message: expect.stringMatching(/password/i),
    });
  });

  it("returns 400 when payload wrapper is missing", async () => {
    const response = await request(app)
      .post("/odin/api/auth/login")
      .send({});

    expect(response.status).toBe(400);
  });

  it("returns 401 on invalid credentials", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", status: 400 },
    });

    const response = await request(app)
      .post("/odin/api/auth/login")
      .send(validLoginPayload());

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: "Unauthorized" });
  });

  it("returns an email-unverified state when Supabase rejects an unverified account", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "email_not_confirmed", status: 400 },
    });

    const response = await request(app)
      .post("/odin/api/auth/login")
      .send(validLoginPayload());

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "email_unverified" });
  });

  it("returns 401 when Supabase does not return a session", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: validUserId }, session: null },
      error: null,
    });

    const response = await request(app)
      .post("/odin/api/auth/login")
      .send(validLoginPayload());

    expect(response.status).toBe(401);
  });

  it("returns 500 when profile bootstrap fails", async () => {
    mockSuccessfulPasswordSignIn();
    mockFrom.mockReturnValueOnce(
      createMockQuery({ data: null, error: { message: "Insert failed" } }),
    );

    const response = await request(app)
      .post("/odin/api/auth/login")
      .send(validLoginPayload());

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      message: "Failed to bootstrap user session.",
    });
  });

  it("returns 500 when onboarding query fails", async () => {
    mockSuccessfulPasswordSignIn();
    mockFrom
      .mockReturnValueOnce(createMockQuery({ data: { user_id: validUserId }, error: null }))
      .mockReturnValueOnce(
        createMockQuery({ data: { personalization_enabled: true }, error: null }),
      )
      .mockReturnValueOnce(createMockQuery({ data: null, error: null }))
      .mockReturnValueOnce(
        createMockQuery({ data: null, error: { message: "DB error" } }),
      );

    const response = await request(app)
      .post("/odin/api/auth/login")
      .send(validLoginPayload());

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      message: "Failed to bootstrap user session.",
    });
  });
});
