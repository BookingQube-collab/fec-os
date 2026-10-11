/** Allow or refuse a self check-in / check-out before any attendance row is written. */

export type SelfCheckKind = "in" | "out";

export type SelfCheckDenyReason = "not_linked" | "not_enabled" | "already_in" | "already_out" | "need_in";

export type SelfCheckDecision = { allow: true } | { allow: false; reason: SelfCheckDenyReason };

function punchCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * The signed-in person may record a punch only when their profile allows it.
 * Daily attendance uses the first punch as check-in and the last as check-out,
 * so a second check-in, or a check-out before check-in, is refused.
 */
export function decideSelfCheck(input: {
  linked: boolean;
  enabled: boolean;
  kind: SelfCheckKind;
  punchesToday: number;
}): SelfCheckDecision {
  if (!input.linked) return { allow: false, reason: "not_linked" };
  if (!input.enabled) return { allow: false, reason: "not_enabled" };
  const count = punchCount(input.punchesToday);
  if (count >= 2) return { allow: false, reason: "already_out" };
  if (input.kind === "in") {
    if (count >= 1) return { allow: false, reason: "already_in" };
    return { allow: true };
  }
  if (count === 0) return { allow: false, reason: "need_in" };
  return { allow: true };
}

/** Which of the two buttons can be used, given punches already stored today. */
export function selfCheckButtons(punchesToday: number): { checkIn: boolean; checkOut: boolean } {
  const count = punchCount(punchesToday);
  return { checkIn: count === 0, checkOut: count === 1 };
}
