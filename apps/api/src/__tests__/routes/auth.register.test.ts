import { jest } from "@jest/globals";
import request from "supertest";

jest.mock("../../lib/supabase.js", () => {
  const mockClient = {
    auth: {
      signUp: jest.fn(),
    },
  };
  return { supabase: mockClient, createAnonAuthClient: () => mockClient };
});

import app from "../../app.js";
import { supabase } from "../../lib/supabase.js";
import { validRegisterPayload, validUserId } from "../helpers/fixtures.js";

const mockSignUp = supabase.auth.signUp as jest.Mock;

describe("POST /odin/api/auth/register", () => {
  it("returns 201 with user, session, and activation when registration succeeds", async () => {
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: validUserId },
        session: { access_token: "at-123", refresh_token: "rt-456" },
      },
      error: null,
    });

    const response = await request(app)
      .post("/odin/api/auth/register")
      .send(validRegisterPayload());

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      payload: {
        user: { id: validUserId },
        session: { access_token: "at-123", refresh_token: "rt-456" },
        activation: {
          email_confirmation_required: true,
          delivery: "email_link",
        },
      },
    });
  });

  it("returns 201 without session when signUp returns no session", async () => {
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: validUserId },
        session: null,
      },
      error: null,
    });

    const response = await request(app)
      .post("/odin/api/auth/register")
      .send(validRegisterPayload());

    expect(response.status).toBe(201);
    expect(response.body.payload.session.access_token).toBeUndefined();
  });

  it("passes display_name in user_metadata when provided", async () => {
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: validUserId },
        session: { access_token: "at-123", refresh_token: "rt-456" },
      },
      error: null,
    });

    await request(app)
      .post("/odin/api/auth/register")
      .send(validRegisterPayload({ display_name: "Juan Dela Cruz" }));

    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: expect.objectContaining({ display_name: "Juan Dela Cruz" }),
        }),
      }),
    );
  });

  it("returns 400 when email is missing", async () => {
    const response = await request(app)
      .post("/odin/api/auth/register")
      .send({ payload: { password: "StrongP@ss1" } });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Bad Request",
      message: expect.stringMatching(/email/i),
    });
  });

  it("returns 400 when email is empty", async () => {
    const response = await request(app)
      .post("/odin/api/auth/register")
      .send({ payload: { email: "", password: "StrongP@ss1" } });

    expect(response.status).toBe(400);
  });

  it("returns 400 when email is not a string", async () => {
    const response = await request(app)
      .post("/odin/api/auth/register")
      .send({ payload: { email: null, password: "StrongP@ss1" } });

    expect(response.status).toBe(400);
  });

  it("returns 400 when email is malformed", async () => {
    const response = await request(app)
      .post("/odin/api/auth/register")
      .send(validRegisterPayload({ email: "not-an-email" }));

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/valid email/i);
  });

  it("returns 400 when password is missing", async () => {
    const response = await request(app)
      .post("/odin/api/auth/register")
      .send({ payload: { email: "user@example.com" } });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Bad Request",
      message: expect.stringMatching(/password/i),
    });
  });

  it("returns 400 when password is empty", async () => {
    const response = await request(app)
      .post("/odin/api/auth/register")
      .send({ payload: { email: "user@example.com", password: "" } });

    expect(response.status).toBe(400);
  });

  it("returns 400 when password misses required character classes", async () => {
    const response = await request(app)
      .post("/odin/api/auth/register")
      .send(validRegisterPayload({ password: "alllowercase" }));

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/uppercase/i);
  });

  it("returns 400 when payload wrapper is missing", async () => {
    const response = await request(app)
      .post("/odin/api/auth/register")
      .send({});

    expect(response.status).toBe(400);
  });

  it("returns 409 when email is already registered", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: {
        message: "A user with this email already exists",
        status: 409,
        code: "user_already_exists",
      },
    });

    const response = await request(app)
      .post("/odin/api/auth/register")
      .send(validRegisterPayload());

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: "Conflict",
    });
  });

  it("returns 429 when Supabase rate-limits", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Rate limit exceeded", status: 429 },
    });

    const response = await request(app)
      .post("/odin/api/auth/register")
      .send(validRegisterPayload());

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ error: "Too Many Requests" });
  });

  it("returns 500 when Supabase returns an unexpected error", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Internal error", status: 500 },
    });

    const response = await request(app)
      .post("/odin/api/auth/register")
      .send(validRegisterPayload());

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ error: "Internal Server Error" });
  });

  it("returns 500 when signUp throws", async () => {
    mockSignUp.mockRejectedValue(new Error("Network error"));

    const response = await request(app)
      .post("/odin/api/auth/register")
      .send(validRegisterPayload());

    expect(response.status).toBe(500);
  });
});
