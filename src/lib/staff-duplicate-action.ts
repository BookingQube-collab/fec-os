/**
 * Decisions for merging or deleting one duplicate staff pair from the People directory.
 *
 * The database function public.merge_staff_into is the writer: it fills empty fields,
 * moves child rows onto the kept person, drops a child row only when a unique key
 * would collide, then deletes the duplicate. These helpers decide what the screen
 * shows and whether a standalone delete is allowed. They never overwrite a non-empty
 * kept value.
 */
import { isGeneratedLocationStub } from "@/lib/staff-mapped-duplicates";

export type DuplicateFieldKind = "text" | "null";

export type DuplicateMergeField = {
  key: string;
  kind: DuplicateFieldKind;
};

/**
 * Identity and HR fields filled only when the kept value is empty.
 * Text fields treat blank strings as empty. Other values copy only when the
 * kept value is null, so false and 0 stay.
 */
export const DUPLICATE_MERGE_FIELDS: readonly DuplicateMergeField[] = [
  { key: "qid", kind: "text" },
  { key: "hire_date", kind: "null" },
  { key: "job_title", kind: "text" },
  { key: "department", kind: "text" },
  { key: "phone", kind: "text" },
  { key: "email", kind: "text" },
  { key: "employment_type", kind: "text" },
  { key: "user_id", kind: "null" },
  { key: "nationality", kind: "text" },
  { key: "passport_number", kind: "text" },
  { key: "gender", kind: "text" },
  { key: "sponsorship_info", kind: "text" },
  { key: "date_of_birth", kind: "null" },
  { key: "ticket_eligibility", kind: "null" },
  { key: "passport_expiry", kind: "null" },
  { key: "qid_expiry", kind: "null" },
];

export function isEmptyDuplicateValue(value: unknown, kind: DuplicateFieldKind): boolean {
  if (kind === "text") {
    return value == null || (typeof value === "string" && value.trim() === "");
  }
  return value == null;
}

/** Field keys that merge would copy from the duplicate onto the kept row. */
export function fieldsCopiedOnMerge(
  keep: Record<string, unknown>,
  drop: Record<string, unknown>,
  fields: readonly DuplicateMergeField[] = DUPLICATE_MERGE_FIELDS,
): string[] {
  const copied: string[] = [];
  for (const field of fields) {
    const kept = keep[field.key];
    const incoming = drop[field.key];
    if (isEmptyDuplicateValue(kept, field.kind) && !isEmptyDuplicateValue(incoming, field.kind)) {
      copied.push(field.key);
    }
  }
  return copied;
}

export type DuplicateDeleteDecision =
  | { allow: true }
  | { allow: false; code: "has_punches" | "punch_count_mismatch" };

/**
 * Delete is allowed only when the live punch count is zero and the user
 * confirmed that same count. A record with punches must be merged so the
 * punches stay attached to a person.
 */
export function duplicateDeleteDecision(input: {
  punchCount: number;
  confirmedPunchCount: number;
}): DuplicateDeleteDecision {
  if (!Number.isInteger(input.punchCount) || input.punchCount < 0) {
    return { allow: false, code: "punch_count_mismatch" };
  }
  if (input.punchCount > 0) return { allow: false, code: "has_punches" };
  if (!Number.isInteger(input.confirmedPunchCount) || input.confirmedPunchCount !== input.punchCount) {
    return { allow: false, code: "punch_count_mismatch" };
  }
  return { allow: true };
}

export function bothStaffHavePunches(leftPunches: number, rightPunches: number): boolean {
  return leftPunches > 0 && rightPunches > 0;
}

export type DuplicateKeepCandidate = {
  id: string;
  employeeCode: string;
  punchCount: number;
};

/** Prefer the row with attendance history, then a real employee code over a generated stub. */
export function suggestDuplicateKeepId(
  anchor: DuplicateKeepCandidate,
  other: DuplicateKeepCandidate,
): string {
  if (anchor.punchCount !== other.punchCount) {
    return anchor.punchCount > other.punchCount ? anchor.id : other.id;
  }
  const anchorStub = isGeneratedLocationStub(anchor.employeeCode);
  const otherStub = isGeneratedLocationStub(other.employeeCode);
  if (anchorStub !== otherStub) return anchorStub ? other.id : anchor.id;
  return anchor.id;
}
