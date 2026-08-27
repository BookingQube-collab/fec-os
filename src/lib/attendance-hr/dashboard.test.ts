import { describe, expect, it } from "vitest";

import {
  aggregateDashboardPeriod,
  buildAbsentRowsForPeriod,
  countRosterEmployees,
  dayRowsFromPunches,
  enrichWatchlistEntries,
  enumerateYmd,
  formatWatchlistLocation,
  frequentExceptionLeaders,
  mergeAttendanceSites,
  monthBounds,
  pickDashboardDate,
  pickDashboardPeriod,
} from "./dashboard";

const INF = "11111111-1111-4111-8111-111111111111";
const KDS = "22222222-2222-4222-8222-222222222222";
const WM = "33333333-3333-4333-8333-333333333333";

describe("pickDashboardDate", () => {
  it("uses an explicit date even when today is empty", () => {
    expect(
      pickDashboardDate({ requested: "2026-08-01", today: "2026-08-24", todayPunchCount: 0, latestPunchDate: "2026-08-10" }),
    ).toEqual({ date: "2026-08-01", usedLatestPunch: false });
  });

  it("keeps today when punches exist", () => {
    expect(
      pickDashboardDate({ today: "2026-08-24", todayPunchCount: 4, latestPunchDate: "2026-08-01" }),
    ).toEqual({ date: "2026-08-24", usedLatestPunch: false });
  });

  it("falls back to the latest imported punch day when today is empty", () => {
    expect(
      pickDashboardDate({ today: "2026-08-24", todayPunchCount: 0, latestPunchDate: "2026-08-01" }),
    ).toEqual({ date: "2026-08-01", usedLatestPunch: true });
  });
});

describe("pickDashboardPeriod", () => {
  it("uses imported from/to when provided", () => {
    expect(
      pickDashboardPeriod({
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
        today: "2026-08-24",
        latestPunchDate: "2026-08-10",
      }),
    ).toMatchObject({ dateFrom: "2026-08-01", dateTo: "2026-08-31", month: "2026-08", usedImportedPeriod: true });
  });

  it("defaults to the month of the latest punch", () => {
    expect(monthBounds("2026-08")).toEqual({ dateFrom: "2026-07-28", dateTo: "2026-08-27" });
    expect(
      pickDashboardPeriod({ today: "2026-08-24", latestPunchDate: "2026-08-10" }),
    ).toMatchObject({ dateFrom: "2026-07-28", dateTo: "2026-08-27", usedImportedPeriod: true });
  });
});

describe("countRosterEmployees", () => {
  const staff = [
    { id: "a", location_id: INF, status: "active" },
    { id: "b", location_id: INF, status: "on_leave" },
    { id: "c", location_id: INF, status: null },
    { id: "d", location_id: KDS, status: "active" },
    { id: "e", location_id: KDS, status: "terminated" },
    { id: "f", location_id: WM, status: "active" },
  ];

  it("counts active, on_leave, and blank across all sites", () => {
    expect(countRosterEmployees(staff)).toBe(5);
  });

  it("scopes to home staff plus roaming work sites", () => {
    expect(countRosterEmployees(staff, { locationId: INF, workStaffIds: ["f"] })).toBe(4);
    expect(countRosterEmployees(staff, { locationId: KDS })).toBe(1);
  });
});

describe("dayRowsFromPunches", () => {
  it("does not count unmatched punches as Present; site in/out still show activity", () => {
    const rows = dayRowsFromPunches(
      [
        {
          location_id: INF,
          staff_id: null,
          biometric_user_id: "9",
          device_id: "dev-1",
          punch_at: "2026-08-01T07:16:58.000Z",
          attendance_date: "2026-08-01",
        },
        {
          location_id: INF,
          staff_id: null,
          biometric_user_id: "9",
          device_id: "dev-1",
          punch_at: "2026-08-01T14:02:00.000Z",
          attendance_date: "2026-08-01",
        },
        {
          location_id: INF,
          staff_id: "staff-1",
          biometric_user_id: "12",
          device_id: "dev-1",
          punch_at: "2026-08-01T05:10:00.000Z",
          attendance_date: "2026-08-01",
        },
        {
          location_id: INF,
          staff_id: "staff-1",
          biometric_user_id: "12",
          device_id: "dev-1",
          punch_at: "2026-08-01T14:10:00.000Z",
          attendance_date: "2026-08-01",
        },
        {
          location_id: INF,
          staff_id: "staff-2",
          biometric_user_id: "21",
          device_id: "dev-1",
          punch_at: "2026-08-01T07:40:00.000Z",
          attendance_date: "2026-08-01",
        },
      ],
      "2026-08-01",
    );

    const agg = aggregateDashboardPeriod(
      rows,
      [{ id: INF, code: "INF-CC", name: "InflataPark", region: "City Center" }],
      INF,
    );

    expect(agg.present).toBe(1);
    expect(agg.missedPunches).toBe(1);
    expect(agg.bySite[0]).toMatchObject({ code: "INF-CC", in: 3, out: 2 });
  });
});

describe("buildAbsentRowsForPeriod", () => {
  it("marks expected staff without punches as absent for each day", () => {
    const existing = dayRowsFromPunches(
      [
        {
          location_id: INF,
          staff_id: "a",
          biometric_user_id: "1",
          device_id: "dev-1",
          punch_at: "2026-08-01T05:00:00.000Z",
          attendance_date: "2026-08-01",
        },
        {
          location_id: INF,
          staff_id: "a",
          biometric_user_id: "1",
          device_id: "dev-1",
          punch_at: "2026-08-01T14:00:00.000Z",
          attendance_date: "2026-08-01",
        },
      ],
      "2026-08-01",
    );
    const absents = buildAbsentRowsForPeriod({
      locationId: INF,
      dates: enumerateYmd("2026-08-01", "2026-08-02"),
      expectedStaffIds: ["a", "b"],
      existing,
    });
    expect(absents.filter((r) => r.staff_id === "a")).toHaveLength(1);
    expect(absents.filter((r) => r.staff_id === "b")).toHaveLength(2);
    const agg = aggregateDashboardPeriod([...existing, ...absents], [{ id: INF, code: "INF-CC", name: "InflataPark" }], INF);
    expect(agg.present).toBe(1);
    expect(agg.absent).toBe(3);
  });

  it("does not invent absents for people missing from an uploaded day roster", () => {
    const expectedByDate = new Map<string, string[]>([
      ["2026-08-01", ["a"]],
      ["2026-08-02", []],
    ]);
    const absents = buildAbsentRowsForPeriod({
      locationId: INF,
      dates: enumerateYmd("2026-08-01", "2026-08-02"),
      expectedStaffIds: expectedByDate,
      existing: [],
    });
    expect(absents.map((r) => `${r.staff_id}|${r.work_date}`)).toEqual(["a|2026-08-01"]);
  });
});

describe("mergeAttendanceSites", () => {
  it("keeps all eight roster venues even without attendance_site_settings", () => {
    const merged = mergeAttendanceSites(
      [
        { id: "1", code: "INF-CC", name: "InflataPark", region: "City Center" },
        { id: "2", code: "KDS-CC", name: "Kids Driving School", region: "City Center" },
        { id: "3", code: "UA-DM", name: "Urban Arena", region: "Doha Mall" },
        { id: "4", code: "KDS-DM", name: "Kids Mini Driving School", region: "Doha Mall" },
        { id: "5", code: "CB-VM", name: "Crayons & Bricks", region: "Vendome Mall" },
        { id: "6", code: "CB-DSM", name: "Crayons & Bricks", region: "Dar Al Salam Mall" },
        { id: "7", code: "CAR-AP", name: "Carousel", region: "Aspire Park" },
        { id: "8", code: "WM-VM", name: "Winter Mirage", region: "Vendome Mall" },
      ],
      [{ location_id: "1" }],
    );
    expect(merged.map((s) => s.code)).toEqual([
      "INF-CC",
      "KDS-CC",
      "UA-DM",
      "KDS-DM",
      "CB-VM",
      "CB-DSM",
      "CAR-AP",
      "WM-VM",
    ]);
  });
});

describe("frequentExceptionLeaders", () => {
  it("watchlist is mapped staff only", () => {
    const leaders = frequentExceptionLeaders(
      [
        { staff_id: null, biometric_user_id: "9", late_minutes: 12, location_id: INF },
        { staff_id: "abc", late_minutes: 4, location_id: INF },
        { staff_id: "abc", late_minutes: 8, location_id: INF },
      ],
      "late",
    );
    expect(leaders).toEqual([{ id: "abc", count: 2, locationId: INF }]);
  });

  it("uses the site where most exceptions occurred", () => {
    const leaders = frequentExceptionLeaders(
      [
        { staff_id: "abc", missed_punch: true, location_id: INF },
        { staff_id: "abc", missed_punch: true, location_id: KDS },
        { staff_id: "abc", missed_punch: true, location_id: KDS },
      ],
      "missed",
    );
    expect(leaders).toEqual([{ id: "abc", count: 3, locationId: KDS }]);
  });
});

describe("enrichWatchlistEntries", () => {
  const sites = [
    { id: INF, code: "INF-CC", name: "Inflatapark", region: "City Center Doha" },
    { id: KDS, code: "KDS-CC", name: "Kids Driving School", region: "City Center" },
  ];

  it("joins staff name and site, falling back to home location", () => {
    const entries = enrichWatchlistEntries(
      [{ id: "abc", count: 6, locationId: null }],
      [{ id: "abc", full_name: "Sara Ali", location_id: INF }],
      sites,
    );
    expect(entries).toEqual([
      {
        id: "abc",
        count: 6,
        name: "Sara Ali",
        locationId: INF,
        locationName: "Inflatapark",
        locationRegion: "City Center Doha",
        locationCode: "INF-CC",
      },
    ]);
    expect(formatWatchlistLocation(entries[0])).toBe("Inflatapark · City Center Doha");
  });

  it("prefers the attendance site over home location", () => {
    const entries = enrichWatchlistEntries(
      [{ id: "abc", count: 2, locationId: KDS }],
      [{ id: "abc", full_name: "Sara Ali", location_id: INF }],
      sites,
    );
    expect(entries[0].locationId).toBe(KDS);
    expect(formatWatchlistLocation(entries[0])).toBe("Kids Driving School · City Center");
  });

  it("omits location when the site is unknown", () => {
    const entries = enrichWatchlistEntries(
      [{ id: "abc", count: 1, locationId: "missing" }],
      [{ id: "abc", full_name: "Sara Ali", location_id: "also-missing" }],
      sites,
    );
    expect(entries[0].locationName).toBeNull();
    expect(formatWatchlistLocation(entries[0])).toBeNull();
  });
});
