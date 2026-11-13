import type { CallCenterIvrAction, CallCenterIvrMenu, CallCenterIvrOption } from "./types";
import { CALL_CENTER_VENUE_QUEUE_IDS } from "./types";

export const IVR_FLOW_VERSION = 1 as const;

export const IVR_NODE_TYPES = [
  "start",
  "menu",
  "play",
  "queue",
  "agent",
  "ai",
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
  /** English TTS / prompt (persisted on flow_json). */
  greetingEn?: string;
  /** Arabic TTS / prompt (persisted on flow_json). */
  greetingAr?: string;
  messageEn?: string;
  messageAr?: string;
  digits?: IvrMenuDigit[];
  queueId?: string | null;
  agentUserId?: string | null;
  eventId?: string | null;
  transferSipUri?: string;
  timeoutSeconds?: number;
  maxRetries?: number;
  /** AI Agent node */
  aiEnabled?: boolean;
  aiSystemPrompt?: string;
  aiLanguage?: "en" | "ar" | "auto";
  aiHandoffQueueId?: string | null;
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
        greetingEn: dataRaw.greetingEn != null ? String(dataRaw.greetingEn) : undefined,
        greetingAr: dataRaw.greetingAr != null ? String(dataRaw.greetingAr) : undefined,
        messageEn: dataRaw.messageEn != null ? String(dataRaw.messageEn) : undefined,
        messageAr: dataRaw.messageAr != null ? String(dataRaw.messageAr) : undefined,
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
        aiEnabled: dataRaw.aiEnabled != null ? Boolean(dataRaw.aiEnabled) : undefined,
        aiSystemPrompt:
          dataRaw.aiSystemPrompt != null ? String(dataRaw.aiSystemPrompt) : undefined,
        aiLanguage:
          dataRaw.aiLanguage === "en" || dataRaw.aiLanguage === "ar" || dataRaw.aiLanguage === "auto"
            ? dataRaw.aiLanguage
            : undefined,
        aiHandoffQueueId:
          dataRaw.aiHandoffQueueId != null && dataRaw.aiHandoffQueueId !== ""
            ? String(dataRaw.aiHandoffQueueId)
            : null,
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
      return {
        label: "Start / Greeting",
        greetingText: "Thank you for calling FEC.",
        greetingEn: "Thank you for calling FEC.",
        greetingAr: "شكراً لاتصالك بـ FEC.",
      };
    case "menu":
      return {
        label: "Menu",
        greetingText: "Press 1 for support. Press 2 for events.",
        greetingEn: "Press 1 for support. Press 2 for events.",
        greetingAr: "اضغط 1 للدعم. اضغط 2 للفعاليات.",
        digits: [
          { digit: "1", label: "Option 1" },
          { digit: "2", label: "Option 2" },
        ],
        timeoutSeconds: 10,
        maxRetries: 2,
      };
    case "play":
      return {
        label: "Play message",
        messageText: "Please hold.",
        messageEn: "Please hold.",
        messageAr: "يرجى الانتظار.",
      };
    case "queue":
      return { label: "Route to queue", queueId: null };
    case "agent":
      return { label: "Route to agent", agentUserId: null };
    case "ai":
      return {
        label: "AI Agent",
        aiEnabled: true,
        aiLanguage: "auto",
        aiSystemPrompt:
          "You are the FEC call-center first responder. Greet the caller, answer venue questions, and hand off to a human queue when needed.",
        aiHandoffQueueId: null,
        queueId: null,
      };
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

export type IvrSpeakLang = "en" | "ar";

/** Resolve the spoken prompt for a node (EN/AR with legacy fallbacks). */
export function nodeSpokenText(node: IvrFlowNode, lang: IvrSpeakLang = "en"): string {
  if (lang === "ar") {
    return (
      node.data.greetingAr ||
      node.data.messageAr ||
      node.data.greetingText ||
      node.data.messageText ||
      node.data.label ||
      ""
    );
  }
  return (
    node.data.greetingEn ||
    node.data.messageEn ||
    node.data.greetingText ||
    node.data.messageText ||
    node.data.label ||
    ""
  );
}

export type FecVenueQueueMap = {
  inflatapark: string;
  urbanArena: string;
  kidsDriving: string;
  birthday: string;
};

/**
 * Bilingual Maqsam-style Main menu:
 * Start → Language (1 EN / 2 AR) → Venue menu → queues.
 */
export function buildFecVenuesTemplate(
  queues: FecVenueQueueMap = {
    inflatapark: CALL_CENTER_VENUE_QUEUE_IDS.inflatapark,
    urbanArena: CALL_CENTER_VENUE_QUEUE_IDS.urbanArena,
    kidsDriving: CALL_CENTER_VENUE_QUEUE_IDS.kidsDriving,
    birthday: CALL_CENTER_VENUE_QUEUE_IDS.birthday,
  },
): IvrFlowJson {
  const startId = "node-start";
  const langId = "node-menu-lang";
  const venueEnId = "node-menu-venues-en";
  const venueArId = "node-menu-venues-ar";
  const aiId = "node-ai";

  const venueDefs = [
    {
      digit: "1",
      en: "InflataPark",
      ar: "إنفلاتا بارك",
      queueId: queues.inflatapark,
      qEn: "node-q-inflatapark",
      qAr: "node-q-inflatapark-ar",
    },
    {
      digit: "2",
      en: "Urban Arena",
      ar: "أوربان أرينا",
      queueId: queues.urbanArena,
      qEn: "node-q-urban",
      qAr: "node-q-urban-ar",
    },
    {
      digit: "3",
      en: "Kids Driving School",
      ar: "مدرسة القيادة للأطفال",
      queueId: queues.kidsDriving,
      qEn: "node-q-kids",
      qAr: "node-q-kids-ar",
    },
    {
      digit: "4",
      en: "Birthday enquiry",
      ar: "استفسار أعياد الميلاد",
      queueId: queues.birthday,
      qEn: "node-q-birthday",
      qAr: "node-q-birthday-ar",
    },
  ] as const;

  const langGreetingEn =
    "Thank you for calling FEC. For English, press 1. للعربية، اضغط 2.";
  const langGreetingAr =
    "شكراً لاتصالك بـ FEC. للإنجليزية اضغط 1. للعربية اضغط 2.";
  const venueGreetingEn =
    "Press 1 for InflataPark, 2 for Urban Arena, 3 for Kids Driving School, or 4 for Birthday enquiry.";
  const venueGreetingAr =
    "اضغط 1 لإنفلاتا بارك، 2 لأوربان أرينا، 3 لمدرسة القيادة للأطفال، أو 4 لاستفسار أعياد الميلاد.";

  const nodes: IvrFlowNode[] = [
    {
      id: startId,
      type: "start",
      position: { x: 40, y: 220 },
      data: {
        label: "Start / Greeting",
        greetingText: langGreetingEn,
        greetingEn: langGreetingEn,
        greetingAr: langGreetingAr,
      },
    },
    {
      id: langId,
      type: "menu",
      position: { x: 320, y: 200 },
      data: {
        label: "Language",
        greetingText: langGreetingEn,
        greetingEn: langGreetingEn,
        greetingAr: langGreetingAr,
        digits: [
          { digit: "1", label: "English" },
          { digit: "2", label: "العربية" },
        ],
        timeoutSeconds: 10,
        maxRetries: 2,
      },
    },
    {
      id: venueEnId,
      type: "menu",
      position: { x: 620, y: 40 },
      data: {
        label: "Venues (EN)",
        greetingText: venueGreetingEn,
        greetingEn: venueGreetingEn,
        greetingAr: venueGreetingAr,
        digits: venueDefs.map((v) => ({ digit: v.digit, label: v.en })),
        timeoutSeconds: 12,
        maxRetries: 2,
      },
    },
    {
      id: venueArId,
      type: "menu",
      position: { x: 620, y: 380 },
      data: {
        label: "الأماكن (AR)",
        greetingText: venueGreetingAr,
        greetingEn: venueGreetingEn,
        greetingAr: venueGreetingAr,
        digits: venueDefs.map((v) => ({ digit: v.digit, label: v.ar })),
        timeoutSeconds: 12,
        maxRetries: 2,
      },
    },
    {
      id: aiId,
      type: "ai",
      position: { x: 320, y: 420 },
      data: {
        label: "AI first responder",
        aiEnabled: true,
        aiLanguage: "auto",
        aiSystemPrompt:
          "You are FEC's bilingual phone assistant for InflataPark, Urban Arena, Kids Driving School, and birthday enquiries. Answer briefly, then hand off to the matching queue when the caller needs a human.",
        aiHandoffQueueId: queues.inflatapark,
        queueId: queues.inflatapark,
      },
    },
  ];

  for (const v of venueDefs) {
    nodes.push(
      {
        id: v.qEn,
        type: "queue",
        position: { x: 960, y: 20 + (Number(v.digit) - 1) * 100 },
        data: { label: v.en, queueId: v.queueId },
      },
      {
        id: v.qAr,
        type: "queue",
        position: { x: 960, y: 360 + (Number(v.digit) - 1) * 100 },
        data: { label: v.ar, queueId: v.queueId },
      },
    );
  }

  const edges: IvrFlowEdge[] = [
    { id: "e-start-lang", source: startId, target: langId, sourceHandle: "out", label: "next" },
    { id: "e-lang-en", source: langId, target: venueEnId, sourceHandle: "1", label: "1" },
    { id: "e-lang-ar", source: langId, target: venueArId, sourceHandle: "2", label: "2" },
  ];

  for (const v of venueDefs) {
    edges.push(
      {
        id: `e-en-${v.digit}`,
        source: venueEnId,
        target: v.qEn,
        sourceHandle: v.digit,
        label: v.digit,
      },
      {
        id: `e-ar-${v.digit}`,
        source: venueArId,
        target: v.qAr,
        sourceHandle: v.digit,
        label: v.digit,
      },
    );
  }

  return {
    version: IVR_FLOW_VERSION,
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 0.75 },
  };
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
    case "ai":
      return "ai";
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
      queueId: target.data.queueId ?? target.data.aiHandoffQueueId ?? null,
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

export type IvrPathStep = {
  nodeId: string;
  type: IvrNodeType;
  label: string;
  spokenEn: string;
  spokenAr: string;
  spoken: string;
};

export type IvrPathSimulation = {
  path: IvrPathStep[];
  terminal: string;
  language: IvrSpeakLang;
  queueId: string | null;
  queueLabel: string | null;
  aiAnswered: boolean;
  /** ok = reached a terminal; waiting = stopped on a menu awaiting more digits; invalid = bad digit. */
  status: "ok" | "waiting" | "invalid" | "dead_end";
  /** 1-based position of the rejected digit within the typed path. */
  invalidDigit?: { digit: string; position: number; menuLabel: string };
  /** Digits accepted by the menu the caller is currently on (invalid / waiting). */
  validDigits: Array<{ digit: string; label: string }>;
  /** Digits typed after the path already reached a terminal (not walked). */
  ignoredDigits: string;
};

/** Digits a menu actually routes (wired edge), with labels from the menu config. */
export function menuWiredDigits(
  flow: IvrFlowJson,
  menu: IvrFlowNode,
): Array<{ digit: string; label: string }> {
  const labels = new Map((menu.data.digits ?? []).map((d) => [d.digit, d.label]));
  const seen = new Set<string>();
  const out: Array<{ digit: string; label: string }> = [];
  for (const edge of flow.edges.filter((e) => e.source === menu.id)) {
    const digit = edge.sourceHandle ?? edge.label ?? "";
    if (!/^[0-9*#]$/.test(digit) || seen.has(digit)) continue;
    seen.add(digit);
    out.push({ digit, label: labels.get(digit) || edge.label || digit });
  }
  return out.sort((a, b) => a.digit.localeCompare(b.digit));
}

export function formatValidDigits(valid: Array<{ digit: string; label: string }>): string {
  return valid.map((d) => `${d.digit} (${d.label})`).join(", ");
}

function pushPathStep(
  path: IvrPathStep[],
  node: IvrFlowNode,
  language: IvrSpeakLang,
): void {
  const spokenEn = nodeSpokenText(node, "en");
  const spokenAr = nodeSpokenText(node, "ar");
  path.push({
    nodeId: node.id,
    type: node.type,
    label: node.data.label,
    spokenEn,
    spokenAr,
    spoken: language === "ar" ? spokenAr || spokenEn : spokenEn || spokenAr,
  });
}

/** Simulate digit path for the Test preview toolbar (e.g. `12` = English → Urban Arena). */
export function simulateDigitPath(
  flow: IvrFlowJson,
  digits: string[],
): IvrPathSimulation {
  let node = findStartNode(flow) ?? findEntryInteractiveNode(flow);
  const path: IvrPathStep[] = [];
  let language: IvrSpeakLang = "en";
  if (!node) {
    return {
      path,
      terminal: "Empty flow — add a Start node and a menu first.",
      language,
      queueId: null,
      queueLabel: null,
      aiAnswered: false,
      status: "dead_end",
      validDigits: [],
      ignoredDigits: "",
    };
  }

  // Walk through non-interactive until menu / terminal
  let guard = 0;
  while (node && !["menu", "queue", "agent", "ai", "hangup", "voicemail", "event"].includes(node.type) && guard < 20) {
    pushPathStep(path, node, language);
    if (node.type === "hours") {
      node = followHandleEdge(flow, node.id, "open") ?? followDefaultEdge(flow, node.id);
    } else if (node.type === "play" || node.type === "start") {
      node = followDefaultEdge(flow, node.id);
    } else {
      break;
    }
    guard += 1;
  }

  if (!node) {
    return {
      path,
      terminal: "Dead end — the Start node is not connected to a menu or action.",
      language,
      queueId: null,
      queueLabel: null,
      aiAnswered: false,
      status: "dead_end",
      validDigits: [],
      ignoredDigits: "",
    };
  }
  pushPathStep(path, node, language);

  let digitIndex = 0;
  for (let i = 0; i < digits.length; i += 1) {
    const digit = digits[i]!;
    if (node.type !== "menu") break;
    const next = followDigitEdge(flow, node.id, digit);
    if (!next) {
      const validDigits = menuWiredDigits(flow, node);
      const menuLabel = node.data.label || "menu";
      return {
        path,
        terminal: `Invalid digit ${digit} (digit ${i + 1}) on “${menuLabel}”. ${
          validDigits.length
            ? `Valid here: ${formatValidDigits(validDigits)}.`
            : "This menu has no connected digits."
        }`,
        language,
        queueId: null,
        queueLabel: null,
        aiAnswered: false,
        status: "invalid",
        invalidDigit: { digit, position: i + 1, menuLabel },
        validDigits,
        ignoredDigits: digits.slice(i + 1).join(""),
      };
    }
    // First menu digit on a Language menu flips EN/AR for spoken script.
    if (digitIndex === 0 && /lang|language|لغة/i.test(node.data.label || "")) {
      language = digit === "2" ? "ar" : "en";
    } else if (
      digitIndex === 0 &&
      digit === "2" &&
      (node.data.digits ?? []).some((d) => /arab|عر/i.test(d.label))
    ) {
      language = "ar";
    }
    const prior = path[path.length - 1];
    if (prior && prior.type === "menu") {
      prior.spoken = language === "ar" ? prior.spokenAr || prior.spokenEn : prior.spokenEn || prior.spokenAr;
    }
    node = next;
    pushPathStep(path, node, language);
    digitIndex += 1;

    if (node.type === "play") {
      const afterPlay = followDefaultEdge(flow, node.id);
      if (afterPlay && afterPlay.id !== node.id) {
        node = afterPlay;
        pushPathStep(path, node, language);
      }
    }
    if (["queue", "agent", "ai", "hangup", "voicemail", "event"].includes(node.type)) {
      const queueId = node.data.queueId ?? node.data.aiHandoffQueueId ?? null;
      return {
        path,
        terminal:
          node.type === "ai"
            ? `AI agent answering → ${node.data.label}${queueId ? " (handoff queue linked)" : ""}`
            : node.type === "queue" || node.type === "event"
              ? `Reached queue: ${node.data.label}`
              : `Reached ${node.type}: ${node.data.label}`,
        language,
        queueId,
        queueLabel: node.type === "queue" || node.type === "event" ? node.data.label : null,
        aiAnswered: node.type === "ai",
        status: "ok",
        validDigits: [],
        ignoredDigits: digits.slice(i + 1).join(""),
      };
    }
  }

  if (node.type === "menu") {
    const validDigits = menuWiredDigits(flow, node);
    return {
      path,
      terminal: digits.length
        ? `Waiting at “${node.data.label}” — type the next digit. ${
            validDigits.length ? `Options: ${formatValidDigits(validDigits)}.` : ""
          }`.trim()
        : `Waiting at “${node.data.label}” — type the full path, one digit per menu (e.g. 14). ${
            validDigits.length ? `First menu: ${formatValidDigits(validDigits)}.` : ""
          }`.trim(),
      language,
      queueId: null,
      queueLabel: null,
      aiAnswered: false,
      status: "waiting",
      validDigits,
      ignoredDigits: "",
    };
  }

  return {
    path,
    terminal: `At ${node.type}: ${node.data.label}`,
    language,
    queueId: node.data.queueId ?? null,
    queueLabel: node.type === "queue" ? node.data.label : null,
    aiAnswered: node.type === "ai",
    status: "ok",
    validDigits: [],
    ignoredDigits: "",
  };
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
