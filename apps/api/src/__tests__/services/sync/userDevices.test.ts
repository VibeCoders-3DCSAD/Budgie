import { jest } from "@jest/globals";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDeviceStatus, registerDevice } from "../../../services/sync/syncService.js";

type Result = { data: unknown; error: { message: string } | null };

function clientReturning(result: Result) {
  const maybeSingle = jest.fn(async () => result);
  const select = jest.fn(() => ({ maybeSingle }));
  const upsert = jest.fn(() => ({ select }));
  const from = jest.fn(() => ({ upsert }));
  return { client: { from } as unknown as SupabaseClient, from, upsert };
}

describe("registerDevice", () => {
  it("upserts the device as active under the user and device uniqueness rule", async () => {
    const { client, from, upsert } = clientReturning({ data: { is_active: true }, error: null });

    await registerDevice(client, "user-1", "device-1");

    expect(from).toHaveBeenCalledWith("user_devices");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", device_id: "device-1", is_active: true, last_seen_at: expect.any(String) }),
      { onConflict: "user_id,device_id" },
    );
  });

  it("throws when the write fails", async () => {
    const { client } = clientReturning({ data: null, error: { message: "permission denied for table user_devices" } });

    await expect(registerDevice(client, "user-1", "device-1")).rejects.toThrow("device registration failed");
  });

  it("throws when no active row comes back", async () => {
    const { client } = clientReturning({ data: null, error: null });

    await expect(registerDevice(client, "user-1", "device-1")).rejects.toThrow("device registration was not saved");
  });

  it("rejects an invalid device id without writing", async () => {
    const { client, from } = clientReturning({ data: { is_active: true }, error: null });

    await expect(registerDevice(client, "user-1", "bad id!")).rejects.toThrow("invalid device id");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("getDeviceStatus", () => {
  function lookupReturning(result: Result) {
    const query = { select: jest.fn(() => query), eq: jest.fn(() => query), maybeSingle: jest.fn(async () => result) };
    return { from: jest.fn(() => query) } as unknown as SupabaseClient;
  }

  it.each([
    [{ is_active: true }, "active"],
    [{ is_active: false }, "inactive"],
    [null, "missing"],
  ])("reads %j as %s", async (row, status) => {
    await expect(getDeviceStatus(lookupReturning({ data: row, error: null }), "user-1", "device-1")).resolves.toBe(status);
  });

  it("throws instead of reporting a missing device when the lookup fails", async () => {
    await expect(getDeviceStatus(lookupReturning({ data: null, error: { message: "timeout" } }), "user-1", "device-1")).rejects.toThrow("device lookup failed");
  });
});
