/**
 * People directory: one usable row per person.
 *
 * Same person (existing identity rules, exact — not fuzzy):
 * - full name + home location
 * - full name + phone
 *
 * A generated location code (`UA-DR-STF84`) is an unmapped stub when a
 * non-generated employee code (`543`) exists for that person. A login
 * (`staff.user_id`) or attendance biometric link is an explicit map: when
 * several real codes share an identity, only the mapped ones stay usable.
 */

import { isGeneratedEmployeeCode } from "@/lib/staff-employee-code";
import { normalizeName, normalizePhoneMatch } from "@/lib/staff-roster/values";

export type StaffIdentityRow = {
  id: string;
  full_name: string;
  employee_code: string;
  location_id: string;
  phone?: string | null;
  user_id?: string | null;
  /** attendance_biometric_users.staff_id points at this row. */
  attendance_mapped?: boolean;
};

function hasGivenAndFamilyName(name: string): boolean {
  return name.includes(" ");
}

function isExplicitlyMapped(row: StaffIdentityRow): boolean {
  return Boolean(row.user_id) || Boolean(row.attendance_mapped);
}

function idsToHide(members: StaffIdentityRow[]): string[] {
  if (members.length < 2) return [];

  const masters = members.filter((row) => !isGeneratedEmployeeCode(row.employee_code));
  const stubs = members.filter((row) => isGeneratedEmployeeCode(row.employee_code));

  if (masters.length && stubs.length) {
    const mappedMasters = masters.filter(isExplicitlyMapped);
    const keep = new Set((mappedMasters.length ? mappedMasters : masters).map((row) => row.id));
    return members.filter((row) => !keep.has(row.id)).map((row) => row.id);
  }

  const mapped = members.filter(isExplicitlyMapped);
  if (!mapped.length || mapped.length === members.length) return [];
  const keep = new Set(mapped.map((row) => row.id));
  return members.filter((row) => !keep.has(row.id)).map((row) => row.id);
}

/** Staff ids that must not appear as separate, actionable directory rows. */
export function hiddenUnmappedDuplicateIds(rows: readonly StaffIdentityRow[]): Set<string> {
  const hidden = new Set<string>();
  if (rows.length < 2) return hidden;

  const parent = new Map<string, string>();
  for (const row of rows) parent.set(row.id, row.id);

  const find = (id: string): string => {
    let cur = id;
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur);
      if (!next) return cur;
      parent.set(cur, parent.get(next) ?? next);
      cur = next;
    }
    return cur;
  };

  const union = (a: string, b: string) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent.set(pa, pb);
  };

  const byNameLocation = new Map<string, string>();
  const byNamePhone = new Map<string, string>();

  for (const row of rows) {
    const name = normalizeName(row.full_name);
    if (!hasGivenAndFamilyName(name)) continue;

    if (row.location_id) {
      const key = `${name}\0${row.location_id}`;
      const prev = byNameLocation.get(key);
      if (prev) union(prev, row.id);
      else byNameLocation.set(key, row.id);
    }

    const phone = normalizePhoneMatch(row.phone);
    if (phone) {
      const key = `${name}\0${phone}`;
      const prev = byNamePhone.get(key);
      if (prev) union(prev, row.id);
      else byNamePhone.set(key, row.id);
    }
  }

  const groups = new Map<string, StaffIdentityRow[]>();
  for (const row of rows) {
    const root = find(row.id);
    const list = groups.get(root);
    if (list) list.push(row);
    else groups.set(root, [row]);
  }

  for (const members of groups.values()) {
    for (const id of idsToHide(members)) hidden.add(id);
  }
  return hidden;
}
