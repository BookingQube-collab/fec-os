/** Raw ZKTeco punch listing. Names may fall back to the device biometric registry — never staff. */

export const DEVICE_LOG_CAP = 2000;
export const DEVICE_LOG_PAGE_SIZE = 100;
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

export type DeviceLogKpis = {
  records: number;
  deviceUsers: number;
  devices: number;
};

/** DD-MM-YYYY in Asia/Qatar from a punch timestamp. */
export function formatDeviceLogDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
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

export function deviceLogKpis(rows: Array<{ biometricUserId: string | null; deviceId: string | null }>): DeviceLogKpis {
  const users = new Set<string>();
  const devices = new Set<string>();
  for (const row of rows) {
    const user = row.biometricUserId?.trim();
    if (user) users.add(user);
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
