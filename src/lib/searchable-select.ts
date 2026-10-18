/** Normalize a picker query the same way header search does (trim + case-fold). */
export function normalizeSearchQuery(query: string): { raw: string; compact: string } {
  const raw = query.trim().toLowerCase();
  return { raw, compact: compactSearchText(raw) };
}

function compactSearchText(value: string): string {
  return value.replace(/[^a-z0-9]+/g, "");
}

/**
 * Match a typed query against option label / code / extra keywords.
 * Compact matching lets "inf cc" hit "INF-CC".
 * Multi-word queries require every token (order-independent), so "ma luz" and
 * "luz ma" both hit "Ma luz Jesus Romeo".
 */
/** Scroll just enough that a fixed-height option row sits inside the list viewport. */
export function scrollTopForIndex(scrollTop: number, index: number, rowHeight: number, viewport: number) {
  const top = Math.max(0, index) * rowHeight;
  if (top < scrollTop) return top;
  if (top + rowHeight > scrollTop + viewport) return Math.max(0, top + rowHeight - viewport);
  return scrollTop;
}

function partMatchesNeedle(value: string, raw: string, compact: string): boolean {
  if (!value) return false;
  if (value.includes(raw)) return true;
  if (compact.length > 0 && compactSearchText(value).includes(compact)) return true;
  return false;
}

export function matchesSearchQuery(query: string, ...parts: Array<string | null | undefined>): boolean {
  const { raw, compact } = normalizeSearchQuery(query);
  if (!raw) return true;
  const values = parts.map((part) => (part ?? "").toLowerCase()).filter(Boolean);
  if (!values.length) return false;
  if (values.some((value) => partMatchesNeedle(value, raw, compact))) return true;

  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  const joined = values.join(" ");
  const joinedCompact = compactSearchText(joined);
  return tokens.every((token) => {
    if (joined.includes(token)) return true;
    const tokenCompact = compactSearchText(token);
    return tokenCompact.length > 0 && joinedCompact.includes(tokenCompact);
  });
}
