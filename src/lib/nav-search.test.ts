import { describe, expect, it } from "vitest";

import { buildNavSearchIndex, searchNav } from "@/lib/nav-search";

const t = (key: string) => key;

describe("nav search", () => {
  it("resolves amc to AMC contract and dashboard routes", () => {
    const index = buildNavSearchIndex(["ceo"]);
    const hits = searchNav("amc", index, t);
    const hrefs = hits.map((h) => h.href);
    expect(hrefs.some((href) => href.includes("amc"))).toBe(true);
    expect(hrefs[0]).toMatch(/amc/);
  });

  it("maps attendance and roster aliases to people routes", () => {
    const index = buildNavSearchIndex(["ceo"]);
    const attendance = searchNav("attendance", index, t);
    expect(attendance.some((h) => h.href.includes("attendance"))).toBe(true);

    const roster = searchNav("roster", index, t);
    expect(roster.some((h) => h.href === "/people/import")).toBe(true);
    expect(roster.every((h) => h.href !== "/people/attendance/roster")).toBe(true);
  });

  it("hides AMC hits when the role cannot view AMC", () => {
    const index = buildNavSearchIndex(["cashier_host"]);
    const hits = searchNav("amc", index, t);
    expect(hits.every((h) => !h.href.includes("amc"))).toBe(true);
  });
});
