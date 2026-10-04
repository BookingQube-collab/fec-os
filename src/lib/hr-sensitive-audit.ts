import type { Json } from "@/integrations/supabase/types";

const REDACTED = "[redacted]";

/** Values that must not be copied into audit_log. Location managers can read that log. */
const SENSITIVE_AUDIT_KEYS = new Set([
  "qid",
  "passport_number",
  "visa_number",
  "iban",
  "bank_name",
  "wps_employee_id",
  "notes",
]);

function jsonValue(raw: unknown): Json {
  if (raw == null) return null;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return raw;
  return null;
}

export function redactAuditPayload(value: Record<string, unknown> | null | undefined): {
  payload: { [key: string]: Json | undefined };
  fields: string[];
} {
  if (!value) return { payload: {}, fields: [] };
  const payload: { [key: string]: Json | undefined } = {};
  const fields: string[] = [];
  for (const [key, raw] of Object.entries(value)) {
    if (SENSITIVE_AUDIT_KEYS.has(key)) {
      fields.push(key);
      payload[key] = raw == null || raw === "" ? null : REDACTED;
    } else {
      payload[key] = jsonValue(raw);
    }
  }
  return { payload, fields };
}
