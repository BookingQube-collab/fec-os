/** Distinct saved job titles. First spelling wins when only case differs. */
export function distinctJobTitles(titles: Iterable<string | null | undefined>): string[] {
  const byKey = new Map<string, string>();
  for (const raw of titles) {
    const title = (raw ?? "").replace(/\s+/g, " ").trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, title);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Case-insensitive suggestions. Prefix matches come before other contains matches
 * so "Crew" lists "Crew / Attendant" ahead of a title that only mentions crew later.
 */
export function matchJobTitleSuggestions(
  titles: Iterable<string | null | undefined>,
  query: string,
  limit = 12,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const title of distinctJobTitles(titles)) {
    const lower = title.toLowerCase();
    if (lower.startsWith(q)) prefix.push(title);
    else if (lower.includes(q)) contains.push(title);
  }
  return [...prefix, ...contains].slice(0, limit);
}
