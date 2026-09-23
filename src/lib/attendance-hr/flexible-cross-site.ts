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
