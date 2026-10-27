/**
 * Pure helpers for one-time self-serve sign-in email changes on /profile.
 */

import { parseStaffLoginEmail } from "@/lib/staff-login";

export type SelfServeLoginEmailPlan =
  | { ok: false; reason: "already_used" | "invalid" | "unchanged" }
  | { ok: true; email: string };

/** Decide whether the user may change their sign-in email once. */
export function planSelfServeLoginEmailChange(input: {
  currentEmail: string | null | undefined;
  nextEmailRaw: string;
  alreadyUsedAt: string | null | undefined;
}): SelfServeLoginEmailPlan {
  if (input.alreadyUsedAt) return { ok: false, reason: "already_used" };

  const email = parseStaffLoginEmail(input.nextEmailRaw);
  if (!email) return { ok: false, reason: "invalid" };

  const current = (input.currentEmail ?? "").trim().toLowerCase();
  if (current && current === email) return { ok: false, reason: "unchanged" };

  return { ok: true, email };
}

/** Map auth/admin errors to a stable client-facing message (no secrets). */
export function selfServeLoginEmailErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "Could not update the sign-in email.";
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  if (code === "email_exists" || /already (?:been )?registered|already exists/i.test(message)) {
    return "A login with this email already exists.";
  }
  if (/invalid.*email|email.*invalid/i.test(message)) {
    return "Enter a valid email address.";
  }
  if (message.trim()) return message.trim();
  return "Could not update the sign-in email.";
}

export function isDuplicateAuthEmailError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return code === "email_exists" || /already (?:been )?registered|already exists/i.test(message);
}
