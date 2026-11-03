// Statuses whose Response must have a null body; the Response constructor rejects any other body for them.
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * Reads the whole body and returns an equivalent Response holding it, so a request deadline can cover the body
 * and not only the headers. The body is read as text: React Native's fetch cannot reliably produce an ArrayBuffer,
 * and every caller of these helpers (Supabase, the Odin API) sends JSON.
 */
export async function bufferedResponse(response: Response): Promise<Response> {
  const body = await response.text();
  return new Response(NULL_BODY_STATUSES.has(response.status) ? null : body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
