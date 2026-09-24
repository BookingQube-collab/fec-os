import { describe, expect, it } from "vitest";

import { expiryBand, isExpiringSoon } from "./hr-expiry-bands";

describe("hr expiry bands", () => {
  it("classifies Expired | 0-30 | 31-60 | 61-90 | Valid", () => {
    expect(expiryBand("2026-09-24", "2026-09-01")).toBe("expired");
    expect(expiryBand("2026-09-24", "2026-10-10")).toBe("0_30");
    expect(expiryBand("2026-09-24", "2026-11-10")).toBe("31_60");
    expect(expiryBand("2026-09-24", "2026-12-10")).toBe("61_90");
    expect(expiryBand("2026-09-24", "2027-09-24")).toBe("valid");
    expect(expiryBand("2026-09-24", null)).toBe("unknown");
  });

  it("treats expired and 0-30 as expiring soon", () => {
    expect(isExpiringSoon("2026-09-24", "2026-09-01")).toBe(true);
    expect(isExpiringSoon("2026-09-24", "2026-10-20")).toBe(true);
    expect(isExpiringSoon("2026-09-24", "2027-01-01")).toBe(false);
  });
});
