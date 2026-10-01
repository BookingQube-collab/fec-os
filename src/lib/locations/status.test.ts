import { describe, expect, it } from "vitest";

import { isOperationalLocationStatus, locationStatusForActiveFlag } from "./status";

describe("location active flag", () => {
  it("treats only active as operational", () => {
    expect(isOperationalLocationStatus("active")).toBe(true);
    expect(isOperationalLocationStatus("closed")).toBe(false);
    expect(isOperationalLocationStatus("maintenance")).toBe(false);
    expect(isOperationalLocationStatus("pre_launch")).toBe(false);
    expect(isOperationalLocationStatus(null)).toBe(false);
  });

  it("stores the inactive switch as closed", () => {
    expect(locationStatusForActiveFlag(true)).toBe("active");
    expect(locationStatusForActiveFlag(false)).toBe("closed");
  });
});
