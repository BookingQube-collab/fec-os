"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  MessageSquareWarning,
  PackageMinus,
  ShieldAlert,
  Siren,
  Users,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { DailyOpsPageShell } from "@/components/daily-ops/DailyOpsLayout";
import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDailyOpsKpis } from "@/hooks/queries/useDailyOps";
import { usePermission } from "@/hooks/use-permission";
import {
  DAILY_OPS_KPI_HREFS,
  dailyOpsKpiLevel,
  type DailyOpsKpiLevel,
} from "@/lib/daily-ops/constants";
import type { DailyOpsLocationKpis } from "@/lib/queries/daily-ops.core";
import { KPI_TINT_CLASS, type KpiTint } from "@/lib/ui/command-surface";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

const KPI_CARDS = [
  {
    key: "active_employees",
    labelKey: "dailyOps.kpis.activeEmployees",
    invert: true,
    icon: Users,
  },
  {
    key: "open_incidents",
    labelKey: "dailyOps.kpis.openIncidents",
    icon: AlertTriangle,
  },
  {
    key: "critical_open_incidents",
    labelKey: "dailyOps.kpis.criticalIncidents",
    icon: ShieldAlert,
  },
  {
    key: "items_needing_reorder",
    labelKey: "dailyOps.kpis.reorderItems",
    icon: PackageMinus,
  },
  {
    key: "open_maintenance_issues",
    labelKey: "dailyOps.kpis.openMaintenance",
    icon: Wrench,
  },
  {
    key: "urgent_maintenance_open",
    labelKey: "dailyOps.kpis.urgentMaintenance",
    icon: Siren,
  },
  {
    key: "open_complaints",
    labelKey: "dailyOps.kpis.openComplaints",
    icon: MessageSquareWarning,
  },
  {
    key: "briefings_filed_today",
    labelKey: "dailyOps.kpis.briefingsToday",
    invert: true,
    icon: ClipboardList,
  },
] as const;

const LEVEL_TINT: Record<DailyOpsKpiLevel, KpiTint> = {
  critical: "red",
  watch: "amber",
  healthy: "green",
  missing: "orange",
};

type LocationStatus = "critical" | "watch" | "clear";

function locationStatus(row: DailyOpsLocationKpis): LocationStatus {
  if (row.critical_open_incidents > 0 || row.urgent_maintenance_open > 0) return "critical";
  const watch =
    row.open_incidents +
    row.open_maintenance_issues +
    row.open_complaints +
    row.items_needing_reorder;
  if (watch > 0 || row.briefings_filed_today === 0) return "watch";
  return "clear";
}

function SignalChip({ href, children, tone }: { href: string; children: ReactNode; tone: "critical" | "watch" }) {
  return (
    <Link
      href={href}
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <Badge variant={tone === "critical" ? "destructive" : "warning"} className="hover:opacity-90">
        {children}
      </Badge>
    </Link>
  );
}

function DailyOpsDashboardPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canViewAll = usePermission("daily_ops.view_all");
  const { data, isLoading } = useDailyOpsKpis(locationId);

  const attentionParts: string[] = [];
  if ((data?.urgent_maintenance_open ?? 0) > 0) {
    attentionParts.push(t("dailyOps.dashboard.attentionUrgent", { count: data!.urgent_maintenance_open }));
  }
  if ((data?.critical_open_incidents ?? 0) > 0) {
    attentionParts.push(t("dailyOps.dashboard.attentionCritical", { count: data!.critical_open_incidents }));
  } else if ((data?.open_incidents ?? 0) > 0 && (data?.urgent_maintenance_open ?? 0) > 0) {
    attentionParts.push(t("dailyOps.dashboard.attentionIncident", { count: data!.open_incidents }));
  }
  const showAttention =
    !isLoading &&
    ((data?.critical_open_incidents ?? 0) > 0 || (data?.urgent_maintenance_open ?? 0) > 0);

  const locationRows = data?.by_location ?? [];
  const allVenuesClear = locationRows.length > 0 && locationRows.every((row) => locationStatus(row) === "clear");

  return (
    <DailyOpsPageShell
      title={t("dailyOps.dashboard.title")}
      subtitle={t("dailyOps.dashboard.subtitle")}
    >
      {showAttention && attentionParts.length > 0 ? (
        <div
          className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
          role="status"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">{t("dailyOps.dashboard.attentionBanner")}: </span>
            {attentionParts.join(" · ")}
          </p>
        </div>
      ) : null}

      {isLoading ? (
        <KpiSkeletonStrip count={8} />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {KPI_CARDS.map((card) => {
            const value = Number(data?.[card.key] ?? 0);
            const invert = "invert" in card && card.invert;
            const level = dailyOpsKpiLevel(card.key, value, invert);
            const label = t(card.labelKey);
            const Icon = card.icon;
            return (
              <Link
                key={card.key}
                href={DAILY_OPS_KPI_HREFS[card.key]}
                aria-label={t("dailyOps.dashboard.openKpi", { label })}
                className={cn(
                  "group flex h-full flex-col rounded-2xl border px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.05)]",
                  "transition-all hover:-translate-y-0.5 hover:shadow-md",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  KPI_TINT_CLASS[LEVEL_TINT[level]],
                  level === "healthy" && "opacity-80",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium text-muted-foreground">{label}</p>
                  <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:ltr:translate-x-0.5 group-hover:rtl:-translate-x-0.5 rtl:rotate-180" />
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-1.5 text-2xl font-bold tracking-tight tabular-nums",
                    level === "healthy" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {value}
                </p>
                <p className="mt-auto pt-2 text-xs font-medium text-muted-foreground">
                  {t("dailyOps.dashboard.open")}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      {canViewAll && (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">{t("dailyOps.dashboard.byLocation")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("dailyOps.dashboard.byLocationHint")}</p>
          </div>
          {isLoading ? (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : locationRows.length > 0 ? (
            <>
              {allVenuesClear ? (
                <p className="text-sm text-emerald-700">{t("dailyOps.dashboard.allClear")}</p>
              ) : null}
              <div className="overflow-x-auto surface-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("dailyOps.table.venue")}</TableHead>
                      <TableHead>{t("dailyOps.dashboard.status")}</TableHead>
                      <TableHead>{t("dailyOps.dashboard.signals")}</TableHead>
                      <TableHead>{t("dailyOps.dashboard.staffOnDuty")}</TableHead>
                      <TableHead>{t("dailyOps.dashboard.briefing")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locationRows.map((row) => {
                      const status = locationStatus(row);
                      const signals: { href: string; label: string; tone: "critical" | "watch" }[] = [];
                      if (row.critical_open_incidents > 0) {
                        signals.push({
                          href: "/daily-ops/incidents?severity=critical",
                          label: t("dailyOps.dashboard.signalCritical", { count: row.critical_open_incidents }),
                          tone: "critical",
                        });
                      }
                      if (row.urgent_maintenance_open > 0) {
                        signals.push({
                          href: "/daily-ops/maintenance?priority=urgent",
                          label: t("dailyOps.dashboard.signalUrgent", { count: row.urgent_maintenance_open }),
                          tone: "critical",
                        });
                      }
                      if (row.open_incidents > 0 && row.critical_open_incidents === 0) {
                        signals.push({
                          href: "/daily-ops/incidents",
                          label: t("dailyOps.dashboard.signalIncident", { count: row.open_incidents }),
                          tone: "watch",
                        });
                      }
                      if (row.open_maintenance_issues > 0 && row.urgent_maintenance_open === 0) {
                        signals.push({
                          href: "/daily-ops/maintenance",
                          label: t("dailyOps.dashboard.signalMaintenance", { count: row.open_maintenance_issues }),
                          tone: "watch",
                        });
                      }
                      if (row.items_needing_reorder > 0) {
                        signals.push({
                          href: "/daily-ops/inventory",
                          label: t("dailyOps.dashboard.signalReorder", { count: row.items_needing_reorder }),
                          tone: "watch",
                        });
                      }
                      if (row.open_complaints > 0) {
                        signals.push({
                          href: "/daily-ops/complaints",
                          label: t("dailyOps.dashboard.signalComplaint", { count: row.open_complaints }),
                          tone: "watch",
                        });
                      }

                      return (
                        <TableRow key={row.location_id}>
                          <TableCell>
                            <div className="min-w-0">
                              <p className="font-medium">{row.name || row.code}</p>
                              {row.name ? (
                                <p className="text-xs text-muted-foreground">{row.code}</p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                status === "critical" ? "destructive" : status === "watch" ? "warning" : "success"
                              }
                            >
                              {status === "critical"
                                ? t("dailyOps.dashboard.statusCritical")
                                : status === "watch"
                                  ? t("dailyOps.dashboard.statusWatch")
                                  : t("dailyOps.dashboard.statusClear")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {signals.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {signals.map((signal) => (
                                  <SignalChip key={`${row.location_id}-${signal.href}-${signal.label}`} href={signal.href} tone={signal.tone}>
                                    {signal.label}
                                  </SignalChip>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">{t("dailyOps.dashboard.noSignals")}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Link
                              href="/daily-ops/roster"
                              className="tabular-nums text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                            >
                              {row.active_employees}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href="/daily-ops/briefings"
                              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                            >
                              <Badge variant={row.briefings_filed_today > 0 ? "success" : "warning"}>
                                {row.briefings_filed_today > 0
                                  ? t("dailyOps.dashboard.briefingFiled")
                                  : t("dailyOps.dashboard.briefingMissing")}
                              </Badge>
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("dailyOps.dashboard.emptyLocations")}</p>
          )}
        </div>
      )}
    </DailyOpsPageShell>
  );
}

export default DailyOpsDashboardPage;
