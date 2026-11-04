import { useCallback, useEffect, useState } from "react";
import { cancelAccountDeletion, getActiveAccountDeletion } from "../api";
import type { AccountDeletionRequest } from "../types";

export type ActiveDeletionState =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "unavailable" }
  | { kind: "active"; request: AccountDeletionRequest };

// The user's open deletion request, if any, and a way to cancel it before the daily job deletes the account.
export function useActiveAccountDeletion(accessToken: string, online: boolean) {
  const [state, setState] = useState<ActiveDeletionState>({ kind: "loading" });

  useEffect(() => {
    if (!online) {
      setState({ kind: "unavailable" });
      return;
    }
    let cancelled = false;
    getActiveAccountDeletion(accessToken)
      .then(({ response, body }) => {
        if (cancelled) return;
        if (!response.ok) {
          setState({ kind: "unavailable" });
          return;
        }
        const request = body.payload?.request ?? null;
        setState(request ? { kind: "active", request } : { kind: "none" });
      })
      .catch(() => { if (!cancelled) setState({ kind: "unavailable" }); });
    return () => { cancelled = true; };
  }, [accessToken, online]);

  const cancel = useCallback(async (requestId: string): Promise<boolean> => {
    const { response } = await cancelAccountDeletion(accessToken, requestId);
    if (response.ok) setState({ kind: "none" });
    return response.ok;
  }, [accessToken]);

  return { state, cancel };
}
