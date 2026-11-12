"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
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
  Plus,
  Save,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  autoLayoutFlow,
  defaultNodeData,
  parseIvrFlowJson,
  simulateDigitPath,
  type IvrFlowJson,
  type IvrFlowNode,
  type IvrNodeData,
  type IvrNodeType,
  IVR_NODE_TYPES,
} from "@/lib/call-center/ivr-flow";
import { cn } from "@/lib/utils";

import { ivrNodeTypes } from "./ivr-nodes";

const PALETTE: { type: IvrNodeType; label: string }[] = [
  { type: "start", label: "Start / Greeting" },
  { type: "menu", label: "Menu (DTMF)" },
  { type: "play", label: "Play message" },
  { type: "queue", label: "Route to queue" },
  { type: "agent", label: "Route to agent" },
  { type: "hangup", label: "Hangup" },
  { type: "hours", label: "Business hours" },
  { type: "voicemail", label: "Voicemail" },
  { type: "event", label: "Event route" },
];

function toRfNodes(flow: IvrFlowJson): Node[] {
  return flow.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
  }));
}

function toRfEdges(flow: IvrFlowJson): Edge[] {
  return flow.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    label: e.label,
    animated: false,
    style: { stroke: "var(--foreground)", strokeOpacity: 0.45 },
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
      <div className="flex h-full flex-col justify-center px-4 text-sm text-muted-foreground">
        Select a node to edit its settings.
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
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {type}
          </p>
          <p className="text-sm font-semibold">{data.label}</p>
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
        <div className="space-y-1.5">
          <Label>Greeting / prompt</Label>
          <Textarea
            rows={3}
            disabled={!canEdit}
            value={data.greetingText ?? ""}
            onChange={(e) => patch({ greetingText: e.target.value })}
          />
        </div>
      )}

      {type === "play" && (
        <div className="space-y-1.5">
          <Label>Message text</Label>
          <Textarea
            rows={3}
            disabled={!canEdit}
            value={data.messageText ?? ""}
            onChange={(e) => patch({ messageText: e.target.value })}
          />
        </div>
      )}

      {type === "menu" && (
        <div className="space-y-2">
          <Label>DTMF options</Label>
          {(data.digits ?? []).map((d, idx) => (
            <div key={`${d.digit}-${idx}`} className="flex gap-2">
              <Input
                className="w-14"
                value={d.digit}
                disabled={!canEdit}
                onChange={(e) => {
                  const digits = [...(data.digits ?? [])];
                  digits[idx] = { ...d, digit: e.target.value.slice(0, 1) };
                  patch({ digits });
                }}
              />
              <Input
                className="flex-1"
                value={d.label}
                disabled={!canEdit}
                onChange={(e) => {
                  const digits = [...(data.digits ?? [])];
                  digits[idx] = { ...d, label: e.target.value };
                  patch({ digits });
                }}
              />
              {canEdit ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const digits = (data.digits ?? []).filter((_, i) => i !== idx);
                    patch({ digits });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ))}
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
              <SelectItem value="none">None</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.userId} value={a.userId}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
  onSave,
}: {
  initialFlow: IvrFlowJson;
  queues: QueueOpt[];
  agents: AgentOpt[];
  canEdit: boolean;
  saving: boolean;
  onSave: (flow: IvrFlowJson) => Promise<void>;
}) {
  const { fitView, zoomIn, zoomOut, getViewport, setViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(toRfNodes(initialFlow));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRfEdges(initialFlow));
  const [selected, setSelected] = useState<Node | null>(null);
  const [previewDigits, setPreviewDigits] = useState("");
  const [previewResult, setPreviewResult] = useState("");

  useEffect(() => {
    setNodes(toRfNodes(initialFlow));
    setEdges(toRfEdges(initialFlow));
    if (initialFlow.viewport) {
      void setViewport(initialFlow.viewport);
    } else {
      requestAnimationFrame(() => fitView({ padding: 0.2 }));
    }
  }, [initialFlow, setNodes, setEdges, setViewport, fitView]);

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
            style: { stroke: "var(--foreground)", strokeOpacity: 0.45 },
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
    requestAnimationFrame(() => fitView({ padding: 0.2 }));
  }

  function runPreview() {
    const flow = fromRf(nodes, edges, getViewport());
    const digits = previewDigits.split("").filter((d) => /^[0-9*#]$/.test(d));
    const result = simulateDigitPath(flow, digits);
    setPreviewResult(
      `${result.path.map((p) => p.label).join(" → ") || "(empty)"}\n${result.terminal}`,
    );
  }

  async function handleSave() {
    const flow = fromRf(nodes, edges, getViewport());
    await onSave(flow);
  }

  const selectedSync = useMemo(() => {
    if (!selected) return null;
    return nodes.find((n) => n.id === selected.id) ?? selected;
  }, [nodes, selected]);

  return (
    <div className="flex h-[min(72vh,820px)] min-h-[520px] overflow-hidden rounded-2xl border border-border/50 bg-card">
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
          <Button type="button" size="sm" variant="outline" onClick={() => zoomIn()}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => zoomOut()}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => fitView({ padding: 0.2 })}>
            Fit
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={runAutoLayout}>
            <LayoutGrid className="me-1 h-3.5 w-3.5" />
            Auto-layout
          </Button>
          <div className="ms-auto flex items-center gap-1.5">
            <Input
              className="h-8 w-28"
              placeholder="Digits e.g. 12"
              value={previewDigits}
              onChange={(e) => setPreviewDigits(e.target.value)}
            />
            <Button type="button" size="sm" variant="secondary" onClick={runPreview}>
              Test
            </Button>
          </div>
        </div>

        <div className="absolute inset-0 pt-12">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={canEdit ? onNodesChange : undefined}
            onEdgesChange={canEdit ? onEdgesChange : undefined}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            nodeTypes={ivrNodeTypes}
            fitView
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
            className="bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.04),_transparent_55%)]"
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="rgba(15,23,42,0.12)" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              className="!bg-card !border-border/50"
              maskColor="rgba(15,23,42,0.08)"
            />
          </ReactFlow>
        </div>

        {previewResult ? (
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-sm rounded-lg border border-border/50 bg-card/95 px-3 py-2 text-xs whitespace-pre-wrap shadow-sm">
            {previewResult}
          </div>
        ) : null}
      </div>

      <aside className="w-72 shrink-0 border-s border-border/50 bg-muted/10">
        <div className="border-b border-border/40 px-3 py-2">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Inspector
          </p>
        </div>
        <Inspector
          node={selectedSync}
          queues={queues}
          agents={agents}
          canEdit={canEdit}
          onChange={updateNodeData}
          onDelete={deleteNode}
        />
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
  onSave: (flow: IvrFlowJson) => Promise<void>;
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
