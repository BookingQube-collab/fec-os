import { describe, expect, it } from "vitest";

import { virtualWindowRange } from "./virtual-window";

describe("virtualWindowRange", () => {
  const rowHeight = 68;
  const viewportPx = 520;
  const overscan = 8;

  it("keeps a small unmatched set fully in window so the UI can drop maxHeight clipping", () => {
    const range = virtualWindowRange(10, 0, rowHeight, viewportPx, overscan);
    expect(range.start).toBe(0);
    expect(range.end).toBe(10);
    expect(range.fullyInWindow).toBe(true);
    expect(range.topPad).toBe(0);
    expect(range.bottomPad).toBe(0);
  });

  it("windows a large all-rows list and reports not fully in window", () => {
    const range = virtualWindowRange(413, 0, rowHeight, viewportPx, overscan);
    expect(range.fullyInWindow).toBe(false);
    expect(range.end).toBeLessThan(413);
    expect(range.bottomPad).toBeGreaterThan(0);
  });

  it("advances the slice when scrolled", () => {
    const range = virtualWindowRange(413, rowHeight * 40, rowHeight, viewportPx, overscan);
    expect(range.start).toBeGreaterThan(0);
    expect(range.end).toBeGreaterThan(range.start);
    expect(range.topPad).toBe(range.start * rowHeight);
  });
});
