import { jest } from "@jest/globals";

jest.mock("expo/virtual/env", () => ({ env: process.env }));

// Headers arrive at once; the body never does unless the request is aborted.
function stalledBody(signal: AbortSignal | null | undefined) {
  return new Response(new ReadableStream({
    start(controller) {
      signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
    },
  }), { status: 200 });
}

describe("fetchWithTimeout", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

  it("aborts a response whose body stalls after the headers", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async (_input: unknown, init?: RequestInit) => stalledBody(init?.signal)) as unknown as typeof fetch;
    const { REQUEST_TIMEOUT_MS } = await import("../../api");
    const { fetchWithTimeout } = await import("../fetchWithTimeout");

    const pending = fetchWithTimeout("https://example.test").catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

    expect(await pending).toMatchObject({ name: "AbortError" });
  });

  it("still cancels the body when the caller aborts", async () => {
    global.fetch = jest.fn(async (_input: unknown, init?: RequestInit) => stalledBody(init?.signal)) as unknown as typeof fetch;
    const { fetchWithTimeout } = await import("../fetchWithTimeout");
    const caller = new AbortController();

    const pending = fetchWithTimeout("https://example.test", { signal: caller.signal }).catch((error: unknown) => error);
    caller.abort();

    expect(await pending).toMatchObject({ name: "AbortError" });
  });

  it("returns the full body and status, and an empty body for 204", async () => {
    global.fetch = jest.fn(async (input: unknown) => String(input).endsWith("/empty")
      ? new Response(null, { status: 204 })
      : Response.json({ ok: 1 }, { status: 201 })) as unknown as typeof fetch;
    const { fetchWithTimeout } = await import("../fetchWithTimeout");

    const created = await fetchWithTimeout("https://example.test/item");
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ ok: 1 });
    const empty = await fetchWithTimeout("https://example.test/empty");
    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe("");
  });
});
