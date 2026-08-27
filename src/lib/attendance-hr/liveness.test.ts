import { describe, expect, it } from "vitest";

import { faceCheckLabel, lumaFrameDelta, livenessPassed } from "./liveness";

describe("lumaFrameDelta", () => {
  it("is zero for identical frames", () => {
    const frame = new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 255]);
    expect(lumaFrameDelta(frame, frame)).toBe(0);
  });

  it("rises when pixels change", () => {
    const a = new Uint8ClampedArray(64).fill(10);
    const b = new Uint8ClampedArray(64).fill(200);
    expect(lumaFrameDelta(a, b)).toBeGreaterThan(50);
  });
});

describe("livenessPassed", () => {
  it("rejects a static photo (near-zero deltas)", () => {
    expect(livenessPassed([0.2, 0.4])).toBe(false);
  });

  it("accepts motion between frames", () => {
    expect(livenessPassed([18, 22])).toBe(true);
  });
});

describe("faceCheckLabel", () => {
  it("does not claim identity match for a captured selfie", () => {
    expect(faceCheckLabel("captured")).toMatch(/not an identity match/i);
  });
});
