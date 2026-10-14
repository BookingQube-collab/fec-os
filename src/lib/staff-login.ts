import { z } from "zod";

/** Matches `provisionUser`: do not weaken the existing auth password bounds. */
export const STAFF_LOGIN_PASSWORD_MIN = 8;
export const STAFF_LOGIN_PASSWORD_MAX = 128;

/**
 * Short words a person can say over the phone. Two of these plus four digits
 * is the staff-login password (`maple-river-4821`).
 */
const STAFF_LOGIN_PASSWORD_WORDS = [
  "amber",
  "apple",
  "beach",
  "berry",
  "cedar",
  "cloud",
  "coral",
  "daisy",
  "ember",
  "field",
  "flint",
  "frost",
  "grape",
  "harbor",
  "honey",
  "ivory",
  "jade",
  "lemon",
  "maple",
  "meadow",
  "ocean",
  "olive",
  "pearl",
  "pine",
  "river",
  "robin",
  "silver",
  "stone",
  "sunny",
  "tiger",
  "willow",
  "winter",
] as const;

function randomBelow(limit: number): number {
  if (limit <= 1) return 0;
  const max = 0x1_0000_0000;
  const cutoff = max - (max % limit);
  const buf = new Uint32Array(1);
  const random = globalThis.crypto;
  if (!random?.getRandomValues) throw new Error("Secure random is unavailable");
  let value = 0;
  do {
    random.getRandomValues(buf);
    value = buf[0] ?? 0;
  } while (value >= cutoff);
  return value % limit;
}

/** Unique readable password for one new or reset staff login. Not a shared constant. */
export function generateStaffLoginPassword(): string {
  const words = STAFF_LOGIN_PASSWORD_WORDS;
  const first = randomBelow(words.length);
  let second = randomBelow(words.length - 1);
  if (second >= first) second += 1;
  const digits = String(randomBelow(10_000)).padStart(4, "0");
  return `${words[first]}-${words[second]}-${digits}`;
}

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

/** Stored staff email for the org-chart create-login field. Blank when none is saved. */
export function prefillOrgChartLoginEmail(staffEmail: string | null | undefined): string {
  return (staffEmail ?? "").trim();
}

/**
 * Org-chart create-login payload. A login is not created until the chosen email is valid.
 */
export function orgChartCreateLoginRequest(input: {
  staffId: string;
  email: string;
  password: string;
}):
  | { ok: true; staffId: string; email: string; password: string }
  | { ok: false; emailError: boolean; passwordError: boolean } {
  const email = parseStaffLoginEmail(input.email);
  const passwordOk = isStaffLoginPassword(input.password);
  if (!email || !passwordOk) return { ok: false, emailError: !email, passwordError: !passwordOk };
  return { ok: true, staffId: input.staffId, email, password: input.password };
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
