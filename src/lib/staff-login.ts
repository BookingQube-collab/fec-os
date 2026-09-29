import { z } from "zod";

/** Same password printed by the demo seed scripts. Shown to provisioners after create. */
export const STAFF_LOGIN_DEFAULT_PASSWORD = "Demo@FEC2026!";

/** Matches `provisionUser`: do not weaken the existing auth password bounds. */
export const STAFF_LOGIN_PASSWORD_MIN = 8;
export const STAFF_LOGIN_PASSWORD_MAX = 128;

/** Least-privileged floor role that can open the employee app. */
export const STAFF_LOGIN_ROLE = "cashier_host" as const;

const LOGIN_EMAIL_DOMAIN = "fec.qa";
const MAX_LOGIN_EMAIL_ATTEMPTS = 20;

const emailSchema = z.string().trim().email().max(200);
const passwordSchema = z.string().min(STAFF_LOGIN_PASSWORD_MIN).max(STAFF_LOGIN_PASSWORD_MAX);

/**
 * Lowercase, turn spaces and other separators into dots, drop empty edges.
 * Same shape as the employee-code login emails (`E3 1001` → `e3.1001`).
 */
export function normalizeLoginLocalPart(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 64);
}

function toLoginEmail(local: string): string | null {
  const trimmed = local.replace(/^\.+|\.+$/g, "").slice(0, 64);
  if (!trimmed) return null;
  const email = `${trimmed}@${LOGIN_EMAIL_DOMAIN}`;
  return emailSchema.safeParse(email).success ? email : null;
}

function withNumericSuffix(base: string, n: number): string {
  const suffix = String(n);
  const room = Math.max(1, 64 - suffix.length);
  return `${base.slice(0, room)}${suffix}`.slice(0, 64);
}

function pushEmail(emails: string[], local: string, limit: number) {
  if (emails.length >= limit) return;
  const email = toLoginEmail(local);
  if (!email || emails.includes(email)) return;
  emails.push(email);
}

/**
 * Name-based sign-in emails, in the order we try them:
 * `Sarah Oxel` → `sarah@fec.qa`, then `sarah.oxel@fec.qa`, then `sarah.oxel2@fec.qa`.
 * A single name skips the combined form and suffixes the first name (`sarah2@fec.qa`).
 */
export function staffLoginEmailCandidates(fullName: string, limit = MAX_LOGIN_EMAIL_ATTEMPTS): string[] {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .map((part) => normalizeLoginLocalPart(part))
    .filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
  const combined = first && last ? normalizeLoginLocalPart(`${first}.${last}`) : "";
  const base = combined || first;
  const emails: string[] = [];
  if (first) pushEmail(emails, first, limit);
  if (combined && combined !== first) pushEmail(emails, combined, limit);
  if (base) {
    for (let n = 2; emails.length < limit && n <= limit + 2; n += 1) {
      pushEmail(emails, withNumericSuffix(base, n), limit);
    }
  }
  return emails;
}

/** Employee-code emails, used when the name cannot produce a local part. */
export function staffLoginCodeEmails(employeeCode: string, limit = MAX_LOGIN_EMAIL_ATTEMPTS): string[] {
  const local = normalizeLoginLocalPart(employeeCode);
  if (!local) return [];
  const emails: string[] = [];
  pushEmail(emails, local, limit);
  for (let n = 2; emails.length < limit && n <= limit + 2; n += 1) {
    pushEmail(emails, withNumericSuffix(local, n), limit);
  }
  return emails;
}

export function pickStaffLoginEmail(candidates: readonly string[], takenEmails: Iterable<string>): string | null {
  const taken = new Set([...takenEmails].map((email) => email.trim().toLowerCase()).filter(Boolean));
  return candidates.find((email) => !taken.has(email)) ?? null;
}

/** Name candidates, then employee-code candidates. `fromEmail` skips anything earlier in that list. */
export function chooseStaffLoginEmail(input: {
  fullName: string;
  employeeCode: string;
  takenEmails: Iterable<string>;
  fromEmail?: string | null;
}): string | null {
  const emails = staffLoginEmailCandidates(input.fullName);
  for (const email of staffLoginCodeEmails(input.employeeCode)) {
    if (!emails.includes(email)) emails.push(email);
  }
  const from = input.fromEmail?.trim().toLowerCase() ?? "";
  const start = from ? emails.indexOf(from) : 0;
  const slice = start > 0 ? emails.slice(start) : emails;
  return pickStaffLoginEmail(slice, input.takenEmails);
}

export function isStaffLoginPassword(value: string): boolean {
  return passwordSchema.safeParse(value).success;
}

export function parseStaffLoginEmail(value: string): string | null {
  const parsed = emailSchema.safeParse(value);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

export type ResolveStaffLoginEmailOptions = {
  fullName?: string | null;
  takenEmails?: Iterable<string>;
};

/**
 * Sign-in is email + password (`signInWithPassword`).
 * Prefer the staff email when it is a real address.
 * Otherwise build `{first}@fec.qa`, then `{first}.{last}@fec.qa`, then a numeric suffix.
 * Employee code is only the fallback when the name has no usable letters.
 */
export function resolveStaffLoginEmail(
  staffEmail: string | null | undefined,
  employeeCode: string,
  options?: ResolveStaffLoginEmailOptions,
): string {
  const trimmed = (staffEmail ?? "").trim();
  if (trimmed && emailSchema.safeParse(trimmed).success) {
    return trimmed.toLowerCase();
  }

  const taken = options?.takenEmails ?? [];
  const name = options?.fullName?.trim() ?? "";
  if (name) {
    const fromName = pickStaffLoginEmail(staffLoginEmailCandidates(name), taken);
    if (fromName) return fromName;
  }

  const fromCode = pickStaffLoginEmail(staffLoginCodeEmails(employeeCode), taken);
  if (fromCode) return fromCode;

  if (!normalizeLoginLocalPart(employeeCode)) {
    throw new Error("Employee needs an email or employee code before a login can be created");
  }
  throw new Error(
    name
      ? "Could not build a unique login email from the employee name"
      : "Could not build a valid login email from the employee code",
  );
}
