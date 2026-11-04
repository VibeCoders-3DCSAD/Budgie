import { completeDataExport, failDataExport, getDataExportBatch, requestDataExport } from "../api";
import { buildExportCsv, exportFileName } from "./csv";
import type { ExportSection } from "./csv";
import { EXPORT_BATCH_INTERVAL_MS } from "./constants";
import { ExportHttpError, createPacer, parseRetryAfter, sleep, withRetry } from "./retry";
import type { Sleep } from "./retry";

export type PreparedExport = { fileName: string; csv: string; rowCount: number };

type RunOptions = {
  isCancelled?: () => boolean;
  sleepFor?: Sleep;
  now?: () => Date;
};

// Raised when the screen that started the export went away; nothing is reported to the server.
export class ExportCancelledError extends Error {
  constructor() {
    super("Export cancelled");
    this.name = "ExportCancelledError";
  }
}

// Throws for a status the export cannot use, carrying Retry-After so a retry waits as long as the server asked.
function ensureOk(response: Response): void {
  if (response.ok) return;
  throw new ExportHttpError(response.status, parseRetryAfter(response.headers.get("Retry-After")));
}

async function startExport(accessToken: string, retry: <T>(task: () => Promise<T>) => Promise<T>) {
  return retry(async () => {
    const { response, body } = await requestDataExport(accessToken);
    ensureOk(response);
    if (!body.payload?.request.id || !Array.isArray(body.payload.datasets)) throw new ExportHttpError(502, null);
    return { requestId: body.payload.request.id, datasets: body.payload.datasets };
  });
}

async function fetchDataset(
  accessToken: string,
  requestId: string,
  dataset: string,
  { retry, pace, isCancelled }: {
    retry: <T>(task: () => Promise<T>) => Promise<T>;
    pace: () => Promise<void>;
    isCancelled: () => boolean;
  },
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  do {
    if (isCancelled()) throw new ExportCancelledError();
    const after: string | null = cursor;
    const batch = await retry(async () => {
      await pace();
      const { response, body } = await getDataExportBatch(accessToken, requestId, dataset, after);
      ensureOk(response);
      if (!body.payload || !Array.isArray(body.payload.rows)) throw new ExportHttpError(502, null);
      return body.payload;
    });
    rows.push(...batch.rows);
    cursor = batch.next_cursor;
  } while (cursor !== null);
  return rows;
}

// Starts an export, reads every dataset in paced batches with retries, and builds the CSV. The request is
// marked completed once the file is built, or failed when any step gives up; both updates are best effort.
export async function runDataExport(accessToken: string, options: RunOptions = {}): Promise<PreparedExport> {
  const { isCancelled = () => false, sleepFor = sleep, now = () => new Date() } = options;
  const retry = <T,>(task: () => Promise<T>) => withRetry(task, { sleepFor, isCancelled });
  const pace = createPacer(EXPORT_BATCH_INTERVAL_MS, Date.now, sleepFor);

  const { requestId, datasets } = await startExport(accessToken, retry);
  try {
    const sections: ExportSection[] = [];
    let rowCount = 0;
    for (const dataset of datasets) {
      const rows = await fetchDataset(accessToken, requestId, dataset, { retry, pace, isCancelled });
      rowCount += rows.length;
      sections.push({ dataset, rows });
    }

    const exportedAt = now();
    const csv = buildExportCsv(sections, exportedAt);
    // The file is complete either way; a request left open is replaced by the next export.
    await retry(async () => ensureOk((await completeDataExport(accessToken, requestId)).response)).catch(() => undefined);
    return { fileName: exportFileName(exportedAt), csv, rowCount };
  } catch (error) {
    if (!(error instanceof ExportCancelledError)) {
      const reason = error instanceof ExportHttpError ? `status ${error.status}` : "client error";
      await failDataExport(accessToken, requestId, reason).catch(() => undefined);
    }
    throw error;
  }
}
