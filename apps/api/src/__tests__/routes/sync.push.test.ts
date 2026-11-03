import { jest } from "@jest/globals";
import request from "supertest";

jest.mock("../../lib/supabase.js", () => {
  const mockClient = { auth: { getUser: jest.fn() }, from: jest.fn() };
  return {
    supabase: mockClient,
    createAnonAuthClient: () => mockClient,
    createAuthenticatedSupabaseClient: () => mockClient,
  };
});

jest.mock("../../services/sync/syncService.js", () => ({
  ...(jest.requireActual("../../services/sync/syncService.js") as object),
  getDeviceStatus: jest.fn(),
  pushOperations: jest.fn(),
}));

import app from "../../app.js";
import { supabase } from "../../lib/supabase.js";
import { getDeviceStatus, pushOperations } from "../../services/sync/syncService.js";
import { authHeader, validUserId } from "../helpers/fixtures.js";

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockGetDeviceStatus = getDeviceStatus as unknown as jest.Mock;
const mockPushOperations = pushOperations as unknown as jest.Mock;

function operation(id: string, overrides: Record<string, unknown> = {}) {
  return {
    operation_id: id,
    entity: "transactions",
    record_id: `record-${id}`,
    operation_type: "update",
    base_version: 1,
    changed_fields: ["note"],
    payload: { note: "x" },
    ...overrides,
  };
}

function push(operations: unknown[]) {
  return request(app)
    .post("/odin/api/sync/push")
    .set(authHeader())
    .send({ payload: { device_id: "device-1", operations } });
}

describe("POST /odin/api/sync/push", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: validUserId } }, error: null });
    mockGetDeviceStatus.mockReset().mockResolvedValue("active" as never);
    mockPushOperations.mockReset().mockImplementation(async (...args: unknown[]) => {
      const operations = args[3] as Array<{ operation_id: string }>;
      return operations.map((item) => ({ operation_id: item.operation_id, status: "applied" }));
    });
  });

  it("rejects a malformed operation on its own and applies the valid ones sent with it", async () => {
    const response = await push([operation("good-1"), operation("bad", { operation_type: "upsert" }), operation("good-2")]);

    expect(response.status).toBe(200);
    expect(mockPushOperations).toHaveBeenCalledWith(expect.anything(), validUserId, "device-1", [
      expect.objectContaining({ operation_id: "good-1" }),
      expect.objectContaining({ operation_id: "good-2" }),
    ]);
    expect(response.body.payload.results).toEqual(expect.arrayContaining([
      { operation_id: "bad", status: "rejected", reason: "invalid_operation" },
      { operation_id: "good-1", status: "applied" },
      { operation_id: "good-2", status: "applied" },
    ]));
  });

  it("tells the client its device is not registered so it can register again", async () => {
    mockGetDeviceStatus.mockResolvedValue("missing" as never);

    const response = await push([operation("good-1")]);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("device_not_registered");
    expect(mockPushOperations).not.toHaveBeenCalled();
  });

  it("does not invite a deactivated device to register again", async () => {
    mockGetDeviceStatus.mockResolvedValue("inactive" as never);

    const response = await push([operation("good-1")]);

    expect(response.status).toBe(400);
    expect(response.body.code).toBeUndefined();
    expect(mockPushOperations).not.toHaveBeenCalled();
  });

  it("answers a batch of only malformed operations without applying anything", async () => {
    const response = await push([operation("bad", { changed_fields: "note" })]);

    expect(response.status).toBe(200);
    expect(mockPushOperations).not.toHaveBeenCalled();
    expect(response.body.payload.results).toEqual([{ operation_id: "bad", status: "rejected", reason: "invalid_operation" }]);
  });

  it("still rejects the whole request when an operation has no id to report against", async () => {
    const response = await push([operation("good"), { entity: "transactions" }]);

    expect(response.status).toBe(400);
    expect(mockPushOperations).not.toHaveBeenCalled();
  });
});
