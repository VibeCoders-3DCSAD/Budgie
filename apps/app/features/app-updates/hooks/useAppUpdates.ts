import { useCallback, useEffect, useState } from "react";
import { findAvailableUpdate, findUnseenReleaseNotes, markReleaseNotesSeen } from "../services/appUpdateChecks";
import type { AppRelease } from "../services/githubReleases";

// Checks run once per app open; a failed check stays quiet and retries on the next open.
export function useAppUpdates() {
  const [availableUpdate, setAvailableUpdate] = useState<AppRelease | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<AppRelease | null>(null);

  useEffect(() => {
    let active = true;
    findUnseenReleaseNotes()
      .then((release) => { if (active) setReleaseNotes(release); })
      .catch((error: unknown) => console.warn("Release notes check failed", error));
    findAvailableUpdate()
      .then((release) => { if (active) setAvailableUpdate(release); })
      .catch((error: unknown) => console.warn("Update check failed", error));
    return () => { active = false; };
  }, []);

  const dismissReleaseNotes = useCallback(() => {
    if (releaseNotes) void markReleaseNotesSeen(releaseNotes).catch((error: unknown) => console.warn("Saving seen version failed", error));
    setReleaseNotes(null);
  }, [releaseNotes]);

  const dismissUpdate = useCallback(() => setAvailableUpdate(null), []);

  return { availableUpdate, releaseNotes, dismissReleaseNotes, dismissUpdate };
}
