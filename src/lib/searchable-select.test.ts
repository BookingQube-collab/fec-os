import { describe, expect, it } from "vitest";

import { matchesSearchQuery, normalizeSearchQuery, scrollTopForIndex } from "@/lib/searchable-select";

describe("searchable select matching", () => {
  it("matches label, code, and compact queries", () => {
    expect(matchesSearchQuery("inf", "INF-CC", "Inflata Park")).toBe(true);
    expect(matchesSearchQuery("inf cc", "INF-CC")).toBe(true);
    expect(matchesSearchQuery("inf-cc", "INF-CC")).toBe(true);
    expect(matchesSearchQuery("park", "INF-CC", "Inflata Park")).toBe(true);
    expect(matchesSearchQuery("missing", "INF-CC")).toBe(false);
  });

  it("matches multi-word names with every token, order-independent", () => {
    expect(matchesSearchQuery("ma luz", "Ma luz Jesus Romeo", "KDS-CC-STF13")).toBe(true);
    expect(matchesSearchQuery("luz ma", "Ma luz Jesus Romeo")).toBe(true);
    expect(matchesSearchQuery("jesus romeo", "Ma luz Jesus Romeo")).toBe(true);
    expect(matchesSearchQuery("ma maria", "Ma luz Jesus Romeo")).toBe(false);
    expect(matchesSearchQuery("Maria", "Ma luz Jesus Romeo")).toBe(false);
  });

  it("treats blank query as match-all", () => {
    expect(matchesSearchQuery("  ", "Anything")).toBe(true);
    expect(normalizeSearchQuery("  Hello ").raw).toBe("hello");
  });

  it("scrolls only when the active row leaves the viewport", () => {
    expect(scrollTopForIndex(0, 0, 36, 256)).toBe(0);
    expect(scrollTopForIndex(0, 10, 36, 256)).toBe(140);
    expect(scrollTopForIndex(400, 1, 36, 256)).toBe(36);
    expect(scrollTopForIndex(100, 4, 36, 256)).toBe(100);
  });
});
