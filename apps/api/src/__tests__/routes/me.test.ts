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
    createAuthenticatedSupabaseClient: () => mockClient,
  };
});

import app from "../../app.js";
import { supabase } from "../../lib/supabase.js";
import { createMockQuery } from "../helpers/supabase.js";
import { validUserId, authHeader } from "../helpers/fixtures.js";

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

describe("GET /odin/api/me", () => {
  function mockAuth() {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
  }

  it("returns 200 with privacy settings by default", async () => {
    mockAuth();
    mockFrom.mockReturnValueOnce(createMockQuery({
      data: { personalization_enabled: true, notifications_opt_in: true },
      error: null,
    }));

    const response = await request(app)
      .get("/odin/api/me")
      .set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body.payload).toEqual({
      privacy_settings: {
        personalization_enabled: true,
        notifications_opt_in: true,
      },
    });
  });

  it("returns 200 with default privacy settings when no privacy row exists", async () => {
    mockAuth();
    mockFrom.mockReturnValueOnce(createMockQuery({
      data: null,
      error: { message: "Not found", code: "PGRST116" },
    }));

    const response = await request(app)
      .get("/odin/api/me")
      .set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body.payload.privacy_settings).toEqual({
      personalization_enabled: true,
      notifications_opt_in: false,
    });
  });

  it("returns only consents when include=consents", async () => {
    mockAuth();
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [{ consent_kind: "terms", status: "granted", version: "2026-06", recorded_at: "2026-06-12T12:00:00Z" }],
              error: null,
            }),
          }),
        }),
      }),
    });

    const response = await request(app)
      .get("/odin/api/me?include=consents")
      .set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body.payload).toEqual({
      consents: [
        {
          consent_kind: "terms",
          status: "granted",
          version: "2026-06",
          recorded_at: "2026-06-12T12:00:00Z",
        },
      ],
    });
  });

  it.each(["profile", "assignment", "consents,wat"])("returns 400 for unsupported include %s", async (include) => {
    mockAuth();

    const response = await request(app)
      .get(`/odin/api/me?include=${include}`)
      .set(authHeader());

    expect(response.status).toBe(400);
  });

  it("returns 401 when no authorization header", async () => {
    const response = await request(app).get("/odin/api/me");
    expect(response.status).toBe(401);
  });

  it("returns 401 when token is invalid", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid token" },
    });

    const response = await request(app)
      .get("/odin/api/me")
      .set(authHeader("bad-token"));

    expect(response.status).toBe(401);
  });

  it("returns 500 when privacy query fails", async () => {
    mockAuth();
    mockFrom.mockReturnValueOnce(createMockQuery({
      data: null,
      error: { message: "DB error", code: "XX000" },
    }));

    const response = await request(app)
      .get("/odin/api/me")
      .set(authHeader());

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      message: expect.stringMatching(/privacy/i),
    });
  });
});
