"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Clock3,
  Headphones,
  MessageSquareText,
  PhoneForwarded,
  PhoneOff,
  Play,
  Radio,
  Route,
  Voicemail,
} from "lucide-react";

import type { IvrNodeData, IvrNodeType } from "@/lib/call-center/ivr-flow";
import { cn } from "@/lib/utils";

const TYPE_META: Record<
  IvrNodeType,
  { icon: typeof Play; accent: string; title: string }
> = {
  start: { icon: Play, accent: "border-emerald-600/40 bg-emerald-50", title: "Start" },
  menu: { icon: MessageSquareText, accent: "border-sky-700/35 bg-sky-50", title: "Menu" },
  play: { icon: Radio, accent: "border-amber-700/35 bg-amber-50", title: "Play" },
  queue: { icon: Headphones, accent: "border-teal-700/35 bg-teal-50", title: "Queue" },
  agent: { icon: PhoneForwarded, accent: "border-cyan-800/35 bg-cyan-50", title: "Agent" },
  hangup: { icon: PhoneOff, accent: "border-rose-700/35 bg-rose-50", title: "Hangup" },
  hours: { icon: Clock3, accent: "border-stone-600/35 bg-stone-50", title: "Hours" },
  voicemail: { icon: Voicemail, accent: "border-orange-700/35 bg-orange-50", title: "Voicemail" },
  event: { icon: Route, accent: "border-lime-800/35 bg-lime-50", title: "Event" },
};

function IvrNodeShell({
  type,
  selected,
  data,
  children,
  showTarget = true,
}: {
  type: IvrNodeType;
  selected?: boolean;
  data: IvrNodeData;
  children?: React.ReactNode;
  showTarget?: boolean;
}) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        "min-w-[180px] max-w-[240px] rounded-xl border bg-card shadow-sm transition-shadow",
        meta.accent,
        selected && "ring-2 ring-foreground/25 shadow-md",
      )}
    >
      {showTarget ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-border !bg-foreground/70"
        />
      ) : null}
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-foreground/80" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {meta.title}
          </p>
          <p className="truncate text-sm font-semibold text-foreground">{data.label}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function IvrFlowNodeView({ data, selected, type }: NodeProps & { type?: string }) {
  const nodeType = (type as IvrNodeType) || "menu";
  const nodeData = data as unknown as IvrNodeData;

  if (nodeType === "start") {
    return (
      <IvrNodeShell type="start" selected={selected} data={nodeData} showTarget={false}>
        <p className="px-3 py-2 text-xs text-muted-foreground line-clamp-3">
          {nodeData.greetingText || "Greeting"}
        </p>
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!h-2.5 !w-2.5 !border-border !bg-foreground/70"
        />
      </IvrNodeShell>
    );
  }

  if (nodeType === "menu") {
    const digits = nodeData.digits?.length
      ? nodeData.digits
      : [
          { digit: "1", label: "Option 1" },
          { digit: "2", label: "Option 2" },
        ];
    return (
      <IvrNodeShell type="menu" selected={selected} data={nodeData}>
        <p className="border-b border-border/30 px-3 py-1.5 text-xs text-muted-foreground line-clamp-2">
          {nodeData.greetingText || "DTMF menu"}
        </p>
        <ul className="relative space-y-1 px-2 py-2">
          {digits.map((d, index) => {
            const topPct = ((index + 0.55) / Math.max(digits.length, 1)) * 100;
            return (
              <li
                key={d.digit}
                className="flex items-center gap-2 rounded-md bg-background/70 px-2 py-1 text-xs"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border font-semibold">
                  {d.digit}
                </span>
                <span className="truncate text-foreground/90">{d.label || `Key ${d.digit}`}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={d.digit}
                  className="!h-2.5 !w-2.5 !border-border !bg-foreground/70"
                  style={{ top: `${topPct}%` }}
                />
              </li>
            );
          })}
        </ul>
      </IvrNodeShell>
    );
  }

  if (nodeType === "hours") {
    return (
      <IvrNodeShell type="hours" selected={selected} data={nodeData}>
        <div className="space-y-1 px-2 py-2 text-xs">
          <div className="relative rounded-md bg-background/70 px-2 py-1">
            Open
            <Handle
              type="source"
              id="open"
              position={Position.Right}
              className="!h-2.5 !w-2.5 !border-border !bg-emerald-700"
            />
          </div>
          <div className="relative rounded-md bg-background/70 px-2 py-1">
            Closed
            <Handle
              type="source"
              id="closed"
              position={Position.Right}
              className="!h-2.5 !w-2.5 !border-border !bg-rose-700"
            />
          </div>
        </div>
      </IvrNodeShell>
    );
  }

  if (nodeType === "play") {
    return (
      <IvrNodeShell type="play" selected={selected} data={nodeData}>
        <p className="px-3 py-2 text-xs text-muted-foreground line-clamp-3">
          {nodeData.messageText || "Play prompt"}
        </p>
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!h-2.5 !w-2.5 !border-border !bg-foreground/70"
        />
      </IvrNodeShell>
    );
  }

  return (
    <IvrNodeShell type={nodeType} selected={selected} data={nodeData}>
      <p className="px-3 py-2 text-xs text-muted-foreground">
        {nodeType === "queue" && (nodeData.queueId ? "Queue linked" : "Pick a queue")}
        {nodeType === "agent" && (nodeData.agentUserId ? "Agent linked" : "Pick an agent")}
        {nodeType === "event" && (nodeData.eventId ? "Event linked" : "Optional event id")}
        {nodeType === "hangup" && "End call"}
        {nodeType === "voicemail" && "Leave a message (stub)"}
      </p>
    </IvrNodeShell>
  );
}

export const ivrNodeTypes = {
  start: IvrFlowNodeView,
  menu: IvrFlowNodeView,
  play: IvrFlowNodeView,
  queue: IvrFlowNodeView,
  agent: IvrFlowNodeView,
  hangup: IvrFlowNodeView,
  hours: IvrFlowNodeView,
  voicemail: IvrFlowNodeView,
  event: IvrFlowNodeView,
};
