"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { EventHealthBadge } from "@/components/events/event-health-badge";
import { EventSourceBanner } from "@/components/events/event-source-banner";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEventsDashboard } from "@/hooks/queries/useEvents";
import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { fmtQar } from "@/lib/currency";
import { savedVsBudgetPct } from "@/lib/events/finance";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

function Kpi({
  label,
  value,
  hint,
  tone,
  tint = "sky",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "warn";
  tint?: KpiTint;
}) {
  const resolved: KpiTint = tone === "danger" ? "red" : tone === "warn" ? "orange" : tint;
  return <TintedKpiCard title={label} value={value} hint={hint} tint={resolved} compact />;
}

export default function EventsDashboardPage() {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const locationId = useAppStore((s) => s.currentLocationId);
  const dash = useEventsDashboard(locationId);
  const d = dash.data;
  const saved = d?.savedVsBudget ?? 0;
  const savedPct = d ? savedVsBudgetPct(d.budgetRevised, d.budgetActual) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarDays}
        kicker={t("events.kicker")}
        title={t("events.dashboard.title")}
        subtitle={t("events.dashboard.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/events/list">{t("events.dashboard.viewAll")}</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/events/reports">{t("nav.eventsReports")}</Link>
            </Button>
            <CapabilityGate capability="events.create">
              <Button size="sm" asChild>
                <Link href="/events/new">{t("events.new")}</Link>
              </Button>
            </CapabilityGate>
          </div>
        }
      />

      <EventSourceBanner />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t("events.dashboard.total")} value={String(d?.total ?? "—")} hint={t("events.dashboard.upcomingHint", { n: d?.upcoming ?? 0 })} tint="sky" />
        <Kpi label={t("events.dashboard.live")} value={String(d?.live ?? "—")} hint={t("events.dashboard.readinessHint", { n: d?.avgReadiness ?? 0 })} tint="green" />
        <Kpi
          label={t("events.dashboard.pendingPrs")}
          value={String(d?.pendingPrs ?? "—")}
          tone={(d?.pendingPrs ?? 0) > 0 ? "warn" : undefined}
          hint={t("events.dashboard.procRisksHint", { n: d?.procurementRisks ?? 0 })}
        />
        <Kpi
          label={t("events.dashboard.overdueTasks")}
          value={String(d?.overdueTasks ?? "—")}
          tone={(d?.overdueTasks ?? 0) > 0 ? "danger" : undefined}
          hint={t("events.dashboard.blockedHint", { n: d?.blockedTasks ?? 0 })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t("events.dashboard.contracted")} value={d ? fmtQar(d.contractedValue) : "—"} tint="green" />
        <Kpi label={t("events.dashboard.budget")} value={d ? fmtQar(d.budgetRevised) : "—"} tint="sky" />
        <Kpi
          label={t("events.dashboard.spent")}
          value={d ? fmtQar(d.budgetActual) : "—"}
          hint={d ? t("events.dashboard.committedHint", { amount: fmtQar(d.budgetCommitted) }) : undefined}
          tint="amber"
        />
        <Kpi
          label={saved < 0 ? t("events.dashboard.overspend") : t("events.dashboard.savedVsBudget")}
          value={d ? fmtQar(Math.abs(saved)) : "—"}
          hint={savedPct == null ? undefined : t("events.dashboard.savedPctHint", { pct: Math.round(savedPct) })}
          tint={saved < 0 ? "red" : "green"}
        />
      </div>

      <section className="surface-card">
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{t("events.dashboard.upcomingList")}</h2>
            <p className="text-xs text-muted-foreground">{t("events.dashboard.commandHint")}</p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/events/list">{t("events.dashboard.viewAll")}</Link>
          </Button>
        </div>
        <div className="divide-y divide-border/40">
          {(d?.events ?? []).length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">{t("events.list.empty")}</p>
          ) : (
            d?.events.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="grid gap-2 px-4 py-3 text-sm hover:bg-muted/40 md:grid-cols-[minmax(0,1.6fr)_minmax(7rem,0.7fr)_auto_minmax(16rem,1.3fr)_auto]"
              >
                <span className="min-w-0">
                  <span className="block font-medium">
                    {event.event_number} · {event.event_name || event.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {event.venue_name ?? event.location_name ?? "—"} · {event.event_start ?? "—"}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {t("events.dashboard.nextGate")}: {(ar ? event.stage_label_ar : event.stage_label_en) ?? "—"}
                </span>
                <span>
                  {event.pending_prs > 0 ? (
                    <Badge variant="warning">{t("events.dashboard.prBlockers", { n: event.pending_prs })}</Badge>
                  ) : event.linked_prs > 0 ? (
                    <Badge variant="outline">{t("events.dashboard.prsClear", { n: event.linked_prs })}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("events.proc.emptyShort")}</span>
                  )}
                </span>
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs tabular-nums">
                  <span>
                    <span className="text-muted-foreground">{t("events.dashboard.rowBudget")}</span>{" "}
                    <span className="font-medium text-foreground">{fmtQar(event.budget_revised ?? 0)}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">{t("events.dashboard.rowSpent")}</span>{" "}
                    <span className="font-medium text-foreground">{fmtQar(event.budget_actual ?? 0)}</span>
                  </span>
                  <span className={cn((event.saved_vs_budget ?? 0) < 0 ? "text-rag-red" : "text-rag-green")}>
                    <span>
                      {(event.saved_vs_budget ?? 0) < 0
                        ? t("events.dashboard.rowOverspend")
                        : t("events.dashboard.rowSaved")}
                    </span>{" "}
                    <span className="font-semibold">{fmtQar(Math.abs(event.saved_vs_budget ?? 0))}</span>
                  </span>
                </span>
                <EventHealthBadge rag={event.health_rag} />
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
