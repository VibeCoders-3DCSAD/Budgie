import { jest } from "@jest/globals";

jest.mock("../../lib/supabase.js", () => {
  const mockClient = { auth: { getUser: jest.fn() } };
  return { supabase: mockClient, createAuthenticatedSupabaseClient: () => mockClient };
});

import { isCursorMap } from "../../services/sync/syncRequestValidation.js";
import { SYNCED_TABLES } from "../../services/sync/syncService.js";

const validCursor = { ts: "2026-01-01T00:00:00.000Z", id: "00000000-0000-0000-0000-000000000002" };
const initialCursor = { ts: "1970-01-01T00:00:00.000Z", id: "" };

describe("sync pull cursor validation", () => {
  it("accepts cursors for every table the pull service synchronizes", () => {
    const cursors = Object.fromEntries(SYNCED_TABLES.map((table) => [table, initialCursor]));

    expect(isCursorMap(cursors)).toBe(true);
  });

  it("accepts mixed initialized and advanced table cursors", () => {
    const cursors = Object.fromEntries(SYNCED_TABLES.map((table) => [table, initialCursor]));
    cursors.transactions = validCursor;

    expect(isCursorMap(cursors)).toBe(true);
  });
});
