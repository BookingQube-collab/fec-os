/** Raw ZKTeco punch listing. Names may fall back to the device biometric registry — never staff. */

export const DEVICE_LOG_CAP = 2000;
export const DEVICE_LOG_PAGE_SIZE = 100;
/** Page size when loading distinct device users for the name filter (not capped by DEVICE_LOG_CAP). */
export const DEVICE_LOG_USERS_PAGE_SIZE = 1000;
/** Device-origin push only (iclock/ADMS ATTLOG). Excludes api_ingest, csv/file import, corrections. */
export const DEVICE_LOG_PUSH_SOURCE = "adms_push";

export type AttendanceDeviceLogRow = {
  id: string;
  locationId: string;
  locationCode: string | null;
  locationName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  deviceSerial: string | null;
  deviceCode: string | null;
  biometricUserId: string | null;
  deviceUserName: string | null;
  punchAt: string;
  inOutStatus: number | null;
  verifyMethod: number | null;
  workCode: number | null;
  source: string | null;
};

/** One person-day on one device (rollup of raw punches for the device-logs table). */
export type AttendanceDeviceLogDayRow = {
  id: string;
  locationId: string;
  locationCode: string | null;
  locationName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  deviceSerial: string | null;
  deviceCode: string | null;
  biometricUserId: string | null;
  deviceUserName: string | null;
  /** Qatar civil day YYYY-MM-DD. */
  dateYmd: string;
  punchInAt: string | null;
  punchOutAt: string | null;
  /** Raw punches folded into this row. */
  punchCount: number;
};

export type DeviceLogKpis = {
  records: number;
  deviceUsers: number;
  devices: number;
};

/** Qatar civil day as YYYY-MM-DD from a punch timestamp. */
export function deviceLogQatarYmd(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

/** DD-MM-YYYY in Asia/Qatar from a punch timestamp. */
export function formatDeviceLogDate(iso: string | null | undefined): string {
  const ymd = deviceLogQatarYmd(iso);
  if (!ymd) return "";
  const [year, month, day] = ymd.split("-");
  if (!year || !month || !day) return "";
  return `${day}-${month}-${year}`;
}

/** DD-MM-YYYY from a Qatar YYYY-MM-DD civil day. */
export function formatDeviceLogYmd(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const [year, month, day] = ymd.split("-");
  if (!year || !month || !day) return "";
  return `${day}-${month}-${year}`;
}

/** Qatar civil-day bounds. punch_at is the device timestamp, not the calculated attendance date. */
export function deviceLogPunchRange(dateFrom: string, dateTo: string): { fromIso: string; toIso: string } {
  return {
    fromIso: `${dateFrom}T00:00:00+03:00`,
    toIso: `${dateTo}T23:59:59.999+03:00`,
  };
}

/** Strip characters that break a PostgREST `or` / `ilike` filter. */
export function deviceLogSearchNeedle(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/[%_,()]/g, "").slice(0, 80);
}

export function deviceLogKpis(
  rows: Array<{ locationId?: string | null; biometricUserId: string | null; deviceId: string | null }>,
): DeviceLogKpis {
  const users = new Set<string>();
  const devices = new Set<string>();
  for (const row of rows) {
    const user = row.biometricUserId?.trim();
    if (user) users.add(row.locationId ? deviceLogUserOptionKey(row.locationId, user) : user);
    if (row.deviceId) devices.add(row.deviceId);
  }
  return { records: rows.length, deviceUsers: users.size, devices: devices.size };
}

const IN_OUT_KEYS = {
  0: "in",
  1: "out",
  2: "breakOut",
  3: "breakIn",
  4: "otIn",
  5: "otOut",
} as const;

const VERIFY_KEYS = {
  0: "password",
  1: "fingerprint",
  2: "card",
  15: "face",
} as const;

export type DeviceLogInOutKey = (typeof IN_OUT_KEYS)[keyof typeof IN_OUT_KEYS];
export type DeviceLogVerifyKey = (typeof VERIFY_KEYS)[keyof typeof VERIFY_KEYS];

export function deviceLogInOutKey(status: number | null | undefined): DeviceLogInOutKey | null {
  if (status == null || !Number.isInteger(status)) return null;
  return IN_OUT_KEYS[status as keyof typeof IN_OUT_KEYS] ?? null;
}

export function deviceLogVerifyKey(method: number | null | undefined): DeviceLogVerifyKey | null {
  if (method == null || !Number.isInteger(method)) return null;
  return VERIFY_KEYS[method as keyof typeof VERIFY_KEYS] ?? null;
}

/** Which punch-time column a raw ZK status belongs in (one row = one punch). */
export function deviceLogPunchSide(status: number | null | undefined): "in" | "out" | null {
  const key = deviceLogInOutKey(status);
  if (key === "in" || key === "breakIn" || key === "otIn") return "in";
  if (key === "out" || key === "breakOut" || key === "otOut") return "out";
  return null;
}

/**
 * Roll raw punches into one row per (location + device + biometric user + Qatar day).
 *
 * Punch in = earliest typed check-in (in / breakIn / otIn).
 * Punch out = latest typed check-out (out / breakOut / otOut).
 * Only-ins → out blank; only-outs → in blank.
 * Unknown status only: earliest → in; latest → out when it differs from earliest.
 * Same user on two devices the same day → two rows (device is in the key).
 */
export function rollupDeviceLogDays(rows: AttendanceDeviceLogRow[]): AttendanceDeviceLogDayRow[] {
  type Acc = {
    sample: AttendanceDeviceLogRow;
    dateYmd: string;
    punches: AttendanceDeviceLogRow[];
  };
  const groups = new Map<string, Acc>();
  for (const row of rows) {
    const ymd = deviceLogQatarYmd(row.punchAt);
    if (!ymd) continue;
    const user = row.biometricUserId?.trim() || "";
    const key = `${row.locationId}|${row.deviceId ?? ""}|${user}|${ymd}`;
    const existing = groups.get(key);
    if (existing) existing.punches.push(row);
    else groups.set(key, { sample: row, dateYmd: ymd, punches: [row] });
  }

  const days: AttendanceDeviceLogDayRow[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group.punches].sort(
      (a, b) => new Date(a.punchAt).getTime() - new Date(b.punchAt).getTime(),
    );
    const ins: string[] = [];
    const outs: string[] = [];
    for (const punch of sorted) {
      const side = deviceLogPunchSide(punch.inOutStatus);
      if (side === "in") ins.push(punch.punchAt);
      else if (side === "out") outs.push(punch.punchAt);
    }

    let punchInAt: string | null = null;
    let punchOutAt: string | null = null;
    if (ins.length || outs.length) {
      punchInAt = ins[0] ?? null;
      punchOutAt = outs.length ? outs[outs.length - 1]! : null;
    } else {
      // All unknown/null status: earliest = in; latest = out only when distinct.
      punchInAt = sorted[0]?.punchAt ?? null;
      const last = sorted[sorted.length - 1]?.punchAt ?? null;
      punchOutAt = last && last !== punchInAt ? last : null;
    }

    const sample = group.sample;
    const deviceUserName =
      sorted.find((p) => p.deviceUserName?.trim())?.deviceUserName?.trim() || sample.deviceUserName;
    days.push({
      id: key,
      locationId: sample.locationId,
      locationCode: sample.locationCode,
      locationName: sample.locationName,
      deviceId: sample.deviceId,
      deviceName: sample.deviceName,
      deviceSerial: sample.deviceSerial,
      deviceCode: sample.deviceCode,
      biometricUserId: sample.biometricUserId,
      deviceUserName,
      dateYmd: group.dateYmd,
      punchInAt,
      punchOutAt,
      punchCount: sorted.length,
    });
  }

  days.sort((a, b) => {
    if (a.dateYmd !== b.dateYmd) return a.dateYmd < b.dateYmd ? 1 : -1;
    const aAt = a.punchInAt ?? a.punchOutAt ?? "";
    const bAt = b.punchInAt ?? b.punchOutAt ?? "";
    if (aAt !== bAt) return aAt < bAt ? 1 : -1;
    return (a.biometricUserId ?? "").localeCompare(b.biometricUserId ?? "");
  });
  return days;
}

/** Raw device identifier as stored for the terminal (serial, else device_code). */
export function deviceLogRawDeviceId(row: {
  deviceSerial?: string | null;
  deviceCode?: string | null;
}): string | null {
  return row.deviceSerial?.trim() || row.deviceCode?.trim() || null;
}

/** Name fields from attendance_biometric_users only (device registry, not HR staff). */
export type DeviceLogBioName = {
  device_name: string | null;
  full_name: string | null;
};

export function indexDeviceLogBioNames(
  rows: Array<{
    location_id: string;
    device_id: string | null;
    biometric_user_id: string;
    device_name: string | null;
    full_name: string | null;
  }>,
): { byDevice: Map<string, DeviceLogBioName>; byLocUser: Map<string, DeviceLogBioName> } {
  const byDevice = new Map<string, DeviceLogBioName>();
  const byLocUser = new Map<string, DeviceLogBioName>();
  for (const row of rows) {
    const loc = row.location_id?.trim();
    const user = row.biometric_user_id?.trim();
    if (!loc || !user) continue;
    const name: DeviceLogBioName = {
      device_name: row.device_name,
      full_name: row.full_name,
    };
    const locUser = `${loc}|${user}`;
    if (!byLocUser.has(locUser)) byLocUser.set(locUser, name);
    if (row.device_id) byDevice.set(`${locUser}|${row.device_id}`, name);
  }
  return { byDevice, byLocUser };
}

export function lookupDeviceLogBioName(
  index: { byDevice: Map<string, DeviceLogBioName>; byLocUser: Map<string, DeviceLogBioName> },
  locationId: string,
  biometricUserId: string | null | undefined,
  deviceId: string | null | undefined,
): DeviceLogBioName | undefined {
  const user = biometricUserId?.trim();
  if (!locationId || !user) return undefined;
  const locUser = `${locationId}|${user}`;
  if (deviceId) {
    const hit = index.byDevice.get(`${locUser}|${deviceId}`);
    if (hit) return hit;
  }
  return index.byLocUser.get(locUser);
}

/** Punch device_user_name first; else registry device_name, then registry full_name. */
export function deviceLogDisplayName(
  punchName: string | null | undefined,
  bio: DeviceLogBioName | null | undefined,
): string | null {
  const fromPunch = punchName?.trim() || null;
  if (fromPunch) return fromPunch;
  return bio?.device_name?.trim() || bio?.full_name?.trim() || null;
}

export type AttendanceDeviceLogUserOption = {
  /** Stable option id: `locationId|biometricUserId` (user ids repeat across sites). */
  key: string;
  locationId: string;
  locationCode: string | null;
  biometricUserId: string;
  name: string | null;
};

/** Dropdown / filter identity: same numeric user id at two sites stays two options. */
export function deviceLogUserOptionKey(locationId: string, biometricUserId: string): string {
  return `${locationId}|${biometricUserId.trim()}`;
}

export function parseDeviceLogUserOptionKey(
  key: string,
): { locationId: string; biometricUserId: string } | null {
  const pipe = key.indexOf("|");
  if (pipe <= 0) return null;
  const locationId = key.slice(0, pipe).trim();
  const biometricUserId = key.slice(pipe + 1).trim();
  if (!locationId || !biometricUserId) return null;
  return { locationId, biometricUserId };
}

/** Distinct device users for the filter (name · user id · location). */
export function collectDeviceLogUsers(
  rows: Array<{
    locationId: string | null;
    locationCode?: string | null;
    biometricUserId: string | null;
    deviceUserName: string | null;
  }>,
): AttendanceDeviceLogUserOption[] {
  const byKey = new Map<string, AttendanceDeviceLogUserOption>();
  for (const row of rows) {
    const locationId = row.locationId?.trim();
    const id = row.biometricUserId?.trim();
    if (!locationId || !id) continue;
    const key = deviceLogUserOptionKey(locationId, id);
    const name = row.deviceUserName?.trim() || null;
    const code = row.locationCode?.trim() || null;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        locationId,
        locationCode: code,
        biometricUserId: id,
        name,
      });
    } else {
      if (!existing.name && name) existing.name = name;
      if (!existing.locationCode && code) existing.locationCode = code;
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const an = (a.name ?? "").toLowerCase();
    const bn = (b.name ?? "").toLowerCase();
    if (an !== bn) return an.localeCompare(bn);
    const idCmp = a.biometricUserId.localeCompare(b.biometricUserId);
    if (idCmp !== 0) return idCmp;
    return (a.locationCode ?? a.locationId).localeCompare(b.locationCode ?? b.locationId);
  });
}

export function deviceLogUserOptionLabel(user: AttendanceDeviceLogUserOption): string {
  const name = user.name?.trim();
  const loc = user.locationCode?.trim();
  const base = name ? `${name} · ${user.biometricUserId}` : user.biometricUserId;
  return loc ? `${base} · ${loc}` : base;
}

/** PostgREST `or` of `and(location_id, biometric_user_id)` pairs (cross-site id collisions). */
export function deviceLogUserPairsOrFilter(
  pairs: Array<{ locationId: string; biometricUserId: string }>,
): string {
  return pairs
    .map(({ locationId, biometricUserId }) => {
      const loc = locationId.trim().replace(/[,()]/g, "");
      const uid = biometricUserId.trim().replace(/[,()]/g, "");
      return `and(location_id.eq.${loc},biometric_user_id.eq.${uid})`;
    })
    .filter((part) => part.includes("location_id.eq.") && part.includes("biometric_user_id.eq."))
    .join(",");
}

/** Match after enrichment: user id OR display name (punch / biometric registry). */
export function deviceLogMatchesNeedle(
  rawNeedle: string,
  row: { biometricUserId?: string | null; deviceUserName?: string | null },
): boolean {
  const needle = deviceLogSearchNeedle(rawNeedle).toLowerCase();
  if (!needle) return true;
  if ((row.biometricUserId ?? "").toLowerCase().includes(needle)) return true;
  if ((row.deviceUserName ?? "").toLowerCase().includes(needle)) return true;
  return false;
}

/**
 * PostgREST `or` for punch search. Includes biometric_user_ids whose registry
 * device_name / full_name matched the needle (display names are not on attendance_logs).
 */
export function deviceLogSearchOrFilter(needle: string, bioUserIds: string[]): string {
  const parts = [`biometric_user_id.ilike.%${needle}%`, `device_user_name.ilike.%${needle}%`];
  const clean = [...new Set(bioUserIds.map((id) => id.trim().replace(/[,()]/g, "")).filter(Boolean))];
  if (clean.length) parts.push(`biometric_user_id.in.(${clean.join(",")})`);
  return parts.join(",");
}

export const DEVICE_LOG_EXPORT_COLUMNS = [
  "Device ID",
  "User ID",
  "Name",
  "Date",
  "Punch in",
  "Punch out",
] as const;

export function deviceLogDayExportObject(
  row: AttendanceDeviceLogDayRow,
  punchIn: string,
  punchOut: string,
): Record<(typeof DEVICE_LOG_EXPORT_COLUMNS)[number], string> {
  return {
    "Device ID": deviceLogRawDeviceId(row) ?? "",
    "User ID": row.biometricUserId ?? "",
    Name: row.deviceUserName ?? "",
    Date: formatDeviceLogYmd(row.dateYmd),
    "Punch in": punchIn,
    "Punch out": punchOut,
  };
}

export function buildDeviceLogDaysCsv(
  rows: AttendanceDeviceLogDayRow[],
  formatPunch: (iso: string | null | undefined) => string,
): string {
  const esc = (value: string) => {
    if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };
  const lines = [DEVICE_LOG_EXPORT_COLUMNS.join(",")];
  for (const row of rows) {
    const obj = deviceLogDayExportObject(row, formatPunch(row.punchInAt) || "", formatPunch(row.punchOutAt) || "");
    lines.push(DEVICE_LOG_EXPORT_COLUMNS.map((col) => esc(obj[col])).join(","));
  }
  return lines.join("\r\n");
}
