import { useCallback, useEffect, useState } from "react";
import { getAccountDeletionHistory } from "../api";
import type { AccountDeletionRequest } from "../types";

// The user's recent deletion requests, including cancelled ones. Empty while loading, offline, or on error,
// so the history section simply stays hidden. `reload` refreshes it after a cancellation.
export function useDeletionHistory(accessToken: string, online: boolean) {
  const [requests, setRequests] = useState<AccountDeletionRequest[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    getAccountDeletionHistory(accessToken)
      .then(({ response, body }) => {
        if (cancelled || !response.ok) return;
        setRequests(body.payload?.requests ?? []);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [accessToken, online, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  return { requests, reload };
}
