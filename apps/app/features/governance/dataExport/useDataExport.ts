import { useCallback, useEffect, useRef, useState } from "react";
import { runDataExport } from "./runDataExport";
import type { ExportProgress, PreparedExport } from "./runDataExport";
import { saveExportFile } from "./saveExportFile";
import { isRateLimited } from "./retry";

export type DataExportState =
  | { kind: "idle" }
  | { kind: "preparing"; progress: ExportProgress | null }
  | { kind: "ready"; prepared: PreparedExport; saving: boolean; saved: boolean }
  // `retryAfterMs` is set when the server refused for rate limiting and said how long to wait.
  | { kind: "failed"; retryAfterMs: number | null };

// Prepares the export, then offers it for saving at once. The prepared file stays in memory while the
// screen is open, so a closed picker or a second copy does not need another export.
export function useDataExport(accessToken: string) {
  const [state, setState] = useState<DataExportState>({ kind: "idle" });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const save = useCallback(async (prepared: PreparedExport) => {
    setState({ kind: "ready", prepared, saving: true, saved: false });
    let saved = false;
    try {
      saved = (await saveExportFile(prepared.fileName, prepared.csv)).saved;
    } catch (error) {
      console.error("[data-export] saving the export file failed", error);
    }
    if (mounted.current) setState({ kind: "ready", prepared, saving: false, saved });
    return saved;
  }, []);

  const start = useCallback(async () => {
    setState({ kind: "preparing", progress: null });
    const onProgress = (progress: ExportProgress) => {
      if (mounted.current) setState({ kind: "preparing", progress });
    };
    let prepared: PreparedExport;
    try {
      prepared = await runDataExport(accessToken, { isCancelled: () => !mounted.current, onProgress });
    } catch (error) {
      const retryAfterMs = isRateLimited(error) ? error.retryAfterMs : null;
      if (mounted.current) setState({ kind: "failed", retryAfterMs });
      return;
    }
    if (mounted.current) await save(prepared);
  }, [accessToken, save]);

  return { state, start, save };
}
