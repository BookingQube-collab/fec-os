import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { E3_WEEKLY_LOCATIONS } from "@/lib/weekly-reports/constants";
import { toQatarIso } from "@/lib/staff-import";

export type AttendanceIngestRecord = {
  location?: string;
  location_code?: string;
  user_name?: string;
  employee_code?: string;
  date?: string;
  first_check_in?: string | null;
  last_check_out?: string | null;
  total_hours_worked?: number;
  overtime?: boolean | string;
  overtime_hours?: number;
  status?: string;
};

export type AttendanceIngestError = {
  row: number;
  message: string;
};

export type AttendanceIngestResult = {
  success: boolean;
  imported: number;
  failed: number;
  errors: AttendanceIngestError[];
};

type LocationRow = { id: string; code: string; name: string; region: string | null };
type StaffRow = { id: string; full_name: string; employee_code: string; user_id: string | null };

const INTERNAL_STATUSES = new Set([
  "present",
  "absent",
  "late",
  "early_leave",
  "missed_punch",
  "overtime",
]);

/** Friendly location labels from external HR / biometric exports. */
const LOCATION_ALIASES: Record<string, string> = {
  ...Object.fromEntries(
    E3_WEEKLY_LOCATIONS.flatMap((loc) => {
      const entries: [string, string][] = [
        [normalizeKey(`${loc.name} - ${loc.venue}`), loc.code],
        [normalizeKey(`${loc.name} ${loc.venue}`), loc.code],
        [normalizeKey(loc.code), loc.code],
      ];
      if (loc.code === "INF-CC") {
        entries.push([normalizeKey("Inflatapark"), loc.code]);
        entries.push([normalizeKey("Inflatapark - City Center"), loc.code]);
        entries.push([normalizeKey("Inflatapark City Center"), loc.code]);
      }
      if (loc.code === "KDS-CC") {
        entries.push([normalizeKey("Kids Driving School - City Center"), loc.code]);
      }
      if (loc.code === "UA-DM") {
        entries.push([normalizeKey("Urban Arena - Doha Mall"), loc.code]);
      }
      if (loc.code === "CAR-AP") {
        entries.push([normalizeKey("Carousel - Aspire Park"), loc.code]);
      }
      if (loc.code === "KDS-DM") {
        entries.push([normalizeKey("Kids Driving School Mini - Doha Mall"), loc.code]);
        entries.push([normalizeKey("Kids Mini Driving School - Doha Mall"), loc.code]);
      }
      return entries;
    }),
  ),
  [normalizeKey("Winter Mirage - Vendome Mall")]: "WM-VM",
  [normalizeKey("Winter Mirage Vendome Mall")]: "WM-VM",
  [normalizeKey("WM-VM")]: "WM-VM",
};

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeIngestRecords(body: unknown): AttendanceIngestRecord[] {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid JSON body");
  }
  if (Array.isArray(body)) {
    return body as AttendanceIngestRecord[];
  }
  const obj = body as Record<string, unknown>;
  if (Array.isArray(obj.records)) {
    return obj.records as AttendanceIngestRecord[];
  }
  if ("location" in obj || "user_name" in obj || "employee_code" in obj) {
    return [obj as AttendanceIngestRecord];
  }
  throw new Error("Expected { records: [...] } or a single attendance record");
}

export function parseWorkDate(raw: string): string {
  const trimmed = raw.trim();
  const dmy = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  throw new Error(`Invalid date "${raw}" — use DD-MM-YYYY or YYYY-MM-DD`);
}

export function parsePunchTime(workDate: string, raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t || t === "-" || t.toLowerCase() === "null") return null;

  const m12 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const ap = m12[4].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return `${workDate}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00+03:00`;
  }

  const m24 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    return toQatarIso(workDate, `${m24[1]}:${m24[2]}`);
  }

  const iso = new Date(t);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  return null;
}

function parseOvertimeFlag(value: boolean | string | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "y";
}

function resolveStatus(
  record: AttendanceIngestRecord,
  actualIn: string | null,
  actualOut: string | null,
  hasOvertime: boolean,
): { status: string; missedPunch: boolean } {
  const missedPunch = !actualIn || !actualOut;
  const rawStatus = record.status?.trim();

  if (rawStatus) {
    const normalized = rawStatus.toLowerCase().replace(/\s+/g, "_");
    if (INTERNAL_STATUSES.has(normalized)) {
      return { status: normalized, missedPunch: normalized === "missed_punch" || missedPunch };
    }
    if (normalized === "missing_punch") {
      return { status: "missed_punch", missedPunch: true };
    }
    if (normalized === "incomplete") {
      if (hasOvertime) return { status: "overtime", missedPunch };
      if (missedPunch) return { status: "missed_punch", missedPunch: true };
      return { status: "present", missedPunch: false };
    }
  }

  if (hasOvertime) return { status: "overtime", missedPunch };
  if (!actualIn && !actualOut) return { status: "absent", missedPunch: true };
  if (missedPunch) return { status: "missed_punch", missedPunch: true };
  return { status: "present", missedPunch: false };
}

function resolveLocationCode(
  record: AttendanceIngestRecord,
  locations: LocationRow[],
): string | null {
  if (record.location_code?.trim()) {
    return record.location_code.trim().toUpperCase();
  }
  if (!record.location?.trim()) return null;

  const key = normalizeKey(record.location);
  const alias = LOCATION_ALIASES[key];
  if (alias) return alias;

  for (const loc of locations) {
    const combined = normalizeKey(`${loc.name} - ${loc.region ?? ""}`);
    const combinedNoDash = normalizeKey(`${loc.name} ${loc.region ?? ""}`);
    if (key === combined || key === combinedNoDash) return loc.code;
    if (key.includes(normalizeKey(loc.name)) && loc.region && key.includes(normalizeKey(loc.region))) {
      return loc.code;
    }
  }
  return null;
}

function matchStaff(
  record: AttendanceIngestRecord,
  staffAtLocation: StaffRow[],
): StaffRow | null {
  const employeeCode = record.employee_code?.trim().toUpperCase();
  if (employeeCode) {
    const byCode = staffAtLocation.find((s) => s.employee_code.toUpperCase() === employeeCode);
    if (byCode) return byCode;
  }

  const userName = record.user_name?.trim();
  if (!userName) return null;

  const lower = userName.toLowerCase();
  const exact = staffAtLocation.find((s) => s.full_name.toLowerCase() === lower);
  if (exact) return exact;

  const firstToken = lower.split(/\s+/)[0];
  const firstNameMatches = staffAtLocation.filter((s) => {
    const staffFirst = s.full_name.toLowerCase().split(/\s+/)[0];
    return staffFirst === firstToken || s.full_name.toLowerCase().startsWith(`${firstToken} `);
  });
  if (firstNameMatches.length === 1) return firstNameMatches[0];
  if (firstNameMatches.length > 1) {
    const startsWith = firstNameMatches.find((s) => s.full_name.toLowerCase().startsWith(lower));
    if (startsWith) return startsWith;
  }

  return null;
}

async function insertPunchLogs(
  sb: SupabaseClient<Database>,
  locationId: string,
  staff: StaffRow,
  actualIn: string | null,
  actualOut: string | null,
  raw: AttendanceIngestRecord,
): Promise<void> {
  const punches: Array<{ punch_at: string; punch_type: "in" | "out" }> = [];
  if (actualIn) punches.push({ punch_at: actualIn, punch_type: "in" });
  if (actualOut) punches.push({ punch_at: actualOut, punch_type: "out" });

  for (const punch of punches) {
    await sb.from("attendance_logs").insert({
      location_id: locationId,
      staff_id: staff.id,
      user_id: staff.user_id,
      biometric_user_id: staff.employee_code,
      punch_at: punch.punch_at,
      punch_type: punch.punch_type,
      source: "api_ingest",
      raw_payload: raw,
    });
  }
}

async function ensureException(
  sb: SupabaseClient<Database>,
  summaryId: string,
  locationId: string,
  staffId: string,
  status: string,
  description: string,
): Promise<void> {
  if (!["missed_punch", "overtime", "late", "early_leave", "absent"].includes(status)) return;

  const { data: existing } = await sb
    .from("attendance_exceptions")
    .select("id")
    .eq("summary_id", summaryId)
    .eq("exception_type", status)
    .eq("status", "open")
    .maybeSingle();
  if (existing) return;

  await sb.from("attendance_exceptions").insert({
    summary_id: summaryId,
    location_id: locationId,
    staff_id: staffId,
    exception_type: status,
    description,
    status: "open",
  });
}

export async function ingestAttendanceRecords(
  sb: SupabaseClient<Database>,
  records: AttendanceIngestRecord[],
): Promise<AttendanceIngestResult> {
  const errors: AttendanceIngestError[] = [];
  let imported = 0;

  const { data: locations, error: locErr } = await sb
    .from("locations")
    .select("id, code, name, region")
    .eq("status", "active");
  if (locErr) throw locErr;

  const locationRows = (locations ?? []) as LocationRow[];
  const locByCode = new Map(locationRows.map((l) => [l.code, l]));

  const { data: allStaff, error: staffErr } = await sb
    .from("staff")
    .select("id, full_name, employee_code, user_id, location_id")
    .eq("status", "active");
  if (staffErr) throw staffErr;

  const staffByLocation = new Map<string, StaffRow[]>();
  for (const s of allStaff ?? []) {
    const list = staffByLocation.get(s.location_id) ?? [];
    list.push({
      id: s.id,
      full_name: s.full_name,
      employee_code: s.employee_code,
      user_id: s.user_id,
    });
    staffByLocation.set(s.location_id, list);
  }

  for (let i = 0; i < records.length; i++) {
    const row = i + 1;
    const record = records[i];

    try {
      const locationCode = resolveLocationCode(record, locationRows);
      if (!locationCode) {
        errors.push({ row, message: `Unknown location: ${record.location ?? record.location_code ?? "(empty)"}` });
        continue;
      }

      const location = locByCode.get(locationCode);
      if (!location) {
        errors.push({ row, message: `Location code not found in database: ${locationCode}` });
        continue;
      }

      const staffPool = staffByLocation.get(location.id) ?? [];
      const staff = matchStaff(record, staffPool);
      if (!staff) {
        const label = record.user_name ?? record.employee_code ?? "unknown";
        errors.push({ row, message: `Staff not found: ${label} at ${locationCode}` });
        continue;
      }

      if (!record.date?.trim()) {
        errors.push({ row, message: "date is required" });
        continue;
      }

      const workDate = parseWorkDate(record.date);
      const actualIn = parsePunchTime(workDate, record.first_check_in);
      const actualOut = parsePunchTime(workDate, record.last_check_out);
      const hasOvertime = parseOvertimeFlag(record.overtime);
      const overtimeMinutes = hasOvertime
        ? Math.round((record.overtime_hours ?? 0) * 60)
        : 0;
      const { status, missedPunch } = resolveStatus(record, actualIn, actualOut, hasOvertime);

      const { data: summary, error: upsertErr } = await sb
        .from("attendance_daily_summary")
        .upsert(
          {
            location_id: location.id,
            staff_id: staff.id,
            user_id: staff.user_id,
            work_date: workDate,
            actual_in: actualIn,
            actual_out: actualOut,
            status,
            missed_punch: missedPunch,
            overtime_minutes: overtimeMinutes,
          },
          { onConflict: "location_id,staff_id,work_date" },
        )
        .select("id")
        .single();

      if (upsertErr) {
        errors.push({ row, message: upsertErr.message });
        continue;
      }

      await insertPunchLogs(sb, location.id, staff, actualIn, actualOut, record);

      if (summary?.id) {
        const desc =
          record.status?.trim() ||
          (missedPunch ? "Missing punch from external ingest" : `Imported via API (${status})`);
        await ensureException(sb, summary.id, location.id, staff.id, status, desc);
      }

      imported += 1;
    } catch (e) {
      errors.push({ row, message: (e as Error).message });
    }
  }

  return {
    success: errors.length === 0,
    imported,
    failed: errors.length,
    errors,
  };
}

/** Exported for API docs — location friendly name → FEC code. */
export function getAttendanceLocationAliasTable(): Array<{ friendly_name: string; location_code: string }> {
  return [
    { friendly_name: "Urban Arena - Doha Mall", location_code: "UA-DM" },
    { friendly_name: "Inflatapark", location_code: "INF-CC" },
    { friendly_name: "Inflatapark - City Center", location_code: "INF-CC" },
    { friendly_name: "Kids Driving School - City Center", location_code: "KDS-CC" },
    { friendly_name: "Kids Driving School Mini - Doha Mall", location_code: "KDS-DM" },
    { friendly_name: "Carousel - Aspire Park", location_code: "CAR-AP" },
    { friendly_name: "Crayons & Bricks - Vendome Mall", location_code: "CB-VM" },
    { friendly_name: "Crayons & Bricks - Dar Al Salam Mall", location_code: "CB-DSM" },
    { friendly_name: "Winter Mirage - Vendome Mall", location_code: "WM-VM" },
  ];
}
