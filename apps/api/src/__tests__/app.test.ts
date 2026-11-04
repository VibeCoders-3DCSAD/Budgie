import { jest } from "@jest/globals";
import request from "supertest";

jest.mock("../lib/supabase.js", () => {
  const mockClient = { auth: { getUser: jest.fn() }, from: jest.fn() };
  return {
    supabase: mockClient,
    createAnonAuthClient: () => mockClient,
    createAuthenticatedSupabaseClient: () => mockClient,
  };
});

// Stand-in recurring routes: /boom fails with an internal error, /whoami is protected, and /run is public like the real cron route.
jest.mock("../routes/recurring.js", () => {
  const { Router } = jest.requireActual("express") as typeof import("express");
  const { requireAuth } = jest.requireActual("../middleware/auth.js") as typeof import("../middleware/auth.js");
  const router = Router();
  router.post("/boom", () => { throw new Error("database password is hunter2"); });
  router.post("/whoami", requireAuth, (request: import("../middleware/auth.js").AuthenticatedRequest, response) => {
    response.json({ userId: request.userId });
  });
  router.post("/run", (request, response) => { response.json({ body: request.body }); });
  return { __esModule: true, default: router };
});

import { supabase } from "../lib/supabase.js";
import app from "../app.js";

const getUser = supabase.auth.getUser as unknown as jest.Mock<(token: string) => Promise<unknown>>;

function signedIn(path: string) {
  return request(app).post(path).set("Authorization", "Bearer valid-token");
}

let consoleError: ReturnType<typeof jest.spyOn>;
let consoleWarn: ReturnType<typeof jest.spyOn>;
beforeEach(() => {
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
  getUser.mockReset();
  getUser.mockImplementation(async (token) => token === "valid-token"
    ? { data: { user: { id: "user-1" } }, error: null }
    : { data: { user: null }, error: new Error("invalid token") });
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("auth before the body parser", () => {
  it("rejects a protected route without a token before reading its body", async () => {
    const response = await request(app)
      .post("/odin/api/recurring/whoami")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ padding: "x".repeat(1024 * 1024 + 1) }));

    // A 401 instead of 413 shows the oversized body was never parsed.
    expect(response.status).toBe(401);
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid token before reading the body", async () => {
    const response = await request(app)
      .post("/odin/api/recurring/whoami")
      .set("Authorization", "Bearer bad-token")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ padding: "x".repeat(1024 * 1024 + 1) }));

    expect(response.status).toBe(401);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("checks a valid token once and lets the route's requireAuth reuse it", async () => {
    const response = await signedIn("/odin/api/recurring/whoami").send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: "user-1" });
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("still checks the token when something else already set request.userId", async () => {
    const { requireAuth } = await import("../middleware/auth.js");
    const status = jest.fn(() => ({ json: jest.fn() }));
    const next = jest.fn();

    await requireAuth({ headers: {}, userId: "spoofed" } as never, { status } as never, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("protects unknown API paths too", async () => {
    const response = await request(app).post("/odin/api/not-a-route").send({});

    expect(response.status).toBe(401);
  });

  it("leaves public routes open and parses their body", async () => {
    const response = await request(app).post("/odin/api/recurring/run").send({ payload: { limit: 1 } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ body: { payload: { limit: 1 } } });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("treats a public route with a trailing slash or other casing as public, as Express routing does", async () => {
    expect((await request(app).post("/odin/api/recurring/run/").send({})).status).toBe(200);
    expect((await request(app).post("/odin/API/Recurring/Run").send({})).status).toBe(200);
  });

  it("leaves routes outside the API open", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
  });
});

describe("final error handler", () => {
  it("answers a JSON body over the 1 MB limit with 413 and a fixed message", async () => {
    const response = await signedIn("/odin/api/recurring/boom")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ padding: "x".repeat(1024 * 1024 + 1) }));

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: "Payload Too Large", message: "Request body is too large" });
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith("Request body too large", {
      method: "POST",
      path: "/odin/api/recurring/boom",
      userId: "user-1",
      contentLength: expect.any(String),
      length: expect.any(Number),
      limit: 1024 * 1024,
    });
  });

  it("logs no user for an oversized body on a public route", async () => {
    const response = await request(app)
      .post("/odin/api/recurring/run")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ padding: "x".repeat(1024 * 1024 + 1) }));

    expect(response.status).toBe(413);
    expect(consoleWarn).toHaveBeenCalledWith("Request body too large", expect.objectContaining({ userId: null }));
  });

  it("still answers malformed JSON with 400", async () => {
    const response = await signedIn("/odin/api/recurring/boom")
      .set("Content-Type", "application/json")
      .send("{\"broken\":");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Bad Request", message: "Invalid JSON in request body" });
  });

  it("keeps another exposed parser client error's status without echoing its text", async () => {
    const response = await signedIn("/odin/api/recurring/boom")
      .set("Content-Type", "application/json; charset=latin1")
      .send("{}");

    expect(response.status).toBe(415);
    expect(response.body).toEqual({ error: "Unsupported Media Type", message: "The request could not be processed" });
    expect(JSON.stringify(response.body)).not.toContain("LATIN1");
  });

  it("still answers an unrelated thrown error with a generic 500 and logs it", async () => {
    const response = await signedIn("/odin/api/recurring/boom").send({});

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Internal Server Error", message: "An unexpected error occurred" });
    expect(JSON.stringify(response.body)).not.toContain("hunter2");
    expect(consoleError).toHaveBeenCalledWith("Unhandled error", expect.objectContaining({ route: "/odin/api/recurring/boom" }));
  });
});
