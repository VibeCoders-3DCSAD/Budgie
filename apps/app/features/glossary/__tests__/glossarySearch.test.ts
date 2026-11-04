import { glossaryTermName, parseGlossaryTermId, searchGlossary } from "../helpers/glossarySearch";
import { GLOSSARY_TERMS } from "../terms";

const ENTRIES = [
  { id: "a", term: "Cut-off date", definition: "Last day of a billing cycle.", keywords: ["cutoff"] },
  { id: "b", term: "Billing cycle", definition: "About a month of purchases." },
  { id: "c", term: "Statement (SOA)", definition: "Bill made at the cut-off.", keywords: ["statement of account"] },
];

describe("searchGlossary", () => {
  it("returns every term for an empty or blank query", () => {
    expect(searchGlossary(ENTRIES, "  ")).toHaveLength(3);
  });

  it("matches names and keywords case-insensitively before definition-only matches", () => {
    expect(searchGlossary(ENTRIES, "CUT").map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(searchGlossary(ENTRIES, "cycle").map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("finds a term by a search-only keyword", () => {
    expect(searchGlossary(ENTRIES, "statement of").map((entry) => entry.id)).toEqual(["c"]);
  });

  it("returns nothing when no term matches", () => {
    expect(searchGlossary(ENTRIES, "zzz")).toEqual([]);
  });
});

describe("parseGlossaryTermId", () => {
  it("accepts only a known term id", () => {
    expect(parseGlossaryTermId("cut-off")).toBe("cut-off");
    expect(parseGlossaryTermId("not-a-term")).toBeUndefined();
    expect(parseGlossaryTermId(["cut-off"])).toBeUndefined();
    expect(parseGlossaryTermId(undefined)).toBeUndefined();
  });
});

describe("GLOSSARY_TERMS", () => {
  it("uses each id once", () => {
    const ids = GLOSSARY_TERMS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names a term by id", () => {
    expect(glossaryTermName("principal")).toBe("Principal");
  });
});
