/**
 * People directory: hide an unmapped generated stub only.
 *
 * A row is hidden only when all of these are true:
 * - its employee code is a generated `{location}-STF` + digits stub (`UA-DR-STF84`)
 * - it has no login (`user_id`)
 * - another row has the same complete full name (case and extra spaces only)
 *   and the same home `location_id`
 * - that other row is the mapped person: a non-generated employee code, a login,
 *   or a phone
 *
 * A numeric code, any other real code, or a row with a login is never removed.
 * Two real employees who share a full name both stay. A single given name
 * ("Rajan", "Sarah") never matches a longer name and never collapses people.
 */

function normalizePhoneMatch(value: string | null | undefined): string | null {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 8) return `+974${digits}`;
  if (digits.length === 11 && digits.startsWith("974")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("974")) return `+${digits.slice(-11)}`;
  if (digits.startsWith("974") && digits.length >= 11) return `+974${digits.slice(-8)}`;
  return `+${digits}`;
}

/** Allocator stubs such as `UA-DR-STF84`. Not `543`, `9`, `INF-CC-BM`, or `FEC-TEC01`. */
const GENERATED_LOCATION_STUB = /^[A-Z0-9]+(?:-[A-Z0-9]+)*-STF\d+$/i;

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

/** Case and repeated spaces only. "Rajan" stays distinct from "Rajan Pathak". */
export function normalizeExactFullName(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isCompleteFullName(name: string): boolean {
  return name.includes(" ");
}

export function isGeneratedLocationStub(value: string | null | undefined): boolean {
  return GENERATED_LOCATION_STUB.test(String(value ?? "").trim());
}

function hasPhone(value: string | null | undefined): boolean {
  return Boolean(normalizePhoneMatch(value));
}

/** The row we keep: real employee code, login, or a phone number. */
function isMappedKeeper(row: StaffIdentityRow): boolean {
  if (row.user_id) return true;
  if (hasPhone(row.phone)) return true;
  const code = String(row.employee_code ?? "").trim();
  return Boolean(code) && !isGeneratedLocationStub(code);
}

/** Staff ids that must not appear as separate, actionable directory rows. */
export function hiddenUnmappedDuplicateIds(rows: readonly StaffIdentityRow[]): Set<string> {
  const hidden = new Set<string>();
  if (rows.length < 2) return hidden;

  for (const row of rows) {
    // A login, a numeric code, or any non-stub code is a real directory row.
    if (row.user_id) continue;
    if (!isGeneratedLocationStub(row.employee_code)) continue;

    const name = normalizeExactFullName(row.full_name);
    const locationId = String(row.location_id ?? "").trim();
    if (!isCompleteFullName(name) || !locationId) continue;

    const keeper = rows.some((other) => {
      if (other.id === row.id) return false;
      if (String(other.location_id ?? "").trim() !== locationId) return false;
      if (normalizeExactFullName(other.full_name) !== name) return false;
      return isMappedKeeper(other);
    });
    if (keeper) hidden.add(row.id);
  }

  return hidden;
}

export type StaffDuplicateMerge = {
  keepId: string;
  removeId: string;
};

function sameStaffPerson(a: StaffIdentityRow, b: StaffIdentityRow): boolean {
  const nameA = normalizeExactFullName(a.full_name);
  const nameB = normalizeExactFullName(b.full_name);
  if (!isCompleteFullName(nameA) || nameA !== nameB) return false;

  const locationA = String(a.location_id ?? "").trim();
  const locationB = String(b.location_id ?? "").trim();
  if (locationA && locationA === locationB) return true;

  const phoneA = normalizePhoneMatch(a.phone);
  const phoneB = normalizePhoneMatch(b.phone);
  return Boolean(phoneA && phoneA === phoneB);
}

function isExplicitlyMapped(row: StaffIdentityRow): boolean {
  return Boolean(row.user_id) || Boolean(row.attendance_mapped);
}

/** Real employee code first, then a login or biometric link, then code, then id. */
function compareStaffKeepers(a: StaffIdentityRow, b: StaffIdentityRow): number {
  const realA = isGeneratedLocationStub(a.employee_code) ? 0 : 1;
  const realB = isGeneratedLocationStub(b.employee_code) ? 0 : 1;
  if (realA !== realB) return realB - realA;
  const mappedA = isExplicitlyMapped(a) ? 1 : 0;
  const mappedB = isExplicitlyMapped(b) ? 1 : 0;
  if (mappedA !== mappedB) return mappedB - mappedA;
  const byCode = String(a.employee_code).localeCompare(String(b.employee_code));
  if (byCode !== 0) return byCode;
  return a.id.localeCompare(b.id);
}

/**
 * Pairs to merge. Same person = exact full name plus home location, or exact
 * full name plus phone. A generated `{location}-STFnn` stub folds into the
 * real employee code. Two real codes fold only when one has a login or
 * attendance link and the other does not.
 */
export function planStaffDuplicateMerges(rows: readonly StaffIdentityRow[]): StaffDuplicateMerge[] {
  const list = [...rows];
  const parent = list.map((_, index) => index);
  const find = (index: number): number => {
    let cur = index;
    while (parent[cur] !== cur) {
      parent[cur] = parent[parent[cur]] ?? parent[cur];
      cur = parent[cur] ?? cur;
    }
    return cur;
  };
  const union = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[a] = b;
  };

  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (sameStaffPerson(list[i], list[j])) union(i, j);
    }
  }

  const groups = new Map<number, StaffIdentityRow[]>();
  list.forEach((row, index) => {
    const root = find(index);
    const bucket = groups.get(root);
    if (bucket) bucket.push(row);
    else groups.set(root, [row]);
  });

  const plans: StaffDuplicateMerge[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(compareStaffKeepers);
    const keep = sorted[0];
    const keepIsReal = !isGeneratedLocationStub(keep.employee_code);
    const keepIsMapped = isExplicitlyMapped(keep);
    for (const other of sorted.slice(1)) {
      const otherIsReal = !isGeneratedLocationStub(other.employee_code);
      if (otherIsReal) {
        if (keepIsReal && keepIsMapped && !isExplicitlyMapped(other)) {
          plans.push({ keepId: keep.id, removeId: other.id });
        }
        continue;
      }
      if (keepIsReal || keepIsMapped) {
        plans.push({ keepId: keep.id, removeId: other.id });
      }
    }
  }

  plans.sort((a, b) => a.removeId.localeCompare(b.removeId) || a.keepId.localeCompare(b.keepId));
  return plans;
}

const BLANK_TEXT_FIELDS = ["job_title", "department", "phone", "email", "qid", "employment_type"] as const;
const NULL_FIELDS = [
  "hire_date",
  "staff_role",
  "e3_enrolled",
  "user_id",
  "source_row_no",
  "reporting_time_minutes",
  "buffer_minutes",
  "flexible_shift_start",
  "flexible_shift_end",
  "expected_hours",
  "break_minutes",
  "weekly_off_weekday",
] as const;

function isBlankField(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

/** Copy only fields that are empty on the kept row and present on the stub. */
export function fillEmptyStaffFields<T extends Record<string, unknown>>(keep: T, stub: T): T {
  const next = { ...keep };
  for (const key of BLANK_TEXT_FIELDS) {
    if (isBlankField(next[key]) && !isBlankField(stub[key])) next[key] = stub[key] as T[typeof key];
  }
  for (const key of NULL_FIELDS) {
    if (next[key] == null && stub[key] != null) next[key] = stub[key] as T[typeof key];
  }
  if (next.photo_data == null && stub.photo_data != null) {
    next.photo_data = stub.photo_data as T["photo_data"];
    next.photo_mime = stub.photo_mime as T["photo_mime"];
    next.photo_updated_at = stub.photo_updated_at as T["photo_updated_at"];
  }
  return next;
}
