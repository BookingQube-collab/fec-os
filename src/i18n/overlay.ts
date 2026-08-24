export type I18nOverrideRow = {
  locale: string;
  key: string;
  value: string;
};

export function setNestedValue(target: Record<string, unknown>, path: string, value: string) {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

export function overridesToNested(items: I18nOverrideRow[]): Record<string, unknown> {
  const nested: Record<string, unknown> = {};
  for (const item of items) {
    setNestedValue(nested, item.key, item.value);
  }
  return nested;
}

function flattenRecord(input: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof input === "string") {
    if (prefix) out[prefix] = input;
    return out;
  }
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    flattenRecord(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

export function flattenResources(bundle: object | undefined): Record<string, string> {
  return flattenRecord(bundle ?? {});
}

export function normalizeLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
