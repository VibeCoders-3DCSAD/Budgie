import { GLOSSARY_TERMS, type GlossaryEntry, type GlossaryTermId } from "../terms";

function normalize(text: string) {
  return text.trim().toLowerCase();
}

function namesMatch(entry: GlossaryEntry, query: string) {
  if (normalize(entry.term).includes(query)) return true;
  return (entry.keywords ?? []).some((keyword) => normalize(keyword).includes(query));
}

function definitionMatches(entry: GlossaryEntry, query: string) {
  return normalize(entry.definition.english).includes(query) || normalize(entry.definition.tagalog).includes(query);
}

// Name and keyword matches come first, then terms that only mention the query in their English or Tagalog definition.
export function searchGlossary<T extends GlossaryEntry>(entries: readonly T[], query: string): T[] {
  const needle = normalize(query);
  if (!needle) return [...entries];
  const byName = entries.filter((entry) => namesMatch(entry, needle));
  const byDefinition = entries.filter((entry) => !byName.includes(entry) && definitionMatches(entry, needle));
  return [...byName, ...byDefinition];
}

// Route params are untrusted: only a known term id passes.
export function parseGlossaryTermId(value: string | string[] | undefined): GlossaryTermId | undefined {
  if (typeof value !== "string") return undefined;
  return GLOSSARY_TERMS.find((entry) => entry.id === value)?.id;
}

export function glossaryTermName(id: GlossaryTermId) {
  return GLOSSARY_TERMS.find((entry) => entry.id === id)?.term ?? id;
}
