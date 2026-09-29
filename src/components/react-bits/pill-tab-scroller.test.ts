import { describe, expect, it } from "vitest";

import {
  pillScrollEdgesFromRects,
  pillScrollMask,
  splitPillFrameClass,
} from "./pill-tab-scroll";

const view = { left: 0, right: 200 };

describe("pillScrollEdgesFromRects", () => {
  it("reports no overflow when both tabs sit inside the view", () => {
    expect(
      pillScrollEdgesFromRects(view, { left: 8, right: 80 }, { left: 88, right: 160 }, false),
    ).toEqual({ start: false, end: false });
  });

  it("marks the inline end when content sticks out on the right in LTR", () => {
    expect(
      pillScrollEdgesFromRects(view, { left: 8, right: 80 }, { left: 180, right: 260 }, false),
    ).toEqual({ start: false, end: true });
  });

  it("marks the inline start when content sticks out on the left in LTR", () => {
    expect(
      pillScrollEdgesFromRects(view, { left: -40, right: 40 }, { left: 80, right: 140 }, false),
    ).toEqual({ start: true, end: false });
  });

  it("swaps the edges in RTL", () => {
    expect(
      pillScrollEdgesFromRects(view, { left: 140, right: 240 }, { left: 8, right: 80 }, true),
    ).toEqual({ start: true, end: false });
    expect(
      pillScrollEdgesFromRects(view, { left: 120, right: 180 }, { left: -30, right: 40 }, true),
    ).toEqual({ start: false, end: true });
  });
});

describe("pillScrollMask", () => {
  it("skips the mask when nothing is clipped", () => {
    expect(pillScrollMask({ start: false, end: false }, false)).toBeUndefined();
  });

  it("fades the physical left edge for an LTR start overflow", () => {
    const mask = pillScrollMask({ start: true, end: false }, false);
    expect(mask).toContain("transparent 0");
    expect(mask).toContain("#000 100%");
  });

  it("fades the physical right edge when RTL content is clipped at the start", () => {
    const mask = pillScrollMask({ start: true, end: false }, true);
    expect(mask?.endsWith("#000 100%)") === false || mask?.includes("transparent 100%")).toBe(true);
    expect(mask).toContain("transparent 100%");
  });
});

describe("splitPillFrameClass", () => {
  it("moves margin and print utilities onto the frame", () => {
    expect(
      splitPillFrameClass("print:hidden mb-1 mt-4 h-auto w-full flex-wrap sm:ms-2"),
    ).toEqual({
      frame: "print:hidden mb-1 mt-4 sm:ms-2",
      port: "h-auto w-full flex-wrap",
    });
  });
});
