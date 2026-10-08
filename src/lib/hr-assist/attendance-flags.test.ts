import { describe, expect, it } from "vitest";

import { buildAttendanceReview, describeAttendanceItem, type AssistDay, type AssistPunch, type AssistRosterRow } from "./attendance-flags";
import { HR_ASSIST_COPY } from "./copy";
import ar from "../../i18n/locales/ar.json";
import en from "../../i18n/locales/en.json";

const period = { periodFrom: "2026-10-01", periodTo: "2026-10-07" };

function day(partial: Partial<AssistDay> & Pick<AssistDay, "workDate">): AssistDay {
  return {
    staffId: "s1",
    staffName: "Noor Ali",
    locationId: "loc-a",
    locationName: "City Center",
    status: "present",
    missedPunch: false,
    punchCount: 2,
    overtimeMinutes: 0,
    actualIn: "2026-10-03T05:00:00.000Z",
    actualOut: "2026-10-03T14:00:00.000Z",
    scheduledIn: null,
    scheduledOut: null,
    ...partial,
  };
}

describe("attendance review flags", () => {
  it("says when there is nothing to read", () => {
    const result = buildAttendanceReview({ ...period, days: [], punches: [], roster: [] });
    expect(result.status).toBe("insufficient");
    expect(result.items).toEqual([]);
  });

  it("flags stored duplicate punches without calling them misconduct", () => {
    const punches: AssistPunch[] = [
      {
        staffId: "s1",
        staffName: "Noor Ali",
        locationId: "loc-a",
        punchAt: "2026-10-03T04:16:00.000Z",
        probableDuplicate: false,
        attendanceDate: "2026-10-03",
      },
      {
        staffId: "s1",
        staffName: "Noor Ali",
        locationId: "loc-a",
        punchAt: "2026-10-03T04:16:40.000Z",
        probableDuplicate: true,
        attendanceDate: "2026-10-03",
      },
    ];
    const result = buildAttendanceReview({ ...period, days: [], punches, roster: [] });
    const item = result.items.find((row) => row.whyKey.includes("duplicate_punch"));
    expect(item).toBeTruthy();
    const text = describeAttendanceItem(item!);
    expect(text.why).toContain("Noor Ali");
    expect(text.why).toContain("flag for review");
    expect(text.why.toLowerCase()).not.toContain("misconduct");
    expect(text.why.toLowerCase()).not.toContain("fraud");
    expect(item!.href).toBe("/people/attendance/corrections");
    expect(text.action).toContain("does not change punches");
  });

  it("flags a shift longer than 18 hours and a punch far from its day", () => {
    const result = buildAttendanceReview({
      ...period,
      days: [
        day({
          workDate: "2026-10-03",
          actualIn: "2026-10-03T05:00:00.000Z",
          actualOut: "2026-10-04T02:00:00.000Z",
        }),
        day({
          workDate: "2026-10-04",
          actualIn: "2026-10-08T05:00:00.000Z",
          actualOut: "2026-10-08T14:00:00.000Z",
        }),
      ],
      punches: [],
      roster: [],
    });
    const span = result.items.find((row) => row.values.detailCode === "span");
    const far = result.items.find((row) => row.values.detailCode === "far_from_day");
    expect(describeAttendanceItem(span!).why).toContain("21 hours");
    expect(describeAttendanceItem(far!).why).toContain("more than one day away");
  });

  it("flags repeated missing punches as a review list", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-04"].map((workDate) =>
      day({ workDate, missedPunch: true, punchCount: 1, actualOut: null, status: "missed_punch" }),
    );
    const result = buildAttendanceReview({ ...period, days, punches: [], roster: [] });
    const item = result.items.find((row) => row.id.startsWith("missing:"));
    expect(item?.values.count).toBe(3);
    expect(describeAttendanceItem(item!).why).toContain("missing in or out");
    expect(describeAttendanceItem(item!).evidence).toContain("2026-10-01");
  });

  it("flags overtime only against that person's own days in the period", () => {
    const days = [0, 0, 10, 0, 200].map((overtimeMinutes, index) =>
      day({ workDate: `2026-10-0${index + 1}`, overtimeMinutes }),
    );
    const quiet = buildAttendanceReview({
      ...period,
      days: days.slice(0, 3),
      punches: [],
      roster: [],
    });
    expect(quiet.items.some((row) => row.id.startsWith("ot:"))).toBe(false);

    const result = buildAttendanceReview({ ...period, days, punches: [], roster: [] });
    const item = result.items.find((row) => row.id.startsWith("ot:"));
    expect(item?.values.overtimeMinutes).toBe(200);
    expect(item?.values.medianMinutes).toBe(0);
    expect(item?.values.comparedDays).toBe(5);
    expect(describeAttendanceItem(item!).why).not.toMatch(/%/);
  });

  it("flags a different site and a clock far outside the rostered shift", () => {
    const roster: AssistRosterRow[] = [
      {
        staffId: "s1",
        staffName: "Noor Ali",
        locationId: "loc-b",
        locationName: "Mall",
        workDate: "2026-10-03",
        shiftStart: "09:00",
        shiftEnd: "17:00",
        isWeekOff: false,
      },
    ];
    const result = buildAttendanceReview({
      ...period,
      days: [
        day({
          workDate: "2026-10-03",
          locationId: "loc-a",
          locationName: "City Center",
          actualIn: "2026-10-03T02:00:00.000Z",
          actualOut: "2026-10-03T14:00:00.000Z",
        }),
      ],
      punches: [],
      roster,
    });
    const site = result.items.find((row) => row.id.startsWith("site:"));
    const shift = result.items.find((row) => row.id.startsWith("shift:"));
    expect(describeAttendanceItem(site!).why).toContain("Mall");
    expect(describeAttendanceItem(site!).why).toContain("City Center");
    expect(describeAttendanceItem(shift!).why).toContain("9:00 AM–5:00 PM");
    expect(describeAttendanceItem(shift!).why).toContain("5:00 AM");
    expect(Number(shift?.values.gapMinutes)).toBeGreaterThan(180);
  });

  it("compares roster duty with the daily summary that already exists", () => {
    const roster: AssistRosterRow[] = [
      {
        staffId: "s1",
        staffName: "Noor Ali",
        locationId: "loc-a",
        locationName: "City Center",
        workDate: "2026-10-03",
        shiftStart: "09:00",
        shiftEnd: "17:00",
        isWeekOff: false,
      },
      {
        staffId: "s1",
        staffName: "Noor Ali",
        locationId: "loc-a",
        locationName: "City Center",
        workDate: "2026-10-04",
        shiftStart: null,
        shiftEnd: null,
        isWeekOff: true,
      },
    ];
    const result = buildAttendanceReview({
      ...period,
      days: [
        day({ workDate: "2026-10-03", status: "absent", punchCount: 0, actualIn: null, actualOut: null }),
        day({ workDate: "2026-10-04", status: "present", punchCount: 2 }),
      ],
      punches: [],
      roster,
    });
    const absent = result.items.find((row) => row.id.includes("mismatch:absent"));
    const weekOff = result.items.find((row) => row.id.includes("mismatch:week_off"));
    expect(describeAttendanceItem(absent!).why).toContain("rostered on duty");
    expect(describeAttendanceItem(absent!).why).toContain("absent");
    expect(describeAttendanceItem(weekOff!).why).toContain("week off");
    expect(result.items.some((row) => row.id.includes("2026-10-05"))).toBe(false);
  });

  it("keeps English copy aligned with en.json and Arabic keys aligned", () => {
    expect(en.hrAssist).toEqual(HR_ASSIST_COPY);
    expect(collectKeys(ar.hrAssist).sort()).toEqual(collectKeys(en.hrAssist).sort());
    const joined = JSON.stringify(en.hrAssist) + JSON.stringify(ar.hrAssist);
    expect(joined.toLowerCase()).not.toContain("fraud");
    expect(joined.toLowerCase()).not.toMatch(/gender|religion|nationality|marital status/);
    expect(en.hrAssist.leave.pattern_review.why.startsWith("Pattern requires HR review")).toBe(true);
    expect(ar.hrAssist.leave.pattern_review.why.startsWith("Pattern requires HR review")).toBe(true);
  });
});

function collectKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}
