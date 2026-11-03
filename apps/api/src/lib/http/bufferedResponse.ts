// Statuses whose Response must have a null body; the Response constructor rejects any other body for them.
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

// Reads the whole body and returns an equivalent Response holding it, so a request deadline covers the body
// and not only the headers.
export async function bufferedResponse(response: Response): Promise<Response> {
  const body = await response.arrayBuffer();
  return new Response(NULL_BODY_STATUSES.has(response.status) ? null : body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
