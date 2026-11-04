jest.mock("../../api", () => ({
  requestDataExport: jest.fn(),
  getDataExportBatch: jest.fn(),
  completeDataExport: jest.fn(),
  failDataExport: jest.fn(),
}));

import { completeDataExport, failDataExport, getDataExportBatch, requestDataExport } from "../../api";
import { runDataExport } from "../runDataExport";

const mockRequest = requestDataExport as jest.Mock;
const mockBatch = getDataExportBatch as jest.Mock;
const mockComplete = completeDataExport as jest.Mock;
const mockFail = failDataExport as jest.Mock;

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return { response: { ok: status >= 200 && status < 300, status, headers: new Headers(headers) }, body };
}

const noWait = async () => {};
const exportedAt = () => new Date("2026-11-04T08:00:00Z");

beforeEach(() => {
  jest.resetAllMocks();
  mockRequest.mockResolvedValue(reply(201, { payload: { request: { id: "req-1", status: "requested" }, datasets: ["accounts", "transactions"] } }));
  mockComplete.mockResolvedValue(reply(200, {}));
  mockFail.mockResolvedValue(reply(200, {}));
});

describe("runDataExport", () => {
  it("reads every dataset page by page and builds one CSV", async () => {
    mockBatch.mockImplementation(async (_token: string, _id: string, dataset: string, after: string | null) => {
      if (dataset === "accounts") return reply(200, { payload: { dataset, rows: [{ id: "a1", name: "Cash" }], next_cursor: null } });
      if (after === null) return reply(200, { payload: { dataset, rows: [{ id: "t1", amount_centavos: 5000 }], next_cursor: "t1" } });
      return reply(200, { payload: { dataset, rows: [{ id: "t2", amount_centavos: 250 }], next_cursor: null } });
    });

    const prepared = await runDataExport("token", { sleepFor: noWait, now: exportedAt });

    expect(mockBatch.mock.calls.map((call) => [call[2], call[3]])).toEqual([["accounts", null], ["transactions", null], ["transactions", "t1"]]);
    expect(prepared.fileName).toBe("budgie-export-2026-11-04.csv");
    expect(prepared.rowCount).toBe(3);
    expect(prepared.csv).toContain("transactions\r\nid,amount_php\r\nt1,50.00\r\nt2,2.50");
    expect(mockComplete).toHaveBeenCalledWith("token", "req-1");
    expect(mockFail).not.toHaveBeenCalled();
  });

  it("retries a rate-limited batch after the server's Retry-After", async () => {
    const sleeps: number[] = [];
    mockBatch
      .mockResolvedValueOnce(reply(429, {}, { "Retry-After": "3" }))
      .mockResolvedValue(reply(200, { payload: { dataset: "x", rows: [], next_cursor: null } }));

    await runDataExport("token", { sleepFor: async (ms) => { sleeps.push(ms); }, now: exportedAt });

    expect(sleeps).toContain(3_000);
    expect(mockComplete).toHaveBeenCalled();
  });

  it("marks the request failed when a batch keeps failing", async () => {
    mockBatch.mockResolvedValue(reply(500, {}));

    await expect(runDataExport("token", { sleepFor: noWait })).rejects.toThrow();

    expect(mockFail).toHaveBeenCalledWith("token", "req-1", "status 500");
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("stops without reporting when the screen goes away", async () => {
    let cancelled = false;
    mockBatch.mockImplementation(async () => {
      cancelled = true;
      return reply(200, { payload: { dataset: "accounts", rows: [{ id: "a1" }], next_cursor: "a1" } });
    });

    await expect(runDataExport("token", { sleepFor: noWait, isCancelled: () => cancelled })).rejects.toThrow("Export cancelled");

    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(mockFail).not.toHaveBeenCalled();
  });

  it("still returns the file when marking the request completed fails", async () => {
    mockBatch.mockResolvedValue(reply(200, { payload: { dataset: "x", rows: [], next_cursor: null } }));
    mockComplete.mockResolvedValue(reply(409, {}));

    await expect(runDataExport("token", { sleepFor: noWait })).resolves.toMatchObject({ rowCount: 0 });
  });
});

describe("runDataExport progress", () => {
  it("reports each dataset and batch in order, then building", async () => {
    mockBatch.mockImplementation(async (_token: string, _id: string, dataset: string, after: string | null) => {
      if (dataset === "accounts") return reply(200, { payload: { dataset, rows: [{ id: "a1" }], next_cursor: null } });
      if (after === null) return reply(200, { payload: { dataset, rows: [{ id: "t1" }], next_cursor: "t1" } });
      return reply(200, { payload: { dataset, rows: [{ id: "t2" }], next_cursor: null } });
    });
    const stages: string[] = [];

    await runDataExport("token", {
      sleepFor: noWait,
      now: exportedAt,
      onProgress: (p) => stages.push(`${p.stage}:${p.dataset ?? "-"}:${p.datasetIndex}/${p.datasetCount}:b${p.batch}:r${p.rowCount}`),
    });

    expect(stages).toEqual([
      "starting:-:0/0:b0:r0",
      "reading:accounts:0/2:b1:r0",
      "reading:transactions:1/2:b1:r1",
      "reading:transactions:1/2:b2:r2",
      "building:-:2/2:b0:r3",
    ]);
  });

  it("reports a rate-limited pause without losing its place, then reads the same batch again", async () => {
    mockBatch
      .mockResolvedValueOnce(reply(429, {}, { "Retry-After": "1" }))
      .mockResolvedValue(reply(200, { payload: { dataset: "x", rows: [], next_cursor: null } }));
    const stages: string[] = [];

    await runDataExport("token", { sleepFor: noWait, now: exportedAt, onProgress: (p) => stages.push(`${p.stage}:${p.dataset ?? "-"}:b${p.batch}`) });

    expect(stages.slice(0, 4)).toEqual(["starting:-:b0", "reading:accounts:b1", "rate-limited:accounts:b1", "reading:accounts:b1"]);
  });
});

describe("runDataExport rate limits", () => {
  it("says when a rate-limited batch resumes, and reports other failures as retrying", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000);
    mockBatch
      .mockResolvedValueOnce(reply(429, {}, { "Retry-After": "4" }))
      .mockResolvedValueOnce(reply(503, {}))
      .mockResolvedValue(reply(200, { payload: { dataset: "x", rows: [], next_cursor: null } }));
    const paused: unknown[] = [];

    await runDataExport("token", {
      sleepFor: noWait,
      now: exportedAt,
      onProgress: (p) => { if (p.stage === "rate-limited" || p.stage === "retrying") paused.push([p.stage, p.resumesAt]); },
    });

    expect(paused).toEqual([["rate-limited", 5_000], ["retrying", null]]);
    jest.restoreAllMocks();
  });

  it("stops at once when the server asks for a longer wait than a retry holds for", async () => {
    mockRequest.mockResolvedValue(reply(429, {}, { "Retry-After": "1800" }));

    await expect(runDataExport("token", { sleepFor: noWait, now: exportedAt })).rejects.toMatchObject({ status: 429, retryAfterMs: 1_800_000 });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});
