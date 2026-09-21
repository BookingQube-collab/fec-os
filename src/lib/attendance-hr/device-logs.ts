/** Raw ZKTeco punch listing. Device-registry name lookup only — no staff HR mapping. */

export const DEVICE_LOG_CAP = 2000;
export const DEVICE_LOG_PAGE_SIZE = 100;

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

/** Punch-row name first; else biometric registry device_name / full_name (no staff HR join). */
export function resolveDeviceLogName(
  punchName: string | null | undefined,
  bio: { device_name?: string | null; full_name?: string | null } | null | undefined,
): string | null {
  const fromPunch = punchName?.trim();
  if (fromPunch) return fromPunch;
  if (!bio) return null;
  return bio.device_name?.trim() || bio.full_name?.trim() || null;
}
