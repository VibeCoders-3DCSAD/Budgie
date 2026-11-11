import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildPracticeSeed } from "../seed";
import { DEBT_IDS } from "../seed/debts";
import { createPracticeResponder } from "../respond";
import { subcategoryLookup } from "../taxonomy";
import type { FinancialPlanRecommendation } from "../../../financial-plan/types";
import { PRACTICE_USER, practiceTaxonomy } from "./practiceTaxonomy";

const BASE = "https://odin.test";
const today = "2026-11-09";
const taxonomy = practiceTaxonomy();
const data = { today, taxonomy, seed: buildPracticeSeed({ userId: PRACTICE_USER, today, subcategoryId: subcategoryLookup(taxonomy) }) };

function responder() {
  const server = jest.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status: 200 }));
  return { server, respond: createPracticeResponder(data, server) };
}

async function post(path: string, body: unknown = {}) {
  const { respond } = responder();
  const response = await respond(`${BASE}${path}`, { method: "POST", body: JSON.stringify(body) });
  return { response, body: await response.json() as { payload: any } };
}

const plan = (body: Record<string, unknown>) => post("/odin/api/financial-plans/recommendation", { includedSubcategoryIds: [], includedCategoryIds: [], manualAllocations: [], ...body })
  .then((result) => result.body.payload as FinancialPlanRecommendation);

describe("practice responder", () => {
  it("answers every endpoint the app calls, passes through settings reads, or refuses it on purpose", async () => {
    const refusedByDesign = ["/odin/api/auth", "/odin/api/consents", "/odin/api/data-export-requests", "/odin/api/account-deletion-requests/", "/odin/api/onboarding/sessions", "/odin/api/sync/"];
    const paths = sourcePaths(join(__dirname, "../../../.."));
    const { respond, server } = responder();
    for (const path of paths) {
      const statuses = await Promise.all(["GET", "POST"].map(async (method) => (await respond(`${BASE}${path}`, { method })).status));
      const answered = statuses.some((status) => status !== 403);
      expect({ path, handled: answered || refusedByDesign.some((prefix) => path.startsWith(prefix)) }).toEqual({ path, handled: true });
    }
    expect(paths.length).toBeGreaterThan(20);
    expect(server.mock.calls.every(([url]) => /\/(me|onboarding\/preferences|account-deletion-requests(\/active)?)$/.test(new URL(String(url)).pathname))).toBe(true);
  });

  it("refuses logout, consent, export, and deletion without reaching the server", async () => {
    const { respond, server } = responder();
    for (const [method, path] of [["POST", "/odin/api/auth/logout"], ["POST", "/odin/api/consents"], ["POST", "/odin/api/data-export-requests"], ["POST", "/odin/api/account-deletion-requests"], ["PATCH", "/odin/api/onboarding/preferences"]]) {
      expect((await respond(`${BASE}${path}`, { method })).status).toBe(403);
    }
    expect(server).not.toHaveBeenCalled();
  });

  it("reads the user's own consents and preferences from the server", async () => {
    const { respond, server } = responder();
    await respond(`${BASE}/odin/api/me?include=consents`, { method: "GET" });
    await respond(`${BASE}/odin/api/onboarding/preferences`, {});
    expect(server).toHaveBeenCalledTimes(2);
  });

  it("lists this month's loans, goals, and bills as commitments", async () => {
    const { body } = await post("/odin/api/financial-plans/commitments");
    expect(body.payload.period).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(body.payload.debtReservations.map((row: any) => row.debtAccountId).filter(Boolean)).toEqual([DEBT_IDS.motorcycle, DEBT_IDS.sss]);
    expect(body.payload.savingsReservations).toHaveLength(2);
    expect(body.payload.obligations.map((row: any) => row.label)).toContain("Condo rent");
  });

  it("plans Food and Groceries at her usual spending and points the surplus at the motorcycle loan", async () => {
    const result = await plan({ includedCategoryIds: ["cat-food"], includedSubcategoryIds: ["sub-transport_public"], plannedAmountCentavos: 8_100_000 });
    expect(result.status).toBe("RECOMMENDATION_READY");
    expect(result.recommendation.allocations.map((row) => [row.label, row.allocatedAmountCentavos === row.forecastAmountCentavos])).toEqual([["Food and Groceries", true], ["transport_public", true]]);
    expect(result.recommendation.allocations[0]!.allocatedAmountCentavos).toBeGreaterThan(0);
    expect(result.recommendation.surplusRecommendation?.advisoryDestination).toEqual({ type: "debt", debtAccountId: DEBT_IDS.motorcycle, label: "Honda Click motorcycle" });
    expect(result.explanations[0]).toMatch(/^Food and Groceries gets ₱/);
  });

  it("scales categories down to fit, and reports a shortfall when commitments alone do not fit", async () => {
    const tight = await plan({ includedCategoryIds: ["cat-food"], plannedAmountCentavos: 5_500_000 });
    const food = tight.recommendation.allocations[0]!;
    expect(food.allocatedAmountCentavos).toBeLessThan(food.forecastAmountCentavos!);
    const short = await plan({ includedCategoryIds: ["cat-food"], plannedAmountCentavos: 1_000_000 });
    expect(short.status).toBe("INFEASIBLE");
    expect(short.recommendation.shortfallCentavos).toBeGreaterThan(0);
  });

  it("keeps manual amounts and skipped commitments as the user set them", async () => {
    const result = await plan({ includedCategoryIds: ["cat-food"], plannedAmountCentavos: 8_100_000, manualAllocations: [{ target: "category", id: "cat-food", amountCentavos: 1_200_000 }], skipDebtRepayments: true });
    expect(result.recommendation.allocations[0]).toMatchObject({ allocationRule: "FIXED", allocatedAmountCentavos: 1_200_000 });
    expect(result.recommendation.debtReservations).toEqual([]);
  });

  it("echoes the plan's explanations and shows a healthy profile", async () => {
    const explained = await post("/odin/api/financial-plans/explanations", { explanations: ["a"] });
    expect(explained.body.payload).toEqual({ explanations: ["a"] });
    const { body } = await post("/odin/api/financial-classification/v2/assess");
    expect(body.payload.assessment.output_snapshot).toMatchObject({
      emergency_savings: { label: "EMERGENCY_FUND_ADEQUATE", value: 6 },
      financial_margin: { label: "POSITIVE_FINANCIAL_MARGIN" },
      credit_card_behavior: [{ label: "TRANSACTOR" }],
    });
  });

  it("forecasts this month and the next quarter from the practice history", async () => {
    const monthly = await post("/odin/api/forecast", { historicalTransactions: [] });
    expect(monthly.body.payload.snapshot).toMatchObject({ month: "2026-11", quality: "PERSONALIZED" });
    expect(monthly.body.payload.snapshot.totalAmountCentavos).toBeGreaterThan(0);
    const quarterly = await post("/odin/api/forecast/quarterly", { historicalTransactions: [] });
    expect(quarterly.body.payload.months.map((row: any) => row.month)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(quarterly.body.payload.months[1].totalCentavos).toBeGreaterThan(quarterly.body.payload.months[0].totalCentavos);
    // The app's quarter labels, which it parses to add scheduled payments.
    expect(quarterly.body.payload.quarters.map((row: any) => row.quarter)).toEqual(["2026Q4", "2027Q1"]);
  });

  it("forecasts from asOf, from the history the app sends, so Reports can compare last month", async () => {
    const historicalTransactions = ["2026-07-15", "2026-08-15", "2026-09-15"].map((date, index) => ({ transactionId: `t${index}`, date, amount: 300, category: "food", transactionType: "expense" }));
    const quarterly = await post("/odin/api/forecast/quarterly", { asOf: "2026-10-01", historicalTransactions });
    expect(quarterly.body.payload.months[0]).toEqual({ month: "2026-10", totalCentavos: 30_000, categories: [{ category: "food", amountCentavos: 30_000 }] });
  });
});

// Every "/odin/api/..." path the app's source mentions, with template parts replaced by a sample id.
function sourcePaths(root: string): string[] {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) {
        for (const match of readFileSync(full, "utf8").matchAll(/\/odin\/api\/[A-Za-z0-9/_${}.?=-]*/g)) {
          found.add(match[0].replace(/\$\{[^}]+\}/g, "sample").split("?")[0]!.replace(/\/$/, ""));
        }
      }
    }
  };
  for (const dir of ["features", "services", "lib", "local-db", "hooks", "app"]) walk(join(root, dir));
  return [...found].filter((path) => path !== "/odin/api");
}
