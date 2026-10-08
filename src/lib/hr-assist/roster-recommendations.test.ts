import { describe, expect, it } from "vitest";

import { buildRosterRecommendations, describeRosterItem, type RosterAssistAssignment } from "./roster-recommendations";

const loc = "loc-mall";

function duty(workDate: string, staffId: string, start = "18:00", end = "22:00"): RosterAssistAssignment {
  return {
    staffId,
    staffName: staffId,
    locationId: loc,
    locationName: "Mall",
    workDate,
    shiftStart: start,
    shiftEnd: end,
    isWeekOff: false,
  };
}

describe("roster recommendations", () => {
  it("asks for additional attendants only when other matching shifts are staffed higher", () => {
    const full = ["s1", "s2", "s3", "s4", "s5", "s6"];
    const short = ["s1", "s2", "s3", "s4"];
    const assignments = [
      ...short.map((id) => duty("2026-10-03", id)),
      ...full.map((id) => duty("2026-10-10", id)),
      ...full.map((id) => duty("2026-10-17", id)),
    ];
    const result = buildRosterRecommendations({
      periodFrom: "2026-09-26",
      periodTo: "2026-10-17",
      assignments,
      leaves: [],
      openings: [{ locationId: loc, name: "Evening", start: "18:00:00", end: "22:00:00" }],
    });
    expect(result.status).toBe("ok");
    const item = result.items.find((row) => row.id.startsWith("cover:"));
    expect(item?.values).toMatchObject({ current: 4, median: 6, gap: 2, date: "2026-10-03" });
    const why = describeRosterItem(item!).why;
    expect(why).toBe(
      "Evening: Saturday 6:00 PM–10:00 PM at Mall on 2026-10-03 has 4 attendants. Other Saturday shifts in 2026-09-26–2026-10-17 rostered a median of 6. Review whether 2 additional attendants are needed before a manager approves the roster.",
    );
    expect(describeRosterItem(item!).action).toContain("does not save a roster");
  });

  it("does not invent a gap from a single week", () => {
    const result = buildRosterRecommendations({
      periodFrom: "2026-10-03",
      periodTo: "2026-10-03",
      assignments: ["s1", "s2"].map((id) => duty("2026-10-03", id)),
      leaves: [],
      openings: [],
    });
    expect(result.status).toBe("empty");
  });

  it("counts approved leave out of the shift before comparing coverage", () => {
    const assignments = [
      ...["s1", "s2", "s3", "s4"].map((id) => duty("2026-10-03", id)),
      ...["s1", "s2", "s3", "s4"].map((id) => duty("2026-10-10", id)),
    ];
    const result = buildRosterRecommendations({
      periodFrom: "2026-10-01",
      periodTo: "2026-10-12",
      assignments,
      leaves: [{ staffId: "s1", dateFrom: "2026-10-03", dateTo: "2026-10-03", status: "approved" }, { staffId: "s2", dateFrom: "2026-10-03", dateTo: "2026-10-03", status: "pending" }],
      openings: [],
    });
    const cover = result.items.find((row) => row.whyKey.includes("short_cover_with_leave"));
    expect(cover?.values).toMatchObject({ current: 2, rostered: 4, onLeave: 2, median: 4, gap: 2 });
    const person = result.items.find((row) => row.id === "leave-roster:s1:2026-10-03");
    expect(describeRosterItem(person!).why).toContain("Approved leave");
    expect(describeRosterItem(person!).why).toContain("until a manager changes it");
  });

  it("returns insufficient when the period has no roster, leave, or shift windows", () => {
    expect(
      buildRosterRecommendations({ periodFrom: "2026-10-01", periodTo: "2026-10-07", assignments: [], leaves: [], openings: [] }).status,
    ).toBe("insufficient");
  });
});
