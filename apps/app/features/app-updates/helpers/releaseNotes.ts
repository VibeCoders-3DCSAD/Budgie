export type ReleaseNoteLine = { kind: "heading" | "bullet" | "text"; text: string };

// GitHub release bodies are markdown; the app shows them as plain styled lines.
function stripInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|`)/g, "")
    .trim();
}

function toLine(raw: string): ReleaseNoteLine | null {
  const line = raw.trim();
  // Markup with nothing after it (a lone "#" or "-") still counts as that markup, then drops as empty.
  const heading = /^#{1,6}(?:\s+(.*))?$/.exec(line);
  if (heading) return { kind: "heading", text: stripInline(heading[1] ?? "") };
  const bullet = /^[-*+](?:\s+(.*))?$/.exec(line);
  if (bullet) return { kind: "bullet", text: stripInline(bullet[1] ?? "") };
  const text = stripInline(line);
  if (!text) return null;
  return { kind: "text", text };
}

export function parseReleaseNotes(markdown: string): ReleaseNoteLine[] {
  return markdown
    .split(/\r?\n/)
    .map(toLine)
    .filter((line): line is ReleaseNoteLine => line !== null && line.text.length > 0);
}
