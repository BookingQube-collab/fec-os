import { normalizeName } from "@/lib/staff-roster/values";

/** Identity key is company + site + device + User ID — never the display name. */
export const BIOMETRIC_USER_CONFLICT = "company_id,location_id,device_id,biometric_user_id";

export type SuggestableStaff = {
  id: string;
  full_name: string;
  location_id?: string | null;
  is_roaming?: boolean | null;
  work_location_ids?: string[] | null;
  /** Active temporary move destinations (today inside starts_on..ends_on). */
  temporary_location_ids?: string[] | null;
};

export function staffAvailableAtLocation(s: SuggestableStaff, locationId: string | null) {
  if (!locationId) return true;
  if (s.location_id === locationId) return true;
  if (s.is_roaming) return true;
  if (s.work_location_ids?.includes(locationId)) return true;
  return Boolean(s.temporary_location_ids?.includes(locationId));
}

export type BiometricMapEligibilityOptions = {
  /** Staff with a roster row at the device site in the current payroll month. */
  rosterStaffIds?: ReadonlySet<string> | null;
};

/**
 * Mapping picker: staff who work at the device site, plus Head Office employees.
 * HO home/work location is included for every site so corporate names stay searchable
 * under All locations and when the HO pill is selected. Other venues stay site-scoped.
 * Roster presence covers people home elsewhere who still appear on this site's roster
 * (e.g. Ma Luz home KDS while also rostered at INF — and the reverse when mapping KDS).
 */
export function staffEligibleForBiometricMap(
  staff: SuggestableStaff,
  deviceLocationId: string | null,
  headOfficeLocationId: string | null,
  options?: BiometricMapEligibilityOptions,
): boolean {
  if (staffAvailableAtLocation(staff, deviceLocationId)) return true;
  if (deviceLocationId && options?.rosterStaffIds?.has(staff.id)) return true;
  if (!headOfficeLocationId || headOfficeLocationId === deviceLocationId) return false;
  return staff.location_id === headOfficeLocationId || Boolean(staff.work_location_ids?.includes(headOfficeLocationId));
}

/**
 * Seed the mapping employee search only when the device name uniquely identifies
 * one eligible employee (exact normalized name). Substring hits like "Maria" →
 * "Mariam" must not pre-filter the list and hide "Ma luz Jesus Romeo".
 */
export function mappingOpenSearchSeed(
  deviceName: string | null | undefined,
  staff: SuggestableStaff[],
  deviceLocationId: string | null,
  headOfficeLocationId: string | null,
  options?: BiometricMapEligibilityOptions & {
    /** @deprecated Ignored — seed uses unique exact name match only. */
    matchesQuery?: (query: string, ...parts: Array<string | null | undefined>) => boolean;
  },
): string | null {
  const seed = deviceName?.trim() || "";
  if (!seed) return null;
  const eligible = staff.filter((s) =>
    staffEligibleForBiometricMap(s, deviceLocationId, headOfficeLocationId, options),
  );
  return suggestStaffIdForDeviceName(seed, deviceLocationId, eligible) ? seed : null;
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

/** One recalc per site, limited to the people just mapped or unmapped. */
export function groupMappedStaffByLocation(
  items: ReadonlyArray<{ locationId?: string | null; staffId?: string | null }>,
): Array<{ locationId: string; staffIds: string[] }> {
  const map = new Map<string, string[]>();
  for (const item of items) {
    if (!item.locationId || !item.staffId) continue;
    const list = map.get(item.locationId) ?? [];
    if (!list.includes(item.staffId)) list.push(item.staffId);
    map.set(item.locationId, list);
  }
  return [...map.entries()].map(([locationId, staffIds]) => ({ locationId, staffIds }));
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
