/**
 * Event-hire employee codes: `EVT-{ROLE}{nn}` derived from the event role code.
 * Distinct from venue staff codes (`INF-CC-STF01`) and shared with demo seed prefixes.
 */

/** True for event-hire / event workforce employee codes (`EVT-CRW01`, `EVT-IBR22`, …). */
export function isEventHireEmployeeCode(code: string | null | undefined): boolean {
  return (code ?? "").trim().toUpperCase().startsWith("EVT-");
}

const KNOWN_ROLE_TOKENS: Record<string, string> = {
  crew: "CRW",
  cashier: "CSH",
  labour: "LBR",
  labor: "LBR",
  cleaner: "CLN",
  maintenance: "MNT",
  management: "MGT",
};

/** 3-letter token from an event role code (crew → CRW, custom_role → CUS). */
export function eventRoleCodeToken(roleCode: string | null | undefined): string {
  const key = String(roleCode ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (KNOWN_ROLE_TOKENS[key]) return KNOWN_ROLE_TOKENS[key]!;
  const letters = key.replace(/[^a-z0-9]/g, "").toUpperCase();
  if (letters.length >= 3) return letters.slice(0, 3);
  return (letters || "ROL").padEnd(3, "X");
}

/**
 * Next free `EVT-CRW01`-style code for a role. Mutates `usedCodes` when allocated.
 */
export function generateEventHireEmployeeCode(
  roleCode: string | null | undefined,
  usedCodes: Set<string>,
): string {
  const token = eventRoleCodeToken(roleCode);
  for (let n = 1; n < 10_000; n += 1) {
    const code = `EVT-${token}${String(n).padStart(2, "0")}`;
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
  throw new Error(`Could not allocate event hire code for role ${roleCode || "role"}`);
}

/** Preview / sample illustration only — first free code for the role (does not claim it). */
export function previewEventHireEmployeeCode(
  roleCode: string | null | undefined,
  existing: Iterable<string> = [],
): string {
  const used = new Set(
    [...existing].map((c) => String(c).trim().toUpperCase()).filter(Boolean),
  );
  return generateEventHireEmployeeCode(roleCode, used);
}
