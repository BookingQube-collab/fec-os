import { describe, expect, it } from "vitest";

import { NAV_DEPARTMENTS } from "./nav-config";
import { isShellLinkActive, shellGroupIdForHref } from "./shell-groups";

function catalogHrefs(): string[] {
  const hrefs: string[] = [];
  for (const dept of NAV_DEPARTMENTS) {
    for (const item of dept.items) hrefs.push(item.href);
    for (const group of dept.groups ?? []) {
      for (const item of group.items) hrefs.push(item.href);
    }
  }
  return hrefs;
}

describe("shell groups", () => {
  it("assigns every catalog href to a real group", () => {
    const missing = catalogHrefs().filter((href) => shellGroupIdForHref(href) == null);
    expect(missing).toEqual([]);
  });

  it("keeps attendance off the employees parent", () => {
    const hrefs = ["/people", "/people/attendance", "/people/roster"];
    expect(isShellLinkActive("/people", "/people/attendance", hrefs)).toBe(false);
    expect(isShellLinkActive("/people/attendance", "/people/attendance/reports", hrefs)).toBe(true);
    expect(isShellLinkActive("/people/roster", "/people/roster", hrefs)).toBe(true);
  });

  it("does not invent a JARVIS route", () => {
    expect(shellGroupIdForHref("/jarvis")).toBeNull();
  });
});
