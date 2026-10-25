import { afterEach, describe, expect, it } from "vitest";

import {
  ADMS_PERF_FLUSH_MS,
  ADMS_PERF_SLOW_WALL_MS,
  buildAdmsPerfLog,
  flushAdmsPerf,
  readAdmsPerfBuckets,
  resetAdmsPerfForTests,
  runWithAdmsPerf,
  setAdmsPerfCategory,
  timeAdmsDb,
} from "./adms-perf";
import {
  chunkPunchRows,
  partitionFreshPunchRows,
  punchInsertFailureMessage,
} from "./adms-punch-batch";
import { planAdmsRecalc } from "./adms-recalc-plan";
import { DEFAULT_SHIFT } from "./constants";
import { assignAttendanceDate } from "./calculate";
import { buildPunchRows } from "./build-punch-rows";

const night = { ...DEFAULT_SHIFT, name: "Night", startTime: "22:00", endTime: "07:00", overnight: true };

function punch(biometricUserId: string, punchAt: string) {
  return {
    biometricUserId,
    punchAt,
    verifyMethod: 1,
    inOutStatus: 0,
    workCode: null,
    reservedField: null,
    raw: `${biometricUserId} ${punchAt}`,
    rowNumber: 1,
  };
}

describe("ADMS performance aggregation", () => {
  afterEach(() => {
    resetAdmsPerfForTests();
  });

  it("counts idle polls in memory and does not emit a line per poll", async () => {
    const lines: unknown[] = [];
    resetAdmsPerfForTests({ sink: (line) => lines.push(line) });
    for (let n = 0; n < 40; n += 1) {
      await runWithAdmsPerf("idle_poll", async () => {
        await timeAdmsDb(async () => undefined);
      });
    }
    const buckets = readAdmsPerfBuckets();
    expect(buckets.idle_poll?.requests).toBe(40);
    expect(buckets.idle_poll?.dbRegions).toBe(40);
    expect(lines).toEqual([]);
  });

  it("labels the flush as wall-clock time and omits attendance data", async () => {
    resetAdmsPerfForTests();
    await runWithAdmsPerf("attlog", async () => {
      setAdmsPerfCategory("attlog");
      await timeAdmsDb(async () => {
        await new Promise((resolve) => setTimeout(resolve, ADMS_PERF_SLOW_WALL_MS + 30));
      });
    });
    const line = flushAdmsPerf(Date.now(), true);
    expect(line?.clock).toBe("wall");
    expect(line?.event).toBe("adms_perf");
    expect(line?.dbOpsExcludesRecalc).toBe(true);
    expect(line?.buckets.attlog?.requests).toBe(1);
    expect(line?.buckets.attlog?.slowRequests).toBe(1);
    expect(line?.buckets.attlog?.dbWallMs).toBeGreaterThanOrEqual(ADMS_PERF_SLOW_WALL_MS);
    const serialized = JSON.stringify(line);
    expect(serialized).not.toMatch(/cpu|serial|password|punch_at|staff_id|SN=/i);
    expect(buildAdmsPerfLog()).toBeNull();
  });

  it("holds a recorded poll until the flush interval", async () => {
    const now = Date.now();
    resetAdmsPerfForTests({ now });
    await runWithAdmsPerf("idle_poll", async () => undefined);
    expect(flushAdmsPerf(now + ADMS_PERF_FLUSH_MS - 1, false)).toBeNull();
    expect(readAdmsPerfBuckets().idle_poll?.requests).toBe(1);
    const line = flushAdmsPerf(now + ADMS_PERF_FLUSH_MS, false);
    expect(line?.buckets.idle_poll?.requests).toBe(1);
  });
});

describe("ADMS punch regression", () => {
  const staff = new Map([
    ["9", "staff-a"],
    ["12", "staff-b"],
  ]);

  it("keeps a replayed punch idempotent and does not cross employees in the duplicate window", () => {
    const rows = buildPunchRows({
      punches: [
        punch("9", "2026-08-01T05:00:00.000Z"),
        punch("9", "2026-08-01T05:00:20.000Z"),
        punch("12", "2026-08-01T05:00:20.000Z"),
        punch("9", "2026-08-01T05:00:00.000Z"),
      ],
      companyId: "company-1",
      locationId: "site-1",
      deviceId: "device-1",
      source: "adms_push",
      windowSeconds: 60,
      shift: DEFAULT_SHIFT,
      staffByBiometric: staff,
    });
    expect(rows.map((row) => row.staff_id)).toEqual(["staff-a", "staff-a", "staff-b", "staff-a"]);
    expect(rows.map((row) => row.probable_duplicate)).toEqual([false, true, false, true]);
    expect(rows[0].punch_hash).toBe(rows[3].punch_hash);
    expect(rows[0].punch_hash).not.toBe(rows[2].punch_hash);
    expect(new Set(rows.map((row) => row.punch_hash)).size).toBe(3);
  });

  it("assigns an overnight out before the cutoff to the shift date, and a delayed punch keeps its own date", () => {
    const start = assignAttendanceDate("2026-08-01T19:05:00.000Z", night);
    const out = assignAttendanceDate("2026-08-01T22:00:00.000Z", night);
    const afterCutoff = assignAttendanceDate("2026-08-02T04:00:00.000Z", night);
    const delayed = assignAttendanceDate("2026-07-20T05:00:00.000Z", DEFAULT_SHIFT);
    expect(start).toBe("2026-08-01");
    expect(out).toBe("2026-08-01");
    expect(afterCutoff).toBe("2026-08-02");
    expect(delayed).toBe("2026-07-20");
  });
});

describe("proposed ADMS recalc scope", () => {
  it("skips a duplicate-only upload", () => {
    expect(planAdmsRecalc([])).toEqual({ mode: "skip" });
  });

  it("scopes mapped employees and pads one day for an overnight split", () => {
    const plan = planAdmsRecalc([
      { staff_id: "staff-b", attendance_date: "2026-08-01" },
      { staff_id: "staff-a", attendance_date: "2026-08-02" },
    ]);
    expect(plan).toEqual({
      mode: "staff",
      staffIds: ["staff-a", "staff-b"],
      dateFrom: "2026-07-31",
      dateTo: "2026-08-03",
      includeUnmappedPunches: false,
    });
  });

  it("keeps a full-site recalculation when any new punch is unmapped", () => {
    const plan = planAdmsRecalc([
      { staff_id: "staff-a", attendance_date: "2026-08-01" },
      { staff_id: null, attendance_date: "2026-08-01" },
    ]);
    expect(plan).toMatchObject({ mode: "full_site", reason: "unmapped_punch", dateFrom: "2026-08-01", dateTo: "2026-08-01" });
  });

  it("keeps a full-site recalculation when the upload covers a wide staff set", () => {
    const inserted = Array.from({ length: 201 }, (_, index) => ({
      staff_id: `staff-${index}`,
      attendance_date: "2026-08-01",
    }));
    expect(planAdmsRecalc(inserted)).toMatchObject({ mode: "full_site", reason: "wide_staff_set" });
  });
});

describe("punch batch helpers", () => {
  it("chunks without dropping or reordering rows", () => {
    expect(chunkPunchRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("counts only the unique-punch conflict as ignorable", () => {
    expect(punchInsertFailureMessage({ code: "23505", message: "duplicate key" })).toBeNull();
    expect(punchInsertFailureMessage({ code: "23502", message: "null value in column attendance_date" })).toBe(
      "null value in column attendance_date",
    );
    expect(punchInsertFailureMessage({ code: "42501", message: "permission denied" })).toBe("permission denied");
    expect(punchInsertFailureMessage(null)).toBeNull();
  });

  it("drops known punch hashes before insert", () => {
    const { fresh, duplicates } = partitionFreshPunchRows(
      [
        { punch_hash: "a", id: 1 },
        { punch_hash: "b", id: 2 },
        { punch_hash: "a", id: 3 },
        { punch_hash: null, id: 4 },
      ],
      ["a"],
    );
    expect(duplicates).toBe(2);
    expect(fresh.map((row) => row.id)).toEqual([2, 4]);
  });
});
