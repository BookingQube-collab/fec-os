"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { EventProcurementPanel } from "@/components/events/event-procurement-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OPEN_ISSUE_STATUSES, PENDING_PR_STATUSES } from "@/lib/events/constants";
import { eventOpsUrls, OPEN_MAINT_STATUSES } from "@/lib/events/ops-link";
import type { EventOverview } from "@/lib/events/types";
import { cn } from "@/lib/utils";

type StreamId = "procurement" | "people" | "maintenance" | "logistics";

export function EventWorkstreamsPanel({
  overview,
  canCreatePr,
  canCreateMaint,
  hideProcurementList,
}: {
  overview: EventOverview;
  canCreatePr?: boolean;
  canCreateMaint?: boolean;
  hideProcurementList?: boolean;
}) {
  const { t } = useTranslation();
  const ev = overview.event;
  const urls = eventOpsUrls(ev.id, ev.location_id);
  const prs = overview.linkedPrs ?? [];
  const maint = overview.linkedMaintenance ?? [];
  const team = overview.team ?? [];
  const assets = overview.assets ?? [];
  const snags = (overview.issues ?? []).filter((issue) => issue.is_snag && OPEN_ISSUE_STATUSES.has(issue.status));
  const pendingPrs = prs.filter((pr) => PENDING_PR_STATUSES.has(pr.status)).length;
  const openMaint = maint.filter((row) => OPEN_MAINT_STATUSES.has(row.status)).length;
  const missingAssets = assets.filter((row) => row.status === "missing").length;
  const staffingGap = team.length === 0 || (overview.event.overdue_hr_tasks ?? 0) > 0;

  const defaultTab: StreamId = useMemo(() => {
    if (pendingPrs > 0) return "procurement";
    if (openMaint > 0) return "maintenance";
    if (staffingGap) return "people";
    if (missingAssets > 0 || snags.length > 0) return "logistics";
    return "procurement";
  }, [pendingPrs, openMaint, staffingGap, missingAssets, snags.length]);

  const [tab, setTab] = useState<StreamId>(defaultTab);

  const streams: Array<{ id: StreamId; count: number; warn: boolean }> = [
    { id: "procurement", count: pendingPrs || prs.length, warn: pendingPrs > 0 },
    { id: "people", count: team.length, warn: staffingGap },
    { id: "maintenance", count: openMaint || maint.length, warn: openMaint > 0 },
    { id: "logistics", count: assets.length + snags.length, warn: missingAssets > 0 || snags.length > 0 },
  ];

  return (
    <section className="min-w-0 rounded-2xl border border-border/40 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t("events.home.workstreams")}</h2>
          <p className="text-xs text-muted-foreground">{t("events.home.workstreamsHint")}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/events/${ev.id}/scope`}>{t("events.workspace.scope")}</Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/events/${ev.id}/plan`}>{t("events.workspace.schedule")}</Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/events/${ev.id}/budget`}>{t("events.workspace.budget")}</Link>
          </Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {streams.map((stream) => (
          <button
            key={stream.id}
            type="button"
            onClick={() => setTab(stream.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
              tab === stream.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`events.home.stream.${stream.id}`)}
            <span className={cn("tabular-nums", tab === stream.id ? "opacity-90" : stream.warn ? "text-rag-red" : "")}>
              {stream.count}
            </span>
          </button>
        ))}
      </div>

      {tab === "procurement" ? (
        hideProcurementList ? (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm text-muted-foreground">
              {t("events.proc.blockedCounts", {
                pending: pendingPrs,
                approved: prs.filter((pr) => !PENDING_PR_STATUSES.has(pr.status)).length,
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href={`/procurement/requisitions?eventId=${ev.id}`}>{t("events.proc.openAll")}</Link>
              </Button>
              {canCreatePr ? (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/procurement/requisitions/new?eventId=${ev.id}`}>{t("events.proc.newPr")}</Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <EventProcurementPanel eventId={ev.id} prs={prs} canCreate={canCreatePr} variant="compact" />
        )
      ) : null}

      {tab === "people" ? (
        <StreamBody
          empty={team.length === 0}
          emptyText={t("events.home.stream.emptyPeople")}
          openHref={urls.people}
          openLabel={t("events.home.stream.openPeople")}
          createHref={urls.roster}
          createLabel={t("events.home.stream.openRoster")}
        >
          {team.slice(0, 3).map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/40 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{member.full_name}</p>
                <p className="text-xs text-muted-foreground">{member.role_label}</p>
              </div>
              {member.is_pm ? <Badge variant="outline">{t("events.fields.pm")}</Badge> : null}
            </li>
          ))}
        </StreamBody>
      ) : null}

      {tab === "maintenance" ? (
        <StreamBody
          empty={maint.length === 0}
          emptyText={t("events.home.stream.emptyMaint")}
          openHref={urls.maintenance}
          openLabel={t("events.home.stream.openMaint")}
          createHref={canCreateMaint ? urls.newMaintenance : undefined}
          createLabel={t("events.home.stream.newMaint")}
        >
          {maint.slice(0, 3).map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/40 px-3 py-2 text-sm">
              <Link href={`${urls.maintenance}&id=${row.id}`} className="min-w-0 truncate font-medium underline-offset-2 hover:underline">
                {row.request_number}
                {row.category ? ` · ${row.category}` : ""}
              </Link>
              <Badge variant={OPEN_MAINT_STATUSES.has(row.status) ? "warning" : "outline"}>{row.status}</Badge>
            </li>
          ))}
        </StreamBody>
      ) : null}

      {tab === "logistics" ? (
        <StreamBody
          empty={assets.length === 0 && snags.length === 0}
          emptyText={t("events.home.stream.emptyLogistics")}
          openHref={urls.inventory}
          openLabel={t("events.home.stream.openInventory")}
          createHref={urls.newSnag}
          createLabel={t("events.home.stream.newSnag")}
        >
          {assets.slice(0, 3).map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/40 px-3 py-2 text-sm">
              <span className="truncate">
                {row.item_name} <span className="text-xs text-muted-foreground">× {row.qty}</span>
              </span>
              <Badge variant={row.status === "missing" ? "destructive" : "outline"}>{t(`events.assetStatus.${row.status}`)}</Badge>
            </li>
          ))}
          {snags.slice(0, Math.max(0, 3 - assets.length)).map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/40 px-3 py-2 text-sm">
              <span className="truncate">{row.title}</span>
              <Badge variant="warning">{t("events.overview.snag")}</Badge>
            </li>
          ))}
        </StreamBody>
      ) : null}
    </section>
  );
}

function StreamBody({
  empty,
  emptyText,
  openHref,
  openLabel,
  createHref,
  createLabel,
  children,
}: {
  empty: boolean;
  emptyText: string;
  openHref: string;
  openLabel: string;
  createHref?: string;
  createLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {empty ? <p className="text-sm text-muted-foreground">{emptyText}</p> : <ul className="space-y-2">{children}</ul>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href={openHref}>{openLabel}</Link>
        </Button>
        {createHref && createLabel ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={createHref}>{createLabel}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
