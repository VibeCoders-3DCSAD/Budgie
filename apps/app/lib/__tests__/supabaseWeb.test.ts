import { jest } from "@jest/globals";

jest.mock("expo/virtual/env", () => ({ env: process.env }));
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({})) }));

describe("web Supabase client", () => {
  it("is created with the shared timeout transport", () => {
    const { createClient } = jest.requireMock("@supabase/supabase-js") as { createClient: jest.Mock };
    // The explicit extension selects the web/default module; the native preset would otherwise pick supabase.native.ts.
    require("../supabase.ts");
    const { fetchWithTimeout } = require("../helpers/fetchWithTimeout");

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), { global: { fetch: fetchWithTimeout } });
  });
});
