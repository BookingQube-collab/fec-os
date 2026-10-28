import { describe, expect, it } from "vitest";

import { isHeavyShellFxRoute, mayMountShellFx } from "@/lib/shell-fx";

describe("shell-fx", () => {
  it("flags dense People / attendance / chat routes as heavy", () => {
    expect(isHeavyShellFxRoute("/people")).toBe(true);
    expect(isHeavyShellFxRoute("/people/attendance")).toBe(true);
    expect(isHeavyShellFxRoute("/people/attendance/reports")).toBe(true);
    expect(isHeavyShellFxRoute("/people/staff/abc")).toBe(true);
    expect(isHeavyShellFxRoute("/chat")).toBe(true);
    expect(isHeavyShellFxRoute("/")).toBe(false);
    expect(isHeavyShellFxRoute("/dashboard")).toBe(false);
    expect(isHeavyShellFxRoute("/people/hr/settings")).toBe(false);
  });

  it("respects preference, reduced motion, and heavy routes", () => {
    expect(
      mayMountShellFx({ pathname: "/", shellFxEnabled: true, prefersReducedMotion: false }),
    ).toBe(true);
    expect(
      mayMountShellFx({ pathname: "/", shellFxEnabled: false, prefersReducedMotion: false }),
    ).toBe(false);
    expect(
      mayMountShellFx({ pathname: "/", shellFxEnabled: true, prefersReducedMotion: true }),
    ).toBe(false);
    expect(
      mayMountShellFx({
        pathname: "/people/attendance",
        shellFxEnabled: true,
        prefersReducedMotion: false,
      }),
    ).toBe(false);
  });
});
