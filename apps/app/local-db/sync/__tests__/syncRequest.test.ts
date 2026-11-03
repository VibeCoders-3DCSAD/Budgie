import { jest } from "@jest/globals";
import { stalledResponse } from "../../../lib/helpers/__tests__/stalledResponse";

const mockRelease = jest.fn();
const mockAuthorizedFetch = jest.fn<(url: string, init?: RequestInit) => Promise<Response>>();
jest.mock("expo/virtual/env", () => ({ env: process.env }));
jest.mock("../../../lib/localAccess", () => ({
  authorizedFetch: (url: string, init?: RequestInit) => mockAuthorizedFetch(url, init),
  rejectServerSession: jest.fn(),
  trackProtectedRequest: () => mockRelease,
}));

afterEach(() => { jest.useRealTimers(); mockRelease.mockReset(); });

it("aborts a sync response whose body stalls, and stops tracking it only afterwards", async () => {
  jest.useFakeTimers();
  mockAuthorizedFetch.mockImplementation(async (_url, init) => stalledResponse(init?.signal));
  const { fetchWithTimeout } = await import("../syncRequest");

  const pending = fetchWithTimeout("https://example.test/sync/pull", { timeout: 1_000 }).catch((error: unknown) => error);
  await jest.advanceTimersByTimeAsync(999);
  expect(mockRelease).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);

  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(mockRelease).toHaveBeenCalledTimes(1);
});
