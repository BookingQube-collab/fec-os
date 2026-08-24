import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { DEFAULT_RULES, DEFAULT_SHIFT } from "./constants";
import {
  buildPunchRows,
  mergeBiometricUsersById,
  persistMergedBiometricUsers,
  recalculateAttendanceRange,
  staffByBiometricFromMappings,
  type ExistingBiometricUser,
} from "./process";
import { parseAdmsAttlog, parseAdmsUsers, type AdmsTable } from "./parse-adms";

type AdminClient = SupabaseClient<Database>;

export type AdmsDeviceRow = {
  id: string;
  location_id: string;
  company_id: string | null;
  serial_number: string | null;
  device_code: string;
  device_name: string;
  active: boolean;
  timezone: string | null;
  adms_attlog_stamp: string | null;
  adms_operlog_stamp: string | null;
};

export type AdmsIngestResult = {
  accepted: number;
  users: number;
  punches: number;
  duplicates: number;
  skipped: boolean;
};

async function loadExistingBiometricUsers(
  sb: AdminClient,
  companyId: string,
  locationId: string,
  deviceId: string,
): Promise<ExistingBiometricUser[]> {
  const { data, error } = await sb
    .from("attendance_biometric_users")
    .select("biometric_user_id, device_name, staff_id, previous_device_name")
    .eq("company_id", companyId)
    .eq("location_id", locationId)
    .eq("device_id", deviceId);
  if (error) {
    const fallback = await sb
      .from("attendance_biometric_users")
      .select("biometric_user_id, device_name, staff_id")
      .eq("company_id", companyId)
      .eq("location_id", locationId)
      .eq("device_id", deviceId);
    if (fallback.error) throw fallback.error;
    return (fallback.data ?? []).map((row) => ({
      biometricUserId: String(row.biometric_user_id),
      deviceName: row.device_name == null ? null : String(row.device_name),
      staffId: row.staff_id == null ? null : String(row.staff_id),
      previousDeviceName: null,
    }));
  }
  return (data ?? []).map((row) => ({
    biometricUserId: String(row.biometric_user_id),
    deviceName: row.device_name == null ? null : String(row.device_name),
    staffId: row.staff_id == null ? null : String(row.staff_id),
    previousDeviceName: row.previous_device_name == null ? null : String(row.previous_device_name),
  }));
}

export async function findAdmsDeviceBySerial(sb: AdminClient, sn: string): Promise<AdmsDeviceRow | null> {
  const serial = sn.trim();
  if (!serial) return null;
  const columns =
    "id, location_id, company_id, serial_number, device_code, device_name, active, timezone, adms_attlog_stamp, adms_operlog_stamp";
  let { data, error } = await sb.from("attendance_devices").select(columns).eq("active", true);
  if (error && /adms_/i.test(error.message)) {
    const fallback = await sb
      .from("attendance_devices")
      .select("id, location_id, company_id, serial_number, device_code, device_name, active, timezone")
      .eq("active", true);
    data = fallback.data as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  const match = (data ?? []).find(
    (row) => String(row.serial_number ?? "").trim().toLowerCase() === serial.toLowerCase(),
  );
  if (!match) return null;
  return {
    id: String(match.id),
    location_id: String(match.location_id),
    company_id: match.company_id ? String(match.company_id) : null,
    serial_number: match.serial_number ? String(match.serial_number) : null,
    device_code: String(match.device_code),
    device_name: String(match.device_name),
    active: Boolean(match.active),
    timezone: match.timezone ? String(match.timezone) : null,
    adms_attlog_stamp: "adms_attlog_stamp" in match && match.adms_attlog_stamp ? String(match.adms_attlog_stamp) : null,
    adms_operlog_stamp: "adms_operlog_stamp" in match && match.adms_operlog_stamp ? String(match.adms_operlog_stamp) : null,
  };
}

async function resolveCompanyId(sb: AdminClient, device: AdmsDeviceRow): Promise<string | null> {
  if (device.company_id) return device.company_id;
  const { data } = await sb
    .from("attendance_site_settings")
    .select("company_id")
    .eq("location_id", device.location_id)
    .maybeSingle();
  return data?.company_id ? String(data.company_id) : null;
}

export async function touchAdmsDevice(
  sb: AdminClient,
  deviceId: string,
  patch: {
    attlogStamp?: string | null;
    operlogStamp?: string | null;
    users?: boolean;
    error?: string | null;
  },
) {
  const update: Record<string, unknown> = {
    last_adms_at: new Date().toISOString(),
    last_adms_error: patch.error ?? null,
    connection_mode: "adms",
  };
  if (patch.attlogStamp) update.adms_attlog_stamp = patch.attlogStamp;
  if (patch.operlogStamp) update.adms_operlog_stamp = patch.operlogStamp;
  if (patch.users) update.last_user_sync_at = new Date().toISOString();
  if (!patch.error) update.last_sync_at = new Date().toISOString();
  const { error } = await sb.from("attendance_devices").update(update).eq("id", deviceId);
  if (error && /adms_|connection_mode/i.test(error.message)) {
    await sb.from("attendance_devices").update({ last_sync_at: new Date().toISOString() }).eq("id", deviceId);
  }
}

export async function ingestAdmsPayload(
  sb: AdminClient,
  input: {
    device: AdmsDeviceRow;
    table: AdmsTable;
    body: string;
    stamp: string | null;
  },
): Promise<AdmsIngestResult> {
  const empty: AdmsIngestResult = { accepted: 0, users: 0, punches: 0, duplicates: 0, skipped: true };
  if (input.table === "ATTPHOTO" || input.table === "BIODATA") {
    return empty;
  }

  const companyId = await resolveCompanyId(sb, input.device);
  if (!companyId) {
    throw new Error("Device is not mapped to a company. Set company on the site in Settings.");
  }

  if (input.table === "OPTIONS" || input.table === "unknown") {
    return { ...empty, skipped: true, accepted: 0 };
  }

  const users =
    input.table === "OPERLOG" || input.table === "USERINFO" || input.table === "USER"
      ? parseAdmsUsers(input.body)
      : [];
  const punches = input.table === "ATTLOG" ? parseAdmsAttlog(input.body) : [];

  if (users.length) {
    const existing = await loadExistingBiometricUsers(sb, companyId, input.device.location_id, input.device.id);
    const merged = mergeBiometricUsersById(existing, users);
    await persistMergedBiometricUsers(sb, {
      companyId,
      locationId: input.device.location_id,
      deviceId: input.device.id,
      merged,
    });
  }

  let punchCount = 0;
  let duplicates = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  if (punches.length) {
    const existing = await loadExistingBiometricUsers(sb, companyId, input.device.location_id, input.device.id);
    const staffByBiometric = staffByBiometricFromMappings(existing);
    const rows = buildPunchRows({
      punches,
      companyId,
      locationId: input.device.location_id,
      deviceId: input.device.id,
      importId: null,
      source: "adms_push",
      windowSeconds: DEFAULT_RULES.duplicateWindowSeconds,
      shift: DEFAULT_SHIFT,
      staffByBiometric,
    });
    for (const row of rows) {
      const { error } = await sb.from("attendance_logs").insert(row);
      if (error) {
        if (error.code === "23505" || /duplicate/i.test(error.message)) duplicates += 1;
        continue;
      }
      punchCount += 1;
      const day = row.attendance_date;
      if (day && (!minDate || day < minDate)) minDate = day;
      if (day && (!maxDate || day > maxDate)) maxDate = day;
    }
    if (minDate && maxDate) {
      await recalculateAttendanceRange(sb, input.device.location_id, minDate, maxDate);
    }
  }

  await touchAdmsDevice(sb, input.device.id, {
    attlogStamp: input.table === "ATTLOG" ? input.stamp : null,
    operlogStamp:
      input.table === "OPERLOG" || input.table === "USERINFO" || input.table === "USER" ? input.stamp : null,
    users: users.length > 0,
    error: null,
  });

  const accepted = users.length + punchCount;
  return {
    accepted,
    users: users.length,
    punches: punchCount,
    duplicates,
    skipped: false,
  };
}
