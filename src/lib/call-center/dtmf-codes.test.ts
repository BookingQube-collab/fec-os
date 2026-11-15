import { describe, expect, it } from "vitest";

import { dtmfDigitToCode } from "./dtmf-codes";

describe("dtmfDigitToCode", () => {
  it("maps 0-9 to themselves", () => {
    for (let i = 0; i <= 9; i += 1) {
      expect(dtmfDigitToCode(String(i))).toBe(i);
    }
  });

  it("maps * and # to RFC 4733 codes", () => {
    expect(dtmfDigitToCode("*")).toBe(10);
    expect(dtmfDigitToCode("#")).toBe(11);
  });

  it("rejects unsupported digits", () => {
    expect(() => dtmfDigitToCode("x")).toThrow(/Unsupported/);
  });
});
