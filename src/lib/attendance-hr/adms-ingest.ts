import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { DEFAULT_RULES, DEFAULT_SHIFT } from "./constants";
import {
  buildPunchRows,
  deviceNameByBiometricFromMappings,
  mergeBiometricUsersById,
  persistMergedBiometricUsers,
  recalculateAttendanceRange,
  staffByBiometricFromMappings,
  type ExistingBiometricUser,
} from "./process";
import {
  buildAdmsAttlogQueryCommand,
  formatAdmsGetRequestCommand,
  parseAdmsAttlog,
  parseAdmsUsers,
  type AdmsTable,
} from "./parse-adms";

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
  adms_pending_cmd: string | null;
  adms_cmd_id: number;
};

export type AdmsIngestResult = {
  accepted: number;
  users: number;
  punches: number;
  duplicates: number;
  skipped: boolean;
};

type BioRow = {
  biometric_user_id: unknown;
  device_name: unknown;
  staff_id: unknown;
  previous_device_name?: unknown;
  full_name?: unknown;
  device_id?: unknown;
};

function mapBioRow(row: BioRow): ExistingBiometricUser & { fullName?: string | null } {
  return {
    biometricUserId: String(row.biometric_user_id),
    deviceName: row.device_name == null ? null : String(row.device_name),
    staffId: row.staff_id == null ? null : String(row.staff_id),
    previousDeviceName:
      row.previous_device_name == null ? null : String(row.previous_device_name),
    fullName: row.full_name == null ? null : String(row.full_name),
  };
}

/**
 * Prefer this device's registry rows; fill gaps from any device at the same site
 * so staff_id / device_name still resolve when USERINFO landed on a sibling terminal.
 */
async function loadExistingBiometricUsers(
  sb: AdminClient,
  companyId: string,
  locationId: string,
  deviceId: string,
): Promise<Array<ExistingBiometricUser & { fullName?: string | null }>> {
  const selectCols =
    "biometric_user_id, device_name, staff_id, previous_device_name, full_name, device_id";
  const fallbackCols = "biometric_user_id, device_name, staff_id, full_name, device_id";

  const load = async (cols: string, withDevice: boolean) => {
    let q = sb
      .from("attendance_biometric_users")
      .select(cols)
      .eq("company_id", companyId)
      .eq("location_id", locationId);
    if (withDevice) q = q.eq("device_id", deviceId);
    return q;
  };

  let deviceRes = await load(selectCols, true);
  if (deviceRes.error && /previous_device_name|full_name/i.test(deviceRes.error.message)) {
    deviceRes = await load(fallbackCols, true);
  }
  if (deviceRes.error) throw deviceRes.error;

  let locRes = await load(selectCols, false);
  if (locRes.error && /previous_device_name|full_name/i.test(locRes.error.message)) {
    locRes = await load(fallbackCols, false);
  }
  if (locRes.error) throw locRes.error;

  const locRows = (locRes.data ?? []) as unknown as BioRow[];
  const deviceRows = (deviceRes.data ?? []) as unknown as BioRow[];

  const byUser = new Map<string, ExistingBiometricUser & { fullName?: string | null }>();
  // Location-wide first, then overwrite with this device so device-local mapping wins.
  for (const row of locRows) {
    const mapped = mapBioRow(row);
    const id = mapped.biometricUserId.trim();
    if (!id) continue;
    const prev = byUser.get(id);
    if (!prev || (!prev.staffId && mapped.staffId) || (!prev.deviceName && mapped.deviceName)) {
      byUser.set(id, {
        ...prev,
        ...mapped,
        staffId: mapped.staffId ?? prev?.staffId ?? null,
        deviceName: mapped.deviceName ?? prev?.deviceName ?? null,
        fullName: mapped.fullName ?? prev?.fullName ?? null,
      });
    }
  }
  for (const row of deviceRows) {
    const mapped = mapBioRow(row);
    const id = mapped.biometricUserId.trim();
    if (!id) continue;
    const prev = byUser.get(id);
    byUser.set(id, {
      ...prev,
      ...mapped,
      staffId: mapped.staffId ?? prev?.staffId ?? null,
      deviceName: mapped.deviceName ?? prev?.deviceName ?? null,
      fullName: mapped.fullName ?? prev?.fullName ?? null,
    });
  }
  return [...byUser.values()];
}

function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function mapAdmsDevice(row: Record<string, unknown>): AdmsDeviceRow {
  return {
    id: String(row.id),
    location_id: String(row.location_id),
    company_id: row.company_id ? String(row.company_id) : null,
    serial_number: row.serial_number ? String(row.serial_number) : null,
    device_code: String(row.device_code),
    device_name: String(row.device_name),
    active: Boolean(row.active),
    timezone: row.timezone ? String(row.timezone) : null,
    adms_attlog_stamp: row.adms_attlog_stamp ? String(row.adms_attlog_stamp) : null,
    adms_operlog_stamp: row.adms_operlog_stamp ? String(row.adms_operlog_stamp) : null,
    adms_pending_cmd: typeof row.adms_pending_cmd === "string" ? row.adms_pending_cmd : null,
    adms_cmd_id: Number(row.adms_cmd_id) > 0 ? Number(row.adms_cmd_id) : 1,
  };
}

export async function findAdmsDeviceBySerial(sb: AdminClient, sn: string): Promise<AdmsDeviceRow | null> {
  const serial = sn.trim();
  if (!serial) return null;
  const columnsWithCmd =
    "id, location_id, company_id, serial_number, device_code, device_name, active, timezone, adms_attlog_stamp, adms_operlog_stamp, adms_pending_cmd, adms_cmd_id";
  const columns =
    "id, location_id, company_id, serial_number, device_code, device_name, active, timezone, adms_attlog_stamp, adms_operlog_stamp";
  const pattern = escapeIlike(serial);

  let { data, error } = await sb
    .from("attendance_devices")
    .select(columnsWithCmd)
    .eq("active", true)
    .ilike("serial_number", pattern)
    .limit(1)
    .maybeSingle();
  if (error && /adms_pending_cmd|adms_cmd_id/i.test(error.message)) {
    const retry = await sb
      .from("attendance_devices")
      .select(columns)
      .eq("active", true)
      .ilike("serial_number", pattern)
      .limit(1)
      .maybeSingle();
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error && /adms_/i.test(error.message)) {
    const fallback = await sb
      .from("attendance_devices")
      .select("id, location_id, company_id, serial_number, device_code, device_name, active, timezone")
      .eq("active", true)
      .ilike("serial_number", pattern)
      .limit(1)
      .maybeSingle();
    data = fallback.data as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  if (data) return mapAdmsDevice(data as Record<string, unknown>);

  const scan = await sb.from("attendance_devices").select(columns).eq("active", true);
  if (scan.error && /adms_/i.test(scan.error.message)) {
    const fallback = await sb
      .from("attendance_devices")
      .select("id, location_id, company_id, serial_number, device_code, device_name, active, timezone")
      .eq("active", true);
    const match = (fallback.data ?? []).find(
      (row) => String(row.serial_number ?? "").trim().toLowerCase() === serial.toLowerCase(),
    );
    return match ? mapAdmsDevice(match as Record<string, unknown>) : null;
  }
  if (scan.error) throw scan.error;
  const match = (scan.data ?? []).find(
    (row) => String(row.serial_number ?? "").trim().toLowerCase() === serial.toLowerCase(),
  );
  return match ? mapAdmsDevice(match as Record<string, unknown>) : null;
}

export function pendingAdmsCommandLine(device: AdmsDeviceRow): string | null {
  const command = device.adms_pending_cmd?.trim();
  if (!command) return null;
  return formatAdmsGetRequestCommand(device.adms_cmd_id || 1, command);
}

export async function queueAdmsAttlogQuery(
  sb: AdminClient,
  deviceId: string,
  hours = 48,
  timeZone = "Asia/Qatar",
): Promise<{ cmdId: number; command: string; from: Date; to: Date }> {
  const to = new Date();
  const from = new Date(to.getTime() - Math.max(1, hours) * 3600_000);
  return queueAdmsAttlogQueryRange(sb, deviceId, from, to, timeZone);
}

/** Queue DATA QUERY ATTLOG for an explicit wall-clock window (device timezone). */
export async function queueAdmsAttlogQueryRange(
  sb: AdminClient,
  deviceId: string,
  from: Date,
  to: Date,
  timeZone = "Asia/Qatar",
): Promise<{ cmdId: number; command: string; from: Date; to: Date }> {
  if (!(from instanceof Date) || Number.isNaN(from.getTime()) || !(to instanceof Date) || Number.isNaN(to.getTime())) {
    throw new Error("Invalid fetch window.");
  }
  if (from.getTime() > to.getTime()) {
    throw new Error("Fetch start must be before end.");
  }
  const command = buildAdmsAttlogQueryCommand(from, to, timeZone);
  const { data: row, error: readError } = await sb
    .from("attendance_devices")
    .select("adms_cmd_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (readError) {
    throw new Error(
      readError.code === "PGRST204"
        ? "Fetch is not ready on the database yet. Apply the ADMS command migration, then try again."
        : readError.message,
    );
  }
  const cmdId = (Number(row?.adms_cmd_id) || 0) + 1;
  const { error } = await sb
    .from("attendance_devices")
    .update({
      adms_pending_cmd: command,
      adms_cmd_id: cmdId,
      adms_cmd_queued_at: new Date().toISOString(),
    })
    .eq("id", deviceId);
  if (error) {
    throw new Error(
      error.code === "PGRST204"
        ? "Fetch is not ready on the database yet. Apply the ADMS command migration, then try again."
        : error.message,
    );
  }
  return { cmdId, command, from, to };
}

export async function queueAdmsAttlogQueryForAll(
  sb: AdminClient,
  hours = 3,
): Promise<{ queued: number; skipped: number; deviceIds: string[] }> {
  const { data, error } = await sb
    .from("attendance_devices")
    .select("id, serial_number, timezone")
    .eq("active", true);
  if (error) throw error;
  const devices = (data ?? []).filter((row) => String(row.serial_number ?? "").trim());
  const deviceIds: string[] = [];
  let skipped = 0;
  for (const device of devices) {
    try {
      await queueAdmsAttlogQuery(
        sb,
        String(device.id),
        hours,
        device.timezone ? String(device.timezone) : "Asia/Qatar",
      );
      deviceIds.push(String(device.id));
    } catch {
      skipped += 1;
    }
  }
  return { queued: deviceIds.length, skipped, deviceIds };
}

export async function ackAdmsCommand(sb: AdminClient, deviceId: string, cmdId: number): Promise<void> {
  const { data } = await sb.from("attendance_devices").select("adms_cmd_id").eq("id", deviceId).maybeSingle();
  if (Number(data?.adms_cmd_id) !== cmdId) return;
  await sb
    .from("attendance_devices")
    .update({ adms_pending_cmd: null, adms_cmd_queued_at: null })
    .eq("id", deviceId);
}

/** Clear the getrequest body after one delivery so the device can POST ATTLOG instead of looping on the same C:id. */
export async function markAdmsCommandDelivered(sb: AdminClient, deviceId: string, cmdId: number): Promise<void> {
  const { error } = await sb
    .from("attendance_devices")
    .update({ adms_pending_cmd: null })
    .eq("id", deviceId)
    .eq("adms_cmd_id", cmdId);
  if (error && /adms_pending_cmd|adms_cmd_id/i.test(error.message)) return;
  if (error) console.error("adms mark delivered failed:", error);
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
    /** True only after ATTLOG/USER ingest — handshake/getrequest must not look like a punch sync. */
    sync?: boolean;
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
  if (patch.sync) update.last_sync_at = new Date().toISOString();
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
    const deviceNameByBiometric = deviceNameByBiometricFromMappings(existing);
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
      deviceNameByBiometric,
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
    sync: input.table === "ATTLOG" || users.length > 0,
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
