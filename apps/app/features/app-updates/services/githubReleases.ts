import { fetchWithTimeout } from "../../../lib/helpers/fetchWithTimeout";
import { normalizeVersion } from "../helpers/versions";

// The public repo's GitHub Releases are the source of truth for shipped versions and their notes.
const RELEASES_API = "https://api.github.com/repos/VibeCoders-3DCSAD/Budgie/releases";
const RELEASE_PAGE_PREFIX = "https://github.com/VibeCoders-3DCSAD/Budgie/releases/";

export type AppRelease = { version: string; notes: string; url: string };

function toAppRelease(body: unknown): AppRelease | null {
  if (typeof body !== "object" || body === null) return null;
  const { tag_name: tag, body: notes, html_url: url } = body as Record<string, unknown>;
  if (typeof tag !== "string" || typeof url !== "string") return null;
  const version = normalizeVersion(tag);
  if (!version || !url.startsWith(RELEASE_PAGE_PREFIX)) return null;
  return { version, notes: typeof notes === "string" ? notes : "", url };
}

/** Returns null when GitHub has no such release; throws when GitHub could not be reached. */
async function fetchRelease(path: string): Promise<AppRelease | null> {
  const response = await fetchWithTimeout(`${RELEASES_API}/${path}`, { headers: { Accept: "application/vnd.github+json" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub releases responded ${response.status}`);
  return toAppRelease(await response.json());
}

// /latest already skips drafts and pre-releases.
export const fetchLatestRelease = () => fetchRelease("latest");

export function fetchReleaseForVersion(version: string): Promise<AppRelease | null> {
  const normalized = normalizeVersion(version);
  if (!normalized) return Promise.resolve(null);
  return fetchRelease(`tags/v${normalized}`);
}
