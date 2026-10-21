/**
 * Pure helpers for staff↔login linking. Kept free of server-only so unit tests
 * can cover cache/heal rules without mocking Supabase.
 */

/** Warm-instance reuse for successful lookups (authorize + session + inbox). */
export const LINKED_STAFF_HIT_TTL_MS = 60_000;

/**
 * Never retain a miss across actions. A transient auth.admin blip or brief
 * desync would otherwise paint every consumer "unlinked" for a full minute.
 */
export const LINKED_STAFF_MISS_TTL_MS = 0;

export type LinkedStaffMatchKind = "user_id" | "email" | "employee_code" | "qid" | "name";

export function linkedStaffCacheTtlMs(found: boolean): number {
  return found ? LINKED_STAFF_HIT_TTL_MS : LINKED_STAFF_MISS_TTL_MS;
}

/**
 * Relink staff.user_id only for stable identity keys.
 * Unique-name fallbacks are too weak to write back onto the roster row
 * (Mary's login desync is email / employee_code — never name alone).
 */
export function shouldHealStaffUserId(match: LinkedStaffMatchKind): boolean {
  return match === "email" || match === "employee_code" || match === "qid";
}
