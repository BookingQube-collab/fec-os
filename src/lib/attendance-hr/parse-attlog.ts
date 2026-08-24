import type { ParsedPunch, ParseIssue } from "./constants";

const MAX_ERROR_RAW = 120;
const MAX_LINE_CHARS = 4_000;
const BINARY_MIN_HITS = 2;
const BINARY_MIN_RATIO = 0.7;

const YMD_RE =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:\s*(AM|PM))?$/i;
const DMY_RE =
  /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:\s*(AM|PM))?$/i;
const DATE_ONLY_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
const TIME_ONLY_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i;

export type AttlogParseResult = {
  punches: ParsedPunch[];
  errors: ParseIssue[];
};

function clipRaw(value: string): string {
  const compact = value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
  return compact.length > MAX_ERROR_RAW ? `${compact.slice(0, MAX_ERROR_RAW)}…` : compact;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoQatar(year: number, month: number, day: number, hour: number, minute: number, second: number): string | null {
  if (year < 2000 || year > 2038 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const iso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}+03:00`;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function applyAmPm(hour: number, mer: string | undefined): number {
  if (!mer) return hour;
  const up = mer.toUpperCase();
  if (up === "PM" && hour < 12) return hour + 12;
  if (up === "AM" && hour === 12) return 0;
  return hour;
}

export function parsePunchTimestamp(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, " ").replace("T", " ");
  const ymd = trimmed.match(YMD_RE);
  if (ymd) {
    const hour = applyAmPm(Number(ymd[4] ?? 0), ymd[7]);
    return toIsoQatar(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]), hour, Number(ymd[5] ?? 0), Number(ymd[6] ?? 0));
  }
  const dmy = trimmed.match(DMY_RE);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const year = Number(dmy[3]);
    const day = a > 12 ? a : b > 12 ? b : a;
    const month = a > 12 ? b : b > 12 ? a : b;
    const hour = applyAmPm(Number(dmy[4] ?? 0), dmy[7]);
    return toIsoQatar(year, month, day, hour, Number(dmy[5] ?? 0), Number(dmy[6] ?? 0));
  }
  return null;
}

function splitAttlogLine(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((p) => p.trim()).filter((p, i, arr) => !(p === "" && i === arr.length - 1));
  }
  if (line.includes(";") && (line.match(/;/g)?.length ?? 0) >= 1) {
    return line.split(";").map((p) => p.trim()).filter(Boolean);
  }
  if (line.includes(",") && /^\d/.test(line.trim())) {
    return line.split(",").map((p) => p.trim()).filter((p, i, arr) => !(p === "" && i === arr.length - 1));
  }
  return line.trim().split(/\s{2,}|\s+/);
}

function toInt(value: string | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function looksLikeHeader(line: string): boolean {
  return /user\s*id|userid|\bpin\b|timestamp|datetime|enroll|punch time/i.test(line) && !/^\d/.test(line);
}

function mergeDateTimeParts(parts: string[]): { userRaw: string; tsRaw: string; restStart: number } {
  let userRaw = parts[0] ?? "";
  let tsRaw = parts[1] ?? "";
  let restStart = 2;

  if (DATE_ONLY_RE.test(tsRaw) && parts[2] && TIME_ONLY_RE.test(parts[2])) {
    tsRaw = `${tsRaw} ${parts[2]}`;
    restStart = 3;
  }

  return { userRaw, tsRaw, restStart };
}

export function parseAttlog(text: string): AttlogParseResult {
  const punches: ParsedPunch[] = [];
  const errors: ParseIssue[] = [];
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = src.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;
    if (i === 0 && looksLikeHeader(line)) continue;
    if (line.length > MAX_LINE_CHARS) {
      errors.push({
        rowNumber: i + 1,
        code: "invalid_row",
        message: "Row is too long to be a punch log. This may be a binary or template file.",
        raw: clipRaw(line),
      });
      continue;
    }

    const parts = splitAttlogLine(line);
    if (parts.length < 2) {
      errors.push({
        rowNumber: i + 1,
        code: "invalid_row",
        message: "Row does not contain a User ID and timestamp.",
        raw: clipRaw(line),
      });
      continue;
    }

    const merged = mergeDateTimeParts(parts);
    const biometricUserId = merged.userRaw.replace(/\s+/g, "").trim();
    if (!biometricUserId) {
      errors.push({
        rowNumber: i + 1,
        code: "missing_user_id",
        message: "Missing User ID.",
        raw: clipRaw(line),
      });
      continue;
    }

    const punchAt = parsePunchTimestamp(merged.tsRaw);
    if (!punchAt) {
      errors.push({
        rowNumber: i + 1,
        code: "invalid_timestamp",
        message: `Invalid timestamp "${clipRaw(merged.tsRaw)}". Expected YYYY-MM-DD HH:mm:ss.`,
        raw: clipRaw(line),
      });
      continue;
    }

    punches.push({
      biometricUserId,
      punchAt,
      verifyMethod: toInt(parts[merged.restStart]),
      inOutStatus: toInt(parts[merged.restStart + 1]),
      workCode: toInt(parts[merged.restStart + 2]),
      reservedField: parts[merged.restStart + 3] ?? null,
      raw: clipRaw(line),
      rowNumber: i + 1,
    });
  }

  return { punches, errors };
}

export function decodeAttendanceText(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return swapped.toString("utf16le");
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 256));
  const pairs = Math.floor(sample.length / 2);
  if (pairs > 10) {
    let oddNuls = 0;
    for (let i = 1; i < sample.length; i += 2) {
      if (sample[i] === 0) oddNuls += 1;
    }
    if (oddNuls / pairs > 0.7) return buffer.toString("utf16le");
  }

  return buffer.toString("utf8");
}

/** ZKTeco packed timestamp used in binary attendance records. */
export function decodeZkPackedTime(value: number): string | null {
  const second = value & 0x3f;
  const minute = (value >> 6) & 0x3f;
  const hour = (value >> 12) & 0x1f;
  const day = (value >> 17) & 0x1f;
  const month = (value >> 22) & 0xf;
  const year = ((value >> 26) & 0x3f) + 2000;
  return toIsoQatar(year, month, day, hour, minute, second);
}

export function encodeZkPackedTime(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}): number {
  return (
    ((input.year - 2000) << 26) |
    (input.month << 22) |
    (input.day << 17) |
    (input.hour << 12) |
    (input.minute << 6) |
    input.second
  ) >>> 0;
}

type BinaryLayout = {
  recordSize: number;
  pinOffset: number;
  pinSize: 2 | 4;
  pinAsString?: boolean;
  pinStringLength?: number;
  timeOffset: number;
  statusOffset?: number;
  verifyOffset?: number;
};

const BINARY_LAYOUTS: BinaryLayout[] = [
  { recordSize: 16, pinOffset: 0, pinSize: 2, timeOffset: 4, statusOffset: 8, verifyOffset: 9 },
  { recordSize: 16, pinOffset: 0, pinSize: 2, timeOffset: 2, statusOffset: 8, verifyOffset: 9 },
  { recordSize: 40, pinOffset: 0, pinSize: 2, timeOffset: 4, statusOffset: 8, verifyOffset: 9 },
  { recordSize: 40, pinOffset: 0, pinSize: 2, timeOffset: 28, statusOffset: 8, verifyOffset: 9 },
  {
    recordSize: 40,
    pinOffset: 2,
    pinSize: 2,
    pinAsString: true,
    pinStringLength: 24,
    timeOffset: 27,
    statusOffset: 26,
    verifyOffset: 31,
  },
];

function readPin(buffer: Buffer, offset: number, layout: BinaryLayout): string | null {
  if (layout.pinAsString && layout.pinStringLength) {
    const raw = buffer.subarray(offset, offset + layout.pinStringLength).toString("utf8").replace(/\u0000/g, "").trim();
    return raw || null;
  }
  const id = layout.pinSize === 4 ? buffer.readUInt32LE(offset) : buffer.readUInt16LE(offset);
  if (id <= 0 || id > 99_999_999) return null;
  return String(id);
}

function parseBinaryLayout(buffer: Buffer, layout: BinaryLayout): AttlogParseResult {
  const punches: ParsedPunch[] = [];
  const errors: ParseIssue[] = [];
  if (buffer.length < layout.recordSize) {
    return { punches, errors };
  }
  const count = Math.floor(buffer.length / layout.recordSize);
  for (let i = 0; i < count; i += 1) {
    const offset = i * layout.recordSize;
    const rec = buffer.subarray(offset, offset + layout.recordSize);
    const biometricUserId = readPin(rec, layout.pinOffset, layout);
    const packed = rec.readUInt32LE(layout.timeOffset);
    const punchAt = decodeZkPackedTime(packed);
    if (!biometricUserId || !punchAt) {
      errors.push({
        rowNumber: i + 1,
        code: "invalid_row",
        message: "Binary record did not contain a valid User ID and timestamp.",
      });
      continue;
    }
    punches.push({
      biometricUserId,
      punchAt,
      verifyMethod: layout.verifyOffset != null ? rec[layout.verifyOffset] ?? null : null,
      inOutStatus: layout.statusOffset != null ? rec[layout.statusOffset] ?? null : null,
      workCode: null,
      reservedField: null,
      raw: `bin:${layout.recordSize}:${i + 1}`,
      rowNumber: i + 1,
    });
  }
  return { punches, errors };
}

export function parseBinaryAttlog(buffer: Buffer): AttlogParseResult {
  let best: AttlogParseResult | null = null;
  for (const layout of BINARY_LAYOUTS) {
    if (buffer.length < layout.recordSize * BINARY_MIN_HITS) continue;
    if (buffer.length % layout.recordSize !== 0 && buffer.length % layout.recordSize > 12) continue;
    const parsed = parseBinaryLayout(buffer, layout);
    const total = parsed.punches.length + parsed.errors.length;
    if (parsed.punches.length < BINARY_MIN_HITS) continue;
    if (total > 0 && parsed.punches.length / total < BINARY_MIN_RATIO) continue;
    if (!best || parsed.punches.length > best.punches.length) best = parsed;
  }
  return best ?? { punches: [], errors: [] };
}

export function parseAttlogBuffer(buffer: Buffer): AttlogParseResult {
  const text = decodeAttendanceText(buffer);
  const textParsed = parseAttlog(text);
  if (textParsed.punches.length > 0) return textParsed;

  const binary = parseBinaryAttlog(buffer);
  if (binary.punches.length > 0) return binary;

  if (textParsed.errors.length > 0) return textParsed;
  return {
    punches: [],
    errors: [
      {
        rowNumber: 0,
        code: "empty_parse",
        message: "No punches could be read. Upload a ZKTeco attlog (.dat), user.dat, Excel or CSV — not fingerprint/face templates.",
      },
    ],
  };
}
