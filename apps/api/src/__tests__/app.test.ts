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

// A route that fails with an internal error, standing in for any unexpected handler exception.
jest.mock("../routes/recurring.js", () => {
  const { Router } = jest.requireActual("express") as typeof import("express");
  const router = Router();
  router.post("/boom", () => { throw new Error("database password is hunter2"); });
  return { __esModule: true, default: router };
});

import app from "../app.js";

describe("final error handler", () => {
  let consoleError: ReturnType<typeof jest.spyOn>;
  beforeEach(() => { consoleError = jest.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => consoleError.mockRestore());

  it("answers a JSON body over the 1 MB limit with 413 and a fixed message", async () => {
    const response = await request(app)
      .post("/odin/api/recurring/boom")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ padding: "x".repeat(1024 * 1024 + 1) }));

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: "Payload Too Large", message: "Request body is too large" });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("still answers malformed JSON with 400", async () => {
    const response = await request(app)
      .post("/odin/api/recurring/boom")
      .set("Content-Type", "application/json")
      .send("{\"broken\":");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Bad Request", message: "Invalid JSON in request body" });
  });

  it("keeps another exposed parser client error's status without echoing its text", async () => {
    const response = await request(app)
      .post("/odin/api/recurring/boom")
      .set("Content-Type", "application/json; charset=latin1")
      .send("{}");

    expect(response.status).toBe(415);
    expect(response.body).toEqual({ error: "Unsupported Media Type", message: "The request could not be processed" });
    expect(JSON.stringify(response.body)).not.toContain("LATIN1");
  });

  it("still answers an unrelated thrown error with a generic 500 and logs it", async () => {
    const response = await request(app).post("/odin/api/recurring/boom").send({});

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Internal Server Error", message: "An unexpected error occurred" });
    expect(JSON.stringify(response.body)).not.toContain("hunter2");
    expect(consoleError).toHaveBeenCalledWith("Unhandled error", expect.objectContaining({ route: "/odin/api/recurring/boom" }));
  });
});
