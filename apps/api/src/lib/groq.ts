import { withTimeout } from "./http/withTimeout.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TIMEOUT_MS = 5_000;

export const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";

type GroqChatRequest = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: string;
};

// Sends a JSON-mode chat completion. `read` handles the response while the timeout still applies.
export function groqJsonChat<T>(fetcher: typeof fetch, request: GroqChatRequest, read: (response: Response) => Promise<T>): Promise<T> {
  return withTimeout(GROQ_TIMEOUT_MS, async (signal) => read(await fetcher(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${request.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: request.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: request.systemPrompt }, { role: "user", content: request.userContent }],
    }),
    signal,
  })));
}

// The first choice's message content from a chat completion response body.
export function groqMessageContent(payload: unknown): unknown {
  return (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
}
