import { completeDataExport, failDataExport, getDataExportBatch, requestDataExport } from "../api";
import { buildExportCsv, exportFileName } from "./csv";
import type { ExportSection } from "./csv";
import { EXPORT_BATCH_INTERVAL_MS } from "./constants";
import { ExportHttpError, ExportLimitError, createPacer, isRateLimited, parseRetryAfter, sleep, withRetry } from "./retry";
import type { Sleep } from "./retry";

export type PreparedExport = { fileName: string; csv: string; rowCount: number };

// Where a running export is: the dataset being read (by position in the file), the batch within it, and the
// records read so far. `datasetCount` is 0 until the server has listed the datasets. While rate-limited,
// `resumesAt` is when the paused request goes out again (ms since epoch); otherwise it is null.
export type ExportProgress = {
  stage: "starting" | "reading" | "retrying" | "rate-limited" | "building";
  dataset: string | null;
  datasetIndex: number;
  datasetCount: number;
  batch: number;
  rowCount: number;
  resumesAt: number | null;
};

type RunOptions = {
  isCancelled?: () => boolean;
  onProgress?: (progress: ExportProgress) => void;
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

// The hourly limit on new exports outlasts any retry, so a 429 here stops the export at once.
async function startExport(accessToken: string, retry: <T>(task: () => Promise<T>) => Promise<T>) {
  try {
    return await retry(async () => {
      const { response, body } = await requestDataExport(accessToken);
      ensureOk(response);
      if (!body.payload?.request.id || !Array.isArray(body.payload.datasets)) throw new ExportHttpError(502, null);
      return { requestId: body.payload.request.id, datasets: body.payload.datasets };
    });
  } catch (error) {
    if (isRateLimited(error)) throw new ExportLimitError(error.retryAfterMs);
    throw error;
  }
}

async function fetchDataset(
  accessToken: string,
  requestId: string,
  dataset: string,
  { retry, pace, isCancelled, onBatch }: {
    retry: <T>(task: () => Promise<T>) => Promise<T>;
    pace: () => Promise<void>;
    isCancelled: () => boolean;
    onBatch: (batch: number, rowsRead: number) => void;
  },
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  let batchNumber = 0;
  do {
    if (isCancelled()) throw new ExportCancelledError();
    batchNumber += 1;
    const after: string | null = cursor;
    const batch = await retry(async () => {
      await pace();
      // Reported on every attempt, so a retried batch shows as reading again once the wait is over.
      onBatch(batchNumber, rows.length);
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
  const { isCancelled = () => false, onProgress = () => undefined, sleepFor = sleep, now = () => new Date() } = options;
  let latest: ExportProgress = { stage: "starting", dataset: null, datasetIndex: 0, datasetCount: 0, batch: 0, rowCount: 0, resumesAt: null };
  const report = (progress: ExportProgress) => {
    latest = progress;
    onProgress(progress);
  };
  // A retry keeps where the export got to and only changes the stage; a 429 also says when it resumes.
  const onRetry = (error: unknown, delayMs: number) => {
    if (isRateLimited(error)) {
      onProgress({ ...latest, stage: "rate-limited", resumesAt: Date.now() + delayMs });
      return;
    }
    onProgress({ ...latest, stage: "retrying" });
  };
  const retry = <T,>(task: () => Promise<T>) => withRetry(task, { sleepFor, isCancelled, onRetry });
  const retryStart = <T,>(task: () => Promise<T>) => withRetry(task, { sleepFor, isCancelled, onRetry, retryRateLimited: false });
  const pace = createPacer(EXPORT_BATCH_INTERVAL_MS, Date.now, sleepFor);

  report(latest);
  const { requestId, datasets } = await startExport(accessToken, retryStart);
  const datasetCount = datasets.length;
  try {
    const sections: ExportSection[] = [];
    let rowCount = 0;
    for (const [datasetIndex, dataset] of datasets.entries()) {
      const onBatch = (batch: number, rowsRead: number) =>
        report({ stage: "reading", dataset, datasetIndex, datasetCount, batch, rowCount: rowCount + rowsRead, resumesAt: null });
      const rows = await fetchDataset(accessToken, requestId, dataset, { retry, pace, isCancelled, onBatch });
      rowCount += rows.length;
      sections.push({ dataset, rows });
    }

    report({ stage: "building", dataset: null, datasetIndex: datasetCount, datasetCount, batch: 0, rowCount, resumesAt: null });
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
