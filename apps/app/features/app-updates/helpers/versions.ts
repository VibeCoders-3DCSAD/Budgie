const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/i;

/** Reads a "1.2.3" or "v1.2.3" tag into its numeric parts; anything else is not a release version. */
export function parseVersion(version: string): [number, number, number] | null {
  const match = VERSION_PATTERN.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Drops the tag's "v" prefix so tags and the installed app version compare as equals. */
export function normalizeVersion(version: string): string | null {
  const parts = parseVersion(version);
  return parts ? parts.join(".") : null;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const installed = parseVersion(current);
  if (!next || !installed) return false;
  for (let i = 0; i < next.length; i += 1) {
    if (next[i] !== installed[i]) return next[i]! > installed[i]!;
  }
  return false;
}
