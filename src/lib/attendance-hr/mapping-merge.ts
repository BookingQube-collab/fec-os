import { normalizeName } from "@/lib/staff-roster/values";

import { markProbableDuplicates, assignAttendanceDate } from "./calculate";
import type { ShiftTemplateInput } from "./constants";
import { punchHash } from "./hash";

/** Identity key is company + site + device + User ID — never the display name. */
export const BIOMETRIC_USER_CONFLICT = "company_id,location_id,device_id,biometric_user_id";

export type SuggestableStaff = {
  id: string;
  full_name: string;
  location_id?: string | null;
  is_roaming?: boolean | null;
  work_location_ids?: string[] | null;
};

export function staffAvailableAtLocation(s: SuggestableStaff, locationId: string | null) {
  if (!locationId) return true;
  if (s.location_id === locationId) return true;
  if (s.is_roaming) return true;
  return Boolean(s.work_location_ids?.includes(locationId));
}

/**
 * Unique exact device-name → staff match for mapping drafts.
 * Ambiguous names (same name at the site, or multiple company-wide) return null.
 */
export function suggestStaffIdForDeviceName(
  deviceName: string | null | undefined,
  locationId: string | null | undefined,
  staff: SuggestableStaff[],
): string | null {
  const name = normalizeName(deviceName);
  if (!name) return null;
  const loc = locationId ?? null;
  const local = staff.filter(
    (s) => staffAvailableAtLocation(s, loc) && normalizeName(s.full_name) === name,
  );
  if (local.length === 1) return local[0]!.id;
  if (local.length > 1) return null;
  if (!loc) return null;
  const global = staff.filter((s) => normalizeName(s.full_name) === name);
  return global.length === 1 ? global[0]!.id : null;
}

export type ExistingBiometricUser = {
  biometricUserId: string;
  deviceName: string | null;
  staffId: string | null;
  previousDeviceName?: string | null;
};

export type IncomingBiometricUser = {
  biometricUserId: string;
  name: string;
};

export type MergedBiometricUser = {
  biometricUserId: string;
  deviceName: string | null;
  staffId: string | null;
  previousDeviceName: string | null;
  nameChanged: boolean;
  isNew: boolean;
};

export function canonicalBiometricUserId(raw: string): string {
  return raw.trim();
}

export function lookupStaffByBiometric(map: Map<string, string> | undefined, biometricUserId: string): string | null {
  if (!map) return null;
  const id = canonicalBiometricUserId(biometricUserId);
  return map.get(id) ?? map.get(biometricUserId) ?? null;
}

export function staffByBiometricFromMappings(
  rows: Array<{ biometricUserId: string; staffId: string | null | undefined }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row.staffId) continue;
    map.set(canonicalBiometricUserId(row.biometricUserId), row.staffId);
  }
  return map;
}

/** Prefer device_name, else full_name — used to stamp attendance_logs.device_user_name. */
export function deviceNameByBiometricFromMappings(
  rows: Array<{
    biometricUserId: string;
    deviceName?: string | null;
    fullName?: string | null;
  }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const id = canonicalBiometricUserId(row.biometricUserId);
    if (!id || map.has(id)) continue;
    const name = row.deviceName?.trim() || row.fullName?.trim() || "";
    if (name) map.set(id, name);
  }
  return map;
}

/** Punch PINs that never landed in the biometric registry (ATTLOG without USERINFO). */
export function missingPunchBiometricIds(
  existing: Array<{ biometricUserId: string }>,
  punchBiometricIds: Iterable<string>,
): string[] {
  const known = new Set(
    existing.map((row) => canonicalBiometricUserId(row.biometricUserId)).filter(Boolean),
  );
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const raw of punchBiometricIds) {
    const id = canonicalBiometricUserId(raw);
    if (!id || known.has(id) || seen.has(id)) continue;
    seen.add(id);
    missing.push(id);
  }
  return missing;
}

/** Registry stubs so Mapping + device-log enrichment can see punch-only user ids. */
export function stubBiometricUsersForIds(ids: string[]): MergedBiometricUser[] {
  return missingPunchBiometricIds([], ids).map((biometricUserId) => ({
    biometricUserId,
    deviceName: null,
    staffId: null,
    previousDeviceName: null,
    nameChanged: false,
    isNew: true,
  }));
}

/**
 * Upsert plan keyed only by User ID. Keeps staff_id across re-imports even when
 * the name on the device changed. Never merges two different User IDs by name.
 */
export function mergeBiometricUsersById(
  existing: ExistingBiometricUser[],
  incoming: IncomingBiometricUser[],
): MergedBiometricUser[] {
  const byId = new Map<string, ExistingBiometricUser>();
  for (const row of existing) {
    const id = canonicalBiometricUserId(row.biometricUserId);
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev || (!prev.staffId && row.staffId)) {
      byId.set(id, { ...row, biometricUserId: id });
    }
  }

  const incomingById = new Map<string, IncomingBiometricUser>();
  for (const user of incoming) {
    const id = canonicalBiometricUserId(user.biometricUserId);
    if (!id) continue;
    incomingById.set(id, { biometricUserId: id, name: user.name });
  }

  const merged: MergedBiometricUser[] = [];
  for (const [id, user] of incomingById) {
    const prev = byId.get(id) ?? null;
    const newName = user.name.trim() || null;
    const oldName = prev?.deviceName?.trim() || null;
    const nameChanged = Boolean(oldName && newName && oldName !== newName);
    merged.push({
      biometricUserId: id,
      deviceName: newName ?? oldName,
      staffId: prev?.staffId ?? null,
      previousDeviceName: nameChanged ? oldName : (prev?.previousDeviceName ?? null),
      nameChanged,
      isNew: !prev,
    });
  }
  return merged;
}

export function buildPunchRows(input: {
  punches: Array<{
    biometricUserId: string;
    punchAt: string;
    verifyMethod: number | null;
    inOutStatus: number | null;
    workCode: number | null;
    reservedField: string | null;
    raw: string;
    rowNumber: number;
  }>;
  companyId: string;
  locationId: string;
  deviceId: string;
  importId?: string | null;
  source?: string;
  windowSeconds: number;
  shift: ShiftTemplateInput | null;
  staffByBiometric?: Map<string, string>;
  /** Registry device_name / full_name stamped onto attendance_logs.device_user_name. */
  deviceNameByBiometric?: Map<string, string>;
}) {
  const withDupes = markProbableDuplicates(
    input.punches.map((p) => ({
      ...p,
      punchAt: p.punchAt,
      probableDuplicate: false as boolean,
      _dupGroup: canonicalBiometricUserId(p.biometricUserId),
    })),
    input.windowSeconds,
    { groupKey: (p) => p._dupGroup },
  );
  return withDupes.map((p) => {
    const biometricUserId = canonicalBiometricUserId(p.biometricUserId);
    const deviceUserName =
      input.deviceNameByBiometric?.get(biometricUserId)?.trim() ||
      input.deviceNameByBiometric?.get(p.biometricUserId)?.trim() ||
      null;
    return {
      location_id: input.locationId,
      device_id: input.deviceId,
      company_id: input.companyId,
      import_id: input.importId ?? null,
      staff_id: lookupStaffByBiometric(input.staffByBiometric, biometricUserId),
      biometric_user_id: biometricUserId,
      device_user_name: deviceUserName,
      punch_at: p.punchAt,
      punch_type: "in",
      source: input.source ?? "file_import",
      punch_hash: punchHash({
        companyId: input.companyId,
        deviceId: input.deviceId,
        biometricUserId,
        punchAt: p.punchAt,
      }),
      verify_method: p.verifyMethod,
      in_out_status: p.inOutStatus,
      work_code: p.workCode,
      reserved_field: p.reservedField,
      probable_duplicate: Boolean(p.probableDuplicate),
      excluded_from_calc: Boolean(p.probableDuplicate),
      attendance_date: assignAttendanceDate(p.punchAt, input.shift),
      raw_payload: { raw: p.raw, row: p.rowNumber },
    };
  });
}
