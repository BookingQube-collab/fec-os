import { markProbableDuplicates, assignAttendanceDate } from "./calculate";
import type { ShiftTemplateInput } from "./constants";
import { punchHash } from "./hash";
import { canonicalBiometricUserId, lookupStaffByBiometric } from "./mapping-merge";

/** Server-only: hashes punches with node:crypto — do not import from client views. */
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
