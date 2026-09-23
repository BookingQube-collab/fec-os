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
 */
/** Scroll just enough that a fixed-height option row sits inside the list viewport. */
export function scrollTopForIndex(scrollTop: number, index: number, rowHeight: number, viewport: number) {
  const top = Math.max(0, index) * rowHeight;
  if (top < scrollTop) return top;
  if (top + rowHeight > scrollTop + viewport) return Math.max(0, top + rowHeight - viewport);
  return scrollTop;
}

export function matchesSearchQuery(query: string, ...parts: Array<string | null | undefined>): boolean {
  const { raw, compact } = normalizeSearchQuery(query);
  if (!raw) return true;
  return parts.some((part) => {
    const value = (part ?? "").toLowerCase();
    if (!value) return false;
    return value.includes(raw) || (compact.length > 0 && compactSearchText(value).includes(compact));
  });
}
