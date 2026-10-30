"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { EventHealthBadge } from "@/components/events/event-health-badge";
import { EventSourceBanner } from "@/components/events/event-source-banner";
import { EventsPortfolioTimeline } from "@/components/events/events-portfolio-timeline";
import {
  FecButton as Button,
  FecEmptyState,
  FecPageHeader,
  FecSkeleton,
} from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { useEventsDashboard, useEventsList } from "@/hooks/queries/useEvents";
import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { fmtQar } from "@/lib/currency";
import { savedVsBudgetPct } from "@/lib/events/finance";
import { usePermission } from "@/hooks/use-permission";
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

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function EventsDashboardPage() {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const search = useSearchParams();
  const locationId = useAppStore((s) => s.currentLocationId);
  const dash = useEventsDashboard(locationId);
  const list = useEventsList({ locationId: locationId ?? null });
  const canFinancePerm = usePermission("events.finance");
  const d = dash.data;
  const canFinance = Boolean(d?.canFinance ?? canFinancePerm);
  const saved = d?.savedVsBudget ?? 0;
  const savedPct = d ? savedVsBudgetPct(d.budgetRevised, d.budgetActual) : null;
  const loading = dash.isLoading && !d;
  const focusStaff = search.get("focus") === "staff";
  const month = useMemo(() => monthKey(), []);

  useEffect(() => {
    if (!focusStaff) return;
    const el = document.getElementById("event-staff");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusStaff, d?.events?.length]);

  const staffingGaps = (d?.events ?? []).filter((event) => !event.pm_staff_id);
  const timelineEvents = useMemo(() => (list.data ?? []).slice(0, 40), [list.data]);
  const hoursUtil =
    d && d.estimatedHours > 0 ? Math.round((d.actualHours / d.estimatedHours) * 1000) / 10 : null;

  return (
    <div className="space-y-6">
      <FecPageHeader
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
            <Button size="sm" variant="outline" asChild>
              <Link href="/events/calendar">{t("nav.eventsCalendar")}</Link>
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

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <FecSkeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : (
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
      )}

      {canFinance ? (
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
      ) : null}

      <section className="rounded-2xl border border-border/40 bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t("events.dashboard.opsStrip")}</h2>
            <p className="text-xs text-muted-foreground">{t("events.dashboard.opsStripHint")}</p>
          </div>
          <Button size="sm" variant="ghost" asChild>
            <Link href="/events/reports">{t("nav.eventsReports")}</Link>
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {(
            [
              ["pendingPos", d?.pendingPos, "warn"],
              ["pendingPayments", d?.pendingPayments, "warn"],
              ["snags", d?.openSnags, "warn"],
              ["safety", d?.criticalSafety, "danger"],
              ["missingAssets", d?.missingAssets, "danger"],
              ["goLivePending", d?.goLivePending, "warn"],
            ] as const
          ).map(([key, value, tone]) => (
            <div key={key} className="rounded-xl border border-border/40 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`events.dashboard.${key}`)}
              </p>
              <p
                className={cn(
                  "mt-1 text-xl font-bold tabular-nums",
                  (value ?? 0) > 0 && tone === "danger" && "text-rag-red",
                  (value ?? 0) > 0 && tone === "warn" && "text-rag-amber",
                )}
              >
                {value ?? "—"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/40 bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t("events.dashboard.healthMatrix")}</h2>
            <p className="text-xs text-muted-foreground">{t("events.dashboard.healthMatrixHint")}</p>
          </div>
          <Button size="sm" variant="ghost" asChild>
            <Link href="/events/list">{t("events.dashboard.viewAll")}</Link>
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          {(["green", "amber", "red", "critical"] as const).map((rag) => (
            <Link
              key={rag}
              href={`/events/list?health=${rag}`}
              className={cn(
                "rounded-xl border border-border/40 px-3 py-3 hover:bg-muted/40",
                rag === "critical" && (d?.rag?.critical ?? 0) > 0 && "border-rag-red/40",
                rag === "red" && (d?.rag?.red ?? 0) > 0 && "border-rag-red/30",
                rag === "amber" && (d?.rag?.amber ?? 0) > 0 && "border-rag-amber/30",
                rag === "green" && (d?.rag?.green ?? 0) > 0 && "border-rag-green/30",
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t(`events.rag.${rag}`)}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{d?.rag?.[rag] ?? "—"}</p>
            </Link>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border/30 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{t("events.dashboard.readinessHigh")}</p>
            <p className="text-lg font-semibold tabular-nums">{d?.readinessBands?.high ?? "—"}</p>
          </div>
          <div className="rounded-xl border border-border/30 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{t("events.dashboard.readinessMid")}</p>
            <p className="text-lg font-semibold tabular-nums">{d?.readinessBands?.mid ?? "—"}</p>
          </div>
          <div className="rounded-xl border border-border/30 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{t("events.dashboard.readinessLow")}</p>
            <p className="text-lg font-semibold tabular-nums">{d?.readinessBands?.low ?? "—"}</p>
          </div>
          <div className="rounded-xl border border-border/30 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{t("events.dashboard.readinessCritical")}</p>
            <p className="text-lg font-semibold tabular-nums">{d?.readinessBands?.critical ?? "—"}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">{t("events.dashboard.stageTrend")}</h2>
            <p className="text-xs text-muted-foreground">{t("events.dashboard.stageTrendHint")}</p>
          </div>
          {(d?.stageMix ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("events.list.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {(d?.stageMix ?? []).map((row) => (
                <li key={row.code} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{row.label}</span>
                  <Badge variant="outline" className="tabular-nums">
                    {row.count}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{t("events.dashboard.execPerf")}</h2>
              <p className="text-xs text-muted-foreground">{t("events.dashboard.execPerfHint")}</p>
            </div>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/events/reports">{t("events.dashboard.openReports")}</Link>
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Kpi
              label={t("events.dashboard.estHours")}
              value={d ? String(d.estimatedHours) : "—"}
              hint={t("events.dashboard.actHoursHint", { n: d?.actualHours ?? 0 })}
              tint="sky"
            />
            <Kpi
              label={t("events.dashboard.hoursUtil")}
              value={hoursUtil == null ? "—" : `${hoursUtil}%`}
              tint={hoursUtil != null && hoursUtil > 110 ? "orange" : "green"}
            />
            <Kpi
              label={t("events.dashboard.avgVelocity")}
              value={d ? String(d.avgVelocity) : "—"}
              hint={t("events.dashboard.sprintHint", { n: d?.sprintCount ?? 0 })}
              tint="slate"
            />
            <Kpi
              label={t("events.dashboard.avgSpi")}
              value={d?.avgSpi == null ? "—" : String(d.avgSpi)}
              hint={
                canFinance && d?.avgCpi != null
                  ? t("events.dashboard.avgCpiHint", { n: d.avgCpi })
                  : t("events.dashboard.spiHint")
              }
              tint="amber"
            />
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border/40 bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t("events.dashboard.timelineEmbed")}</h2>
            <p className="text-xs text-muted-foreground">{t("events.dashboard.timelineEmbedHint")}</p>
          </div>
          <Button size="sm" variant="ghost" asChild>
            <Link href="/events/calendar">{t("events.calendar.tabTimeline")}</Link>
          </Button>
        </div>
        {list.isLoading ? (
          <FecSkeleton className="h-40 rounded-xl" />
        ) : (
          <EventsPortfolioTimeline events={timelineEvents} month={month} />
        )}
      </section>

      <section id="event-staff" className="scroll-mt-24 rounded-2xl border border-border/40 bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t("events.dashboard.staffing")}</h2>
            <p className="text-xs text-muted-foreground">{t("events.dashboard.staffingHint")}</p>
          </div>
        </div>
        {staffingGaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("events.dashboard.staffingOk")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {staffingGaps.slice(0, 8).map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-2">
                <Link href={`/events/${event.id}#event-staff`} className="font-medium underline-offset-2 hover:underline">
                  {event.event_number} · {event.event_name || event.name}
                </Link>
                <Badge variant="warning">{t("events.dashboard.missingPm")}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

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
            <FecEmptyState message={t("events.list.empty")} className="border-0 bg-transparent" />
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
                {canFinance ? (
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
                ) : (
                  <span className="text-xs text-muted-foreground">{t("events.dashboard.financeHidden")}</span>
                )}
                <EventHealthBadge rag={event.health_rag} />
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
