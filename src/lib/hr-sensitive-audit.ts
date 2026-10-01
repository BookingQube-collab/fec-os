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

export function redactAuditPayload(value: Record<string, unknown> | null | undefined): {
  payload: Record<string, unknown>;
  fields: string[];
} {
  if (!value) return { payload: {}, fields: [] };
  const payload: Record<string, unknown> = {};
  const fields: string[] = [];
  for (const [key, raw] of Object.entries(value)) {
    if (SENSITIVE_AUDIT_KEYS.has(key)) {
      fields.push(key);
      payload[key] = raw == null || raw === "" ? null : REDACTED;
    } else {
      payload[key] = raw;
    }
  }
  return { payload, fields };
}
