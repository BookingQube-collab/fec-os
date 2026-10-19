/**
 * Near-duplicate name matching for People merge suggestions.
 *
 * Manual merge (merge_staff_into) accepts any pair an editor confirms.
 * Auto bulk merge still requires an exact full name. These helpers only
 * surface likely pairs in the merge dialog — they never merge alone.
 */

import { namesAreFuzzyMatch, normalizeName, normalizePhoneMatch } from "@/lib/staff-roster/values";

export type StaffDuplicateMatchRow = {
  id: string;
  full_name: string;
  employee_code: string;
  location_id: string;
  phone?: string | null;
};

/** Small Levenshtein for surname typos (Kirorio / Kurorio). */
export function shortEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cur = row[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min((row[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length] ?? 3;
}

/**
 * True when two roster names look like the same person with a typo or
 * an extra middle name. Same first name is required. Last names may match
 * exactly, differ by one edit when both are at least 5 letters, or follow
 * the existing payroll-style fuzzy rules.
 */
export function nearDuplicateStaffNames(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const aTokens = left.split(" ").filter(Boolean);
  const bTokens = right.split(" ").filter(Boolean);
  // A single given name is too weak for merge suggestions.
  if (aTokens.length < 2 || bTokens.length < 2) return false;
  if (aTokens[0] !== bTokens[0]) return false;

  if (namesAreFuzzyMatch(a, b)) return true;

  const aLast = aTokens[aTokens.length - 1] ?? "";
  const bLast = bTokens[bTokens.length - 1] ?? "";
  if (!aLast || !bLast) return false;
  if (aLast === bLast) return true;
  if (aLast.length >= 5 && bLast.length >= 5 && shortEditDistance(aLast, bLast) <= 1) {
    return true;
  }
  return false;
}

/** Same home site, or the same normalized phone, plus a near-duplicate name. */
export function isLikelyStaffDuplicatePair(a: StaffDuplicateMatchRow, b: StaffDuplicateMatchRow): boolean {
  if (a.id === b.id) return false;
  if (!nearDuplicateStaffNames(a.full_name, b.full_name)) return false;

  const locA = String(a.location_id ?? "").trim();
  const locB = String(b.location_id ?? "").trim();
  if (locA && locB && locA === locB) return true;

  const phoneA = normalizePhoneMatch(a.phone);
  const phoneB = normalizePhoneMatch(b.phone);
  return Boolean(phoneA && phoneB && phoneA === phoneB);
}

/** Rank candidates for the merge dialog: same site first, then name closeness. */
export function rankLikelyStaffDuplicates(
  anchor: StaffDuplicateMatchRow,
  candidates: readonly StaffDuplicateMatchRow[],
): StaffDuplicateMatchRow[] {
  return candidates
    .filter((row) => isLikelyStaffDuplicatePair(anchor, row))
    .sort((left, right) => {
      const loc = String(anchor.location_id ?? "").trim();
      const leftSame = loc && String(left.location_id ?? "").trim() === loc ? 0 : 1;
      const rightSame = loc && String(right.location_id ?? "").trim() === loc ? 0 : 1;
      if (leftSame !== rightSame) return leftSame - rightSame;
      return left.full_name.localeCompare(right.full_name) || left.employee_code.localeCompare(right.employee_code);
    });
}
