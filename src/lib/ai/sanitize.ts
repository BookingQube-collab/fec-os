import type { AiErrorKind } from "@/lib/ai/types";

const SECRET_KEY = /^(api[_-]?key|encrypted_api_key|authorization|password|secret|token|credential|bearer)$/i;
const SECRET_IN_STRING =
  /(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{10,}|gsk_[A-Za-z0-9_-]{8,}|or-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/-]+=*)/gi;

const KIND_MESSAGES: Record<AiErrorKind, string> = {
  auth: "Authentication failed. The API key may be invalid or revoked.",
  rate_limit: "The provider rate-limited this request. Try again later or switch providers.",
  timeout: "The provider timed out. The request was not completed.",
  unavailable_model: "The selected model is unavailable or retired.",
  server: "The provider returned a server error.",
  invalid: "The request was rejected by the provider.",
  unknown: "The provider request failed.",
};

export function classifyProviderStatus(status: number, bodyText = ""): AiErrorKind {
  const lower = bodyText.toLowerCase();
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  if (
    status === 404 &&
    /(model|not found|unknown model|does not exist|retired)/i.test(bodyText)
  ) {
    return "unavailable_model";
  }
  if (/(invalid[_ ]api[_ ]key|incorrect api key|unauthorized|permission_denied)/i.test(lower)) {
    return "auth";
  }
  if (/(model[_ ]not[_ ]found|unknown model|retired|not available)/i.test(lower)) {
    return "unavailable_model";
  }
  if (status >= 500) return "server";
  if (status >= 400) return "invalid";
  return "unknown";
}

export function sanitizeProviderError(raw: unknown, kind?: AiErrorKind): string {
  const resolved = kind ?? inferKindFromUnknown(raw);
  const base = KIND_MESSAGES[resolved];
  const extra = extractSafeHint(raw);
  return extra ? `${base} ${extra}` : base;
}

function inferKindFromUnknown(raw: unknown): AiErrorKind {
  if (raw instanceof Error) {
    const msg = raw.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("aborted")) return "timeout";
    if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized")) return "auth";
    if (msg.includes("429")) return "rate_limit";
  }
  return "unknown";
}

function extractSafeHint(raw: unknown): string {
  let text = "";
  if (typeof raw === "string") text = raw;
  else if (raw instanceof Error) text = raw.message;
  else if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    if (typeof rec.message === "string") text = rec.message;
    else if (typeof rec.error === "string") text = rec.error;
  }
  text = redactSecrets(text).replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length > 160) text = `${text.slice(0, 157)}…`;
  if (/https?:\/\/|api[_-]?key|token|secret/i.test(text) && !/model|rate|timeout|unavailable/i.test(text)) {
    return "";
  }
  return text;
}

export function redactSecrets(value: string): string {
  return value.replace(SECRET_IN_STRING, "[redacted]");
}

export function stripSecrets<T>(value: T): T {
  return stripSecretsInner(value, 0) as T;
}

function stripSecretsInner(value: unknown, depth: number): unknown {
  if (depth > 8 || value == null) return value;
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map((item) => stripSecretsInner(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key) || /encrypted_api_key/i.test(key)) continue;
      out[key] = stripSecretsInner(nested, depth + 1);
    }
    return out;
  }
  return value;
}

export function canFallback(kind: AiErrorKind): boolean {
  return kind === "timeout" || kind === "rate_limit" || kind === "server" || kind === "unavailable_model";
}

export function isAuthFailure(kind: AiErrorKind): boolean {
  return kind === "auth";
}

export function buildAuditAfter(payload: Record<string, unknown>): Record<string, unknown> {
  return stripSecrets(payload);
}
