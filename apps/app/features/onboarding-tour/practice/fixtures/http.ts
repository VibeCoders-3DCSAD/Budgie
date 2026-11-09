// Responses shaped like the Odin API's, for the practice responder.
export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function payload(body: unknown): Response {
  return json(200, { payload: body });
}

// Refused during the tour: account and consent changes never happen on practice data.
export function refused(): Response {
  return json(403, { error: "Forbidden", message: "This action is not available during the tutorial. Finish or pause the tour to continue." });
}

export async function requestBody(init: RequestInit): Promise<Record<string, unknown>> {
  if (typeof init.body !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(init.body);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
