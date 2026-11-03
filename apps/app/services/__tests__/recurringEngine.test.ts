import { jest } from "@jest/globals";

const mockGetSession = jest.fn<() => Promise<unknown>>();
const mockApiFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("../../lib/supabase", () => ({ supabase: { auth: { getSession: () => mockGetSession() } } }));
jest.mock("../../lib/helpers/apiFetch", () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));

import { triggerRecurringEngine } from "../recurringEngine";

describe("triggerRecurringEngine", () => {
  beforeEach(() => { mockGetSession.mockReset(); mockApiFetch.mockReset(); });

  it("posts to the user's recurring run through apiFetch", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "token-1" } } });
    mockApiFetch.mockResolvedValue({ response: new Response(null, { status: 202 }), body: {} });

    await triggerRecurringEngine();

    expect(mockApiFetch).toHaveBeenCalledWith("token-1", "/odin/api/recurring/run/me", { method: "POST" });
  });

  it("swallows a failed request", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "token-1" } } });
    mockApiFetch.mockRejectedValue(new Error("aborted"));

    await expect(triggerRecurringEngine()).resolves.toBeUndefined();
  });

  it("does nothing without a session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await triggerRecurringEngine();

    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
