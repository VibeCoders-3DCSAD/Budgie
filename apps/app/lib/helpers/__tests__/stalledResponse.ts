// A response whose headers arrive at once and whose body never does, unless the request is aborted.
export function stalledResponse(signal: AbortSignal | null | undefined): Response {
  return new Response(new ReadableStream({
    start(controller) {
      signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
    },
  }));
}
