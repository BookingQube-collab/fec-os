/** Qatar IDs are typically 8–11 digits. Internal staff codes are never all-digits. */
const QID_SHAPED = /^\d{8,11}$/;

export type EmployeeCodeHint = {
  staffRole?: string | null;
  jobTitle?: string | null;
};

export function isQidShapedCode(value: string | null | undefined): boolean {
  if (value == null) return false;
  return QID_SHAPED.test(String(value).replace(/\s+/g, "").trim());
}

export function isPreservableEmployeeCode(
  value: string | null | undefined,
  qid?: string | null,
): boolean {
  const code = String(value ?? "").trim();
  if (!code) return false;
  if (isQidShapedCode(code)) return false;
  if (qid != null && code === String(qid).replace(/\s+/g, "").trim()) return false;
  return true;
}

export function assertInternalEmployeeCode(code: string, qid?: string | null): string {
  const employee_code = code.trim().toUpperCase();
  if (!employee_code) throw new Error("Employee code is required");
  if (isQidShapedCode(employee_code)) {
    throw new Error("Employee code must be an internal staff code (e.g. INF-CC-STF01), not a QID");
  }
  const qidNorm = qid == null ? null : String(qid).replace(/\s+/g, "").trim();
  if (qidNorm && employee_code === qidNorm) {
    throw new Error("Employee code cannot be the same as QID");
  }
  return employee_code;
}

type RoleKind = "BM" | "CSH" | "TEC" | "STF";

export function roleTokenKind(hint?: EmployeeCodeHint): RoleKind {
  const role = (hint?.staffRole ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const title = (hint?.jobTitle ?? "").toLowerCase();
  if (
    role === "venue_supervisor" ||
    title.includes("branch manager") ||
    title.includes("venue supervisor")
  ) {
    return "BM";
  }
  if (role === "cashier" || title.includes("cashier")) return "CSH";
  if (role === "technician" || title.includes("technician")) return "TEC";
  return "STF";
}

function* tokenSequence(kind: RoleKind): Generator<string> {
  if (kind === "BM") {
    yield "BM";
    yield "VS";
    for (let n = 2; n < 10_000; n += 1) yield `BM${n}`;
    return;
  }
  if (kind === "CSH" || kind === "TEC") {
    yield kind;
    for (let n = 1; n < 10_000; n += 1) yield `${kind}${String(n).padStart(2, "0")}`;
    return;
  }
  for (let n = 1; n < 10_000; n += 1) yield `STF${String(n).padStart(2, "0")}`;
}

/**
 * `{LOCATION_CODE}-{ROLE_TOKEN}` unique across the whole staff table.
 * venue_supervisor / branch manager → BM, then VS, then BM2…
 * cashier → CSH, technician → TEC, default → STF01, STF02…
 */
export function generateEmployeeCode(
  locationCode: string,
  usedCodes: Set<string>,
  hint?: EmployeeCodeHint,
): string {
  const loc = (locationCode || "UNK").trim().toUpperCase() || "UNK";
  const kind = roleTokenKind(hint);
  for (const token of tokenSequence(kind)) {
    const code = `${loc}-${token}`;
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
  throw new Error(`Could not allocate employee code for ${loc}`);
}

/** @deprecated Prefer generateEmployeeCode with a role hint. */
export function generateSyntheticEmployeeCode(
  locationCode: string,
  usedCodes: Set<string>,
): string {
  return generateEmployeeCode(locationCode, usedCodes);
}
