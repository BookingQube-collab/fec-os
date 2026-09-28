import { describe, expect, it } from "vitest";

import { expandSopCodes } from "./model";

describe("expandSopCodes", () => {
  it("expands ranges and keeps extra codes from the scorecard reference", () => {
    expect(expandSopCodes("C02-C06; C11")).toEqual(["C02", "C03", "C04", "C05", "C06", "C11"]);
    expect(expandSopCodes("A02, A03; SR01")).toEqual(["A02", "A03", "SR01"]);
    expect(expandSopCodes("F01-F05; R09; R10")).toEqual(["F01", "F02", "F03", "F04", "F05", "R09", "R10"]);
    expect(expandSopCodes("A02; A03 only if approved; SR01")).toEqual(["A02", "A03", "SR01"]);
  });
});
