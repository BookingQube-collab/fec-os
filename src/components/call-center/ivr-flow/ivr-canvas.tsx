"use client";

import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  LayoutGrid,
  Phone,
  PhoneOff,
  Plus,
  Save,
  Trash2,
  Volume2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { FecButton as Button } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  autoLayoutFlow,
  defaultNodeData,
  formatValidDigits,
  parseIvrFlowJson,
  simulateDigitPath,
  type IvrFlowJson,
  type IvrFlowNode,
  type IvrNodeData,
  type IvrNodeType,
  type IvrPathSimulation,
  IVR_NODE_TYPES,
} from "@/lib/call-center/ivr-flow";
import {
  playIvrVoicePreview,
  playIvrVoicePreviewSequence,
  resolveIvrPreviewLang,
  stopIvrVoicePreview,
  unlockIvrAudio,
  type IvrPreviewLang,
} from "@/lib/call-center/ivr-voice-preview";
import { cn } from "@/lib/utils";

import { ivrNodeTypes } from "./ivr-nodes";

const PALETTE: { type: IvrNodeType; label: string }[] = [
  { type: "start", label: "Start / Greeting" },
  { type: "menu", label: "Menu (DTMF)" },
  { type: "play", label: "Play message" },
  { type: "queue", label: "Route to queue" },
  { type: "agent", label: "Route to agent" },
  { type: "ai", label: "AI Agent" },
  { type: "hangup", label: "Hangup" },
  { type: "hours", label: "Business hours" },
  { type: "voicemail", label: "Voicemail" },
  { type: "event", label: "Event route" },
];

function ListenButton({
  text,
  lang,
  label = "Listen",
}: {
  text: string;
  lang: IvrPreviewLang;
  label?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        const result = playIvrVoicePreview(text, lang);
        if (!result.ok) toast.error(result.error);
      }}
    >
      <Volume2 className="me-1 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

function toRfNodes(flow: IvrFlowJson): Node[] {
  return flow.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
  }));
}

const EDGE_BASE = {
  type: "smoothstep" as const,
  animated: false,
  style: { stroke: "var(--foreground)", strokeOpacity: 0.28, strokeWidth: 1.5 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: "color-mix(in oklab, var(--foreground) 45%, transparent)",
  },
};

function toRfEdges(flow: IvrFlowJson): Edge[] {
  return flow.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    label: e.label,
    ...EDGE_BASE,
  }));
}

function fromRf(nodes: Node[], edges: Edge[], viewport?: Viewport): IvrFlowJson {
  return parseIvrFlowJson({
    version: 1,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      label: typeof e.label === "string" ? e.label : e.sourceHandle || undefined,
    })),
    viewport: viewport
      ? { x: viewport.x, y: viewport.y, zoom: viewport.zoom }
      : undefined,
  });
}

function newNodeId(type: IvrNodeType): string {
  return `node-${type}-${Math.random().toString(36).slice(2, 9)}`;
}

type QueueOpt = { id: string; name: string };
type AgentOpt = { userId: string; label: string };

function Inspector({
  node,
  queues,
  agents,
  canEdit,
  onChange,
  onDelete,
}: {
  node: Node | null;
  queues: QueueOpt[];
  agents: AgentOpt[];
  canEdit: boolean;
  onChange: (id: string, data: IvrNodeData) => void;
  onDelete: (id: string) => void;
}) {
  if (!node) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 px-5 py-6">
        <p className="text-sm font-semibold text-foreground">Select a step to edit</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Click a node on the canvas to edit greetings, DTMF options, audio, and routing. Use
          Auto-layout if the flow looks crowded.
        </p>
      </div>
    );
  }
  // Capture after null guard — nested handlers must not close over `node: T | null`.
  const selectedNode: Node = node;
  const data = selectedNode.data as unknown as IvrNodeData;
  const type = selectedNode.type as IvrNodeType;
  const nodeId = selectedNode.id;

  function patch(partial: Partial<IvrNodeData>) {
    onChange(nodeId, { ...data, ...partial });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {type}
          </p>
          <p className="truncate text-sm font-semibold">{data.label}</p>
        </div>
        {canEdit ? (
          <Button type="button" size="icon" variant="ghost" onClick={() => onDelete(nodeId)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>Label</Label>
        <Input
          value={data.label}
          disabled={!canEdit}
          onChange={(e) => patch({ label: e.target.value })}
        />
      </div>

      {(type === "start" || type === "menu") && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Greeting (English)</Label>
              <ListenButton
                text={data.greetingEn || data.greetingText || ""}
                lang="en"
              />
            </div>
            <Textarea
              rows={5}
              className="min-h-[7.5rem] resize-y text-sm leading-relaxed"
              disabled={!canEdit}
              value={data.greetingEn ?? data.greetingText ?? ""}
              onChange={(e) =>
                patch({
                  greetingEn: e.target.value,
                  greetingText: e.target.value,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Greeting (Arabic)</Label>
              <ListenButton text={data.greetingAr || ""} lang="ar" />
            </div>
            <Textarea
              rows={5}
              className="min-h-[7.5rem] resize-y text-sm leading-relaxed"
              dir="rtl"
              disabled={!canEdit}
              value={data.greetingAr ?? ""}
              onChange={(e) => patch({ greetingAr: e.target.value })}
              placeholder="النص بالعربية…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Audio clip URL</Label>
            <Input
              disabled={!canEdit}
              value={data.audioUrl ?? ""}
              onChange={(e) => patch({ audioUrl: e.target.value.trim() })}
              placeholder="https://…/prompt.mp3"
            />
            <p className="text-[0.7rem] text-muted-foreground">
              Optional. When set, Call Control prefers this clip over TTS text.
            </p>
          </div>
        </div>
      )}

      {type === "play" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Message (English)</Label>
              <ListenButton text={data.messageEn || data.messageText || ""} lang="en" />
            </div>
            <Textarea
              rows={5}
              className="min-h-[7.5rem] resize-y text-sm leading-relaxed"
              disabled={!canEdit}
              value={data.messageEn ?? data.messageText ?? ""}
              onChange={(e) =>
                patch({
                  messageEn: e.target.value,
                  messageText: e.target.value,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Message (Arabic)</Label>
              <ListenButton text={data.messageAr || ""} lang="ar" />
            </div>
            <Textarea
              rows={5}
              className="min-h-[7.5rem] resize-y text-sm leading-relaxed"
              dir="rtl"
              disabled={!canEdit}
              value={data.messageAr ?? ""}
              onChange={(e) => patch({ messageAr: e.target.value })}
              placeholder="النص بالعربية…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Audio clip URL</Label>
            <Input
              disabled={!canEdit}
              value={data.audioUrl ?? ""}
              onChange={(e) => patch({ audioUrl: e.target.value.trim() })}
              placeholder="https://…/prompt.mp3"
            />
          </div>
        </div>
      )}

      {type === "menu" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>DTMF options</Label>
            <p className="text-[0.7rem] text-muted-foreground">
              Digit key + spoken label. Connect each digit handle on the canvas to the next step.
            </p>
          </div>
          <div className="space-y-2">
            {(data.digits ?? []).map((d, idx) => (
              <div
                key={`${d.digit}-${idx}`}
                className="rounded-lg border border-border/50 bg-background/60 p-2.5"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Label className="text-[0.7rem] text-muted-foreground">Digit {idx + 1}</Label>
                  {canEdit ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        const digits = (data.digits ?? []).filter((_, i) => i !== idx);
                        patch({ digits });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Input
                    className="w-14 shrink-0 text-center font-semibold"
                    value={d.digit}
                    disabled={!canEdit}
                    aria-label={`DTMF digit ${idx + 1}`}
                    onChange={(e) => {
                      const digits = [...(data.digits ?? [])];
                      digits[idx] = { ...d, digit: e.target.value.slice(0, 1) };
                      patch({ digits });
                    }}
                  />
                  <Input
                    className="min-w-0 flex-1"
                    value={d.label}
                    disabled={!canEdit}
                    aria-label={`DTMF label ${idx + 1}`}
                    onChange={(e) => {
                      const digits = [...(data.digits ?? [])];
                      digits[idx] = { ...d, label: e.target.value };
                      patch({ digits });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const used = new Set((data.digits ?? []).map((x) => x.digit));
                const next = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*", "#"].find(
                  (d) => !used.has(d),
                );
                if (!next) return;
                patch({
                  digits: [...(data.digits ?? []), { digit: next, label: `Option ${next}` }],
                });
              }}
            >
              <Plus className="me-1 h-3.5 w-3.5" />
              Add digit
            </Button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Timeout (s)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                disabled={!canEdit}
                value={data.timeoutSeconds ?? 10}
                onChange={(e) => patch({ timeoutSeconds: Number(e.target.value) || 10 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Retries</Label>
              <Input
                type="number"
                min={0}
                max={5}
                disabled={!canEdit}
                value={data.maxRetries ?? 2}
                onChange={(e) => patch({ maxRetries: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>
      )}

      {(type === "queue" || type === "event") && (
        <div className="space-y-1.5">
          <Label>Queue</Label>
          <Select
            value={data.queueId || "none"}
            disabled={!canEdit}
            onValueChange={(v) => patch({ queueId: v === "none" ? null : v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {queues.map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  {q.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {type === "agent" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Agent</Label>
            <Select
              value={data.agentUserId || "none"}
              disabled={!canEdit}
              onValueChange={(v) => patch({ agentUserId: v === "none" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any available (use queue)</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.userId} value={a.userId}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!data.agentUserId ? (
            <div className="space-y-1.5">
              <Label>Fallback queue</Label>
              <Select
                value={data.queueId || "none"}
                disabled={!canEdit}
                onValueChange={(v) => patch({ queueId: v === "none" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ring this queue" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {queues.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[0.7rem] text-muted-foreground">
                When no specific agent is set, offers the call to available members of this queue.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {type === "ai" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>Enable AI answer</Label>
              <p className="text-xs text-muted-foreground">First responder on this node</p>
            </div>
            <Switch
              checked={data.aiEnabled !== false}
              disabled={!canEdit}
              onCheckedChange={(v) => patch({ aiEnabled: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Select
              value={data.aiLanguage || "auto"}
              disabled={!canEdit}
              onValueChange={(v) =>
                patch({ aiLanguage: v as "en" | "ar" | "auto" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (from IVR path)</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">Arabic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>System prompt</Label>
            <Textarea
              rows={4}
              disabled={!canEdit}
              value={data.aiSystemPrompt ?? ""}
              onChange={(e) => patch({ aiSystemPrompt: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Handoff queue on fail</Label>
            <Select
              value={data.aiHandoffQueueId || data.queueId || "none"}
              disabled={!canEdit}
              onValueChange={(v) =>
                patch({
                  aiHandoffQueueId: v === "none" ? null : v,
                  queueId: v === "none" ? null : v,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {queues.map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Global flags live on{" "}
            <Link href="/call-center/ai" className="underline underline-offset-2">
              Call Center → AI
            </Link>
            . Reaching this node sets CDR metadata <code>ai_answered</code> (LiveKit Agents
            handoff is stubbed until Agents is deployed).
          </p>
        </div>
      )}

      {(type === "event" || type === "queue" || type === "voicemail") && (
        <div className="space-y-1.5">
          <Label>Event id</Label>
          <Input
            disabled={!canEdit}
            value={data.eventId ?? ""}
            placeholder="UUID (optional)"
            onChange={(e) => patch({ eventId: e.target.value || null })}
          />
        </div>
      )}

      {type === "queue" && (
        <div className="space-y-1.5">
          <Label>Transfer SIP URI (optional)</Label>
          <Input
            disabled={!canEdit}
            value={data.transferSipUri ?? ""}
            onChange={(e) => patch({ transferSipUri: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

function CanvasInner({
  initialFlow,
  queues,
  agents,
  canEdit,
  saving,
  applyingTemplate,
  onSave,
  onApplyVenuesTemplate,
}: {
  initialFlow: IvrFlowJson;
  queues: QueueOpt[];
  agents: AgentOpt[];
  canEdit: boolean;
  saving: boolean;
  applyingTemplate?: boolean;
  onSave: (flow: IvrFlowJson) => Promise<void>;
  onApplyVenuesTemplate?: () => Promise<void>;
}) {
  const { fitView, zoomIn, zoomOut, getViewport, setViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(toRfNodes(initialFlow));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRfEdges(initialFlow));
  const [selected, setSelected] = useState<Node | null>(null);
  const [previewDigits, setPreviewDigits] = useState("");
  const [preview, setPreview] = useState<IvrPathSimulation | null>(null);
  const [liveActive, setLiveActive] = useState(false);
  const spokenLenRef = useRef(0);

  useEffect(() => {
    setNodes(toRfNodes(initialFlow));
    setEdges(toRfEdges(initialFlow));
    setLiveActive(false);
    setPreview(null);
    setPreviewDigits("");
    spokenLenRef.current = 0;
    if (initialFlow.viewport) {
      void setViewport(initialFlow.viewport);
    } else {
      requestAnimationFrame(() => fitView({ padding: 0.28, maxZoom: 1 }));
    }
  }, [initialFlow, setNodes, setEdges, setViewport, fitView]);

  useEffect(() => () => stopIvrVoicePreview(), []);

  useEffect(() => {
    const onVoiceError = (event: Event) => {
      const error = (event as CustomEvent<{ error?: string }>).detail?.error;
      if (error) toast.error(error);
    };
    const onVoiceInfo = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      if (message) toast.message(message);
    };
    window.addEventListener("ivr-voice-preview-error", onVoiceError);
    window.addEventListener("ivr-voice-preview-info", onVoiceInfo);
    return () => {
      window.removeEventListener("ivr-voice-preview-error", onVoiceError);
      window.removeEventListener("ivr-voice-preview-info", onVoiceInfo);
    };
  }, []);

  // Highlight the live call path on the canvas.
  useEffect(() => {
    if (!preview?.path.length) {
      setNodes((ns) =>
        ns.map((n) => ({
          ...n,
          className: undefined,
          style: { ...(n.style ?? {}), outline: "none", outlineOffset: "0" },
        })),
      );
      return;
    }
    const activeId = preview.path[preview.path.length - 1]?.nodeId;
    const visited = new Set(preview.path.map((p) => p.nodeId));
    setNodes((ns) =>
      ns.map((n) => {
        const isActive = n.id === activeId;
        const isVisited = visited.has(n.id);
        return {
          ...n,
          className: isActive ? "ivr-live-active" : isVisited ? "ivr-live-visited" : undefined,
          style: {
            ...(n.style ?? {}),
            outline: isActive
              ? "2px solid var(--fec-star)"
              : isVisited
                ? "1px solid color-mix(in oklab, var(--fec-star) 55%, transparent)"
                : "none",
            outlineOffset: isActive || isVisited ? "3px" : "0",
          },
        };
      }),
    );
  }, [preview, setNodes]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!canEdit) return;
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: `e-${connection.source}-${connection.sourceHandle ?? "out"}-${connection.target}`,
            label: connection.sourceHandle && /^[0-9*#]$/.test(connection.sourceHandle)
              ? connection.sourceHandle
              : undefined,
            ...EDGE_BASE,
          },
          eds,
        ),
      );
    },
    [canEdit, setEdges],
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelected(params.nodes[0] ?? null);
  }, []);

  function addNode(type: IvrNodeType) {
    if (!canEdit) return;
    if (type === "start" && nodes.some((n) => n.type === "start")) {
      toast.error("Only one Start node is allowed.");
      return;
    }
    const id = newNodeId(type);
    const node: Node = {
      id,
      type,
      position: { x: 120 + nodes.length * 24, y: 80 + (nodes.length % 5) * 40 },
      data: defaultNodeData(type),
    };
    setNodes((ns) => [...ns, node]);
    setSelected(node);
  }

  function updateNodeData(id: string, data: IvrNodeData) {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data } : n)));
    setSelected((cur) => (cur && cur.id === id ? { ...cur, data } : cur));
  }

  function deleteNode(id: string) {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelected(null);
  }

  function runAutoLayout() {
    const flow = autoLayoutFlow(fromRf(nodes, edges, getViewport()));
    setNodes(toRfNodes(flow));
    setEdges(toRfEdges(flow));
    requestAnimationFrame(() => fitView({ padding: 0.28, maxZoom: 1 }));
  }

  function spokenPartsFrom(
    result: IvrPathSimulation,
    fromIndex = 0,
  ): Array<{ text: string; lang: IvrPreviewLang }> {
    const parts: Array<{ text: string; lang: IvrPreviewLang }> = [];
    for (let i = fromIndex; i < result.path.length; i += 1) {
      const step = result.path[i]!;
      if (!["start", "menu", "play", "ai"].includes(step.type)) continue;
      // Prefer the language-specific script after EN/AR selection.
      const text = (
        result.language === "ar"
          ? step.spokenAr || step.spoken || step.spokenEn
          : step.spokenEn || step.spoken || step.spokenAr
      ).trim();
      if (!text || parts[parts.length - 1]?.text === text) continue;
      parts.push({ text, lang: resolveIvrPreviewLang(text, result.language) });
    }
    return parts;
  }

  function runSimulation(digitsRaw: string): IvrPathSimulation {
    const flow = fromRf(nodes, edges, getViewport());
    const digits = digitsRaw.split("").filter((d) => /^[0-9*#]$/.test(d));
    const result = simulateDigitPath(flow, digits);
    setPreview(result);
    return result;
  }

  function speakSimulation(result: IvrPathSimulation, fromIndex = 0) {
    const parts = spokenPartsFrom(result, fromIndex);
    if (!parts.length) return;
    const played = playIvrVoicePreviewSequence(parts);
    if (!played.ok) toast.error(played.error);
  }

  function startLiveCall() {
    unlockIvrAudio();
    stopIvrVoicePreview();
    spokenLenRef.current = 0;
    setPreviewDigits("");
    setLiveActive(true);
    const result = runSimulation("");
    speakSimulation(result, 0);
    spokenLenRef.current = result.path.length;
    if (result.status === "dead_end") {
      toast.error(result.terminal);
      setLiveActive(false);
      return;
    }
    toast.message("Live IVR test started — press digits like a caller.");
  }

  function endLiveCall() {
    stopIvrVoicePreview();
    setLiveActive(false);
    setPreviewDigits("");
    setPreview(null);
    spokenLenRef.current = 0;
  }

  function pressLiveDigit(digit: string) {
    if (!/^[0-9*#]$/.test(digit)) return;
    unlockIvrAudio();

    let baseDigits = previewDigits;
    let from = spokenLenRef.current;

    if (!liveActive) {
      stopIvrVoicePreview();
      spokenLenRef.current = 0;
      baseDigits = "";
      setLiveActive(true);
      const greeting = runSimulation("");
      speakSimulation(greeting, 0);
      from = greeting.path.length;
      spokenLenRef.current = from;
      if (greeting.status === "dead_end") {
        toast.error(greeting.terminal);
        setLiveActive(false);
        return;
      }
    }

    const next = `${baseDigits}${digit}`;
    const result = runSimulation(next);

    if (result.status === "invalid") {
      toast.error(result.terminal);
      // Drop the bad digit and restore the waiting menu so the caller can retry.
      setPreviewDigits(baseDigits);
      runSimulation(baseDigits);
      return;
    }

    setPreviewDigits(next);
    speakSimulation(result, from);
    spokenLenRef.current = result.path.length;

    if (result.status === "ok") {
      toast.success(result.terminal);
      setLiveActive(false);
    }
  }

  const pressLiveDigitRef = useRef(pressLiveDigit);
  const endLiveCallRef = useRef(endLiveCall);
  pressLiveDigitRef.current = pressLiveDigit;
  endLiveCallRef.current = endLiveCall;

  // Phone-style keypad while a live test is running.
  useEffect(() => {
    if (!liveActive) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape") {
        endLiveCallRef.current();
        return;
      }
      if (/^[0-9*#]$/.test(e.key)) {
        e.preventDefault();
        pressLiveDigitRef.current(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [liveActive]);

  /** One-shot: run a full typed path (e.g. 111) and speak the whole script. */
  function runFullPathTest() {
    stopIvrVoicePreview();
    setLiveActive(false);
    const result = runSimulation(previewDigits);
    spokenLenRef.current = result.path.length;
    if (result.status === "invalid" || result.status === "dead_end") {
      toast.error(result.terminal);
      return;
    }
    speakSimulation(result, 0);
    if (result.status === "waiting") {
      toast.message(result.terminal);
      setLiveActive(true);
      return;
    }
    toast.success(result.terminal);
  }

  function listenPreviewPath() {
    const result = runSimulation(previewDigits);
    spokenLenRef.current = result.path.length;
    speakSimulation(result, 0);
    if (result.status === "invalid") toast.error(result.terminal);
  }

  async function handleSave() {
    const flow = fromRf(nodes, edges, getViewport());
    await onSave(flow);
  }

  const selectedSync = useMemo(() => {
    if (!selected) return null;
    return nodes.find((n) => n.id === selected.id) ?? selected;
  }, [nodes, selected]);

  const displayEdges = useMemo(() => {
    const selectedId = selectedSync?.id ?? null;
    const previewEdgeKeys = new Set<string>();
    if (preview?.path && preview.path.length > 1) {
      for (let i = 0; i < preview.path.length - 1; i += 1) {
        const from = preview.path[i]?.nodeId;
        const to = preview.path[i + 1]?.nodeId;
        if (from && to) previewEdgeKeys.add(`${from}->${to}`);
      }
    }

    return edges.map((e) => {
      const connectedToSelection =
        !!selectedId && (e.source === selectedId || e.target === selectedId);
      const onPreviewPath = previewEdgeKeys.has(`${e.source}->${e.target}`);
      const emphasize = connectedToSelection || onPreviewPath;

      if (!selectedId && previewEdgeKeys.size === 0) {
        return {
          ...e,
          type: "smoothstep" as const,
          animated: false,
          style: { stroke: "var(--foreground)", strokeOpacity: 0.28, strokeWidth: 1.5 },
          markerEnd: EDGE_BASE.markerEnd,
          zIndex: 0,
        };
      }

      return {
        ...e,
        type: "smoothstep" as const,
        animated: emphasize && connectedToSelection,
        style: {
          stroke: emphasize ? "var(--fec-star)" : "var(--foreground)",
          strokeOpacity: emphasize ? 0.92 : 0.1,
          strokeWidth: emphasize ? 2.5 : 1.25,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: emphasize ? 16 : 12,
          height: emphasize ? 16 : 12,
          color: emphasize
            ? "var(--fec-star)"
            : "color-mix(in oklab, var(--foreground) 25%, transparent)",
        },
        zIndex: emphasize ? 20 : 0,
      };
    });
  }, [edges, selectedSync?.id, preview]);

  return (
    <div className="flex h-[min(78vh,920px)] min-h-[560px] overflow-hidden rounded-2xl border border-border/50 bg-card">
      <aside className="flex w-48 shrink-0 flex-col border-e border-border/50 bg-muted/20">
        <div className="border-b border-border/40 px-3 py-2">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Steps
          </p>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {PALETTE.map((item) => (
            <button
              key={item.type}
              type="button"
              disabled={!canEdit}
              onClick={() => addNode(item.type)}
              className={cn(
                "flex w-full items-center rounded-lg border border-transparent px-2 py-1.5 text-left text-xs font-medium text-foreground/90 transition-colors",
                canEdit
                  ? "hover:border-border hover:bg-background"
                  : "cursor-not-allowed opacity-60",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </aside>

      <div className="relative min-w-0 flex-1">
        <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border/40 bg-card/90 px-3 py-2 backdrop-blur">
          {canEdit ? (
            <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
              <Save className="me-1 h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save flow"}
            </Button>
          ) : null}
          {canEdit && onApplyVenuesTemplate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={applyingTemplate || saving}
              onClick={() => void onApplyVenuesTemplate()}
            >
              {applyingTemplate ? "Applying…" : "Apply E3 IVR template"}
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={() => zoomIn()}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => zoomOut()}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fitView({ padding: 0.28, maxZoom: 1 })}
          >
            Fit
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={runAutoLayout}>
            <LayoutGrid className="me-1 h-3.5 w-3.5" />
            Auto-layout
          </Button>
          <div className="ms-auto flex flex-wrap items-center gap-1.5">
            <Input
              className="h-8 w-28"
              inputMode="numeric"
              aria-label="Digit path to test"
              placeholder="Path e.g. 111"
              title="Optional: type the full digit path then press Listen, or start a live call and use the keypad."
              value={previewDigits}
              disabled={liveActive}
              onChange={(e) => setPreviewDigits(e.target.value.replace(/[^0-9*#]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") runFullPathTest();
              }}
            />
            {liveActive ? (
              <Button type="button" size="sm" variant="destructive" onClick={endLiveCall}>
                <PhoneOff className="me-1 h-3.5 w-3.5" />
                End test
              </Button>
            ) : (
              <Button type="button" size="sm" variant="secondary" onClick={startLiveCall}>
                <Phone className="me-1 h-3.5 w-3.5" />
                Test
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={liveActive}
              onClick={listenPreviewPath}
            >
              <Volume2 className="me-1 h-3.5 w-3.5" />
              Listen
            </Button>
          </div>
        </div>

        <div className="absolute inset-0 pt-12">
          <ReactFlow
            nodes={nodes}
            edges={displayEdges}
            onNodesChange={canEdit ? onNodesChange : undefined}
            onEdgesChange={canEdit ? onEdgesChange : undefined}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            nodeTypes={ivrNodeTypes}
            fitView
            fitViewOptions={{ padding: 0.28, maxZoom: 1 }}
            minZoom={0.15}
            maxZoom={1.75}
            defaultEdgeOptions={EDGE_BASE}
            connectionLineType={ConnectionLineType.SmoothStep}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable
            selectNodesOnDrag={false}
            panOnScroll
            zoomOnDoubleClick
            proOptions={{ hideAttribution: true }}
            className="bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.04),_transparent_55%)]"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(15,23,42,0.1)" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              className="!bg-card !border-border/50"
              maskColor="rgba(15,23,42,0.08)"
            />
          </ReactFlow>
        </div>

        {liveActive || preview ? (
          <div className="absolute bottom-3 left-3 z-10 flex max-w-lg flex-col gap-2 rounded-lg border border-border/50 bg-card/95 px-3 py-2 text-xs shadow-sm">
            {liveActive ? (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">
                    Live IVR test
                    {previewDigits ? (
                      <span className="ms-1 font-mono text-muted-foreground">· {previewDigits}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    Press digits like a caller. Prompts play as you move through the flow.
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-1">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="h-8 w-8 rounded-md border border-border/60 bg-background font-mono text-sm font-semibold hover:bg-muted"
                      onClick={() => pressLiveDigit(d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {preview ? (
              <>
                <p className="font-semibold text-foreground">
                  Path ({preview.language.toUpperCase()}):{" "}
                  {preview.path.map((p) => p.label).join(" → ") || "(empty)"}
                </p>
                <p
                  className={cn(
                    preview.status === "invalid" || preview.status === "dead_end"
                      ? "font-medium text-destructive"
                      : preview.status === "waiting"
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-muted-foreground",
                  )}
                >
                  {preview.terminal}
                </p>
                {preview.status === "waiting" && preview.validDigits.length > 0 ? (
                  <p className="text-muted-foreground">
                    Options: {formatValidDigits(preview.validDigits)}
                  </p>
                ) : null}
                {preview.ignoredDigits ? (
                  <p className="text-muted-foreground">
                    Ignored extra digits: {preview.ignoredDigits}
                  </p>
                ) : null}
                {preview.queueLabel || preview.queueId ? (
                  <p className="text-muted-foreground">
                    Queue: {preview.queueLabel || preview.queueId}
                  </p>
                ) : null}
                {preview.aiAnswered ? (
                  <p className="text-muted-foreground">CDR flag: ai_answered</p>
                ) : null}
                <div className="space-y-1 border-t border-border/40 pt-2">
                  <p className="font-medium text-foreground/90">Spoken script</p>
                  {preview.path
                    .filter(
                      (p, i, all) =>
                        ["start", "menu", "play", "ai"].includes(p.type) &&
                        p.spoken &&
                        !(i > 0 && all[i - 1]?.spoken === p.spoken && all[i - 1]?.type === "start"),
                    )
                    .map((p) => (
                      <p key={`${p.nodeId}-script`} className="text-muted-foreground">
                        <span className="font-medium text-foreground/80">{p.label}:</span> {p.spoken}
                      </p>
                    ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <aside className="flex w-[22rem] shrink-0 flex-col border-s border-border/50 bg-muted/10">
        <div className="shrink-0 border-b border-border/40 px-3 py-2">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Inspector
          </p>
        </div>
        <div className="min-h-0 flex-1">
          <Inspector
            node={selectedSync}
            queues={queues}
            agents={agents}
            canEdit={canEdit}
            onChange={updateNodeData}
            onDelete={deleteNode}
          />
        </div>
      </aside>
    </div>
  );
}

export function IvrFlowCanvas(props: {
  initialFlow: IvrFlowJson;
  queues: QueueOpt[];
  agents: AgentOpt[];
  canEdit: boolean;
  saving: boolean;
  applyingTemplate?: boolean;
  onSave: (flow: IvrFlowJson) => Promise<void>;
  onApplyVenuesTemplate?: () => Promise<void>;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

export function ensureFlowNodes(flow: IvrFlowJson): IvrFlowNode[] {
  return flow.nodes.filter((n) => IVR_NODE_TYPES.includes(n.type));
}
