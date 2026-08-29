/** Pure helpers for face enrollment targeting — not identity matching. */

export type FaceEnrollmentTarget =
  | { ok: true; staffId: string; editingOther: boolean }
  | { ok: false; reason: "no_staff" | "forbidden_other" };

/**
 * Resolve which staff row an enrollment applies to.
 * Self-enroll uses the linked staff id; HR may pass another staff id when allowed.
 */
export function resolveFaceEnrollmentTarget(input: {
  linkedStaffId: string | null | undefined;
  requestedStaffId: string | null | undefined;
  canEnrollOthers: boolean;
}): FaceEnrollmentTarget {
  const linked = input.linkedStaffId ?? null;
  const requested = input.requestedStaffId ?? null;
  const staffId = requested ?? linked;
  if (!staffId) return { ok: false, reason: "no_staff" };
  const editingOther = Boolean(requested && requested !== linked);
  if (editingOther && !input.canEnrollOthers) return { ok: false, reason: "forbidden_other" };
  return { ok: true, staffId, editingOther };
}
