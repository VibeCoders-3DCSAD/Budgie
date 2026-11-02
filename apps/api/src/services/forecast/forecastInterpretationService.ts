const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_FORECAST_MODEL = "qwen/qwen3.8-27b";
const MAX_NOTES = 6;
const MAX_NOTE_LENGTH = 320;

export class ForecastInterpretationValidationError extends Error {}

const systemPrompt = `You reword short notes about a person's estimated spending for the coming months in Odin, a budgeting app.

You are a rewording layer only. Every amount, month range, and expense name in NOTES is final. Never add facts, amounts, dates, reasons, causes, prices, inflation, holidays, events, or advice that is not already in a note. Never explain why spending changes.

Write in simple, warm English for everyday Filipino readers, like a helpful friend. Use one or two short sentences per note. Avoid technical words such as forecast, projected, quarter, category, baseline, trend, model, and HFCE. Do not pressure, shame, or create urgency. Never use "may" or "might"; say "will likely" instead, because readers can take "may" to mean permission.

Keep every peso amount exactly as written (for example "PHP 16,500") and every month or month range exactly as written (for example "December 2026" or "Jan–Mar 2027"). Keep the notes in the same order and return exactly one rewritten note for each input note.

Return valid JSON only in this exact shape:
{"notes":["rewritten note 1","rewritten note 2"]}`;

export function parseForecastInterpretationRequest(value: unknown): string[] {
  const notes = value && typeof value === "object" && !Array.isArray(value) ? (value as { notes?: unknown }).notes : undefined;
  if (!Array.isArray(notes) || notes.length === 0 || notes.length > MAX_NOTES || !notes.every((note) => typeof note === "string" && note.trim().length > 0 && note.length <= MAX_NOTE_LENGTH)) {
    throw new ForecastInterpretationValidationError("notes must contain between 1 and 6 short strings");
  }
  return notes.map((note: string) => note.trim());
}

// Peso amounts, years, months, and month ranges a note states; a rewrite must state exactly the same ones.
function facts(note: string): string {
  const numbers = note.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? [];
  const months = note.match(/\b(?:(?:Jan|Apr|Jul|Oct)–(?:Mar|Jun|Sep|Dec)|January|February|March|April|May|June|July|August|September|October|November|December)\b/g) ?? [];
  return [...numbers, ...months].sort().join("|");
}

function isFaithfulRewrite(original: string, rewrite: unknown): rewrite is string {
  return typeof rewrite === "string"
    && rewrite.trim().length > 0 && rewrite.length <= MAX_NOTE_LENGTH
    && facts(original) === facts(rewrite)
    && !/\bhfce\b|household final consumption|\bforecast|\bquarter|\bQ[1-4]\b/i.test(rewrite)
    // Lowercase only, so the month May still passes.
    && !/\b(?:may|might)\b/.test(rewrite);
}

// Returns Groq's friendlier wording, or the original notes when Groq is unavailable or changes a fact.
export async function interpretForecast(notes: string[], fetcher: typeof fetch = fetch, userId?: string): Promise<string[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.info("forecast Groq interpretation skipped", { user_id: userId ?? null, reason: "api_key_unconfigured" });
    return notes;
  }
  const model = process.env.GROQ_FORECAST_MODEL ?? DEFAULT_GROQ_FORECAST_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  const startedAt = Date.now();
  try {
    const response = await fetcher(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `NOTES:\n${JSON.stringify(notes)}` }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn("forecast Groq interpretation failed", { user_id: userId ?? null, status: response.status, duration_ms: Date.now() - startedAt });
      return notes;
    }
    const content = ((await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    const rewrites = typeof content === "string" && content.length <= 10_000 ? (JSON.parse(content) as { notes?: unknown }).notes : undefined;
    if (!Array.isArray(rewrites) || rewrites.length !== notes.length) {
      console.warn("forecast Groq interpretation failed", { user_id: userId ?? null, reason: "invalid_response", duration_ms: Date.now() - startedAt });
      return notes;
    }
    // A rewrite that drops or changes an amount keeps its original note.
    const result = notes.map((note, index) => isFaithfulRewrite(note, rewrites[index]) ? (rewrites[index] as string).trim() : note);
    console.info("forecast Groq interpretation completed", { user_id: userId ?? null, model, rewritten_count: result.filter((note, index) => note !== notes[index]).length, duration_ms: Date.now() - startedAt });
    return result;
  } catch (error) {
    console.warn("forecast Groq interpretation failed", { user_id: userId ?? null, reason: error instanceof Error && error.name === "AbortError" ? "timeout" : error instanceof SyntaxError ? "invalid_json" : "request_error", duration_ms: Date.now() - startedAt });
    return notes;
  } finally {
    clearTimeout(timeout);
  }
}
