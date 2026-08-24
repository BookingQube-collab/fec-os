import { markProbableDuplicates, assignAttendanceDate } from "./calculate";
import type { ShiftTemplateInput } from "./constants";
import { punchHash } from "./hash";

/** Identity key is company + site + device + User ID — never the display name. */
export const BIOMETRIC_USER_CONFLICT = "company_id,location_id,device_id,biometric_user_id";

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
}) {
  const withDupes = markProbableDuplicates(
    input.punches.map((p) => ({ ...p, punchAt: p.punchAt, probableDuplicate: false as boolean })),
    input.windowSeconds,
  );
  return withDupes.map((p) => {
    const biometricUserId = canonicalBiometricUserId(p.biometricUserId);
    return {
      location_id: input.locationId,
      device_id: input.deviceId,
      company_id: input.companyId,
      import_id: input.importId ?? null,
      staff_id: lookupStaffByBiometric(input.staffByBiometric, biometricUserId),
      biometric_user_id: biometricUserId,
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
