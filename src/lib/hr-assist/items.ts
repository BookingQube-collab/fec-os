import type { AssistItem, AssistResult } from "./types";

export function takeItems(items: AssistItem[], perTitle = 3, max = 12): AssistItem[] {
  const counts = new Map<string, number>();
  const out: AssistItem[] = [];
  for (const item of items) {
    const seen = counts.get(item.titleKey) ?? 0;
    if (seen >= perTitle) continue;
    counts.set(item.titleKey, seen + 1);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

export function resultFrom(items: AssistItem[]): AssistResult {
  return items.length ? { status: "ok", items } : { status: "empty", items: [] };
}
