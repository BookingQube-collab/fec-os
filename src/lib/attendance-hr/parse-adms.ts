import { parseAttlog, parsePunchTimestamp } from "./parse-attlog";
import type { IncomingBiometricUser } from "./mapping-merge";
import type { ParsedPunch } from "./constants";

const USER_LINE_RE = /^(USER|USERINFO)\s+/i;
const SKIP_LINE_RE = /^(FP|FPPIN|USERPIC|FACE|BIOPHOTO|OPLOG)\b/i;

export type AdmsTable =
  | "ATTLOG"
  | "OPERLOG"
  | "USERINFO"
  | "USER"
  | "OPTIONS"
  | "BIODATA"
  | "ATTPHOTO"
  | "unknown";

export function normalizeAdmsTable(raw: string | null | undefined): AdmsTable {
  const value = (raw ?? "").trim().toUpperCase();
  if (value === "ATTLOG") return "ATTLOG";
  if (value === "OPERLOG") return "OPERLOG";
  if (value === "USERINFO") return "USERINFO";
  if (value === "USER") return "USER";
  if (value === "OPTIONS" || value === "OPTION") return "OPTIONS";
  if (value === "BIODATA") return "BIODATA";
  if (value === "ATTPHOTO") return "ATTPHOTO";
  return "unknown";
}

export function parseAdmsQuery(url: URL): {
  sn: string;
  table: AdmsTable;
  stamp: string | null;
  options: string | null;
  pushver: string | null;
  pushcommkey: string | null;
} {
  const sn = (url.searchParams.get("SN") ?? url.searchParams.get("sn") ?? "").trim();
  return {
    sn,
    table: normalizeAdmsTable(url.searchParams.get("table") ?? url.searchParams.get("Table")),
    stamp: (url.searchParams.get("Stamp") ?? url.searchParams.get("stamp") ?? "").trim() || null,
    options: (url.searchParams.get("options") ?? url.searchParams.get("Options") ?? "").trim() || null,
    pushver: (url.searchParams.get("pushver") ?? url.searchParams.get("pushVer") ?? "").trim() || null,
    pushcommkey:
      (
        url.searchParams.get("pushcommkey") ??
        url.searchParams.get("pushCommKey") ??
        url.searchParams.get("CommKey") ??
        url.searchParams.get("commKey") ??
        ""
      ).trim() || null,
  };
}

function parseKeyValueLine(line: string): Record<string, string> {
  const trimmed = line.replace(USER_LINE_RE, "").trim();
  if (!trimmed) return {};
  const parts = trimmed.includes("\t")
    ? trimmed.split("\t")
    : trimmed.split(/\s+(?=[A-Za-z][A-Za-z0-9_]*=)/);
  const fields: Record<string, string> = {};
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    fields[part.slice(0, idx).trim().toUpperCase()] = part.slice(idx + 1).trim();
  }
  return fields;
}

function field(fields: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = fields[key.toUpperCase()];
    if (value) return value;
  }
  return "";
}

function parseEpochTimestamp(raw: string): string | null {
  if (!/^\d{10,13}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const dt = new Date(ms);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function parseAdmsPunchTimestamp(raw: string): string | null {
  return parsePunchTimestamp(raw) ?? parseEpochTimestamp(raw);
}

export function parseAdmsUsers(text: string): IncomingBiometricUser[] {
  const users: IncomingBiometricUser[] = [];
  const seen = new Set<string>();
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (!line || SKIP_LINE_RE.test(line)) continue;
    const fields = parseKeyValueLine(line);
    const pin = field(fields, "PIN", "PIN2");
    if (!pin) continue;
    if (seen.has(pin)) continue;
    seen.add(pin);
    users.push({
      biometricUserId: pin,
      name: field(fields, "NAME") || pin,
    });
  }
  return users;
}

function parseKeyValueAttlog(text: string): ParsedPunch[] {
  const punches: ParsedPunch[] = [];
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || SKIP_LINE_RE.test(line)) continue;
    if (!/=/.test(line)) continue;
    const fields = parseKeyValueLine(line);
    const pin = field(fields, "PIN", "PIN2");
    const tsRaw = field(fields, "DATETIME", "TIME", "DATE");
    const punchAt = tsRaw ? parseAdmsPunchTimestamp(tsRaw) : null;
    if (!pin || !punchAt) continue;
    punches.push({
      biometricUserId: pin,
      punchAt,
      verifyMethod: toInt(field(fields, "VERIFIED", "VERIFY")),
      inOutStatus: toInt(field(fields, "STATUS", "INOUT", "IN_OUT")),
      workCode: toInt(field(fields, "WORKCODE", "WORK_CODE")),
      reservedField: field(fields, "RESERVED") || null,
      raw: line.slice(0, 120),
      rowNumber: i + 1,
    });
  }
  return punches;
}

function toInt(value: string): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export function parseAdmsAttlog(text: string): ParsedPunch[] {
  const kv = parseKeyValueAttlog(text);
  if (kv.length) return kv;
  return parseAttlog(text).punches;
}

export function buildAdmsHandshake(input: {
  sn: string;
  attlogStamp?: string | null;
  operlogStamp?: string | null;
  timezoneOffsetHours?: number;
}): string {
  const att = input.attlogStamp?.trim() || "None";
  const oper = input.operlogStamp?.trim() || "None";
  const tz = input.timezoneOffsetHours ?? 3;
  return [
    `GET OPTION FROM: ${input.sn}`,
    `ATTLOGStamp=${att}`,
    `OPERLOGStamp=${oper}`,
    "ATTPHOTOStamp=None",
    "ErrorDelay=30",
    "Delay=10",
    "TransTimes=00:00;14:00",
    "TransInterval=1",
    "TransFlag=TransData AttLog OpLog EnrollUser ChgUser",
    `TimeZone=${tz}`,
    "Realtime=1",
    "Encrypt=None",
  ].join("\n");
}

export function admsOk(count?: number): string {
  if (count == null) return "OK";
  return `OK: ${count}`;
}
