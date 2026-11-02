import { jest } from "@jest/globals";
import request from "supertest";

jest.mock("../../lib/supabase.js", () => {
  const mockClient = {
    auth: {
      getUser: jest.fn(),
      resend: jest.fn(),
    },
  };

  return {
    supabase: mockClient,
    createAuthenticatedSupabaseClient: () => mockClient,
  };
});

import app from "../../app.js";
import { supabase } from "../../lib/supabase.js";
import { authHeader, validEmail, validUserId } from "../helpers/fixtures.js";

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockResend = supabase.auth.resend as jest.Mock;

describe("email verification", () => {
  it("resends a signup verification email", async () => {
    mockResend.mockResolvedValue({ data: {}, error: null });

    const response = await request(app)
      .post("/odin/api/auth/verification-resend")
      .send({ payload: { email: ` ${validEmail.toUpperCase()} ` } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ payload: { sent: true } });
    expect(mockResend).toHaveBeenCalledWith(expect.objectContaining({
      type: "signup",
      email: validEmail,
    }));
  });

  it("returns 429 when resending is rate-limited", async () => {
    mockResend.mockResolvedValue({ data: {}, error: { status: 429 } });

    const response = await request(app)
      .post("/odin/api/auth/verification-resend")
      .send({ payload: { email: validEmail } });

    expect(response.status).toBe(429);
  });

  it("confirms an authenticated user with a verified email", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId, email_confirmed_at: "2026-01-01T00:00:00.000Z" } },
      error: null,
    });

    const response = await request(app)
      .post("/odin/api/auth/verify")
      .set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ payload: { verified: true, user_id: validUserId } });
    // requireAuth's lookup is reused; the route does not fetch the user again.
    expect(mockGetUser).toHaveBeenCalledTimes(1);
  });

  it("rejects an authenticated user whose email remains unverified", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId, email_confirmed_at: null } },
      error: null,
    });

    const response = await request(app)
      .post("/odin/api/auth/verify")
      .set(authHeader());

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/verify your email/i);
  });
});
