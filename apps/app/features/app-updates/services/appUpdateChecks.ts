import { isNewerVersion } from "../helpers/versions";
import { fetchLatestRelease, fetchReleaseForVersion, type AppRelease } from "./githubReleases";
import { installedVersion, readLastSeenVersion, writeLastSeenVersion } from "./installedVersion";

export async function findAvailableUpdate(): Promise<AppRelease | null> {
  const current = installedVersion();
  if (!current) return null;
  const latest = await fetchLatestRelease();
  if (!latest || !isNewerVersion(latest.version, current)) return null;
  return latest;
}

/** Notes for the build just installed, once per version. The caller marks them seen on dismiss. */
export async function findUnseenReleaseNotes(): Promise<AppRelease | null> {
  const current = installedVersion();
  if (!current) return null;
  const lastSeen = await readLastSeenVersion();
  if (lastSeen === current) return null;
  // A fresh install has nothing to compare against, and a downgrade has nothing new to show.
  if (lastSeen === null || !isNewerVersion(current, lastSeen)) {
    await writeLastSeenVersion(current);
    return null;
  }
  const release = await fetchReleaseForVersion(current);
  if (!release || !release.notes.trim()) {
    await writeLastSeenVersion(current);
    return null;
  }
  return release;
}

export const markReleaseNotesSeen = (release: AppRelease) => writeLastSeenVersion(release.version);
