import { describe, expect, it } from "vitest";
import { resolvePreviousCompensationWindow } from "@/lib/salary-previous-rate";

describe("resolvePreviousCompensationWindow", () => {
  it("resolves joker previous day-rate window from history reasons", () => {
    expect(
      resolvePreviousCompensationWindow([
        {
          effectiveOn: "2026-04-01",
          dailyRateQar: 60,
          reason: "joker_current_rate_resume",
          createdAt: "2026-03-20T12:00:00Z",
        },
        {
          effectiveOn: "2026-03-01",
          dailyRateQar: 50,
          reason: "joker_previous_rate",
          createdAt: "2026-03-20T11:00:00Z",
        },
      ]),
    ).toEqual({
      amountQar: 50,
      from: "2026-03-01",
      to: "2026-03-31",
      kind: "daily",
    });
  });

  it("resolves monthly package previous window", () => {
    expect(
      resolvePreviousCompensationWindow([
        {
          effectiveOn: "2026-06-16",
          monthlyTotalQar: 4500,
          basicQar: 3000,
          reason: "package_current_rate_resume",
          createdAt: "2026-06-01T10:00:00Z",
        },
        {
          effectiveOn: "2026-05-01",
          monthlyTotalQar: 4000,
          basicQar: 2800,
          reason: "package_previous_rate",
          createdAt: "2026-06-01T09:00:00Z",
        },
      ]),
    ).toEqual({
      amountQar: 4000,
      from: "2026-05-01",
      to: "2026-06-15",
      kind: "monthly",
    });
  });

  it("returns null when previous reason has no resume", () => {
    expect(
      resolvePreviousCompensationWindow([
        {
          effectiveOn: "2026-03-01",
          dailyRateQar: 50,
          reason: "joker_previous_rate",
        },
      ]),
    ).toBeNull();
  });
});
