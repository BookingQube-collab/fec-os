"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Ticket,
} from "lucide-react";

import type { LocationRollup, RagStatus } from "@/lib/queries/occ.core";
import { matchesVenueQuery, rollupDrivers, sharedCity, type OccStatusFilter } from "@/lib/occ/status";
import { useEstateRollup } from "@/hooks/queries/useOcc";
import { queryKeys } from "@/lib/query-keys";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const RAG_CARD: Record<RagStatus, string> = {
  red: "border-rose-300/80 bg-rose-50/90 shadow-[0_0_0_1px_rgba(244,63,94,0.08)] dark:border-rose-500/40 dark:bg-rose-500/10",
  amber:
    "border-amber-300/80 bg-amber-50/80 dark:border-amber-500/35 dark:bg-amber-500/10",
  green: "border-emerald-200/80 bg-card dark:border-emerald-500/25 dark:bg-emerald-500/5",
};

const RAG_DOT: Record<RagStatus, string> = {
  red: "bg-rose-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
};

const RAG_BADGE: Record<RagStatus, "destructive" | "warning" | "success"> = {
  red: "destructive",
  amber: "warning",
  green: "success",
};

function EstatePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useEstateRollup({
    refetchInterval: 30_000,
  });
  const [filter, setFilter] = useState<OccStatusFilter>("all");
  const [query, setQuery] = useState("");

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

  const rollups = useMemo(() => data ?? [], [data]);
  const counts = {
    red: rollups.filter((r) => r.rag === "red").length,
    amber: rollups.filter((r) => r.rag === "amber").length,
    green: rollups.filter((r) => r.rag === "green").length,
  };
  const city = sharedCity(rollups);
  const redVenues = rollups.filter((r) => r.rag === "red");

  const visible = useMemo(() => {
    return rollups.filter((r) => (filter === "all" || r.rag === filter) && matchesVenueQuery(r, query));
  }, [rollups, filter, query]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {t("command.headline", { red: counts.red, amber: counts.amber, green: counts.green })}
        {city ? ` · ${city}` : ""}
      </p>

      {redVenues.length > 0 && filter === "all" && !query.trim() ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/80 px-3 py-2.5 dark:border-rose-500/30 dark:bg-rose-500/10">
          <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">{t("command.needsYouNow")}</span>
          {redVenues.map((r) => (
            <Link
              key={r.location_id}
              href={`/occ/branch/${r.location_id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-rose-400 dark:border-rose-500/40"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              {r.name}
              <span className="text-muted-foreground">
                {t("command.urgentShort", { count: r.urgent_tickets + r.incidents_24h })}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("command.filterAria")}>
          <FilterPill
            label={t("common.all")}
            count={rollups.length}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <FilterPill
            label={t("command.rag.red")}
            count={counts.red}
            status="red"
            active={filter === "red"}
            onClick={() => setFilter(filter === "red" ? "all" : "red")}
          />
          <FilterPill
            label={t("command.rag.amber")}
            count={counts.amber}
            status="amber"
            active={filter === "amber"}
            onClick={() => setFilter(filter === "amber" ? "all" : "amber")}
          />
          <FilterPill
            label={t("command.rag.green")}
            count={counts.green}
            status="green"
            active={filter === "green"}
            onClick={() => setFilter(filter === "green" ? "all" : "green")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("command.searchPlaceholder")}
              className="min-h-10 ps-10"
              aria-label={t("command.searchPlaceholder")}
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ms-1.5">{t("command.refresh")}</span>
          </Button>
        </div>
      </div>

      {dataUpdatedAt ? (
        <p className="text-[11px] text-muted-foreground">{formatUpdatedAt(dataUpdatedAt, t)}</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/5 dark:text-rose-300">
          <AlertCircle className="me-2 inline h-4 w-4" />
          {t("command.loadError", { message: (error as Error).message })}
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl border border-border bg-surface" />
          ))}
        </div>
      ) : rollups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          {t("command.emptyAssignments")}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">{t("command.emptyFilter")}</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => {
              setFilter("all");
              setQuery("");
            }}
          >
            {t("command.clearFilters")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((r) => (
            <LocationTile key={r.location_id} rollup={r} hideCity={Boolean(city)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  label,
  count,
  status,
  active,
  onClick,
}: {
  label: string;
  count: number;
  status?: RagStatus;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-foreground hover:bg-muted/60",
      )}
    >
      {status ? <span className={cn("h-2 w-2 rounded-full", RAG_DOT[status])} /> : null}
      <span>{label}</span>
      <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}

function LocationTile({ rollup, hideCity }: { rollup: LocationRollup; hideCity: boolean }) {
  const { t } = useTranslation();
  const drivers = rollupDrivers(rollup).slice(0, 2);
  const why =
    drivers.length > 0
      ? drivers.map((d) => t(`command.driver.${d.key}`, { count: d.count })).join(" · ")
      : t("command.driver.clear");

  return (
    <Link
      href={`/occ/branch/${rollup.location_id}`}
      className={cn(
        "group flex flex-col rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        RAG_CARD[rollup.rag],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={RAG_BADGE[rollup.rag]} className="capitalize">
              {t(`command.rag.${rollup.rag}`)}
            </Badge>
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{rollup.code}</span>
            {rollup.surge_mode ? (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {t("common.surgeMode")}
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 flex items-center gap-2 text-base font-semibold text-foreground">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{rollup.name}</span>
          </h3>
          {!hideCity && rollup.city ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{rollup.city}</p>
          ) : null}
          <p className="mt-1.5 text-sm leading-snug text-foreground/80">{why}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <Metric label={t("command.metric.urgent")} value={rollup.urgent_tickets} tone="red" />
        <Metric label={t("command.metric.high")} value={rollup.high_tickets} tone="amber" />
        <Metric label={t("command.metric.incidents")} value={rollup.incidents_24h} tone="red" />
        <Metric label={t("command.metric.overdue")} value={rollup.overdue_work_orders} tone="amber" />
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <Ticket className="h-3.5 w-3.5" />
            {t("command.openTickets", { count: rollup.open_tickets })}
          </span>
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            {t("command.openComplaints", { count: rollup.open_complaints })}
          </span>
        </span>
        <span className="shrink-0 font-medium text-foreground">{t("command.openVenue")}</span>
      </div>
    </Link>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "amber";
}) {
  const hot = value > 0;
  const toneClass =
    !hot
      ? "text-muted-foreground"
      : tone === "red"
        ? "text-rose-600 dark:text-rose-400"
        : "text-amber-600 dark:text-amber-400";
  return (
    <div className={cn("rounded-xl bg-background/70 px-1 py-2 dark:bg-background/30", !hot && "opacity-60")}>
      <div className={cn("text-xl font-semibold tabular-nums leading-none", toneClass)}>{value}</div>
      <div className="mt-1 text-[11px] font-medium leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}

function formatUpdatedAt(ts: number, t: ReturnType<typeof useTranslation>["t"]): string {
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 15) return t("command.updatedNow");
  if (sec < 60) return t("command.updatedSeconds", { count: sec });
  return t("command.updatedMinutes", { count: Math.max(1, Math.round(sec / 60)) });
}

export default EstatePage;
