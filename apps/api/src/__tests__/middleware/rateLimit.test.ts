import { jest } from "@jest/globals";
import type { NextFunction, Response } from "express";
import { rateLimitPerUser } from "../../middleware/rateLimit.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";

function mockResponse() {
  const headers: Record<string, string> = {};
  const response = {
    headers,
    setHeader: jest.fn((name: string, value: string) => { headers[name] = value; }),
    status: jest.fn(() => response),
    json: jest.fn(() => response),
  };
  return response;
}

function call(limiter: ReturnType<typeof rateLimitPerUser>, userId: string) {
  const response = mockResponse();
  const next = jest.fn();
  limiter({ userId } as AuthenticatedRequest, response as unknown as Response, next as NextFunction);
  return { response, next };
}

describe("rateLimitPerUser", () => {
  it("allows up to the limit, then answers 429 with Retry-After until the window resets", () => {
    let time = 0;
    const limiter = rateLimitPerUser({ name: "test", windowMs: 60_000, max: 2, now: () => time });

    expect(call(limiter, "user-1").next).toHaveBeenCalled();
    expect(call(limiter, "user-1").next).toHaveBeenCalled();

    time = 15_000;
    const blocked = call(limiter, "user-1");
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.response.status).toHaveBeenCalledWith(429);
    expect(blocked.response.headers["Retry-After"]).toBe("45");

    time = 60_000;
    expect(call(limiter, "user-1").next).toHaveBeenCalled();
  });

  it("counts each user separately", () => {
    const limiter = rateLimitPerUser({ name: "test", windowMs: 60_000, max: 1, now: () => 0 });

    expect(call(limiter, "user-1").next).toHaveBeenCalled();
    expect(call(limiter, "user-2").next).toHaveBeenCalled();
    expect(call(limiter, "user-1").next).not.toHaveBeenCalled();
  });
});
