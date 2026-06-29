"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AlertCircle, Building2, ChevronRight, FileText, Loader2, RefreshCw } from "lucide-react";

import type { LocationRollup, RagStatus } from "@/lib/queries/occ.core";
import { useEstateRollup } from "@/hooks/queries/useOcc";
import { queryKeys } from "@/lib/query-keys";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const RAG_STYLES: Record<RagStatus, string> = {
  green: "border-emerald-500/30 bg-emerald-500/5",
  amber: "border-amber-500/40 bg-amber-500/5",
  red: "border-rose-500/50 bg-rose-500/10",
};

const RAG_DOT: Record<RagStatus, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
};

function EstatePage() {
    const qc = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } = useEstateRollup({ refetchInterval: 30_000 });

  useEffect(() => {
    const channel = supabase
      .channel("occ-estate-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        void qc.invalidateQueries({ queryKey: queryKeys.occ.rollup() });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => {
        void qc.invalidateQueries({ queryKey: queryKeys.occ.rollup() });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () => {
        void qc.invalidateQueries({ queryKey: queryKeys.occ.rollup() });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const rollups = data ?? [];
  const counts = {
    red: rollups.filter((r) => r.rag === "red").length,
    amber: rollups.filter((r) => r.rag === "amber").length,
    green: rollups.filter((r) => r.rag === "green").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SummaryPill label="Red" count={counts.red} status="red" />
          <SummaryPill label="Amber" count={counts.amber} status="amber" />
          <SummaryPill label="Green" count={counts.green} status="green" />
        </div>
        <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          <span className="ml-1.5">Refresh</span>
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 text-sm text-rose-300">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          Failed to load estate rollup: {(error as Error).message}
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg border border-border bg-surface" />
          ))}
        </div>
      ) : rollups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No locations visible. Check your branch assignments.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rollups.map((r) => (
            <LocationTile key={r.location_id} rollup={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryPill({ label, count, status }: { label: string; count: number; status: RagStatus }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs">
      <span className={cn("h-2 w-2 rounded-full", RAG_DOT[status])} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{count}</span>
    </div>
  );
}

function LocationTile({ rollup }: { rollup: LocationRollup }) {
  return (
    <Link href={`/occ/branch/${rollup.location_id}`}
      className={cn(
        "group block rounded-lg border p-4 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5",
        RAG_STYLES[rollup.rag],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", RAG_DOT[rollup.rag])} />
            <div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
              {rollup.code}
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h3 className="truncate font-semibold text-foreground">{rollup.name}</h3>
            {rollup.surge_mode && (
              <span className="rounded-full bg-rose-600/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                Surge
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{rollup.city}</div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <Metric label="Urgent" value={rollup.urgent_tickets} tone={rollup.urgent_tickets ? "red" : "muted"} />
        <Metric label="High" value={rollup.high_tickets} tone={rollup.high_tickets ? "amber" : "muted"} />
        <Metric label="Inc 24h" value={rollup.incidents_24h} tone={rollup.incidents_24h ? "red" : "muted"} />
        <Metric label="Overdue" value={rollup.overdue_work_orders} tone={rollup.overdue_work_orders ? "amber" : "muted"} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        <span>{rollup.open_tickets} open tickets</span>
        <span className="flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {rollup.open_complaints} complaints
        </span>
      </div>
    </Link>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "red" | "amber" | "muted" }) {
  const toneClass =
    tone === "red"
      ? "text-rose-300"
      : tone === "amber"
        ? "text-amber-300"
        : "text-muted-foreground";
  return (
    <div className="rounded-md bg-surface/50 px-1 py-1.5">
      <div className={cn("text-lg font-semibold tabular-nums", toneClass)}>{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

export default EstatePage;
