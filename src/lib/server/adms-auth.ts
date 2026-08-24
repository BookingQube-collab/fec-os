import { getRequestSourceIp } from "@/lib/attendance-ingest-log";

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
  return queryKey;
}

export function validateAdmsIp(request: Request): AdmsAuthFailure | null {
  const allow = process.env.ADMS_IP_ALLOWLIST?.trim();
  if (!allow) return null;
  const ip = getRequestSourceIp(request);
  const allowed = allow.split(",").map((s) => s.trim()).filter(Boolean);
  if (ip && allowed.includes(ip)) return null;
  return { status: 403, body: "AUTH_ERROR", reason: "ip_not_allowed" };
}

export function validateAdmsCommKey(request: Request, queryKey: string | null): AdmsAuthFailure | null {
  const expected = expectedCommKey();
  if (!expected) return null;
  const got = extractAdmsCommKey(request, queryKey);
  if (got && got === expected) return null;
  return { status: 403, body: "AUTH_ERROR", reason: "bad_comm_key" };
}

export function admsCommKeyConfigured(): boolean {
  return Boolean(expectedCommKey());
}
