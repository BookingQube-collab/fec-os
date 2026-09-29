"use client";

import { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Gauge,
  MapPin,
  ShieldCheck,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CircularProgressBadge } from "@/components/dashboard/circular-progress-badge";
import {
  AppCard,
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
  SectionHeader,
  SegmentControl,
  StatusCard,
  StatusChip,
  StatusIndicator,
  type MetricTone,
  type StatusTone,
} from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EmployeeMePage from "@/views/employee-me-page";

import { useAuth } from "@/hooks/use-auth";
import { useDashboardKpis, useDashboardCharts } from "@/hooks/queries/useDashboardKpis";
import { useDashboardSecondary } from "@/hooks/queries/useDashboardSecondary";
import { useComplianceRenewals } from "@/hooks/queries/useInspections";
import { useAfterLoad, useScrollGatedVisible } from "@/hooks/use-deferred-visible";
import { useAppStore } from "@/stores/app-store";

import { useSites } from "@/hooks/queries/useSites";
import { useBranchesSummary } from "@/hooks/queries/useOperationsDashboard";
import type { DashboardPeriod } from "@/lib/dashboard.functions";
import {
  dashboardViewForRoles,
  canViewRevenue,
  isEmployeeHomeAudience,
  type AppRole,
} from "@/lib/rbac";
import { fmtQar } from "@/lib/currency";
import { retryImport } from "@/lib/retry-import";
import type { ComplianceRenewalRow } from "@/lib/queries/amc-queries.core";

const HomeCommandCharts = dynamic(
  () =>
    retryImport(() =>
      import("@/components/dashboard/home-dashboard-charts").then((m) => m.HomeCommandCharts),
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    ),
  },
);

const PERIODS: DashboardPeriod[] = ["today", "yesterday", "week", "month"];

const TIER_RANK: Record<string, number> = {
  "Due ≤30": 0,
  "Due ≤60": 1,
  Expired: 2,
};

function healthTone(pct: number): StatusTone {
  if (pct >= 80) return "completed";
  if (pct >= 60) return "warning";
  return "critical";
}

function CommandKpi({
  href,
  tone,
  pulse,
  ...props
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone: MetricTone;
  empty?: boolean;
  href?: string;
  pulse?: boolean;
}) {
  return <MetricCard href={href} tone={tone} pulse={pulse} {...props} />;
}

function pickAttentionItems(rows: ComplianceRenewalRow[] | undefined, limit = 5) {
  const ranked = (rows ?? [])
    .filter((item) => ["Due ≤30", "Due ≤60", "Expired"].includes(String(item.alert_tier)))
    .slice()
    .sort((a, b) => {
      const rank = (TIER_RANK[String(a.alert_tier)] ?? 9) - (TIER_RANK[String(b.alert_tier)] ?? 9);
      if (rank !== 0) return rank;
      return String(a.expiry_date ?? "").localeCompare(String(b.expiry_date ?? ""));
    });
  return {
    top: ranked.slice(0, limit),
    hiddenExpired: ranked.slice(limit).filter((item) => String(item.alert_tier) === "Expired")
      .length,
  };
}

function OpsCommandHome() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const roleList = roles.map((r) => r.role as AppRole);
  const view = dashboardViewForRoles(roleList);
  const showRevenue = canViewRevenue(roleList);
  const storeLocationId = useAppStore((s) => s.currentLocationId);
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const afterLoad = useAfterLoad(100);
  const { ref: chartsRef, visible: chartsVisible } = useScrollGatedVisible(100);
  const locationId = storeLocationId ?? null;
  const year = new Date().getFullYear();
  const showCompliance = view === "estate" || view === "branch";
  const rolesReady = roleList.length > 0;

  const kpisQ = useDashboardKpis({
    period,
    locationId,
    view,
    enabled: rolesReady,
  });

  const sitesQ = useSites({ enabled: rolesReady });
  const attentionEnabled = rolesReady && showCompliance && !!kpisQ.data;
  const chartsEnabled = rolesReady && afterLoad && chartsVisible && !!kpisQ.data;

  const secondaryQ = useDashboardSecondary({
    include: attentionEnabled ? ["complianceKpis"] : [],
    locationId,
    year,
    utilityBase: kpisQ.data?.smartmaintain.utility_cost_this_month,
    enabled: attentionEnabled,
  });

  const renewalsQ = useComplianceRenewals({ limit: 8 }, { enabled: attentionEnabled });

  const chartsQ = useDashboardCharts({
    period,
    locationId,
    year,
    utilityBase: kpisQ.data?.smartmaintain.utility_cost_this_month,
    enabled: chartsEnabled,
  });

  const branchesQ = useBranchesSummary({ period, locationId }, { enabled: attentionEnabled });

  const e = kpisQ.data?.estate;
  const sm = kpisQ.data?.smartmaintain;
  const charts = chartsQ.data;
  const complianceKpis = secondaryQ.data?.complianceKpis;

  const siteLabel = useMemo(() => {
    if (!locationId) return t("common.allBranches");
    return sitesQ.data?.find((s) => s.id === locationId)?.code ?? t("common.allBranches");
  }, [locationId, sitesQ.data, t]);

  const attention = useMemo(() => pickAttentionItems(renewalsQ.data, 5), [renewalsQ.data]);

  const openingPct = useMemo(() => {
    const rows = branchesQ.data ?? [];
    if (rows.length === 0) return null;
    return Math.round(rows.reduce((sum, row) => sum + row.opening_checklist_pct, 0) / rows.length);
  }, [branchesQ.data]);

  if (!rolesReady) {
    return (
      <div className="mx-auto max-w-lg rounded-[var(--radius-xl)] border border-dashed border-border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold text-foreground">{t("home.pendingTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("home.pendingBody")}</p>
      </div>
    );
  }

  const openWo = sm?.open_work_orders ?? e?.open_issues ?? 0;
  const overdueWo = sm?.overdue_work_orders ?? 0;
  const pendingVerify = sm?.pending_inspections ?? 0;
  const critical = e?.critical_issues ?? 0;
  const openIssues = e?.open_issues ?? 0;
  const readiness = sm?.site_readiness_score ?? e?.health_score ?? 0;
  const hasRoster = !!e && e.staff_scheduled > 0;
  const hasRevenue = showRevenue && !!e && (e.revenue_today > 0 || e.revenue_target_pct > 0);
  const hasUtility = !!sm && sm.utility_cost_this_month > 0;
  const expiringDocs = complianceKpis?.doc_due_30;
  const expiringAmc = sm?.amc_expiring_soon;
  const expiringValue =
    expiringDocs != null || expiringAmc != null ? (expiringAmc ?? 0) + (expiringDocs ?? 0) : "—";
  const branchRows = branchesQ.data;
  const lateTotal = branchRows ? branchRows.reduce((sum, row) => sum + row.staff_late, 0) : null;
  const gamesOffline = branchRows
    ? branchRows.reduce((sum, row) => sum + row.machines_down, 0)
    : null;

  return (
    <div className="ds-enter space-y-6">
      <PageHeader
        description={t("home.asOf", { period: t(`home.period.${period}`), site: siteLabel })}
        actions={
          <>
            <SegmentControl
              layout="scroll"
              ariaLabel={t("home.periodLabel")}
              value={period}
              onValueChange={setPeriod}
              options={PERIODS.map((p) => ({ value: p, label: t(`home.period.${p}`) }))}
            />
            {e ? (
              <StatusChip tone={healthTone(e.health_score)}>
                <span title={t("home.healthTooltip")}>{t("home.health", { pct: e.health_score })}</span>
              </StatusChip>
            ) : null}
          </>
        }
      />

      {kpisQ.isLoading ? (
        <LoadingState label={t("home.chartsTitle")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {e ? (
            <CommandKpi
              title={t("home.sitesOpen")}
              value={`${e.branches_open}/${e.branches_total}`}
              hint={t("home.sites", { n: e.branches_total })}
              icon={MapPin}
              tone="info"
              href="/branches"
            />
          ) : null}
          <CommandKpi
            title={t("home.openWorkOrders")}
            value={openWo}
            hint={t("home.sites", { n: e?.branches_total ?? "—" })}
            icon={Wrench}
            tone="info"
            href="/maintenance"
          />
          <CommandKpi
            title={t("home.overduePms")}
            value={overdueWo}
            hint={t("home.orders")}
            icon={Clock}
            tone={overdueWo > 0 ? "danger" : "success"}
            href="/maintenance"
          />
          <CommandKpi
            title={t("home.criticalIssues")}
            value={critical}
            hint={t("home.openIssuesHint", { n: openIssues })}
            icon={AlertTriangle}
            tone={critical > 0 ? "danger" : openIssues > 0 ? "warning" : "success"}
            pulse={critical > 0}
            href="/issues"
          />
          <CommandKpi
            title={t("home.staffOnFloor")}
            value={hasRoster ? `${e.staff_present}/${e.staff_scheduled}` : t("home.noRoster")}
            hint={hasRoster ? t("home.acrossEstate") : t("home.noRosterHint")}
            icon={Users}
            tone="info"
            empty={!hasRoster}
            href="/daily-ops/roster"
          />
          {lateTotal != null ? (
            <CommandKpi
              title={t("home.staffLate")}
              value={lateTotal}
              hint={t("home.staffLateHint")}
              icon={Clock}
              tone={lateTotal > 0 ? "warning" : "success"}
              href="/people/attendance"
            />
          ) : null}
          {gamesOffline != null ? (
            <CommandKpi
              title={t("home.gamesOffline")}
              value={gamesOffline}
              hint={t("home.gamesOfflineHint")}
              icon={Gauge}
              tone={gamesOffline > 0 ? "danger" : "success"}
              href="/arcade/faults"
            />
          ) : null}
          {hasRevenue ? (
            <CommandKpi
              title={t("home.revenueToday")}
              value={fmtQar(e.revenue_today)}
              hint={t("home.targetPct", { pct: e.revenue_target_pct })}
              icon={Wallet}
              tone="success"
              href="/revenue"
            />
          ) : null}
          {hasUtility ? (
            <CommandKpi
              title={t("home.utilityCost")}
              value={fmtQar(sm.utility_cost_this_month)}
              hint={t("home.thisMonth")}
              icon={BarChart3}
              tone="success"
              href="/operations/utilities"
            />
          ) : null}
          {showCompliance ? (
            <>
              <CommandKpi
                title={t("home.expiringSoon")}
                value={expiringValue}
                hint={t("home.expiringHint", {
                  amc: expiringAmc ?? "—",
                  docs: expiringDocs ?? "—",
                })}
                icon={ShieldCheck}
                tone={(expiringAmc ?? 0) + (expiringDocs ?? 0) > 0 ? "warning" : "neutral"}
                href="/compliance/expiry-alerts"
              />
              <CommandKpi
                title={t("home.complianceHealth")}
                value={complianceKpis ? `${complianceKpis.compliance_health_pct}%` : "—"}
                hint={t("home.complianceHealthHint")}
                icon={ShieldCheck}
                tone={
                  complianceKpis
                    ? complianceKpis.compliance_health_pct >= 80
                      ? "success"
                      : complianceKpis.compliance_health_pct >= 60
                        ? "warning"
                        : "danger"
                    : "neutral"
                }
                href="/compliance"
              />
            </>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <AppCard>
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
              <SectionHeader icon={AlertTriangle} title={t("home.needsAttention")} />
              <Button variant="ghost" size="sm" asChild>
                <Link href="/compliance/expiry-alerts">{t("home.viewAll")}</Link>
              </Button>
            </div>
            <div className="divide-y divide-border/40">
              <AttentionRow
                href="/maintenance"
                label={t("home.overdueWoItem", { n: overdueWo })}
                tone={overdueWo > 0 ? "danger" : "ok"}
              />
              <AttentionRow
                href="/compliance/amc-schedule"
                label={t("home.pendingInspectItem", { n: pendingVerify })}
                tone={pendingVerify > 0 ? "warn" : "ok"}
              />
              {renewalsQ.isLoading ? (
                <Skeleton className="m-4 h-24 rounded-xl" />
              ) : attention.top.length === 0 ? (
              <EmptyState title={t("home.noItemsDue")} />
              ) : (
                attention.top.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{item.item_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.domain} · {item.venue_scope}
                      </p>
                    </div>
                    <Badge
                      variant={String(item.alert_tier) === "Expired" ? "destructive" : "warning"}
                    >
                      {tierLabel(t, String(item.alert_tier))}
                    </Badge>
                  </div>
                ))
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {attention.hiddenExpired > 0
                  ? t("home.moreExpired", { n: attention.hiddenExpired })
                  : t("home.attentionHint")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/compliance/register">{t("home.viewFullRegister")}</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/compliance/expiry-alerts">{t("home.documentExpiryAlerts")}</Link>
                </Button>
              </div>
            </div>
          </AppCard>
        </section>

        <section>
          <AppCard>
            <StatusCard>
              <SectionHeader icon={Gauge} title={t("home.siteReadiness")} />
              <div className="mt-5 flex justify-center">
                {kpisQ.isLoading ? (
                  <Skeleton className="h-[120px] w-[120px] rounded-full" />
                ) : (
                  <CircularProgressBadge value={readiness} size={120} positive={readiness >= 70} />
                )}
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {t("home.readinessGaugeHint")}
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{t("home.highRiskBullet", { n: sm?.high_risk_items ?? 0 })}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    {openingPct == null
                      ? t("home.openingBulletEmpty")
                      : t("home.openingBullet", { pct: openingPct })}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    {hasRoster
                      ? t("home.staffBullet", {
                          present: e.staff_present,
                          scheduled: e.staff_scheduled,
                        })
                      : t("home.staffBulletEmpty")}
                  </span>
                </li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link href="/compliance/expiry-alerts">{t("home.viewExpiryAlerts")}</Link>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/facility">{t("home.viewFacilityReadiness")}</Link>
                </Button>
              </div>
            </StatusCard>
          </AppCard>
        </section>
      </div>

      <div ref={chartsRef}>
        <SectionHeader className="mb-3" icon={BarChart3} title={t("home.chartsTitle")} />
        <Suspense
          fallback={
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-64 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          }
        >
          {!chartsVisible || chartsQ.isLoading ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-64 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          ) : (
            <HomeCommandCharts
              woTrend={charts?.woTrend ?? []}
              siteIssueChart={charts?.siteIssues ?? []}
              utilityTrend={charts?.utilityTrend ?? []}
            />
          )}
        </Suspense>
      </div>

      {(view === "tasks" || view === "branch") &&
        kpisQ.data?.assigned_tasks &&
        kpisQ.data.assigned_tasks.length > 0 && (
          <section>
            <AppCard>
              <div className="p-4">
                <SectionHeader className="mb-3" icon={CheckCircle2} title={t("home.myAssignedTasks")} />
                <ul className="space-y-2">
                  {kpisQ.data.assigned_tasks.map((task) => (
                    <li key={task.id} className="flex items-center justify-between text-sm">
                      <Link
                        href={`/tasks/${task.id}`}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {task.title}
                      </Link>
                      <Badge variant="outline">{task.status}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </AppCard>
          </section>
        )}

      {showCompliance ? (
        <section>
          <AppCard>
            <div className="border-b border-border/40 px-4 py-3">
              <SectionHeader icon={MapPin} title={t("home.siteReadinessSummary")} />
            </div>
            {branchesQ.isLoading ? (
              <Skeleton className="m-4 h-32 rounded-xl" />
            ) : branchesQ.data && branchesQ.data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-start text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="sticky start-0 z-10 bg-card px-4 py-2.5 font-semibold">{t("home.tableSite")}</th>
                      <th className="px-4 py-2.5 font-semibold">{t("home.tableHealth")}</th>
                      <th className="px-4 py-2.5 font-semibold">{t("home.tableOpening")}</th>
                      <th className="px-4 py-2.5 font-semibold">{t("home.tableStaff")}</th>
                      <th className="px-4 py-2.5 font-semibold">{t("home.tableIssues")}</th>
                      {showRevenue ? (
                        <th className="px-4 py-2.5 font-semibold">{t("home.tableRevenue")}</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {branchesQ.data.map((b) => (
                      <tr
                        key={b.location_id}
                        className="border-b border-border/30 last:border-0 hover:bg-muted/40"
                      >
                        <td className="sticky start-0 z-10 bg-card px-4 py-2.5 font-medium">
                          <Link
                            href={`/occ/branch/${b.location_id}`}
                            className="text-foreground underline-offset-2 hover:underline"
                          >
                            {b.code}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusChip tone={healthTone(b.health_score)} className="tabular-nums">
                            {b.health_score >= 80
                              ? t("home.healthHealthy")
                              : b.health_score >= 60
                                ? t("home.healthWatch")
                                : t("home.healthAtRisk")}
                            <span className="font-semibold">{b.health_score}%</span>
                          </StatusChip>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge
                            variant={
                              b.opening_checklist_pct >= 80
                                ? "success"
                                : b.opening_checklist_pct > 0
                                  ? "warning"
                                  : "muted"
                            }
                          >
                            {b.opening_checklist_pct}%
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                          {b.staff_scheduled > 0
                            ? `${b.staff_present}/${b.staff_scheduled}`
                            : t("home.noStaffShort")}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">{b.open_issues}</td>
                        {showRevenue ? (
                          <td className="px-4 py-2.5 tabular-nums">
                            {b.revenue_today > 0 ? fmtQar(b.revenue_today) : "—"}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title={t("home.noBranchData")} />
            )}
          </AppCard>
        </section>
      ) : null}
    </div>
  );
}

function AttentionRow({
  href,
  label,
  tone,
}: {
  href: string;
  label: string;
  tone: "danger" | "warn" | "ok";
}) {
  const { t } = useTranslation();
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40"
    >
      <StatusIndicator
        tone={tone === "danger" ? "critical" : tone === "warn" ? "warning" : "completed"}
        label={label}
        pulse={tone === "danger"}
      />
      <span className="text-xs text-muted-foreground">{t("home.viewAll")}</span>
    </Link>
  );
}

function tierLabel(t: (key: string) => string, tier: string) {
  if (tier === "Expired") return t("home.tierExpired");
  if (tier === "Due ≤30") return t("home.tierDue30");
  if (tier === "Due ≤60") return t("home.tierDue60");
  return tier;
}

export default function HomePage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const roleList = roles.map((r) => r.role as AppRole);
  if (roleList.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-[var(--radius-xl)] border border-dashed border-border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold text-foreground">{t("home.pendingTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("home.pendingBody")}</p>
      </div>
    );
  }
  if (isEmployeeHomeAudience(roleList)) return <EmployeeMePage />;
  return <OpsCommandHome />;
}
