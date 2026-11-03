import { fetchWithTimeout } from "../../../lib/http/fetchWithTimeout.js";

// Headers arrive at once; the body never does unless the request is aborted.
function stalledBody(signal: AbortSignal | null | undefined) {
  return new Response(new ReadableStream({
    start(controller) {
      signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
    },
  }));
}

describe("Supabase fetch deadline", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

  it("aborts a response whose body stalls after the headers", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async (_input: unknown, init?: RequestInit) => stalledBody(init?.signal)) as unknown as typeof fetch;

    const pending = fetchWithTimeout("https://example.test").catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await pending).toMatchObject({ name: "AbortError" });
  });

  it("still cancels when the SDK caller aborts", async () => {
    global.fetch = jest.fn(async (_input: unknown, init?: RequestInit) => stalledBody(init?.signal)) as unknown as typeof fetch;
    const caller = new AbortController();

    const pending = fetchWithTimeout("https://example.test", { signal: caller.signal }).catch((error: unknown) => error);
    caller.abort();

    expect(await pending).toMatchObject({ name: "AbortError" });
  });

  it("returns the full body and status, and an empty body for 204", async () => {
    global.fetch = jest.fn(async (input: unknown) => String(input).endsWith("/empty")
      ? new Response(null, { status: 204 })
      : Response.json({ ok: 1 }, { status: 201, headers: { "content-range": "0-0/1" } })) as unknown as typeof fetch;

    const created = await fetchWithTimeout("https://example.test/item");
    expect(created.status).toBe(201);
    expect(created.headers.get("content-range")).toBe("0-0/1");
    expect(await created.json()).toEqual({ ok: 1 });
    expect(await (await fetchWithTimeout("https://example.test/empty")).text()).toBe("");
  });
});
