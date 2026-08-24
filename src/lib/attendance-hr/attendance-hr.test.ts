import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseEncryptionKey } from "@/lib/ai/crypto";

import { calculateDailyAttendance, markProbableDuplicates } from "./calculate";
import { DEFAULT_SHIFT, USER_DAT_RECORD_SIZE } from "./constants";
import { decryptFileBuffer, encryptFileBuffer } from "./file-crypto";
import { detectBufferKind } from "./detect";
import { guardAttendanceUpload } from "./file-guard";
import {
  isAllowedAttendanceImportFilename,
  selectAttendanceImportFiles,
} from "./select-import-files";
import { punchHash } from "./hash";
import { encodeZkPackedTime, parseAttlog, parseAttlogBuffer } from "./parse-attlog";
import {
  admsOk,
  buildAdmsAttlogQueryCommand,
  buildAdmsHandshake,
  formatAdmsDateTime,
  formatAdmsGetRequestCommand,
  parseAdmsAttlog,
  parseAdmsDeviceCmdAck,
  parseAdmsQuery,
  parseAdmsUsers,
} from "./parse-adms";
import { parseDelimitedAttendance } from "./parse-spreadsheet";
import { buildUserDat, parseUserDat } from "./parse-user-dat";
import { previewAttendanceFile } from "./preview";
import {
  buildPunchRows,
  mergeBiometricUsersById,
  staffByBiometricFromMappings,
} from "./mapping-merge";
import { attendanceHrStaffMatches, formatAttendanceHrLocation } from "./report";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("ZKTeco user.dat parser", () => {
  it("parses 72-byte little-endian records from the sample file", () => {
    const buf = readFileSync(join(fixtureDir, "user.dat"));
    expect(buf.length % USER_DAT_RECORD_SIZE).toBe(0);
    const parsed = parseUserDat(buf);
    expect(parsed.errors.filter((e) => e.code === "corrupt_user_dat")).toHaveLength(0);
    expect(parsed.users.length).toBeGreaterThanOrEqual(3);
    expect(parsed.users.map((u) => u.biometricUserId)).toEqual(expect.arrayContaining(["9", "12", "21"]));
    expect(parsed.users.find((u) => u.biometricUserId === "9")?.name).toMatch(/Ahmed/i);
  });

  it("rejects corrupt files whose length is not divisible by 72", () => {
    const parsed = parseUserDat(Buffer.from("not-a-user-dat"));
    expect(parsed.users).toHaveLength(0);
    expect(parsed.errors[0]?.code).toBe("corrupt_user_dat");
  });

  it("round-trips builder output", () => {
    const buf = buildUserDat([
      { userId: 9, name: "Ahmed Ali" },
      { userId: 12, name: "Sara Khan" },
    ]);
    const parsed = parseUserDat(buf);
    expect(parsed.users).toEqual([
      expect.objectContaining({ biometricUserId: "9", name: "Ahmed Ali" }),
      expect.objectContaining({ biometricUserId: "12", name: "Sara Khan" }),
    ]);
  });
});

describe("ZKTeco attlog parser", () => {
  it("parses JJA1251800498_attlog.dat tab-separated punches", () => {
    const text = readFileSync(join(fixtureDir, "JJA1251800498_attlog.dat"), "utf8");
    const parsed = parseAttlog(text);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.punches.length).toBeGreaterThanOrEqual(6);
    expect(parsed.punches[0]).toMatchObject({
      biometricUserId: "9",
      verifyMethod: 1,
      inOutStatus: 0,
      workCode: 1,
    });
    expect(parsed.punches[0].punchAt).toContain("2026-08-01");
  });

  it("trims spaces around User ID and rejects bad timestamps", () => {
    const parsed = parseAttlog("  9  \t2026-99-01 10:16:58\t1\t0\t1\t0\n");
    expect(parsed.punches).toHaveLength(0);
    expect(parsed.errors[0]?.code).toBe("invalid_timestamp");
  });

  it("accepts timestamps without seconds and comma-separated rows", () => {
    const parsed = parseAttlog("9,2026-08-01 10:16,1,0,1,0\n");
    expect(parsed.punches).toHaveLength(1);
    expect(parsed.punches[0].biometricUserId).toBe("9");
    expect(parsed.punches[0].punchAt).toContain("2026-08-01");
  });

  it("decodes UTF-16 LE attlog buffers", () => {
    const text = readFileSync(join(fixtureDir, "JJA1251800498_attlog.dat"), "utf8");
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
    const parsed = parseAttlogBuffer(utf16);
    expect(parsed.punches.length).toBeGreaterThanOrEqual(6);
    expect(parsed.punches[0].biometricUserId).toBe("9");
  });

  it("parses packed binary ZKTeco attendance records", () => {
    const stamp = encodeZkPackedTime({ year: 2026, month: 8, day: 1, hour: 10, minute: 16, second: 58 });
    const rec = (pin: number) => {
      const buf = Buffer.alloc(16);
      buf.writeUInt16LE(pin, 0);
      buf.writeUInt32LE(stamp, 4);
      buf.writeUInt8(0, 8);
      buf.writeUInt8(1, 9);
      return buf;
    };
    const parsed = parseAttlogBuffer(Buffer.concat([rec(9), rec(12), rec(21)]));
    expect(parsed.punches).toHaveLength(3);
    expect(parsed.punches.map((p) => p.biometricUserId)).toEqual(["9", "12", "21"]);
    expect(parsed.punches[0].punchAt).toContain("2026-08-01");
  });
});

describe("attendance preview from .dat", () => {
  it("turns fixture attlog.dat into preview punch rows", async () => {
    const buffer = readFileSync(join(fixtureDir, "JJA1251800498_attlog.dat"));
    const preview = await previewAttendanceFile({
      filename: "device-1.dat",
      buffer,
      locationId: "loc",
      deviceId: "dev",
      companyId: "co",
    });
    expect(preview.ok).toBe(true);
    expect(preview.kind).toBe("attlog");
    expect(preview.punchCount).toBeGreaterThanOrEqual(6);
    expect(preview.punches.length).toBeGreaterThanOrEqual(6);
    expect(preview.uniqueUserCount).toBeGreaterThanOrEqual(3);
    expect(preview.dateFrom).toBeTruthy();
    expect(preview.dateTo).toBeTruthy();
    expect(() => JSON.stringify(preview)).not.toThrow();
  });

  it("returns a clear failed preview for unreadable binary .dat", async () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
    const preview = await previewAttendanceFile({
      filename: "noise.dat",
      buffer,
      locationId: "loc",
      deviceId: "dev",
      companyId: "co",
    });
    expect(preview.ok).toBe(false);
    expect(preview.punchCount).toBe(0);
    expect(preview.message ?? preview.errors[0]?.message).toMatch(/punch|user|template|read/i);
    expect(() => JSON.stringify(preview)).not.toThrow();
  });

  it("does not treat a text attlog as a fingerprint template", () => {
    const buffer = readFileSync(join(fixtureDir, "JJA1251800498_attlog.dat"));
    expect(detectBufferKind(buffer, "attlog").kind).toBe("attlog");
    expect(guardAttendanceUpload("JJA1251800498_attlog.dat", buffer.length).ok).toBe(true);
  });
});

describe("spreadsheet auto-detect", () => {
  it("maps User ID and timestamp columns from CSV", () => {
    const csv = "User ID,Name,Timestamp\n9,Ahmed,2026-08-01 10:16:58\n";
    const parsed = parseDelimitedAttendance(csv, ",");
    expect(parsed.punches).toHaveLength(1);
    expect(parsed.punches[0].biometricUserId).toBe("9");
    expect(parsed.users[0].name).toBe("Ahmed");
  });
});

describe("file guard", () => {
  it("rejects biometric template files", () => {
    const blocked = guardAttendanceUpload("template.fp10", 128);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe("biometric_template");
      expect(blocked.message).toMatch(/sensitive/i);
    }
  });

  it("accepts user.dat and attlog names", () => {
    expect(guardAttendanceUpload("user.dat", 72).ok).toBe(true);
    expect(guardAttendanceUpload("JJA1251800498_attlog.dat", 200).ok).toBe(true);
  });
});

describe("import file picker filter", () => {
  it("keeps user.dat, attlog, Excel and CSV, and skips templates", () => {
    expect(isAllowedAttendanceImportFilename("user.dat")).toBe(true);
    expect(isAllowedAttendanceImportFilename("JJA1251800498_attlog.dat")).toBe(true);
    expect(isAllowedAttendanceImportFilename("punches.xlsx")).toBe(true);
    expect(isAllowedAttendanceImportFilename("punches.csv")).toBe(true);
    expect(isAllowedAttendanceImportFilename("template.fp10")).toBe(false);
    expect(isAllowedAttendanceImportFilename("face_template.bin")).toBe(false);
    expect(isAllowedAttendanceImportFilename("notes.txt")).toBe(false);
  });

  it("merges a ZKTeco dump folder and reports skipped templates", () => {
    const result = selectAttendanceImportFiles(
      [
        { name: "user.dat", size: 72, lastModified: 1 },
        { name: "JJA1251800498_attlog.dat", size: 200, lastModified: 2 },
        { name: "template.fp10", size: 128, lastModified: 3 },
        { name: "readme.txt", size: 20, lastModified: 4 },
      ],
      [{ name: "user.dat", size: 72, lastModified: 1 }],
    );
    expect(result.accepted.map((f) => f.name)).toEqual(["user.dat", "JJA1251800498_attlog.dat"]);
    expect(result.skipped).toEqual([
      { filename: "template.fp10", reason: "template" },
      { filename: "readme.txt", reason: "unsupported" },
    ]);
  });
});

describe("punch hash and duplicates", () => {
  it("hashes company + device + user + timestamp", () => {
    const a = punchHash({
      companyId: "c1",
      deviceId: "d1",
      biometricUserId: "9",
      punchAt: "2026-08-01T07:16:58.000Z",
    });
    const b = punchHash({
      companyId: "c1",
      deviceId: "d2",
      biometricUserId: "9",
      punchAt: "2026-08-01T07:16:58.000Z",
    });
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });

  it("marks punches within 60 seconds as probable duplicates", () => {
    const marked = markProbableDuplicates(
      [
        { punchAt: "2026-08-01T07:16:58.000Z", probableDuplicate: false },
        { punchAt: "2026-08-01T07:17:20.000Z", probableDuplicate: false },
        { punchAt: "2026-08-01T10:00:00.000Z", probableDuplicate: false },
      ],
      60,
    );
    expect(marked[1].probableDuplicate).toBe(true);
    expect(marked[2].probableDuplicate).toBe(false);
  });
});

describe("daily calculation", () => {
  const shift = {
    name: "Morning",
    startTime: "08:00",
    endTime: "17:00",
    overnight: false,
    graceMinutes: 10,
    breakMinutes: 60,
    minWorkMinutes: 480,
    overtimeAfterMinutes: 480,
    earlyInWindowMinutes: 120,
    lateOutWindowMinutes: 180,
    dayCutoffTime: "06:00",
  };

  it("uses first punch as in and last as out", () => {
    const day = calculateDailyAttendance(
      [
        { punchAt: "2026-08-01T05:05:00.000Z" },
        { punchAt: "2026-08-01T14:00:00.000Z" },
      ],
      { workDate: "2026-08-01", scheduled: true, shift },
    );
    expect(day.statusFlags).toContain("present");
    expect(day.actualIn).toBeTruthy();
    expect(day.actualOut).toBeTruthy();
    expect(day.validPunchCount).toBe(2);
  });

  it("does not mark absent without a roster", () => {
    const day = calculateDailyAttendance([], { workDate: "2026-08-01", scheduled: false });
    expect(day.status).toBe("unscheduled");
  });

  it("marks absent only on a scheduled working day", () => {
    const day = calculateDailyAttendance([], { workDate: "2026-08-01", scheduled: true, shift });
    expect(day.status).toBe("absent");
  });

  it("flags a single punch as missed punch", () => {
    const day = calculateDailyAttendance([{ punchAt: "2026-08-01T05:05:00.000Z" }], {
      workDate: "2026-08-01",
      scheduled: true,
      shift,
    });
    expect(day.missedPunch).toBe(true);
    expect(day.statusFlags).toContain("missed_punch");
  });

  it("supports overnight shifts when out is after midnight", () => {
    const night = { ...shift, name: "Night", startTime: "22:00", endTime: "07:00", overnight: true };
    const day = calculateDailyAttendance(
      [
        { punchAt: "2026-08-01T19:05:00.000Z" },
        { punchAt: "2026-08-02T04:00:00.000Z" },
      ],
      { workDate: "2026-08-01", scheduled: true, shift: night },
    );
    expect(day.actualIn).toBeTruthy();
    expect(day.actualOut).toBeTruthy();
    expect(new Date(day.actualOut!).getTime()).toBeGreaterThan(new Date(day.actualIn!).getTime());
  });
});

describe("HR report row helpers", () => {
  it("matches staff by name, employee code, or QID", () => {
    const row = {
      staff_name: "Ahmed Ali",
      employee_code: "E3-012",
      qid: "28912345678",
      biometric_user_id: "9",
    };
    expect(attendanceHrStaffMatches(row, "ahmed")).toBe(true);
    expect(attendanceHrStaffMatches(row, "e3-012")).toBe(true);
    expect(attendanceHrStaffMatches(row, "2891234")).toBe(true);
    expect(attendanceHrStaffMatches(row, "sara")).toBe(false);
  });

  it("treats unmapped keyword as unmatched staff", () => {
    expect(attendanceHrStaffMatches({ staff_name: null, biometric_user_id: "9" }, "Unmapped")).toBe(true);
    expect(attendanceHrStaffMatches({ staff_name: "Ahmed Ali" }, "Unmapped")).toBe(false);
  });

  it("formats location as venue code plus name", () => {
    expect(formatAttendanceHrLocation("INF-CC", "InflataPark")).toMatch(/INF-CC/);
    expect(formatAttendanceHrLocation("INF-CC", "InflataPark")).toMatch(/City Center|InflataPark/i);
  });
});

describe("sticky biometric mapping across re-uploads", () => {
  const punch = (userId: string, at = "2026-08-01T07:16:58.000Z") => ({
    biometricUserId: userId,
    punchAt: at,
    verifyMethod: 1,
    inOutStatus: 0,
    workCode: 1,
    reservedField: null,
    raw: `${userId}\t2026-08-01 10:16:58`,
    rowNumber: 1,
  });

  it("keeps staff_id when user.dat is reimported with a new device name", () => {
    const first = parseUserDat(buildUserDat([{ userId: 12, name: "Sara" }]));
    const mapped = mergeBiometricUsersById([], first.users);
    mapped[0].staffId = "staff-a";

    const renamed = parseUserDat(buildUserDat([{ userId: 12, name: "Sara Khan" }]));
    const reimported = mergeBiometricUsersById(
      mapped.map((row) => ({
        biometricUserId: row.biometricUserId,
        deviceName: row.deviceName,
        staffId: row.staffId,
        previousDeviceName: row.previousDeviceName,
      })),
      renamed.users,
    );

    expect(reimported).toHaveLength(1);
    expect(reimported[0]).toMatchObject({
      biometricUserId: "12",
      staffId: "staff-a",
      deviceName: "Sara Khan",
      previousDeviceName: "Sara",
      nameChanged: true,
      isNew: false,
    });
  });

  it("attaches reimported punches to the existing mapped staff_id", () => {
    const merged = mergeBiometricUsersById(
      [{ biometricUserId: "12", deviceName: "Sara", staffId: "staff-a" }],
      [{ biometricUserId: "12", name: "Sara Khan" }],
    );
    const staffByBiometric = staffByBiometricFromMappings(merged);
    const rows = buildPunchRows({
      punches: [punch("12")],
      companyId: "co",
      locationId: "loc",
      deviceId: "dev",
      importId: "imp",
      windowSeconds: 60,
      shift: DEFAULT_SHIFT,
      staffByBiometric,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].staff_id).toBe("staff-a");
    expect(rows[0].biometric_user_id).toBe("12");
  });

  it("does not merge two User IDs just because names look similar", () => {
    const merged = mergeBiometricUsersById(
      [
        { biometricUserId: "12", deviceName: "Sara Khan", staffId: "staff-a" },
        { biometricUserId: "21", deviceName: "Sara K", staffId: null },
      ],
      [
        { biometricUserId: "12", name: "Sara K" },
        { biometricUserId: "21", name: "Sara Khan" },
      ],
    );
    const byId = new Map(merged.map((row) => [row.biometricUserId, row]));
    expect(byId.get("12")?.staffId).toBe("staff-a");
    expect(byId.get("21")?.staffId).toBeNull();
    expect(byId.get("12")?.isNew).toBe(false);
    expect(byId.get("21")?.isNew).toBe(false);
  });

  it("does not create a second row for the same User ID", () => {
    const merged = mergeBiometricUsersById(
      [{ biometricUserId: "12", deviceName: "Sara", staffId: "staff-a" }],
      [
        { biometricUserId: "12", name: "Sara" },
        { biometricUserId: "12", name: "Sara Khan" },
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].staffId).toBe("staff-a");
    expect(merged[0].deviceName).toBe("Sara Khan");
  });
});

describe("ZKTeco ADMS / iClock parse", () => {
  it("parses tab-separated ATTLOG the same way as *_attlog.dat", () => {
    const punches = parseAdmsAttlog("9\t2026-08-01 10:16:58\t1\t0\t1\t0\n12\t2026-08-01 18:02:11\t1\t1\t1\t0\n");
    expect(punches.map((p) => p.biometricUserId)).toEqual(["9", "12"]);
    expect(punches[0].punchAt).toBe("2026-08-01T07:16:58.000Z");
  });

  it("parses PIN= key/value ATTLOG lines", () => {
    const punches = parseAdmsAttlog("PIN=1001\tDateTime=2026-08-01 10:16:58\tVerified=1\tStatus=0\n");
    expect(punches).toHaveLength(1);
    expect(punches[0]).toMatchObject({ biometricUserId: "1001", verifyMethod: 1, inOutStatus: 0 });
  });

  it("parses OPERLOG USER lines and skips fingerprint templates", () => {
    const users = parseAdmsUsers(
      "USER PIN=12\tName=Sara Khan\tPri=0\tPasswd=\tCard=\nFPPIN=12\tFID=0\tTMP=xxxx\nUSER PIN=21 Name=Ali Pri=0\n",
    );
    expect(users).toEqual([
      { biometricUserId: "12", name: "Sara Khan" },
      { biometricUserId: "21", name: "Ali" },
    ]);
  });

  it("parses USERINFO PIN= Name= lines", () => {
    const users = parseAdmsUsers("PIN=9\tName=Mary\tPrivilege=0\tCard=\tPassword=\n");
    expect(users).toEqual([{ biometricUserId: "9", name: "Mary" }]);
  });

  it("keeps staff_id when ADMS re-pushes a renamed user", () => {
    const incoming = parseAdmsUsers("USER PIN=12\tName=Sara Khan\tPri=0\n");
    const merged = mergeBiometricUsersById(
      [{ biometricUserId: "12", deviceName: "Sara", staffId: "staff-a" }],
      incoming,
    );
    expect(merged[0]).toMatchObject({ staffId: "staff-a", deviceName: "Sara Khan", nameChanged: true });
  });

  it("builds an iClock handshake and OK count", () => {
    const url = new URL("https://example.test/iclock/cdata?SN=JJA1251800498&table=ATTLOG&Stamp=26&pushcommkey=secret");
    expect(parseAdmsQuery(url)).toMatchObject({
      sn: "JJA1251800498",
      table: "ATTLOG",
      stamp: "26",
      pushcommkey: "secret",
    });
    const body = buildAdmsHandshake({ sn: "JJA1251800498", attlogStamp: "26" });
    expect(body).toContain("GET OPTION FROM: JJA1251800498");
    expect(body).toContain("ATTLOGStamp=26");
    expect(body).toContain("TransFlag=TransData AttLog OpLog EnrollUser ChgUser");
    expect(admsOk(3)).toBe("OK: 3");
    const firstSync = buildAdmsHandshake({ sn: "JJA1251600498" });
    expect(firstSync).toContain("ATTLOGStamp=0");
    expect(firstSync).toContain("OPERLOGStamp=0");
    expect(firstSync).toContain("ATTPHOTOStamp=None");
    expect(buildAdmsHandshake({ sn: "X", attlogStamp: "None" })).toContain("ATTLOGStamp=0");
  });

  it("builds a DATA QUERY ATTLOG getrequest command and parses device ACK", () => {
    const from = new Date("2026-08-24T00:00:00+03:00");
    const to = new Date("2026-08-24T12:00:00+03:00");
    const command = buildAdmsAttlogQueryCommand(from, to);
    expect(command).toContain("DATA QUERY ATTLOG");
    expect(command).toContain("StartTime=2026-08-24 00:00:00");
    expect(command).toContain("EndTime=2026-08-24 12:00:00");
    expect(formatAdmsGetRequestCommand(7, command)).toBe(`C:7:${command}`);
    expect(formatAdmsDateTime(from)).toBe("2026-08-24 00:00:00");
    expect(parseAdmsDeviceCmdAck("ID=7&Return=0")).toEqual({ id: 7, returnCode: 0 });
    expect(parseAdmsDeviceCmdAck("OK")).toBeNull();
  });
});

describe("file encryption", () => {
  it("round-trips ciphertext", () => {
    const key = parseEncryptionKey("0".repeat(64));
    const plain = Buffer.from("hello punches");
    const enc = encryptFileBuffer(plain, key);
    expect(enc.equals(plain)).toBe(false);
    expect(decryptFileBuffer(enc, key).toString("utf8")).toBe("hello punches");
  });
});
