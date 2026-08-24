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
import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useAuth } from "@/hooks/use-auth";
import { useDashboardKpis, useDashboardCharts } from "@/hooks/queries/useDashboardKpis";
import { useDashboardSecondary } from "@/hooks/queries/useDashboardSecondary";
import { useComplianceRenewals } from "@/hooks/queries/useInspections";
import { useAfterLoad, useScrollGatedVisible } from "@/hooks/use-deferred-visible";
import { useAppStore } from "@/stores/app-store";
import { useBranchesSummary } from "@/hooks/queries/useOperationsDashboard";
import { useSites } from "@/hooks/queries/useSites";
import type { DashboardPeriod } from "@/lib/dashboard.functions";
import { dashboardViewForRoles, canViewRevenue, type AppRole } from "@/lib/rbac";
import { fmtQar } from "@/lib/currency";
import { retryImport } from "@/lib/retry-import";
import { cn } from "@/lib/utils";
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

function CommandKpi({
  href,
  ...props
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tint: KpiTint;
  empty?: boolean;
  href?: string;
}) {
  const card = <TintedKpiCard compact {...props} />;
  if (!href) return card;
  return (
    <Link
      href={href}
      className="block rounded-2xl transition-shadow hover:shadow-elevated-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      {card}
    </Link>
  );
}

function HealthPill({ pct }: { pct: number }) {
  const { t } = useTranslation();
  const variant = pct >= 80 ? "success" : pct >= 60 ? "warning" : "destructive";
  const label =
    pct >= 80 ? t("home.healthHealthy") : pct >= 60 ? t("home.healthWatch") : t("home.healthAtRisk");
  return (
    <Badge variant={variant} className="tabular-nums">
      {label}
      <span className="font-semibold">{pct}%</span>
    </Badge>
  );
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
    hiddenExpired: ranked.slice(limit).filter((item) => String(item.alert_tier) === "Expired").length,
  };
}

function HomePage() {
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

  const branchesQ = useBranchesSummary(
    { period, locationId },
    { enabled: attentionEnabled },
  );

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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("home.asOf", { period: t(`home.period.${period}`), site: siteLabel })}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as DashboardPeriod)}>
            <SelectTrigger className="w-auto min-w-[10.5rem]" aria-label={t("home.periodLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`home.period.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {e ? (
            <span
              tabIndex={0}
              title={t("home.healthTooltip")}
              aria-label={`${t("home.health", { pct: e.health_score })}. ${t("home.healthTooltip")}`}
              className="group relative inline-flex cursor-help items-center rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              {t("home.health", { pct: e.health_score })}
              <span
                role="tooltip"
                className="pointer-events-none absolute end-0 top-full z-20 mt-2 w-72 rounded-xl border border-border/70 bg-card p-3 text-start text-xs font-normal leading-relaxed text-foreground opacity-0 shadow-elevated-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                {t("home.healthTooltip")}
              </span>
            </span>
          ) : null}
        </div>
      </header>

      {kpisQ.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[7.25rem] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CommandKpi
            title={t("home.openWorkOrders")}
            value={openWo}
            hint={t("home.sites", { n: e?.branches_total ?? "—" })}
            icon={Wrench}
            tint="sky"
            href="/maintenance"
          />
          <CommandKpi
            title={t("home.overduePms")}
            value={overdueWo}
            hint={t("home.orders")}
            icon={Clock}
            tint={overdueWo > 0 ? "red" : "green"}
            href="/maintenance"
          />
          <CommandKpi
            title={t("home.criticalIssues")}
            value={critical}
            hint={t("home.openIssuesHint", { n: openIssues })}
            icon={AlertTriangle}
            tint={critical > 0 ? "red" : openIssues > 0 ? "orange" : "green"}
            href="/issues"
          />
          <CommandKpi
            title={t("home.staffOnFloor")}
            value={hasRoster ? `${e.staff_present}/${e.staff_scheduled}` : t("home.noRoster")}
            hint={hasRoster ? t("home.acrossEstate") : t("home.noRosterHint")}
            icon={Users}
            tint="sky"
            empty={!hasRoster}
            href="/daily-ops/roster"
          />
          {hasRevenue ? (
            <CommandKpi
              title={t("home.revenueToday")}
              value={fmtQar(e.revenue_today)}
              hint={t("home.targetPct", { pct: e.revenue_target_pct })}
              icon={Wallet}
              tint="green"
              href="/revenue"
            />
          ) : null}
          {hasUtility ? (
            <CommandKpi
              title={t("home.utilityCost")}
              value={fmtQar(sm.utility_cost_this_month)}
              hint={t("home.thisMonth")}
              icon={BarChart3}
              tint="green"
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
                tint={(expiringAmc ?? 0) + (expiringDocs ?? 0) > 0 ? "orange" : "amber"}
                href="/compliance/expiry-alerts"
              />
              <CommandKpi
                title={t("home.complianceHealth")}
                value={complianceKpis ? `${complianceKpis.compliance_health_pct}%` : "—"}
                hint={t("home.complianceHealthHint")}
                icon={ShieldCheck}
                tint={
                  complianceKpis
                    ? complianceKpis.compliance_health_pct >= 80
                      ? "green"
                      : complianceKpis.compliance_health_pct >= 60
                        ? "amber"
                        : "red"
                    : "slate"
                }
                href="/compliance"
              />
            </>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-card">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <h2 className="section-kicker">
              <AlertTriangle strokeWidth={1.5} />
              <span>{t("home.needsAttention")}</span>
            </h2>
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
              <p className="px-4 py-6 text-sm text-muted-foreground">{t("home.noItemsDue")}</p>
            ) : (
              attention.top.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{item.item_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.domain} · {item.venue_scope}
                    </p>
                  </div>
                  <Badge variant={String(item.alert_tier) === "Expired" ? "destructive" : "warning"}>
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
        </section>

        <section className="surface-card p-5">
          <h2 className="section-kicker">
            <Gauge strokeWidth={1.5} />
            <span>{t("home.siteReadiness")}</span>
          </h2>
          <div className="mt-5 flex justify-center">
            {kpisQ.isLoading ? (
              <Skeleton className="h-[120px] w-[120px] rounded-full" />
            ) : (
              <CircularProgressBadge value={readiness} size={120} positive={readiness >= 70} />
            )}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">{t("home.readinessGaugeHint")}</p>
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
        </section>
      </div>

      <div ref={chartsRef}>
        <h2 className="section-kicker mb-3">
          <BarChart3 strokeWidth={1.5} />
          <span>{t("home.chartsTitle")}</span>
        </h2>
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
          <section className="surface-card p-4">
            <h2 className="section-kicker mb-3">
              <CheckCircle2 strokeWidth={1.5} />
              <span>{t("home.myAssignedTasks")}</span>
            </h2>
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
          </section>
        )}

      {showCompliance ? (
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <h2 className="section-kicker">
              <MapPin strokeWidth={1.5} />
              <span>{t("home.siteReadinessSummary")}</span>
            </h2>
          </div>
          {branchesQ.isLoading ? (
            <Skeleton className="m-4 h-32 rounded-xl" />
          ) : branchesQ.data && branchesQ.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-start text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">{t("home.tableSite")}</th>
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
                    <tr key={b.location_id} className="border-b border-border/30 last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2.5 font-medium">
                        <Link
                          href={`/occ/branch/${b.location_id}`}
                          className="text-foreground underline-offset-2 hover:underline"
                        >
                          {b.code}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <HealthPill pct={b.health_score} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={b.opening_checklist_pct >= 80 ? "success" : b.opening_checklist_pct > 0 ? "warning" : "muted"}>
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
            <p className="px-4 py-6 text-sm text-muted-foreground">{t("home.noBranchData")}</p>
          )}
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
      <span
        className={cn(
          "font-medium",
          tone === "danger" && "text-rag-red",
          tone === "warn" && "text-foreground",
          tone === "ok" && "text-muted-foreground",
        )}
      >
        {label}
      </span>
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

export default HomePage;
