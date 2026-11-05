import { isNewerVersion, normalizeVersion, parseVersion } from "../versions";

describe("parseVersion", () => {
  it("accepts plain and v-prefixed release tags", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("v10.0.4")).toEqual([10, 0, 4]);
  });

  it("rejects tags that are not plain releases", () => {
    expect(parseVersion("1.2")).toBeNull();
    expect(parseVersion("v1.2.3-beta.1")).toBeNull();
    expect(parseVersion("latest")).toBeNull();
  });
});

describe("normalizeVersion", () => {
  it("drops the tag prefix", () => {
    expect(normalizeVersion("v1.4.0")).toBe("1.4.0");
    expect(normalizeVersion("nope")).toBeNull();
  });
});

describe("isNewerVersion", () => {
  it("compares each part numerically, not as text", () => {
    expect(isNewerVersion("v1.10.0", "1.9.9")).toBe(true);
    expect(isNewerVersion("2.0.0", "1.99.99")).toBe(true);
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true);
  });

  it("is false for the same, older, or unreadable versions", () => {
    expect(isNewerVersion("v1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "1.2.0")).toBe(false);
    expect(isNewerVersion("garbage", "1.0.0")).toBe(false);
  });
});
