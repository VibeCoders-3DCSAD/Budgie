import { jest } from "@jest/globals";
import { ForecastInterpretationValidationError, interpretForecast, parseForecastInterpretationRequest } from "../../../services/forecast/forecastInterpretationService";

const notes = [
  "From Oct–Dec 2026 to Jul–Sep 2027, your spending will likely go up from about PHP 15,000 to PHP 16,500 every 3 months.",
  "Food and groceries is your biggest expense, about 7 of every 10 pesos you spend.",
];

const groq = (rewrites: unknown) => jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ notes: rewrites }) } }] }) });

describe("forecast interpretation service", () => {
  const originalApiKey = process.env.GROQ_API_KEY;
  afterEach(() => { if (originalApiKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalApiKey; });

  it("accepts only a short list of non-empty notes", () => {
    expect(parseForecastInterpretationRequest({ notes: [" A note. "] })).toEqual(["A note."]);
    expect(() => parseForecastInterpretationRequest({ notes: [] })).toThrow(ForecastInterpretationValidationError);
    expect(() => parseForecastInterpretationRequest({ notes: ["x".repeat(321)] })).toThrow(ForecastInterpretationValidationError);
    expect(() => parseForecastInterpretationRequest({ notes: Array(7).fill("note") })).toThrow(ForecastInterpretationValidationError);
  });

  it("uses Groq's wording when every amount and month range is kept", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const rewrites = [
      "Heads up, your spending will likely go up a bit. Every 3 months, expect around PHP 15,000 in Oct–Dec 2026, rising to PHP 16,500 by Jul–Sep 2027.",
      "Most of your money goes to food and groceries, about 7 of every 10 pesos.",
    ];
    const fetcher = groq(rewrites);
    await expect(interpretForecast(notes, fetcher as unknown as typeof fetch)).resolves.toEqual(rewrites);
    const [, init] = fetcher.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).messages[1].content).toContain("PHP 15,000");
  });

  it("keeps the original note when a rewrite changes an amount or uses technical words", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const fetcher = groq([
      "Your spending may go from PHP 15,000 to PHP 17,000 every 3 months (Oct–Dec 2026 to Jul–Sep 2027).",
      "Food and groceries is your biggest forecast category, about 7 of every 10 pesos.",
    ]);
    await expect(interpretForecast(notes, fetcher as unknown as typeof fetch)).resolves.toEqual(notes);
  });

  it("keeps a monthly note when a rewrite changes or shortens its month", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const monthly = ["Your most expensive month will likely be December 2026, at about PHP 8,000. Try to save a little extra before then."];
    await expect(interpretForecast(monthly, groq(["Dec 2026 may cost you about PHP 8,000, so set a little aside before then."]) as unknown as typeof fetch)).resolves.toEqual(monthly);
    await expect(interpretForecast(monthly, groq(["November 2026 may cost you about PHP 8,000, so set a little aside before then."]) as unknown as typeof fetch)).resolves.toEqual(monthly);
    const kept = ["December 2026 will likely cost you about PHP 8,000, so set a little aside before then."];
    await expect(interpretForecast(monthly, groq(kept) as unknown as typeof fetch)).resolves.toEqual(kept);
  });

  it("keeps the original note when a rewrite says may or might, but allows the month May", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const may = ["Your most expensive month will likely be May 2027, at about PHP 8,000."];
    await expect(interpretForecast(may, groq(["You may spend about PHP 8,000 in May 2027, your priciest month."]) as unknown as typeof fetch)).resolves.toEqual(may);
    await expect(interpretForecast(may, groq(["May 2027 might cost about PHP 8,000."]) as unknown as typeof fetch)).resolves.toEqual(may);
    const kept = ["May 2027 will likely be your priciest month, at about PHP 8,000."];
    await expect(interpretForecast(may, groq(kept) as unknown as typeof fetch)).resolves.toEqual(kept);
  });

  it("returns the original notes when Groq is unconfigured, fails, or returns the wrong count", async () => {
    delete process.env.GROQ_API_KEY;
    const unused = jest.fn();
    await expect(interpretForecast(notes, unused as unknown as typeof fetch)).resolves.toEqual(notes);
    expect(unused).not.toHaveBeenCalled();

    process.env.GROQ_API_KEY = "test-key";
    await expect(interpretForecast(notes, jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch)).resolves.toEqual(notes);
    await expect(interpretForecast(notes, jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch)).resolves.toEqual(notes);
    await expect(interpretForecast(notes, groq(["Only one note."]) as unknown as typeof fetch)).resolves.toEqual(notes);
  });
});
