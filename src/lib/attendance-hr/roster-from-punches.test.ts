import { describe, expect, it } from "vitest";

import { scheduledIsoFromHm } from "@/lib/attendance-hr/late-punch";
import {
  canSelfUploadPunchRoster,
  canUploadPunchDerivedRoster,
  isCompletePunchPair,
  isIncompletePunchOut,
  listIncompletePunchRosterDays,
  planRosterFromPunches,
  qatarHmFromIso,
  ROSTER_FROM_PUNCH_SOURCE,
  rosterFromPunchDates,
  SELF_PUNCH_ROSTER_NAME_KEYS,
} from "@/lib/attendance-hr/roster-from-punches";

const INF = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const UA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const LOUIE = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const RUSSELL = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const EXISTING_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

describe("qatarHmFromIso", () => {
  it("reads Qatar local HH:MM from an ISO punch", () => {
    expect(qatarHmFromIso(scheduledIsoFromHm("2026-10-18", "11:12"))).toBe("11:12");
    expect(qatarHmFromIso(scheduledIsoFromHm("2026-10-18", "16:35"))).toBe("16:35");
    expect(qatarHmFromIso(null)).toBeNull();
  });
});

describe("complete vs incomplete punch pairs", () => {
  it("requires both punch in and punch out for a complete pair", () => {
    expect(isCompletePunchPair({ punchInAt: "a", punchOutAt: "b" })).toBe(true);
    expect(isCompletePunchPair({ punchInAt: "a", punchOutAt: null })).toBe(false);
    expect(isIncompletePunchOut({ punchInAt: "a", punchOutAt: null })).toBe(true);
    expect(isIncompletePunchOut({ punchInAt: "a", punchOutAt: "b" })).toBe(false);
    expect(isIncompletePunchOut({ punchInAt: null, punchOutAt: null })).toBe(false);
  });
});

describe("planRosterFromPunches", () => {
  it("saves complete pairs only, skips incomplete out and existing roster days", () => {
    const plan = planRosterFromPunches({
      days: [
        {
          staffId: LOUIE,
          workDate: "2026-10-17",
          locationId: INF,
          punchInAt: scheduledIsoFromHm("2026-10-17", "11:17"),
          punchOutAt: scheduledIsoFromHm("2026-10-17", "16:35"),
        },
        {
          staffId: LOUIE,
          workDate: "2026-10-18",
          locationId: INF,
          punchInAt: scheduledIsoFromHm("2026-10-18", "11:12"),
          punchOutAt: null,
        },
        {
          staffId: RUSSELL,
          workDate: "2026-10-17",
          locationId: UA,
          punchInAt: scheduledIsoFromHm("2026-10-17", "09:00"),
          punchOutAt: scheduledIsoFromHm("2026-10-17", "18:00"),
        },
        {
          staffId: RUSSELL,
          workDate: "2026-10-16",
          locationId: INF,
          punchInAt: scheduledIsoFromHm("2026-10-16", "10:00"),
          punchOutAt: scheduledIsoFromHm("2026-10-16", "19:00"),
        },
        {
          staffId: null,
          workDate: "2026-10-15",
          locationId: INF,
          punchInAt: scheduledIsoFromHm("2026-10-15", "10:00"),
          punchOutAt: scheduledIsoFromHm("2026-10-15", "18:00"),
        },
      ],
      existing: [{ staffId: RUSSELL, workDate: "2026-10-16" }],
    });

    expect(ROSTER_FROM_PUNCH_SOURCE).toBe("device_punch");
    expect(plan.savedEligible).toBe(2);
    expect(plan.correctedEligible).toBe(0);
    expect(plan.skippedIncomplete).toBe(1);
    expect(plan.skippedExisting).toBe(1);
    expect(plan.skippedUnmapped).toBe(1);
    expect(plan.rows).toEqual([
      {
        staffId: LOUIE,
        workDate: "2026-10-17",
        locationId: INF,
        checkOutLocationId: INF,
        shiftStart: "11:17",
        shiftEnd: "16:35",
      },
      {
        staffId: RUSSELL,
        workDate: "2026-10-17",
        locationId: UA,
        checkOutLocationId: UA,
        shiftStart: "09:00",
        shiftEnd: "18:00",
      },
    ]);
  });

  it("keeps the check-in location for a cross-site collapsed day (UA-DM → INF-CC)", () => {
    const plan = planRosterFromPunches({
      days: [
        {
          staffId: LOUIE,
          workDate: "2026-10-08",
          locationId: UA,
          checkOutLocationId: INF,
          punchInAt: scheduledIsoFromHm("2026-10-08", "11:00"),
          punchOutAt: scheduledIsoFromHm("2026-10-08", "17:00"),
        },
      ],
      existing: [],
    });
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({
      locationId: UA,
      checkOutLocationId: INF,
      shiftStart: "11:00",
      shiftEnd: "17:00",
    });
  });

  it("keeps the check-in location for INF-CC → UA-DM days", () => {
    const plan = planRosterFromPunches({
      days: [
        {
          staffId: LOUIE,
          workDate: "2026-10-09",
          locationId: INF,
          checkOutLocationId: UA,
          punchInAt: scheduledIsoFromHm("2026-10-09", "10:30"),
          punchOutAt: scheduledIsoFromHm("2026-10-09", "18:00"),
        },
      ],
      existing: [],
    });
    expect(plan.rows[0]).toMatchObject({
      locationId: INF,
      checkOutLocationId: UA,
    });
  });

  it("queues a location fix for existing device_punch rows with the wrong check-in site", () => {
    const plan = planRosterFromPunches({
      days: [
        {
          staffId: LOUIE,
          workDate: "2026-10-08",
          locationId: UA,
          checkOutLocationId: INF,
          punchInAt: scheduledIsoFromHm("2026-10-08", "11:00"),
          punchOutAt: scheduledIsoFromHm("2026-10-08", "17:00"),
        },
      ],
      existing: [
        {
          id: EXISTING_ID,
          staffId: LOUIE,
          workDate: "2026-10-08",
          locationId: INF,
          source: ROSTER_FROM_PUNCH_SOURCE,
        },
      ],
    });

    expect(plan.savedEligible).toBe(0);
    expect(plan.correctedEligible).toBe(1);
    expect(plan.skippedExisting).toBe(0);
    expect(plan.locationFixes).toEqual([
      {
        id: EXISTING_ID,
        staffId: LOUIE,
        workDate: "2026-10-08",
        locationId: UA,
        checkOutLocationId: INF,
        shiftStart: "11:00",
        shiftEnd: "17:00",
      },
    ]);
  });

  it("does not overwrite uploaded or manual roster days", () => {
    const plan = planRosterFromPunches({
      days: [
        {
          staffId: LOUIE,
          workDate: "2026-10-08",
          locationId: UA,
          checkOutLocationId: INF,
          punchInAt: scheduledIsoFromHm("2026-10-08", "11:00"),
          punchOutAt: scheduledIsoFromHm("2026-10-08", "17:00"),
        },
      ],
      existing: [
        {
          id: EXISTING_ID,
          staffId: LOUIE,
          workDate: "2026-10-08",
          locationId: INF,
          source: "upload",
        },
      ],
    });
    expect(plan.correctedEligible).toBe(0);
    expect(plan.skippedExisting).toBe(1);
    expect(plan.locationFixes).toEqual([]);
  });
});

describe("listIncompletePunchRosterDays", () => {
  it("lists punch-in-only days that still need a roster row", () => {
    const incomplete = listIncompletePunchRosterDays({
      days: [
        {
          staffId: LOUIE,
          workDate: "2026-10-18",
          locationId: INF,
          punchInAt: scheduledIsoFromHm("2026-10-18", "11:12"),
          punchOutAt: null,
        },
        {
          staffId: LOUIE,
          workDate: "2026-10-17",
          locationId: INF,
          punchInAt: scheduledIsoFromHm("2026-10-17", "11:00"),
          punchOutAt: scheduledIsoFromHm("2026-10-17", "17:00"),
        },
        {
          staffId: LOUIE,
          workDate: "2026-10-19",
          locationId: UA,
          punchInAt: scheduledIsoFromHm("2026-10-19", "12:00"),
          punchOutAt: null,
        },
      ],
      existing: [{ staffId: LOUIE, workDate: "2026-10-19" }],
    });

    expect(incomplete).toHaveLength(1);
    expect(incomplete[0]).toMatchObject({
      staffId: LOUIE,
      workDate: "2026-10-18",
      locationId: INF,
      suggestedShiftStart: "11:12",
    });
  });
});

describe("rosterFromPunchDates", () => {
  it("rejects an inverted or oversized range", () => {
    expect(() => rosterFromPunchDates("2026-10-02", "2026-10-01")).toThrow(/from date/i);
    expect(() => rosterFromPunchDates("2026-01-01", "2026-04-01")).toThrow(/62/);
    expect(() => rosterFromPunchDates("2026-09-28", "2026-10-27")).not.toThrow();
  });
});

describe("canSelfUploadPunchRoster", () => {
  it("allows only Russell and Louie by first name, not other roaming names", () => {
    expect(SELF_PUNCH_ROSTER_NAME_KEYS).toEqual(["russell", "louie"]);
    expect(canSelfUploadPunchRoster({ fullName: "Russell Bombita Pante" })).toBe(true);
    expect(canSelfUploadPunchRoster({ fullName: "Louie" })).toBe(true);
    expect(canSelfUploadPunchRoster({ fullName: "Louie Pathak" })).toBe(true);
    expect(canSelfUploadPunchRoster({ fullName: "Sam Roaming" })).toBe(false);
    expect(canSelfUploadPunchRoster({ fullName: "John Russell" })).toBe(false);
    expect(canSelfUploadPunchRoster({ fullName: null })).toBe(false);
  });
});

describe("canUploadPunchDerivedRoster", () => {
  it("allows supervisors, Sr. Site, Site Supervisor, F&B Supervisor, and F&B Manager", () => {
    expect(canUploadPunchDerivedRoster({ jobTitle: "Site Supervisor" })).toBe(true);
    expect(canUploadPunchDerivedRoster({ jobTitle: "Sr. Site Supervisor" })).toBe(true);
    expect(canUploadPunchDerivedRoster({ jobTitle: "Senior Site Supervisor" })).toBe(true);
    expect(canUploadPunchDerivedRoster({ jobTitle: "F&B Supervisor" })).toBe(true);
    expect(canUploadPunchDerivedRoster({ jobTitle: "F&B Manager", department: "F&B" })).toBe(true);
    expect(canUploadPunchDerivedRoster({ staffRole: "venue_supervisor" })).toBe(true);
  });

  it("allows HoO direct-report ops peers even without a supervisor title", () => {
    expect(
      canUploadPunchDerivedRoster({
        roles: ["cashier_host"],
        jobTitle: "Operations Coordinator",
        reportsToHeadOfOperations: true,
      }),
    ).toBe(true);
    expect(
      canUploadPunchDerivedRoster({
        roles: ["cashier_host"],
        jobTitle: "Operations Manager",
        reportsToHeadOfOperations: true,
      }),
    ).toBe(true);
    // Russell seed: Technician / Maintenance reporting to HoO.
    expect(
      canUploadPunchDerivedRoster({
        roles: ["technician"],
        jobTitle: "Technician",
        staffRole: "technician",
        department: "Maintenance",
        reportsToHeadOfOperations: true,
      }),
    ).toBe(true);
    expect(
      canUploadPunchDerivedRoster({
        roles: ["cashier_host"],
        jobTitle: "Operations Coordinator",
        reportsToHeadOfOperations: false,
      }),
    ).toBe(false);
  });

  it("keeps F&B, cashiers, and crew out of the HoO-peer punch-roster path", () => {
    expect(
      canUploadPunchDerivedRoster({
        roles: ["cashier_host"],
        jobTitle: "Cashier",
        reportsToHeadOfOperations: true,
      }),
    ).toBe(false);
    expect(
      canUploadPunchDerivedRoster({
        jobTitle: "F&B Manager",
        department: "F&B",
        reportsToHeadOfOperations: true,
      }),
    ).toBe(true); // F&B Manager still has its own allow, independent of HoO peer
    expect(
      canUploadPunchDerivedRoster({
        jobTitle: "Crew / Attendant",
        department: "Operations",
        reportsToHeadOfOperations: false,
      }),
    ).toBe(false);
  });

  it("keeps a plain cashier out and keeps existing shift-roster openers in", () => {
    expect(canUploadPunchDerivedRoster({ roles: ["cashier_host"], jobTitle: "Cashier" })).toBe(false);
    expect(canUploadPunchDerivedRoster({ roles: ["ceo"] })).toBe(true);
    expect(canUploadPunchDerivedRoster({ roles: ["hr"] })).toBe(true);
    expect(canUploadPunchDerivedRoster({ jobTitle: "Team Leader" })).toBe(false);
  });
});
