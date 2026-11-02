import { jest } from "@jest/globals";
import type { Response } from "express";

jest.mock("../../lib/supabase.js", () => {
  const mockClient = {
    auth: {
      getUser: jest.fn(),
    },
  };

  return {
    supabase: mockClient,
    createAnonAuthClient: () => mockClient,
    createAuthenticatedSupabaseClient: () => mockClient,
  };
});

import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { supabase } from "../../lib/supabase.js";

const mockGetUser = supabase.auth.getUser as jest.Mock;

function mockReq(headers: Record<string, string | undefined> = {}): AuthenticatedRequest {
  return { headers } as unknown as AuthenticatedRequest;
}

function mockRes(): { status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json };
}

describe("requireAuth middleware", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const req = mockReq({});
    const res = mockRes();
    const next = jest.fn();

    await requireAuth(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Unauthorized" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header has no Bearer prefix", async () => {
    const req = mockReq({ authorization: "Token abc123" });
    const res = mockRes();
    const next = jest.fn();

    await requireAuth(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 when Authorization uses Basic scheme", async () => {
    const req = mockReq({ authorization: "Basic dXNlcjpwYXNz" });
    const res = mockRes();
    const next = jest.fn();

    await requireAuth(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 when token is empty after Bearer", async () => {
    const req = mockReq({ authorization: "Bearer " });
    const res = mockRes();
    const next = jest.fn();

    await requireAuth(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 when header is just 'Bearer' with no space", async () => {
    const req = mockReq({ authorization: "Bearer" });
    const res = mockRes();
    const next = jest.fn();

    await requireAuth(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 when getUser returns null user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const req = mockReq({ authorization: "Bearer valid-token" });
    const res = mockRes();
    const next = jest.fn();

    await requireAuth(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 when getUser returns an error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Token expired" },
    });

    const req = mockReq({ authorization: "Bearer expired-token" });
    const res = mockRes();
    const next = jest.fn();

    await requireAuth(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("calls next() and sets userId when token is valid", async () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    mockGetUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });

    const req = mockReq({ authorization: "Bearer valid-token" });
    const res = mockRes();
    const next = jest.fn();

    await requireAuth(req, res as unknown as Response, next);

    expect(req.userId).toBe(userId);
    expect(req.accessToken).toBe("valid-token");
    expect(req.supabase).toBe(supabase);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
