import { jest } from "@jest/globals";
import request from "supertest";

jest.mock("../../lib/supabase.js", () => {
  const mockClient = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
    rpc: jest.fn(),
  };

  return {
    supabase: mockClient,
    createAnonAuthClient: () => mockClient,
    createAuthenticatedSupabaseClient: () => mockClient,
  };
});

import app from "../../app.js";
import { supabase } from "../../lib/supabase.js";
import { authHeader, validAccessToken, validUserId } from "../helpers/fixtures.js";

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as unknown as jest.Mock;

function mockAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: validUserId } },
    error: null,
  });
}

function mockReplaceResult(result: { data: object | null; error: object | null }) {
  const mockSingle = jest.fn().mockReturnValue(result);
  mockRpc.mockReturnValue({ single: mockSingle });
}

describe("GET /odin/api/data-export-requests", () => {
  it("returns the user's export requests", async () => {
    mockAuth();

    const requests = [
      { id: "id-1", status: "requested", requested_at: "2026-07-06T12:00:00Z" },
    ];
    const mockLimit = jest.fn().mockReturnValue({ data: requests, error: null });
    const mockOrder = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockEq = jest.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });

    const response = await request(app)
      .get("/odin/api/data-export-requests")
      .set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body.payload.requests).toEqual(requests);
  });

  it("returns 401 without authorization", async () => {
    const response = await request(app).get("/odin/api/data-export-requests");
    expect(response.status).toBe(401);
  });
});

describe("POST /odin/api/data-export-requests", () => {
  beforeEach(() => mockRpc.mockReset());

  it("creates a data export request", async () => {
    mockAuth();

    const requestId = "00000000-0000-0000-0000-000000000020";
    mockReplaceResult({ data: { id: requestId, status: "requested" }, error: null });

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: { format: "csv", reason: "user_request" } });

    expect(response.status).toBe(201);
    expect(response.body.payload.request).toEqual({
      id: requestId,
      status: "requested",
    });
    expect(response.body.payload.datasets).toContain("transactions");
  });

  it("replaces the active export in one database call scoped to the signed-in user", async () => {
    mockAuth();
    mockReplaceResult({ data: { id: "new-id", status: "requested" }, error: null });

    await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: { format: "csv", reason: "user_request" } });

    // The function reads the user from the JWT; the client never names one.
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("replace_data_export_request", {
      p_metadata: { format: "csv", reason: "user_request" },
    });
    expect(mockFrom).not.toHaveBeenCalledWith("data_export_requests");
  });

  it("creates a minimal export request without optional fields", async () => {
    mockAuth();
    mockReplaceResult({ data: { id: "id", status: "requested" }, error: null });

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(201);
    expect(mockRpc).toHaveBeenCalledWith("replace_data_export_request", { p_metadata: { format: "csv" } });
  });

  it("returns 400 for array payload", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: ["format", "json"] });

    expect(response.status).toBe(400);
  });

  it("returns 400 for missing payload", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({});

    expect(response.status).toBe(400);
  });

  it("returns 400 for a format other than csv", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: { format: "json" } });

    expect(response.status).toBe(400);
  });

  it("returns 400 for non-string reason", async () => {
    mockAuth();

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: { reason: 123 } });

    expect(response.status).toBe(400);
  });

  it("returns 401 without authorization header", async () => {
    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .send({ payload: {} });

    expect(response.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid token" },
    });

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader("bad-token"))
      .send({ payload: {} });

    expect(response.status).toBe(401);
  });

  it("returns 500 when the replacement fails", async () => {
    mockAuth();
    mockReplaceResult({ data: null, error: { message: "Database error" } });

    const response = await request(app)
      .post("/odin/api/data-export-requests")
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Failed to create data export request");
  });
});

// A Supabase query builder stand-in: every filter returns the builder, and awaiting it yields the result.
type QueryResult = { data: unknown; error: unknown };
function mockQuery(result: QueryResult) {
  const builder: Record<string, jest.Mock> & { then?: unknown } = {};
  for (const method of ["select", "eq", "or", "gt", "in", "order", "limit", "update"]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const exportId = "00000000-0000-0000-0000-000000000030";
const batchPath = `/odin/api/data-export-requests/${exportId}/batches`;

describe("GET /odin/api/data-export-requests/:id/batches", () => {
  beforeEach(() => mockFrom.mockReset());

  it("returns a page of the user's rows and a cursor when the page is full", async () => {
    mockAuth();
    const lookup = mockQuery({ data: { id: exportId, status: "processing" }, error: null });
    const rows = [
      { id: "00000000-0000-0000-0000-0000000000a1", amount_centavos: 100 },
      { id: "00000000-0000-0000-0000-0000000000a2", amount_centavos: 200 },
    ];
    const page = mockQuery({ data: rows, error: null });
    mockFrom.mockReturnValueOnce(lookup).mockReturnValueOnce(page);

    const response = await request(app)
      .get(batchPath)
      .query({ dataset: "transactions", limit: 2, after: "00000000-0000-0000-0000-0000000000a0" })
      .set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body.payload).toEqual({ dataset: "transactions", rows, next_cursor: rows[1].id });
    expect(lookup.eq).toHaveBeenCalledWith("user_id", validUserId);
    expect(mockFrom).toHaveBeenNthCalledWith(2, "transactions");
    expect(page.eq).toHaveBeenCalledWith("user_id", validUserId);
    expect(page.eq).toHaveBeenCalledWith("deleted", false);
    expect(page.gt).toHaveBeenCalledWith("id", "00000000-0000-0000-0000-0000000000a0");
    expect(page.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(page.limit).toHaveBeenCalledWith(2);
  });

  it("ends the dataset with a null cursor on a short page", async () => {
    mockAuth();
    mockFrom
      .mockReturnValueOnce(mockQuery({ data: { id: exportId, status: "processing" }, error: null }))
      .mockReturnValueOnce(mockQuery({ data: [{ id: "00000000-0000-0000-0000-0000000000a1" }], error: null }));

    const response = await request(app).get(batchPath).query({ dataset: "transactions" }).set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body.payload.next_cursor).toBeNull();
  });

  it("includes built-in categories alongside the user's own", async () => {
    mockAuth();
    const page = mockQuery({ data: [], error: null });
    mockFrom
      .mockReturnValueOnce(mockQuery({ data: { id: exportId, status: "processing" }, error: null }))
      .mockReturnValueOnce(page);

    await request(app).get(batchPath).query({ dataset: "categories" }).set(authHeader());

    expect(page.or).toHaveBeenCalledWith(`user_id.eq.${validUserId},user_id.is.null`);
  });

  it("marks a new request as processing on its first batch", async () => {
    mockAuth();
    const lookup = mockQuery({ data: { id: exportId, status: "requested" }, error: null });
    const markProcessing = mockQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(lookup)
      .mockReturnValueOnce(markProcessing)
      .mockReturnValueOnce(mockQuery({ data: [], error: null }));

    const response = await request(app).get(batchPath).query({ dataset: "profile" }).set(authHeader());

    expect(response.status).toBe(200);
    expect(markProcessing.update).toHaveBeenCalledWith({ status: "processing" });
    expect(markProcessing.eq).toHaveBeenCalledWith("status", "requested");
  });

  it("rejects an unknown dataset before touching the database", async () => {
    mockAuth();

    const response = await request(app).get(batchPath).query({ dataset: "auth.users" }).set(authHeader());

    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects a cursor that is not a record id", async () => {
    mockAuth();

    const response = await request(app).get(batchPath).query({ dataset: "transactions", after: "1,id.gt.0" }).set(authHeader());

    expect(response.status).toBe(400);
  });

  it("rejects an oversized batch", async () => {
    mockAuth();

    const response = await request(app).get(batchPath).query({ dataset: "transactions", limit: 5000 }).set(authHeader());

    expect(response.status).toBe(400);
  });

  it("returns 404 for another user's or a missing request", async () => {
    mockAuth();
    mockFrom.mockReturnValueOnce(mockQuery({ data: null, error: null }));

    const response = await request(app).get(batchPath).query({ dataset: "transactions" }).set(authHeader());

    expect(response.status).toBe(404);
  });

  it("returns 409 once the request was replaced or finished", async () => {
    mockAuth();
    mockFrom.mockReturnValueOnce(mockQuery({ data: { id: exportId, status: "cancelled" }, error: null }));

    const response = await request(app).get(batchPath).query({ dataset: "transactions" }).set(authHeader());

    expect(response.status).toBe(409);
  });

  it("returns 500 without the database message when a read fails", async () => {
    mockAuth();
    mockFrom
      .mockReturnValueOnce(mockQuery({ data: { id: exportId, status: "processing" }, error: null }))
      .mockReturnValueOnce(mockQuery({ data: null, error: { message: "relation secret_table does not exist" } }));

    const response = await request(app).get(batchPath).query({ dataset: "transactions" }).set(authHeader());

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Failed to read export batch");
  });
});

describe("POST /odin/api/data-export-requests/:id/complete and /fail", () => {
  beforeEach(() => mockFrom.mockReset());

  it("completes an active request", async () => {
    mockAuth();
    const update = mockQuery({ data: [{ id: exportId }], error: null });
    mockFrom.mockReturnValueOnce(update);

    const response = await request(app).post(`/odin/api/data-export-requests/${exportId}/complete`).set(authHeader()).send({});

    expect(response.status).toBe(200);
    expect(response.body.payload.request).toEqual({ id: exportId, status: "completed" });
    expect(update.eq).toHaveBeenCalledWith("user_id", validUserId);
    expect(update.in).toHaveBeenCalledWith("status", ["requested", "processing"]);
  });

  it("returns 409 when completing a request that is no longer active", async () => {
    mockAuth();
    mockFrom.mockReturnValueOnce(mockQuery({ data: [], error: null }));

    const response = await request(app).post(`/odin/api/data-export-requests/${exportId}/complete`).set(authHeader()).send({});

    expect(response.status).toBe(409);
  });

  it("records a trimmed, bounded failure reason", async () => {
    mockAuth();
    const update = mockQuery({ data: [{ id: exportId }], error: null });
    mockFrom.mockReturnValueOnce(update);

    const response = await request(app)
      .post(`/odin/api/data-export-requests/${exportId}/fail`)
      .set(authHeader())
      .send({ payload: { reason: `  ${"x".repeat(300)}  ` } });

    expect(response.status).toBe(200);
    const changes = update.update.mock.calls[0][0] as { status: string; failure_reason: string };
    expect(changes.status).toBe("failed");
    expect(changes.failure_reason).toHaveLength(200);
  });

  it("returns 400 for a non-string failure reason", async () => {
    mockAuth();

    const response = await request(app)
      .post(`/odin/api/data-export-requests/${exportId}/fail`)
      .set(authHeader())
      .send({ payload: { reason: 5 } });

    expect(response.status).toBe(400);
  });
});
