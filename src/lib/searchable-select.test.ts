import { describe, expect, it } from "vitest";

import { matchesSearchQuery, normalizeSearchQuery } from "@/lib/searchable-select";

describe("searchable select matching", () => {
  it("matches label, code, and compact queries", () => {
    expect(matchesSearchQuery("inf", "INF-CC", "Inflata Park")).toBe(true);
    expect(matchesSearchQuery("inf cc", "INF-CC")).toBe(true);
    expect(matchesSearchQuery("inf-cc", "INF-CC")).toBe(true);
    expect(matchesSearchQuery("park", "INF-CC", "Inflata Park")).toBe(true);
    expect(matchesSearchQuery("missing", "INF-CC")).toBe(false);
  });

  it("treats blank query as match-all", () => {
    expect(matchesSearchQuery("  ", "Anything")).toBe(true);
    expect(normalizeSearchQuery("  Hello ").raw).toBe("hello");
  });
});
