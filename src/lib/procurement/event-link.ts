export function uniqueEventProjectNames(event: {
  name?: string | null;
  event_name?: string | null;
  event_number?: string | null;
}): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of [event.event_number, event.event_name, event.name]) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(value);
  }
  return names;
}

export function eventDisplayName(event: {
  event_number?: string | null;
  event_name?: string | null;
  name?: string | null;
}): string {
  const title = event.event_name?.trim() || event.name?.trim() || "";
  if (event.event_number && title) return `${event.event_number} · ${title}`;
  return event.event_number?.trim() || title || "";
}

export function taskLooksLikeProcurement(title: string | null | undefined): boolean {
  return /\b(pr|prs|requisition|purchase request|طلب شراء)\b/i.test(title ?? "");
}

export function matchTaskToPr<T extends { id: string; pr_number?: string | null }>(
  title: string,
  prs: T[],
): T | null {
  const numbered = title.match(/\b(?:PR|EVT)?[- ]?(\d{4}[- ]?\d{3,})\b/i);
  if (numbered?.[1]) {
    const needle = numbered[1].replace(/\s+/g, "");
    const hit = prs.find((pr) => (pr.pr_number ?? "").replace(/\s+/g, "").includes(needle));
    if (hit) return hit;
  }
  return null;
}
