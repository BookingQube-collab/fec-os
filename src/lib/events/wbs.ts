import { WBS_MAX_DEPTH, WBS_NODE_TYPES, type WbsNodeType } from "@/lib/events/constants";
import type { EventScheduleVariance, EventWbsNode } from "@/lib/events/types";

export function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function scheduleVariance(
  currentStart: string | null | undefined,
  currentDue: string | null | undefined,
  currentPct: number | null | undefined,
  baselineStart: string | null | undefined,
  baselineDue: string | null | undefined,
  baselinePct: number | null | undefined,
): EventScheduleVariance {
  return {
    startDays: daysBetween(baselineStart, currentStart),
    dueDays: daysBetween(baselineDue, currentDue),
    progressDelta:
      currentPct == null || baselinePct == null ? null : Math.round(currentPct - baselinePct),
  };
}

export function typeForDepth(depth: number): WbsNodeType {
  return WBS_NODE_TYPES[Math.min(Math.max(depth, 0), WBS_MAX_DEPTH)];
}

export function wbsAncestors<T extends { id: string; parent_id: string | null }>(nodes: T[], id: string): T[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: T[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id) ?? null;
  while (cur) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parent_id ? (byId.get(cur.parent_id) ?? null) : null;
  }
  return chain;
}

export function wbsDepth(nodes: Pick<EventWbsNode, "id" | "parent_id">[], id: string) {
  return Math.max(0, wbsAncestors(nodes, id).length - 1);
}

export function descendantIds(nodes: Pick<EventWbsNode, "id" | "parent_id">[], id: string) {
  const out = new Set<string>();
  const walk = (parentId: string) => {
    for (const node of nodes) {
      if (node.parent_id === parentId && !out.has(node.id)) {
        out.add(node.id);
        walk(node.id);
      }
    }
  };
  walk(id);
  return out;
}

export function subtreeHeight(nodes: Pick<EventWbsNode, "id" | "parent_id">[], id: string): number {
  let max = 0;
  for (const node of nodes) {
    if (node.parent_id === id) {
      max = Math.max(max, 1 + subtreeHeight(nodes, node.id));
    }
  }
  return max;
}

export function siblingsOf(nodes: Pick<EventWbsNode, "id" | "parent_id" | "sort_order">[], node: { parent_id: string | null }) {
  return nodes
    .filter((n) => n.parent_id === node.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function wouldCycle(
  nodes: Pick<EventWbsNode, "id" | "parent_id">[],
  nodeId: string,
  newParentId: string | null,
) {
  if (!newParentId) return false;
  if (newParentId === nodeId) return true;
  return descendantIds(nodes, nodeId).has(newParentId);
}

export function canIndent(nodes: Pick<EventWbsNode, "id" | "parent_id" | "sort_order">[], id: string) {
  const node = nodes.find((n) => n.id === id);
  if (!node) return false;
  const sibs = siblingsOf(nodes, node);
  const idx = sibs.findIndex((n) => n.id === id);
  const prev = idx > 0 ? sibs[idx - 1] : null;
  if (!prev) return false;
  const newDepth = wbsDepth(nodes, prev.id) + 1;
  return newDepth + subtreeHeight(nodes, id) <= WBS_MAX_DEPTH;
}

export function canOutdent(nodes: Pick<EventWbsNode, "id" | "parent_id">[], id: string) {
  const node = nodes.find((n) => n.id === id);
  return Boolean(node?.parent_id);
}

export function applyNodeTypes<T extends { id: string; parent_id: string | null; node_type: WbsNodeType }>(
  nodes: T[],
): T[] {
  return nodes.map((node) => ({ ...node, node_type: typeForDepth(wbsDepth(nodes, node.id)) }));
}

export function flattenWbsTree<T extends { id: string; parent_id: string | null; sort_order: number }>(
  nodes: T[],
): Array<T & { depth: number }> {
  const byParent = new Map<string | null, T[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parent_id) ?? [];
    list.push(node);
    byParent.set(node.parent_id, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }
  const out: Array<T & { depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const node of byParent.get(parentId) ?? []) {
      out.push({ ...node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}
