/** Qatar IDs are typically 8–11 digits. Internal staff codes are never all-digits. */
const QID_SHAPED = /^\d{8,11}$/;

export function isQidShapedCode(value) {
  if (value == null) return false;
  return QID_SHAPED.test(String(value).replace(/\s+/g, "").trim());
}

export function isPreservableEmployeeCode(value, qid) {
  const code = String(value ?? "").trim();
  if (!code) return false;
  if (isQidShapedCode(code)) return false;
  if (qid != null && code === String(qid).replace(/\s+/g, "").trim()) return false;
  return true;
}

export function roleTokenKind(hint = {}) {
  const role = String(hint.staffRole ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const title = String(hint.jobTitle ?? "").toLowerCase();
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

function* tokenSequence(kind) {
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

export function generateEmployeeCode(locationCode, usedCodes, hint) {
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
