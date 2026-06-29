"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  Sparkles,
  Wrench,
  Flame,
} from "lucide-react";

import { toggleSurgeMode } from "@/lib/occ.functions";
import type { BranchPack } from "@/lib/queries/occ.core";
import { useBranchPack } from "@/hooks/queries/useOcc";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function BranchPage() {
  const { locationId } = useParams() as { locationId: string };
    const { data, isLoading, error } = useBranchPack(locationId, { enabled: !!locationId });

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/occ" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Estate
        </Link>
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 text-sm text-rose-300">
          {(error as Error).message}
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div>
          <Link href="/occ" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Estate
          </Link>
          <Skeleton className="mt-2 h-7 w-64" />
          <Skeleton className="mt-1 h-4 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return <BranchView pack={data} />;
}

function BranchView({ pack }: { pack: BranchPack }) {
  const r = pack.rollup;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/occ" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Estate
          </Link>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{pack.location.name}</h2>
          <div className="text-xs text-muted-foreground">
            {pack.location.code} · {pack.location.city} · {pack.location.status}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SurgeToggle
            locationId={pack.location.id}
            surgeMode={pack.location.surge_mode}
            reason={pack.location.surge_reason}
          />
          <Link href={`/occ/handover/${pack.location.id}`}>
            <Button size="sm" variant="outline">
              <ClipboardList className="h-3.5 w-3.5" />
              <span className="ml-1.5">Handover</span>
            </Button>
          </Link>
          <Link href="/occ/protocols">
            <Button size="sm" variant="outline">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="ml-1.5">Protocols</span>
            </Button>
          </Link>
        </div>
      </div>

      {r ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Open tickets" value={r.open_tickets} />
          <StatCard label="Urgent" value={r.urgent_tickets} tone={r.urgent_tickets ? "red" : undefined} />
          <StatCard label="Incidents 24h" value={r.incidents_24h} tone={r.incidents_24h ? "red" : undefined} />
          <StatCard label="Overdue WOs" value={r.overdue_work_orders} tone={r.overdue_work_orders ? "amber" : undefined} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Recent tickets" icon={AlertTriangle}>
          {pack.recent_tickets.length === 0 ? (
            <EmptyHint text="No tickets in window" />
          ) : (
            <ul className="divide-y divide-border">
              {pack.recent_tickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.title}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t.priority} · {t.status}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent incidents" icon={AlertOctagon}>
          {pack.recent_incidents.length === 0 ? (
            <EmptyHint text="No incidents on record" />
          ) : (
            <ul className="divide-y divide-border">
              {pack.recent_incidents.map((i) => (
                <li key={i.id} className="py-2 text-sm">
                  <div className="truncate font-medium">{i.summary}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {i.severity} · {i.status} · {new Date(i.occurred_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Open work orders" icon={Wrench}>
          {pack.open_work_orders.length === 0 ? (
            <EmptyHint text="No open work orders" />
          ) : (
            <ul className="divide-y divide-border">
              {pack.open_work_orders.map((w) => (
                <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{w.title}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {w.kind} · {w.status}
                    </div>
                  </div>
                  {w.planned_end ? (
                    <div className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      due {new Date(w.planned_end).toLocaleDateString()}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Attractions" icon={Sparkles}>
          {pack.attractions.length === 0 ? (
            <EmptyHint text="No attractions configured" />
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {pack.attractions.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
                >
                  <span className="truncate font-medium">{a.name}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                      a.status === "operational"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : a.status === "degraded"
                          ? "bg-amber-500/10 text-amber-300"
                          : "bg-rose-500/10 text-rose-300",
                    )}
                  >
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "red" | "amber" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "red" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="py-6 text-center text-xs text-muted-foreground">{text}</div>;
}

function SurgeToggle({
  locationId,
  surgeMode,
  reason,
}: {
  locationId: string;
  surgeMode: boolean;
  reason: string | null;
}) {
    const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (vars: { enable: boolean; reason?: string }) =>
      toggleSurgeMode({ locationId, enable: vars.enable, reason: vars.reason }),
    onSuccess: () => {
      toast.success(surgeMode ? "Surge mode cleared" : "Surge mode enabled");
      qc.invalidateQueries({ queryKey: ["occ", "branch", locationId] });
      qc.invalidateQueries({ queryKey: ["occ", "estate"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Button
      size="sm"
      variant={surgeMode ? "default" : "outline"}
      className={cn(surgeMode && "bg-rose-600 hover:bg-rose-500 text-white")}
      disabled={mut.isPending}
      onClick={() => {
        if (!surgeMode) {
          const reasonInput = window.prompt("Reason for surge mode?", "");
          if (reasonInput === null) return;
          mut.mutate({ enable: true, reason: reasonInput || "Manual" });
        } else {
          mut.mutate({ enable: false });
        }
      }}
      title={reason ?? undefined}
    >
      <Flame className="h-3.5 w-3.5" />
      <span className="ml-1.5">{surgeMode ? "Surge ON" : "Surge"}</span>
    </Button>
  );
}

export default BranchPage;
