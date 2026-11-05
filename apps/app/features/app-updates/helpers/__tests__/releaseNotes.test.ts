import { parseReleaseNotes } from "../releaseNotes";

describe("parseReleaseNotes", () => {
  it("turns a GitHub release body into headings, bullets, and text without markdown syntax", () => {
    expect(parseReleaseNotes("## What's new\r\n\r\n- **Faster** sync\n* See [the docs](https://x.y) for `more`\nThanks!")).toEqual([
      { kind: "heading", text: "What's new" },
      { kind: "bullet", text: "Faster sync" },
      { kind: "bullet", text: "See the docs for more" },
      { kind: "text", text: "Thanks!" },
    ]);
  });

  it("drops blank lines and empty markup", () => {
    expect(parseReleaseNotes("\n#  \n- \n")).toEqual([]);
  });
});
