import type { CallCenterIvrAction, CallCenterIvrMenu, CallCenterIvrOption } from "./types";

export const IVR_FLOW_VERSION = 1 as const;

export const IVR_NODE_TYPES = [
  "start",
  "menu",
  "play",
  "queue",
  "agent",
  "hangup",
  "hours",
  "voicemail",
  "event",
] as const;

export type IvrNodeType = (typeof IVR_NODE_TYPES)[number];

export type IvrMenuDigit = {
  digit: string;
  label: string;
};

export type IvrNodeData = {
  label: string;
  greetingText?: string;
  messageText?: string;
  digits?: IvrMenuDigit[];
  queueId?: string | null;
  agentUserId?: string | null;
  eventId?: string | null;
  transferSipUri?: string;
  timeoutSeconds?: number;
  maxRetries?: number;
};

export type IvrFlowNode = {
  id: string;
  type: IvrNodeType;
  position: { x: number; y: number };
  data: IvrNodeData;
};

export type IvrFlowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
};

export type IvrFlowViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type IvrFlowJson = {
  version: typeof IVR_FLOW_VERSION;
  nodes: IvrFlowNode[];
  edges: IvrFlowEdge[];
  viewport?: IvrFlowViewport;
};

export type FlattenedIvrOption = {
  digit: string;
  label: string;
  action: CallCenterIvrAction;
  queueId: string | null;
  eventId: string | null;
  transferSipUri: string;
  agentUserId: string | null;
  nextMenuId: string | null;
  targetNodeId: string;
  sortOrder: number;
};

const EMPTY_FLOW: IvrFlowJson = {
  version: IVR_FLOW_VERSION,
  nodes: [],
  edges: [],
};

export function isIvrNodeType(value: unknown): value is IvrNodeType {
  return typeof value === "string" && (IVR_NODE_TYPES as readonly string[]).includes(value);
}

export function parseIvrFlowJson(raw: unknown): IvrFlowJson {
  if (!raw || typeof raw !== "object") return { ...EMPTY_FLOW };
  const obj = raw as Record<string, unknown>;
  const nodesRaw = Array.isArray(obj.nodes) ? obj.nodes : [];
  const edgesRaw = Array.isArray(obj.edges) ? obj.edges : [];
  const nodes: IvrFlowNode[] = [];
  for (const n of nodesRaw) {
    if (!n || typeof n !== "object") continue;
    const row = n as Record<string, unknown>;
    const id = String(row.id ?? "");
    const type = row.type;
    if (!id || !isIvrNodeType(type)) continue;
    const pos = (row.position as { x?: number; y?: number } | undefined) ?? {};
    const dataRaw = (row.data as Record<string, unknown> | undefined) ?? {};
    const digitsRaw = Array.isArray(dataRaw.digits) ? dataRaw.digits : undefined;
    nodes.push({
      id,
      type,
      position: { x: Number(pos.x ?? 0), y: Number(pos.y ?? 0) },
      data: {
        label: String(dataRaw.label ?? type),
        greetingText: dataRaw.greetingText != null ? String(dataRaw.greetingText) : undefined,
        messageText: dataRaw.messageText != null ? String(dataRaw.messageText) : undefined,
        digits: digitsRaw
          ?.filter((d): d is Record<string, unknown> => Boolean(d) && typeof d === "object")
          .map((d) => ({
            digit: String(d.digit ?? "").slice(0, 1),
            label: String(d.label ?? ""),
          }))
          .filter((d) => /^[0-9*#]$/.test(d.digit)),
        queueId: dataRaw.queueId != null && dataRaw.queueId !== "" ? String(dataRaw.queueId) : null,
        agentUserId:
          dataRaw.agentUserId != null && dataRaw.agentUserId !== ""
            ? String(dataRaw.agentUserId)
            : null,
        eventId: dataRaw.eventId != null && dataRaw.eventId !== "" ? String(dataRaw.eventId) : null,
        transferSipUri: dataRaw.transferSipUri != null ? String(dataRaw.transferSipUri) : undefined,
        timeoutSeconds:
          dataRaw.timeoutSeconds != null ? Number(dataRaw.timeoutSeconds) : undefined,
        maxRetries: dataRaw.maxRetries != null ? Number(dataRaw.maxRetries) : undefined,
      },
    });
  }
  const edges: IvrFlowEdge[] = edgesRaw
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map((e) => ({
      id: String(e.id ?? `${e.source}-${e.target}`),
      source: String(e.source ?? ""),
      target: String(e.target ?? ""),
      sourceHandle: e.sourceHandle != null ? String(e.sourceHandle) : null,
      targetHandle: e.targetHandle != null ? String(e.targetHandle) : null,
      label: e.label != null ? String(e.label) : undefined,
    }))
    .filter((e) => e.source && e.target);

  const viewportRaw = obj.viewport as IvrFlowViewport | undefined;
  const viewport =
    viewportRaw && typeof viewportRaw === "object"
      ? {
          x: Number(viewportRaw.x ?? 0),
          y: Number(viewportRaw.y ?? 0),
          zoom: Number(viewportRaw.zoom ?? 1),
        }
      : undefined;

  return {
    version: IVR_FLOW_VERSION,
    nodes,
    edges,
    viewport,
  };
}

export function flowHasGraph(flow: IvrFlowJson | null | undefined): boolean {
  return Boolean(flow && flow.nodes.length > 0);
}

export function defaultNodeData(type: IvrNodeType): IvrNodeData {
  switch (type) {
    case "start":
      return { label: "Start / Greeting", greetingText: "Thank you for calling." };
    case "menu":
      return {
        label: "Menu",
        greetingText: "Press 1 for support. Press 2 for events.",
        digits: [
          { digit: "1", label: "Option 1" },
          { digit: "2", label: "Option 2" },
        ],
        timeoutSeconds: 10,
        maxRetries: 2,
      };
    case "play":
      return { label: "Play message", messageText: "Please hold." };
    case "queue":
      return { label: "Route to queue", queueId: null };
    case "agent":
      return { label: "Route to agent", agentUserId: null };
    case "hangup":
      return { label: "Hangup" };
    case "hours":
      return { label: "Business hours" };
    case "voicemail":
      return { label: "Voicemail" };
    case "event":
      return { label: "Event route", eventId: null, queueId: null };
    default:
      return { label: type };
  }
}

/** Build a canvas graph from existing menu + digit options (first-load migration). */
export function buildFlowFromMenuAndOptions(
  menu: CallCenterIvrMenu,
  options: CallCenterIvrOption[],
): IvrFlowJson {
  const startId = "node-start";
  const menuId = "node-menu";
  const nodes: IvrFlowNode[] = [
    {
      id: startId,
      type: "start",
      position: { x: 80, y: 180 },
      data: {
        label: "Start / Greeting",
        greetingText: menu.greetingText || "Thank you for calling.",
      },
    },
    {
      id: menuId,
      type: "menu",
      position: { x: 360, y: 160 },
      data: {
        label: menu.name || "Main menu",
        greetingText: menu.greetingText,
        digits: options
          .filter((o) => o.action !== "repeat")
          .map((o) => ({ digit: o.digit, label: o.label || o.action })),
        timeoutSeconds: menu.timeoutSeconds,
        maxRetries: menu.maxRetries,
        queueId: menu.fallbackQueueId,
      },
    },
  ];
  const edges: IvrFlowEdge[] = [
    {
      id: "e-start-menu",
      source: startId,
      target: menuId,
      sourceHandle: "out",
      label: "next",
    },
  ];

  let col = 0;
  for (const opt of options) {
    if (opt.action === "repeat") {
      edges.push({
        id: `e-${opt.digit}-repeat`,
        source: menuId,
        target: menuId,
        sourceHandle: opt.digit,
        label: opt.digit,
      });
      continue;
    }
    const nodeId = `node-${opt.digit}-${opt.action}`;
    const x = 680;
    const y = 40 + col * 120;
    col += 1;

    if (opt.action === "queue") {
      nodes.push({
        id: nodeId,
        type: "queue",
        position: { x, y },
        data: {
          label: opt.label || "Queue",
          queueId: opt.queueId,
          eventId: opt.eventId,
        },
      });
    } else if (opt.action === "hangup") {
      nodes.push({
        id: nodeId,
        type: "hangup",
        position: { x, y },
        data: { label: opt.label || "Hangup" },
      });
    } else if (opt.action === "voicemail") {
      nodes.push({
        id: nodeId,
        type: "voicemail",
        position: { x, y },
        data: { label: opt.label || "Voicemail", eventId: opt.eventId },
      });
    } else if (opt.action === "agent") {
      nodes.push({
        id: nodeId,
        type: "agent",
        position: { x, y },
        data: {
          label: opt.label || "Agent",
          agentUserId: (opt as CallCenterIvrOption & { agentUserId?: string | null }).agentUserId ?? null,
        },
      });
    } else if (opt.action === "transfer_sip") {
      nodes.push({
        id: nodeId,
        type: "queue",
        position: { x, y },
        data: {
          label: opt.label || "SIP transfer",
          transferSipUri: opt.transferSipUri,
          queueId: opt.queueId,
        },
      });
    } else if (opt.action === "menu") {
      nodes.push({
        id: nodeId,
        type: "menu",
        position: { x, y },
        data: {
          label: opt.label || "Sub-menu",
          digits: [
            { digit: "1", label: "Option 1" },
            { digit: "2", label: "Option 2" },
          ],
        },
      });
    } else {
      continue;
    }

    edges.push({
      id: `e-${menuId}-${opt.digit}`,
      source: menuId,
      target: nodeId,
      sourceHandle: opt.digit,
      label: opt.digit,
    });
  }

  return {
    version: IVR_FLOW_VERSION,
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 0.9 },
  };
}

export function findStartNode(flow: IvrFlowJson): IvrFlowNode | null {
  return flow.nodes.find((n) => n.type === "start") ?? flow.nodes[0] ?? null;
}

export function findEntryInteractiveNode(flow: IvrFlowJson): IvrFlowNode | null {
  const start = findStartNode(flow);
  if (!start) return null;
  if (start.type === "menu" || start.type === "hours") return start;
  const next = followDefaultEdge(flow, start.id);
  return next;
}

export function followDefaultEdge(flow: IvrFlowJson, sourceId: string): IvrFlowNode | null {
  const edge =
    flow.edges.find((e) => e.source === sourceId && (e.sourceHandle === "out" || !e.sourceHandle)) ??
    flow.edges.find((e) => e.source === sourceId);
  if (!edge) return null;
  return flow.nodes.find((n) => n.id === edge.target) ?? null;
}

export function followDigitEdge(
  flow: IvrFlowJson,
  sourceId: string,
  digit: string,
): IvrFlowNode | null {
  const edge = flow.edges.find(
    (e) => e.source === sourceId && (e.sourceHandle === digit || e.label === digit),
  );
  if (!edge) return null;
  return flow.nodes.find((n) => n.id === edge.target) ?? null;
}

export function followHandleEdge(
  flow: IvrFlowJson,
  sourceId: string,
  handle: string,
): IvrFlowNode | null {
  const edge = flow.edges.find((e) => e.source === sourceId && e.sourceHandle === handle);
  if (!edge) return null;
  return flow.nodes.find((n) => n.id === edge.target) ?? null;
}

export function nodeActionFromType(type: IvrNodeType): CallCenterIvrAction | null {
  switch (type) {
    case "queue":
    case "event":
      return "queue";
    case "voicemail":
      return "voicemail";
    case "hangup":
      return "hangup";
    case "agent":
      return "agent";
    case "menu":
      return "menu";
    default:
      return null;
  }
}

/** Flatten top-level menu digit edges into options rows for runtime + DID tooling. */
export function flattenFlowToOptions(
  flow: IvrFlowJson,
  menuRecordId: string,
): FlattenedIvrOption[] {
  const entry = findEntryInteractiveNode(flow);
  if (!entry || entry.type !== "menu") {
    // If entry is hours, try open branch menu
    if (entry?.type === "hours") {
      const openNode = followHandleEdge(flow, entry.id, "open");
      if (openNode?.type === "menu") {
        return flattenMenuNode(flow, openNode);
      }
    }
    return [];
  }
  void menuRecordId;
  return flattenMenuNode(flow, entry);
}

function flattenMenuNode(flow: IvrFlowJson, menuNode: IvrFlowNode): FlattenedIvrOption[] {
  const digits = menuNode.data.digits ?? [];
  const out: FlattenedIvrOption[] = [];
  const used = new Set<string>();

  for (const d of digits) {
    if (used.has(d.digit)) continue;
    used.add(d.digit);
    const target = followDigitEdge(flow, menuNode.id, d.digit);
    if (!target) {
      // Self-loop / unset → repeat
      out.push({
        digit: d.digit,
        label: d.label || "Unset",
        action: "repeat",
        queueId: null,
        eventId: null,
        transferSipUri: "",
        agentUserId: null,
        nextMenuId: null,
        targetNodeId: "",
        sortOrder: Number(d.digit) || 0,
      });
      continue;
    }

    if (target.id === menuNode.id) {
      out.push({
        digit: d.digit,
        label: d.label || "Repeat",
        action: "repeat",
        queueId: null,
        eventId: null,
        transferSipUri: "",
        agentUserId: null,
        nextMenuId: null,
        targetNodeId: target.id,
        sortOrder: Number(d.digit) || 0,
      });
      continue;
    }

    const action = nodeActionFromType(target.type) ?? "queue";
    out.push({
      digit: d.digit,
      label: d.label || target.data.label || action,
      action: action === "menu" ? "menu" : action,
      queueId: target.data.queueId ?? null,
      eventId: target.data.eventId ?? null,
      transferSipUri: target.data.transferSipUri ?? "",
      agentUserId: target.data.agentUserId ?? null,
      nextMenuId: null,
      targetNodeId: target.id,
      sortOrder: Number(d.digit) || 0,
    });
  }

  // Digits that have edges but aren't listed in digits config
  for (const edge of flow.edges.filter((e) => e.source === menuNode.id && e.sourceHandle)) {
    const digit = edge.sourceHandle!;
    if (!/^[0-9*#]$/.test(digit) || used.has(digit)) continue;
    used.add(digit);
    const target = flow.nodes.find((n) => n.id === edge.target);
    if (!target) continue;
    const action = nodeActionFromType(target.type) ?? "queue";
    out.push({
      digit,
      label: edge.label || target.data.label || action,
      action: target.id === menuNode.id ? "repeat" : action,
      queueId: target.data.queueId ?? null,
      eventId: target.data.eventId ?? null,
      transferSipUri: target.data.transferSipUri ?? "",
      agentUserId: target.data.agentUserId ?? null,
      nextMenuId: null,
      targetNodeId: target.id,
      sortOrder: Number(digit) || 0,
    });
  }

  return out.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Simulate digit path for the Test preview toolbar. */
export function simulateDigitPath(
  flow: IvrFlowJson,
  digits: string[],
): { path: Array<{ nodeId: string; type: IvrNodeType; label: string }>; terminal: string } {
  let node = findEntryInteractiveNode(flow) ?? findStartNode(flow);
  const path: Array<{ nodeId: string; type: IvrNodeType; label: string }> = [];
  if (!node) return { path, terminal: "Empty flow" };

  // Walk through non-interactive until menu
  let guard = 0;
  while (node && node.type !== "menu" && guard < 20) {
    path.push({ nodeId: node.id, type: node.type, label: node.data.label });
    if (node.type === "hours") {
      node = followHandleEdge(flow, node.id, "open") ?? followDefaultEdge(flow, node.id);
    } else if (node.type === "play" || node.type === "start") {
      node = followDefaultEdge(flow, node.id);
    } else {
      break;
    }
    guard += 1;
  }

  if (!node) return { path, terminal: "Dead end" };
  path.push({ nodeId: node.id, type: node.type, label: node.data.label });

  for (const digit of digits) {
    if (node.type !== "menu") break;
    const next = followDigitEdge(flow, node.id, digit);
    if (!next) return { path, terminal: `Invalid digit ${digit}` };
    node = next;
    path.push({ nodeId: node.id, type: node.type, label: node.data.label });
    if (node.type === "play") {
      node = followDefaultEdge(flow, node.id) ?? node;
      if (node.id !== next.id) {
        path.push({ nodeId: node.id, type: node.type, label: node.data.label });
      }
    }
    if (["queue", "agent", "hangup", "voicemail", "event"].includes(node.type)) {
      return { path, terminal: `Reached ${node.type}: ${node.data.label}` };
    }
  }

  return { path, terminal: `At ${node.type}: ${node.data.label}` };
}

export function autoLayoutFlow(flow: IvrFlowJson): IvrFlowJson {
  const start = findStartNode(flow);
  if (!start) return flow;
  const visited = new Set<string>();
  const levels = new Map<string, number>();
  const queue = [{ id: start.id, level: 0 }];
  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur.id)) continue;
    visited.add(cur.id);
    levels.set(cur.id, cur.level);
    for (const edge of flow.edges.filter((e) => e.source === cur.id)) {
      if (!visited.has(edge.target)) queue.push({ id: edge.target, level: cur.level + 1 });
    }
  }
  const byLevel = new Map<number, string[]>();
  for (const [id, level] of levels) {
    const list = byLevel.get(level) ?? [];
    list.push(id);
    byLevel.set(level, list);
  }
  const nodes = flow.nodes.map((n) => {
    const level = levels.get(n.id);
    if (level == null) return n;
    const siblings = byLevel.get(level) ?? [n.id];
    const index = siblings.indexOf(n.id);
    return {
      ...n,
      position: { x: 80 + level * 280, y: 60 + index * 130 },
    };
  });
  return { ...flow, nodes };
}
