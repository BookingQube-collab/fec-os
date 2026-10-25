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
 * one eligible employee (exact or collapsed name). Substring / first-token hits
 * like "Maria" → "Mariam" or "Sara" → "Sara Khan" must not pre-filter the list.
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
  const name = normalizeName(seed);
  const collapsed = collapsePersonName(seed);
  if (!name) return null;
  const exact = eligible.filter(
    (s) => normalizeName(s.full_name) === name || collapsePersonName(s.full_name) === collapsed,
  );
  return uniqueStaffId(exact) ? seed : null;
}

/** Lowercase letters/digits only — "ZaryabJavaid" ↔ "Zaryab Javaid". */
export function collapsePersonName(value: string | null | undefined): string {
  return normalizeName(value).replace(/\s+/g, "");
}

function uniqueStaffId(matches: SuggestableStaff[]): string | null {
  if (matches.length !== 1) return null;
  return matches[0]!.id;
}

/** Small Levenshtein for name tokens (cap length 24). */
function tokenEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (a.length > 24 || b.length > 24) return 99;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

/**
 * Distinctive length before collapsed prefix / short-alias rules apply.
 * Keeps Carousel aliases ("Analiza" ↔ "AnalizaGutierrez") while blocking
 * short given-name collisions ("Mary" ≠ "MaryMoraa").
 */
const LOOSE_NAME_PREFIX_MIN = 6;

/** Collapsed equal/prefix, or multi-token names within edit distance 1 per aligned token. */
export function personNamesLooselyMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = collapsePersonName(left);
  const b = collapsePersonName(right);
  if (!a || !b || a.length < 4 || b.length < 4) return false;
  if (a === b) return true;
  // Prefix only for long-enough stems — "mary" must not swallow "marymoraa".
  const shorter = Math.min(a.length, b.length);
  if (shorter >= LOOSE_NAME_PREFIX_MIN && (a.startsWith(b) || b.startsWith(a))) return true;

  const aTokens = normalizeName(left).split(/\s+/).filter(Boolean);
  const bTokens = normalizeName(right).split(/\s+/).filter(Boolean);
  if (aTokens.length >= 2 && bTokens.length >= 2) {
    const n = Math.min(aTokens.length, bTokens.length);
    let ok = 0;
    for (let i = 0; i < n; i += 1) {
      if (tokenEditDistance(aTokens[i]!, bTokens[i]!) <= 1) ok += 1;
    }
    return ok >= 2 && ok >= Math.ceil(n * 0.6);
  }
  // Single-token alias ("Maniraj") vs camel/spaced device ("maniaRaj Paiyar").
  // Require a long stem so "Mary" never equals "Mary Moraa" via first-token alone.
  if (aTokens.length === 1 && bTokens.length >= 2) {
    return singleTokenLooselyMatchesMulti(aTokens[0]!, bTokens);
  }
  if (bTokens.length === 1 && aTokens.length >= 2) {
    return singleTokenLooselyMatchesMulti(bTokens[0]!, aTokens);
  }
  return tokenEditDistance(a, b) <= 2 && Math.min(a.length, b.length) >= 6;
}

function singleTokenLooselyMatchesMulti(alias: string, multiTokens: string[]): boolean {
  if (alias.length < LOOSE_NAME_PREFIX_MIN) return false;
  const joined = multiTokens.slice(0, 2).join("");
  return (
    tokenEditDistance(alias, joined) <= 2 ||
    (joined.startsWith(alias) && alias.length >= LOOSE_NAME_PREFIX_MIN) ||
    tokenEditDistance(alias, multiTokens[0]!) <= 2
  );
}

/**
 * Unique device-name → staff match for mapping drafts and recalc auto-link.
 * Order: exact normalized → collapsed → staff name prefix of device → unique first token
 * (single device token, length ≥5, e.g. "wahaj") → loose multi-token.
 * Short stems ("Mary", "Sara") never first-token or prefix-merge onto longer names.
 * Ambiguous names return null (never guess when two people share a match).
 */
export function suggestStaffIdForDeviceName(
  deviceName: string | null | undefined,
  locationId: string | null | undefined,
  staff: SuggestableStaff[],
): string | null {
  const name = normalizeName(deviceName);
  if (!name) return null;
  const collapsed = collapsePersonName(deviceName);
  const loc = locationId ?? null;
  const eligible = staff.filter((s) => staffAvailableAtLocation(s, loc));
  const pool = eligible.length ? eligible : staff;

  const exact = pool.filter((s) => normalizeName(s.full_name) === name);
  const exactId = uniqueStaffId(exact);
  if (exactId) return exactId;
  if (exact.length > 1) return null;

  const byCollapse = pool.filter((s) => collapsePersonName(s.full_name) === collapsed);
  const collapseId = uniqueStaffId(byCollapse);
  if (collapseId) return collapseId;
  if (byCollapse.length > 1) return null;

  // "flora Mae Remolino" → Flora Mae; device may carry a middle/maiden surname.
  // Require 2+ staff tokens (or spaced prefix) so "Maria" never steals "Mariam".
  // Spaced prefix needs staff name length ≥6 so "Mary " never claims "Mary Moraa".
  const byPrefix = pool.filter((s) => {
    const staffName = normalizeName(s.full_name);
    if (!staffName || staffName.length < 4) return false;
    if (name === staffName) return true;
    if (staffName.length >= LOOSE_NAME_PREFIX_MIN && name.startsWith(`${staffName} `)) return true;
    const staffCollapsed = collapsePersonName(s.full_name);
    const tokenCount = staffName.split(/\s+/).filter(Boolean).length;
    return (
      tokenCount >= 2 &&
      staffCollapsed.length >= LOOSE_NAME_PREFIX_MIN &&
      collapsed.startsWith(staffCollapsed)
    );
  });
  const prefixId = uniqueStaffId(byPrefix);
  if (prefixId) return prefixId;
  if (byPrefix.length > 1) return null;

  // "wahaj" → Wahaj Asghar only when the device string is a single distinctive token.
  // Short stems ("Mary", "Sara") must not map onto "Mary Moraa" / "Sara Khan".
  const deviceTokens = name.split(/\s+/).filter(Boolean);
  if (deviceTokens.length === 1) {
    const deviceFirst = deviceTokens[0]!;
    if (deviceFirst.length >= 5) {
      const byFirst = pool.filter((s) => (normalizeName(s.full_name).split(/\s+/)[0] ?? "") === deviceFirst);
      const firstId = uniqueStaffId(byFirst);
      if (firstId) return firstId;
    }
  }

  const byLoose = pool.filter((s) => personNamesLooselyMatch(deviceName, s.full_name));
  const looseId = uniqueStaffId(byLoose);
  if (looseId) return looseId;
  if (byLoose.length > 1) return null;

  if (!loc) return null;
  const global = staff.filter((s) => normalizeName(s.full_name) === name);
  return uniqueStaffId(global);
}

/**
 * Reuse a staff_id already mapped under a similar device_name at another site
 * (Carousel "maniaRaj Paiyar" ↔ INF "Maniraj"; "AnalizaGutierrez" ↔ "Analiza").
 * Only when the staff is eligible at this site and the alias match is unique.
 */
export function suggestStaffIdFromMappedAliases(
  deviceName: string | null | undefined,
  locationId: string | null | undefined,
  staff: SuggestableStaff[],
  mappedAliases: ReadonlyArray<{ staffId: string; deviceName: string | null | undefined }>,
): string | null {
  const collapsed = collapsePersonName(deviceName);
  if (!collapsed || collapsed.length < 4) return null;
  const loc = locationId ?? null;
  const eligibleIds = new Set(
    staff.filter((s) => staffAvailableAtLocation(s, loc) || !loc).map((s) => s.id),
  );
  if (loc) {
    for (const s of staff) {
      if (s.location_id === loc || s.is_roaming || s.work_location_ids?.includes(loc) || s.temporary_location_ids?.includes(loc)) {
        eligibleIds.add(s.id);
      }
    }
  }

  const hits = new Set<string>();
  for (const alias of mappedAliases) {
    const staffId = String(alias.staffId ?? "").trim();
    if (!staffId || !eligibleIds.has(staffId)) continue;
    if (!personNamesLooselyMatch(deviceName, alias.deviceName)) continue;
    hits.add(staffId);
    if (hits.size > 1) return null;
  }
  return hits.size === 1 ? [...hits][0]! : null;
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

/** Staff ids that must be recalculated after a bio remap (new + previous owners). */
export function staffIdsAffectedByBiometricRemap(opts: {
  newStaffId: string;
  previousMappingStaffId?: string | null;
  previousLogStaffIds?: ReadonlyArray<string | null | undefined>;
}): string[] {
  return [
    ...new Set(
      [opts.newStaffId, opts.previousMappingStaffId, ...(opts.previousLogStaffIds ?? [])]
        .map((id) => (id == null ? "" : String(id).trim()))
        .filter(Boolean),
    ),
  ];
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
