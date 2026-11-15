"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Bot,
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

/** How many DTMF rows to show on the canvas; full list lives in the inspector. */
const MENU_VISIBLE_DIGITS = 4;

const TYPE_META: Record<
  IvrNodeType,
  { icon: typeof Play; accent: string; title: string }
> = {
  start: { icon: Play, accent: "border-emerald-600/40 bg-emerald-50", title: "Start" },
  menu: { icon: MessageSquareText, accent: "border-sky-700/35 bg-sky-50", title: "Menu" },
  play: { icon: Radio, accent: "border-amber-700/35 bg-amber-50", title: "Play" },
  queue: { icon: Headphones, accent: "border-teal-700/35 bg-teal-50", title: "Queue" },
  agent: { icon: PhoneForwarded, accent: "border-cyan-800/35 bg-cyan-50", title: "Agent" },
  ai: { icon: Bot, accent: "border-indigo-800/35 bg-indigo-50", title: "AI" },
  hangup: { icon: PhoneOff, accent: "border-rose-700/35 bg-rose-50", title: "Hangup" },
  hours: { icon: Clock3, accent: "border-stone-600/35 bg-stone-50", title: "Hours" },
  voicemail: { icon: Voicemail, accent: "border-orange-700/35 bg-orange-50", title: "Voicemail" },
  event: { icon: Route, accent: "border-lime-800/35 bg-lime-50", title: "Event" },
};

const HANDLE_CLASS =
  "!h-3.5 !w-3.5 !border-2 !border-background !bg-foreground/75 hover:!bg-foreground";

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
        "min-w-[200px] max-w-[260px] rounded-xl border bg-card shadow-sm transition-[box-shadow,ring] duration-150",
        meta.accent,
        selected
          ? "ring-2 ring-[color-mix(in_oklab,var(--fec-star)_70%,transparent)] shadow-md"
          : "hover:shadow-md",
      )}
    >
      {showTarget ? (
        <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
      ) : null}
      <div className="flex items-center gap-2.5 border-b border-border/40 px-3.5 py-2.5">
        <Icon className="h-4 w-4 shrink-0 text-foreground/80" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {meta.title}
          </p>
          <p className="truncate text-[0.9375rem] font-semibold leading-snug text-foreground">
            {data.label}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

function promptPreview(text: string | undefined, fallback: string) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return fallback;
  return trimmed.length > 90 ? `${trimmed.slice(0, 87)}…` : trimmed;
}

export function IvrFlowNodeView({ data, selected, type }: NodeProps & { type?: string }) {
  const nodeType = (type as IvrNodeType) || "menu";
  const nodeData = data as unknown as IvrNodeData;

  if (nodeType === "start") {
    return (
      <IvrNodeShell type="start" selected={selected} data={nodeData} showTarget={false}>
        <p className="px-3.5 py-2.5 text-[0.8125rem] leading-snug text-muted-foreground line-clamp-2">
          {promptPreview(nodeData.greetingEn || nodeData.greetingText, "Greeting")}
        </p>
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className={HANDLE_CLASS}
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
    const visible = digits.slice(0, MENU_VISIBLE_DIGITS);
    const hiddenCount = digits.length - visible.length;

    return (
      <IvrNodeShell type="menu" selected={selected} data={nodeData}>
        <p className="border-b border-border/30 px-3.5 py-2 text-[0.8125rem] leading-snug text-muted-foreground line-clamp-2">
          {promptPreview(
            nodeData.greetingEn || nodeData.greetingText || nodeData.greetingAr,
            "DTMF menu",
          )}
        </p>
        {/* Handles stay mounted for every digit so edges keep working when the list is collapsed. */}
        <ul className="space-y-1 px-2.5 py-2">
          {visible.map((d) => (
            <li
              key={d.digit}
              className="relative flex items-center gap-2 rounded-md bg-background/70 px-2 py-1.5 text-[0.8125rem]"
            >
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border font-semibold">
                {d.digit}
              </span>
              <span className="truncate text-foreground/90">{d.label || `Key ${d.digit}`}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={d.digit}
                className={HANDLE_CLASS}
                title={`Key ${d.digit}`}
              />
            </li>
          ))}
          {hiddenCount > 0 ? (
            <li className="relative px-2 py-1.5 text-[0.75rem] font-medium text-muted-foreground">
              +{hiddenCount} more — edit in inspector
              {digits.slice(MENU_VISIBLE_DIGITS).map((d, index, hidden) => {
                const topPct = ((index + 0.5) / Math.max(hidden.length, 1)) * 100;
                return (
                  <Handle
                    key={`hidden-${d.digit}`}
                    type="source"
                    position={Position.Right}
                    id={d.digit}
                    className={HANDLE_CLASS}
                    style={{ top: `${topPct}%` }}
                    title={`Key ${d.digit}`}
                  />
                );
              })}
            </li>
          ) : null}
        </ul>
      </IvrNodeShell>
    );
  }

  if (nodeType === "hours") {
    return (
      <IvrNodeShell type="hours" selected={selected} data={nodeData}>
        <div className="space-y-1.5 px-2.5 py-2.5 text-[0.8125rem]">
          <div className="relative rounded-md bg-background/70 px-2.5 py-1.5">
            Open
            <Handle
              type="source"
              id="open"
              position={Position.Right}
              className="!h-3.5 !w-3.5 !border-2 !border-background !bg-emerald-700"
            />
          </div>
          <div className="relative rounded-md bg-background/70 px-2.5 py-1.5">
            Closed
            <Handle
              type="source"
              id="closed"
              position={Position.Right}
              className="!h-3.5 !w-3.5 !border-2 !border-background !bg-rose-700"
            />
          </div>
        </div>
      </IvrNodeShell>
    );
  }

  if (nodeType === "play") {
    return (
      <IvrNodeShell type="play" selected={selected} data={nodeData}>
        <p className="px-3.5 py-2.5 text-[0.8125rem] leading-snug text-muted-foreground line-clamp-2">
          {promptPreview(nodeData.messageEn || nodeData.messageText, "Play prompt")}
        </p>
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className={HANDLE_CLASS}
        />
      </IvrNodeShell>
    );
  }

  return (
    <IvrNodeShell type={nodeType} selected={selected} data={nodeData}>
      <p className="px-3.5 py-2.5 text-[0.8125rem] text-muted-foreground">
        {nodeType === "queue" && (nodeData.queueId ? "Queue linked" : "Pick a queue")}
        {nodeType === "agent" && (nodeData.agentUserId ? "Agent linked" : "Pick an agent")}
        {nodeType === "ai" &&
          (nodeData.aiEnabled === false ? "AI disabled" : "AI answers call (LiveKit stub)")}
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
  ai: IvrFlowNodeView,
  hangup: IvrFlowNodeView,
  hours: IvrFlowNodeView,
  voicemail: IvrFlowNodeView,
  event: IvrFlowNodeView,
};
