import { getRequestSourceIp } from "@/lib/attendance-ingest-log";
import { secretsEqual } from "@/lib/server/secret-equal";

export type AdmsAuthFailure = {
  status: number;
  body: string;
  reason: string;
};

function expectedCommKey(): string | null {
  const key = process.env.ADMS_COMM_KEY?.trim();
  return key || null;
}

export function extractAdmsCommKey(request: Request, queryKey: string | null): string | null {
  const header =
    request.headers.get("x-adms-key") ??
    request.headers.get("x-api-key") ??
    "";
  const fromHeader = header.trim();
  if (fromHeader) return fromHeader;
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const fromQuery = queryKey?.trim() ?? "";
  return fromQuery || null;
}

export function validateAdmsIp(request: Request): AdmsAuthFailure | null {
  const allow = process.env.ADMS_IP_ALLOWLIST?.trim();
  if (!allow) return null;
  const ip = getRequestSourceIp(request);
  const allowed = allow.split(",").map((s) => s.trim()).filter(Boolean);
  if (ip && allowed.includes(ip)) return null;
  return { status: 403, body: "AUTH_ERROR", reason: "ip_not_allowed" };
}

/**
 * Key check only. A terminal that sends no key is allowed here, whether or not
 * ADMS_COMM_KEY is set. Callers must still reject an unregistered serial.
 * A key the device does send must match ADMS_COMM_KEY when that variable is set
 * (trimmed, case-sensitive). When the server key is unset, a sent key is not
 * rejected — these menus have no Server Auth field to type it into.
 */
export function validateAdmsCommKey(request: Request, queryKey: string | null): AdmsAuthFailure | null {
  const expected = expectedCommKey();
  const got = extractAdmsCommKey(request, queryKey);
  if (got && expected && !secretsEqual(got, expected)) {
    return { status: 403, body: "AUTH_ERROR", reason: "bad_comm_key" };
  }
  return null;
}

export function admsCommKeyConfigured(): boolean {
  return Boolean(expectedCommKey());
}

/** Operator-facing reason stored on the device. Does not include the key. */
export function admsAuthFailureMessage(reason: string): string {
  if (reason === "bad_comm_key") {
    return "Device comm key was rejected. Punches are not saved until it matches ADMS_COMM_KEY.";
  }
  if (reason === "ip_not_allowed") {
    return "Device IP is not on ADMS_IP_ALLOWLIST, so punches are rejected.";
  }
  return "ADMS request was rejected before punches could be saved.";
}
