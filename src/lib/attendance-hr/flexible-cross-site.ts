/**
 * Cross-site day merge for staff with flexible_attendance.
 *
 * Choice (documented): the daily summary `location_id` is the location of the
 * earliest valid punch that day (first check-in site). Hours = last out − first
 * in across all sites. Non-anchor sites suppress false ABSENT / partial rows —
 * including roster-only ABSENT fillers at work locations with no punches.
 */

export type FlexibleCrossSitePunch = {
  locationId: string;
  punchAt: string;
  /** Device user id on that terminal (differs per site for flexible staff). */
  biometricUserId?: string | null;
  excludedFromCalc?: boolean;
  probableDuplicate?: boolean;
};

export type FlexibleDayRecalcAction = "write_merged" | "suppress" | "no_punches";

function isUsablePunch(p: FlexibleCrossSitePunch): boolean {
  return !p.excludedFromCalc && !p.probableDuplicate;
}

function sortedUsablePunches(punches: FlexibleCrossSitePunch[]): FlexibleCrossSitePunch[] {
  return punches
    .filter(isUsablePunch)
    .sort((a, b) => new Date(a.punchAt).getTime() - new Date(b.punchAt).getTime());
}

/** Location of the earliest usable punch (first check-in site). */
export function flexibleDayAnchorLocationId(
  punches: FlexibleCrossSitePunch[],
): string | null {
  return sortedUsablePunches(punches)[0]?.locationId ?? null;
}

/** First usable punch site (check-in) and last usable punch site (check-out). */
export function flexibleDayFirstLastLocationIds(punches: FlexibleCrossSitePunch[]): {
  checkInLocationId: string | null;
  checkOutLocationId: string | null;
} {
  const valid = sortedUsablePunches(punches);
  if (!valid.length) return { checkInLocationId: null, checkOutLocationId: null };
  return {
    checkInLocationId: valid[0]?.locationId ?? null,
    checkOutLocationId: valid[valid.length - 1]?.locationId ?? null,
  };
}

/**
 * Same-date device punches for flexible reports: first usable = check-in,
 * last usable = check-out when 2+ punches (1 punch → in only, out null).
 */
export function flexibleDayFirstLastPunchAt(punches: FlexibleCrossSitePunch[]): {
  firstPunchAt: string | null;
  lastPunchAt: string | null;
  usableCount: number;
} {
  const valid = sortedUsablePunches(punches);
  if (!valid.length) return { firstPunchAt: null, lastPunchAt: null, usableCount: 0 };
  return {
    firstPunchAt: valid[0]?.punchAt ?? null,
    lastPunchAt: valid.length > 1 ? (valid[valid.length - 1]?.punchAt ?? null) : null,
    usableCount: valid.length,
  };
}

/** Device user ids on the first check-in punch and last check-out punch. */
export function flexibleDayFirstLastBiometricUserIds(punches: FlexibleCrossSitePunch[]): {
  checkInBiometricUserId: string | null;
  checkOutBiometricUserId: string | null;
} {
  const valid = sortedUsablePunches(punches);
  if (!valid.length) return { checkInBiometricUserId: null, checkOutBiometricUserId: null };
  const first = valid[0]?.biometricUserId?.trim() || null;
  const last =
    valid.length > 1 ? valid[valid.length - 1]?.biometricUserId?.trim() || null : first;
  return { checkInBiometricUserId: first, checkOutBiometricUserId: last };
}

/**
 * Listing label for device user ids across sites: `UA-DM 35 → INF-CC 24`
 * when in/out sites (or ids) differ; plain id when single-site.
 */
export function formatFlexibleCrossSiteDeviceUserLabel(
  checkInCode: string | null | undefined,
  checkInUserId: string | null | undefined,
  checkOutCode: string | null | undefined,
  checkOutUserId: string | null | undefined,
): string | null {
  const inCode = checkInCode?.trim() || "";
  const outCode = checkOutCode?.trim() || "";
  const inId = checkInUserId?.trim() || "";
  const outId = checkOutUserId?.trim() || "";
  const pair = (code: string, id: string) => {
    if (code && id) return `${code} ${id}`;
    return id || code || "";
  };
  const a = pair(inCode, inId);
  const b = pair(outCode, outId);
  if (!a && !b) return null;
  if (!a) return b;
  if (!b || a === b) {
    // Single site: keep the bare user id when we only have one id (no code clutter).
    if (inId && (!outId || inId === outId) && (!outCode || inCode === outCode)) return inId;
    if (outId && !inId) return outId;
    return a;
  }
  return `${a} → ${b}`;
}

/**
 * Site-scoped recalc decision for a flexible staff day.
 * - write_merged: this location is the anchor → one Present/hours row from all punches
 * - suppress: punches exist but anchor is elsewhere → no row here (delete stale ABSENT)
 * - no_punches: no usable punches anywhere → normal absent / leave path
 */
export function flexibleDayRecalcAction(opts: {
  locationId: string;
  punchesAcrossSites: FlexibleCrossSitePunch[];
}): FlexibleDayRecalcAction {
  const anchor = flexibleDayAnchorLocationId(opts.punchesAcrossSites);
  if (!anchor) return "no_punches";
  return anchor === opts.locationId ? "write_merged" : "suppress";
}

/** True when usable punches exist on any site for the day. */
export function flexibleDayHasQualifyingPunches(
  punches: FlexibleCrossSitePunch[],
): boolean {
  return punches.some(isUsablePunch);
}

/** Distinct non-anchor locations that contributed punches (for stale summary cleanup). */
export function flexibleDayNonAnchorPunchLocations(
  punches: FlexibleCrossSitePunch[],
  anchorLocationId: string,
): string[] {
  const ids = new Set<string>();
  for (const p of punches) {
    if (!isUsablePunch(p)) continue;
    if (p.locationId && p.locationId !== anchorLocationId) ids.add(p.locationId);
  }
  return [...ids];
}

/**
 * Compact dual-site label for listing/grid: `INF-CC → UA-DM` when in/out sites differ,
 * otherwise a single code. Full venue names stay on the single-site path.
 */
export function formatFlexibleCrossSiteLocationLabel(
  checkInCode: string | null | undefined,
  checkOutCode: string | null | undefined,
): string | null {
  const a = checkInCode?.trim() || "";
  const b = checkOutCode?.trim() || "";
  if (!a && !b) return null;
  if (!a) return b;
  if (!b || a === b) return a;
  return `${a} → ${b}`;
}

export function normalizeFlexiblePersonName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export type FlexibleBioIdentity = {
  staffId: string | null;
  locationId: string;
  biometricUserId: string;
  deviceName?: string | null;
};

/**
 * Expand flexible staff biometric pairs to include unmapped (or already-this-staff)
 * registry rows that share the same device_name. Lets UA-DM 35 join INF-CC 24 when
 * both devices show "Russell" but only one site is mapped to staff.
 */
export function expandFlexibleBiometricPairsByDeviceName(
  mappedForStaff: FlexibleBioIdentity[],
  catalog: FlexibleBioIdentity[],
): Array<{ staffId: string; locationId: string; biometricUserId: string }> {
  const out: Array<{ staffId: string; locationId: string; biometricUserId: string }> = [];
  const seen = new Set<string>();
  const namesByStaff = new Map<string, Set<string>>();

  const add = (staffId: string, locationId: string, biometricUserId: string) => {
    const uid = biometricUserId.trim();
    const loc = locationId.trim();
    if (!staffId || !loc || !uid) return;
    const key = `${staffId}|${loc}|${uid}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ staffId, locationId: loc, biometricUserId: uid });
  };

  for (const row of mappedForStaff) {
    const staffId = row.staffId?.trim();
    if (!staffId) continue;
    add(staffId, row.locationId, row.biometricUserId);
    const dn = normalizeFlexiblePersonName(row.deviceName);
    if (!dn) continue;
    const names = namesByStaff.get(staffId) ?? new Set<string>();
    names.add(dn);
    namesByStaff.set(staffId, names);
  }

  for (const [staffId, names] of namesByStaff) {
    if (!names.size) continue;
    for (const row of catalog) {
      const rowStaff = row.staffId?.trim() || "";
      if (rowStaff && rowStaff !== staffId) continue;
      const dn = normalizeFlexiblePersonName(row.deviceName);
      if (!dn || !names.has(dn)) continue;
      add(staffId, row.locationId, row.biometricUserId);
    }
  }

  return out;
}
