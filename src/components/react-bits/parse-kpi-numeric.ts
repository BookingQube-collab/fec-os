export interface ParsedKpiNumeric {
  to: number;
  prefix: string;
  suffix: string;
  separator: string;
}

/** Extract a single countable number from KPI display text; null if not animatable. */
export function parseKpiNumeric(value: string | number): ParsedKpiNumeric | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return { to: value, prefix: "", suffix: "", separator: "," };
  }

  const s = value.trim();
  if (!s || s === "—" || s === "-" || s === "–" || s === "N/A") return null;
  // Dates / ISO-ish
  if (/^\d{4}[-/]\d{1,2}/.test(s)) return null;

  const m = s.match(
    /^([^\d+\-]*?)([+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[+-]?\d+(?:\.\d+)?)([^\d]*)$/,
  );
  if (!m) return null;

  const raw = m[2].replace(/,/g, "");
  const to = Number(raw);
  if (!Number.isFinite(to)) return null;

  return {
    to,
    prefix: m[1],
    suffix: m[3],
    separator: m[2].includes(",") ? "," : "",
  };
}
