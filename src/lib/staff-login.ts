import { z } from "zod";

/** Same password printed by the demo seed scripts. Shown to provisioners after create. */
export const STAFF_LOGIN_DEFAULT_PASSWORD = "Demo@FEC2026!";

/** Least-privileged floor role that can open the employee app. */
export const STAFF_LOGIN_ROLE = "cashier_host" as const;

const emailSchema = z.string().trim().email().max(200);

/**
 * Sign-in is email + password (`signInWithPassword`).
 * Prefer the staff email when it is a real address; otherwise build `{code}@fec.qa`
 * the same way demo staff logins are generated from employee codes.
 */
export function resolveStaffLoginEmail(staffEmail: string | null | undefined, employeeCode: string): string {
  const trimmed = (staffEmail ?? "").trim();
  if (trimmed && emailSchema.safeParse(trimmed).success) {
    return trimmed.toLowerCase();
  }

  const local = employeeCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 64);
  if (!local) {
    throw new Error("Employee needs an email or employee code before a login can be created");
  }

  const generated = `${local}@fec.qa`;
  if (!emailSchema.safeParse(generated).success) {
    throw new Error("Could not build a valid login email from the employee code");
  }
  return generated;
}
