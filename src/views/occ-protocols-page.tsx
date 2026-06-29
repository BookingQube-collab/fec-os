"use client";

import { useState } from "react";
import { AlertOctagon, CheckCircle2, Circle, Play, Siren, UserSearch, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Protocol {
  id: string;
  title: string;
  category: string;
  icon: typeof Siren;
  tone: string;
  steps: string[];
}

const PROTOCOLS: Protocol[] = [
  {
    id: "lost-child",
    title: "Lost Child",
    category: "Guest safety",
    icon: UserSearch,
    tone: "border-amber-500/40 bg-amber-500/5",
    steps: [
      "Get child description (age, clothing, name) from reporting party",
      "Announce Code Adam over PA — all exits monitored",
      "Dispatch staff to attractions in last-seen radius",
      "Notify Duty Manager and Security",
      "Review CCTV from last-seen point",
      "Reunite and log incident — file complaint record if applicable",
    ],
  },
  {
    id: "evacuation",
    title: "Evacuation",
    category: "Life safety",
    icon: Siren,
    tone: "border-rose-500/40 bg-rose-500/5",
    steps: [
      "Activate fire panel / pull station — confirm alarm audible",
      "Stop all attractions — operators escort guests to exits",
      "Dispatch wardens to muster points",
      "Sweep restrooms, party rooms, back-of-house",
      "Notify mall ops and emergency services",
      "Headcount at muster — confirm all-clear before re-entry",
      "File incident report with RCA within 24h",
    ],
  },
  {
    id: "power-failure",
    title: "Power Failure",
    category: "Continuity",
    icon: Zap,
    tone: "border-amber-500/40 bg-amber-500/5",
    steps: [
      "Confirm scope — full site vs. partial, check mall ops",
      "Verify emergency lighting and generator transfer",
      "Safely unload guests from active attractions (priority: ride seats, dark rides)",
      "Stop new admissions — refund/rebook policy active",
      "Open work order against affected assets",
      "Communicate ETA to guests and mall ops every 15 min",
      "On restore — system checks before re-opening each attraction",
    ],
  },
  {
    id: "medical",
    title: "Medical Incident",
    category: "Guest safety",
    icon: AlertOctagon,
    tone: "border-rose-500/40 bg-rose-500/5",
    steps: [
      "Secure scene — clear bystanders",
      "Trained first-aider responds; call 998 if serious",
      "Notify Duty Manager and mall ops",
      "Preserve CCTV and witness contacts",
      "Open incident record immediately, RCA within 24h",
      "Asset hold if attraction-related until inspection cleared",
    ],
  },
];

function ProtocolsPage() {
  const [active, setActive] = useState<Protocol | null>(null);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Launch a guided checklist for any of the standard branch protocols. Steps are time-stamped locally for the handover digest.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PROTOCOLS.map((p) => {
          const Icon = p.icon;
          return (
            <div key={p.id} className={cn("rounded-lg border p-4", p.tone)}>
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-surface text-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{p.category}</div>
                  <h3 className="font-semibold text-foreground">{p.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{p.steps.length} steps</p>
                </div>
                <Button size="sm" onClick={() => setActive(p)}>
                  <Play className="h-3.5 w-3.5" />
                  <span className="ml-1.5">Launch</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {active ? <ProtocolRunner protocol={active} onClose={() => setActive(null)} /> : null}
    </div>
  );
}

function ProtocolRunner({ protocol, onClose }: { protocol: Protocol; onClose: () => void }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setDone((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const Icon = protocol.icon;
  const complete = done.size === protocol.steps.length;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-4">
      <div className="max-h-[85vh] w-full max-w-xl overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <Icon className="h-5 w-5 text-primary" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{protocol.category}</div>
              <div className="font-semibold">{protocol.title}</div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <ol className="max-h-[60vh] divide-y divide-border overflow-y-auto">
          {protocol.steps.map((step, i) => {
            const isDone = done.has(i);
            return (
              <li key={i}>
                <button
                  onClick={() => toggle(i)}
                  className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-sidebar-accent/40"
                >
                  {isDone ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Step {i + 1}</div>
                    <div className={cn("text-sm", isDone && "text-muted-foreground line-through")}>{step}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <div className="text-xs text-muted-foreground">
            {done.size} / {protocol.steps.length} complete
          </div>
          <Button size="sm" disabled={!complete} onClick={onClose}>
            {complete ? "Log & close" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ProtocolsPage;
