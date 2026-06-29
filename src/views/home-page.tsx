"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  HelpCircle,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";

import { CircularProgressBadge } from "@/components/dashboard/circular-progress-badge";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { KPIWidget } from "@/components/dashboard/kpi-widget";
import { MiniMetricCard } from "@/components/dashboard/mini-metric-card";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useDashboardKpis } from "@/hooks/queries/useDashboardKpis";
import { useDashboardSecondary } from "@/hooks/queries/useDashboardSecondary";
import { useComplianceRenewals } from "@/hooks/queries/useInspections";
import { useAfterLoad, useScrollGatedVisible } from "@/hooks/use-deferred-visible";
import { useAppStore } from "@/stores/app-store";
import { useBranchesSummary } from "@/hooks/queries/useOperationsDashboard";
import type { DashboardPeriod } from "@/lib/dashboard.functions";
import { dashboardViewForRoles, canViewRevenue, type AppRole } from "@/lib/rbac";
import { fmtQar } from "@/lib/currency";
import { retryImport } from "@/lib/retry-import";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const HomeWoTrendChart = dynamic(
  () =>
    retryImport(() =>
      import("@/components/dashboard/home-dashboard-charts").then((m) => m.HomeWoTrendChart),
    ),
  { ssr: false, loading: () => <Skeleton className="h-56 rounded-2xl" /> },
);

const HomeBottomCharts = dynamic(
  () =>
    retryImport(() =>
      import("@/components/dashboard/home-dashboard-charts").then((m) => m.HomeBottomCharts),
    ),
  { ssr: false, loading: () => (
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-52 rounded-2xl" />
      <Skeleton className="h-52 rounded-2xl" />
    </div>
  ) },
);

const ActivityHistory = dynamic(
  () =>
    retryImport(() =>
      import("@/components/dashboard/activity-history").then((m) => m.ActivityHistory),
    ),
  { ssr: false, loading: () => <Skeleton className="h-48 rounded-2xl" /> },
);

const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

function KpiSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}

function HomePage() {
  const { roles } = useAuth();
  const roleList = roles.map((r) => r.role as AppRole);
  const view = dashboardViewForRoles(roleList);
  const showRevenue = canViewRevenue(roleList);
  const storeLocationId = useAppStore((s) => s.currentLocationId);
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [deferSecondary, setDeferSecondary] = useState(false);
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

  useEffect(() => {
    if (!kpisQ.isSuccess) return;
    let cancelled = false;
    let timer: number | undefined;

    const arm = () => {
      timer = window.setTimeout(() => {
        if (!cancelled) setDeferSecondary(true);
      }, 1500);
    };

    if (document.readyState === "complete") {
      arm();
    } else {
      const onLoad = () => arm();
      window.addEventListener("load", onLoad, { once: true });
      return () => {
        cancelled = true;
        window.removeEventListener("load", onLoad);
        if (timer !== undefined) window.clearTimeout(timer);
      };
    }

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [kpisQ.isSuccess]);

  const chartsEnabled = rolesReady && afterLoad && chartsVisible && !!kpisQ.data;
  const complianceKpisEnabled =
    rolesReady && showCompliance && deferSecondary && !complianceOpen;
  const complianceKpisOnExpand = rolesReady && showCompliance && complianceOpen;

  const secondaryIncludes = useMemo(() => {
    const inc: Array<"charts" | "complianceKpis"> = [];
    if (chartsEnabled) inc.push("charts");
    if (complianceKpisEnabled || complianceKpisOnExpand) inc.push("complianceKpis");
    return inc;
  }, [chartsEnabled, complianceKpisEnabled, complianceKpisOnExpand]);

  const secondaryQ = useDashboardSecondary({
    include: secondaryIncludes,
    locationId,
    year,
    utilityBase: kpisQ.data?.smartmaintain.utility_cost_this_month,
    enabled: secondaryIncludes.length > 0,
  });

  const chartsQ = {
    data: secondaryQ.data?.charts,
    isLoading: secondaryQ.isLoading && secondaryIncludes.includes("charts"),
  };

  const complianceKpisQ = {
    data: secondaryQ.data?.complianceKpis,
    isLoading: secondaryQ.isLoading && secondaryIncludes.includes("complianceKpis"),
  };

  const { data: dueItems, isLoading: renewalsLoading } = useComplianceRenewals(
    { limit: 20 },
    { enabled: rolesReady && showCompliance && complianceOpen },
  );

  const branchesQ = useBranchesSummary(
    { period, locationId },
    { enabled: rolesReady && branchesOpen && showCompliance },
  );

  const e = kpisQ.data?.estate;
  const sm = kpisQ.data?.smartmaintain;
  const charts = chartsQ.data;
  const complianceKpis = complianceKpisQ.data;

  const activityRows = useMemo(() => {
    return (charts?.siteIssues ?? []).slice(0, 5).map((b) => {
      const statusTone: "success" | "warning" | "danger" =
        b.critical === 0 ? "success" : b.critical < 3 ? "warning" : "danger";
      return {
        id: b.site,
        title: b.site,
        subtitle: `${b.issues} open issues`,
        time: "Today",
        category: "Site",
        status: b.critical === 0 ? "Healthy" : "Watch",
        statusTone,
      };
    });
  }, [charts?.siteIssues]);

  const dueSoon = useMemo(
    () =>
      (dueItems ?? [])
        .filter((i) => ["Due ≤30", "Due ≤60", "Expired"].includes(String(i.alert_tier)))
        .slice(0, 8),
    [dueItems],
  );

  if (!rolesReady) {
    return (
      <div className="mx-auto max-w-lg rounded-[28px] border border-dashed border-[#C7D2FE] bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-[#111827]">Account pending setup</h2>
        <p className="mt-2 text-sm text-[#6B7280]">Contact your administrator to get access.</p>
      </div>
    );
  }

  const openWo = sm?.open_work_orders ?? e?.open_issues ?? 0;
  const overdueWo = sm?.overdue_work_orders ?? 0;
  const pendingVerify = sm?.pending_inspections ?? 0;
  const declined = e?.critical_issues ?? 0;
  const readiness = sm?.site_readiness_score ?? e?.health_score ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select value={period} onValueChange={(v) => setPeriod(v as DashboardPeriod)}>
          <SelectTrigger className="h-9 w-[130px] rounded-full border-white/80 bg-white/80 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {e && (
          <Badge className="rounded-full bg-[#EEF0FF] text-[#6366F1] hover:bg-[#EEF0FF]">
            Health {e.health_score}%
          </Badge>
        )}
      </div>

      <CollapsibleSection title="Operations overview">
        {kpisQ.isLoading ? (
          <KpiSkeletonGrid />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KPIWidget
              title="Open work orders"
              value={openWo}
              secondary={`/ ${e?.branches_total ?? "—"} sites`}
              icon={Wrench}
              progress={openWo > 0 ? Math.min(100, openWo * 8) : 0}
              accent="blue"
              href="/maintenance"
            />
            <KPIWidget
              title="Pending verification"
              value={pendingVerify}
              secondary="inspections"
              icon={CheckCircle2}
              progress={pendingVerify > 0 ? 65 : 100}
              progressPositive={pendingVerify === 0}
              accent="cyan"
              href="/compliance/amc-schedule"
            />
            <KPIWidget
              title="Critical / declined"
              value={declined}
              secondary="issues"
              icon={XCircle}
              progress={declined > 0 ? 40 : 100}
              progressPositive={declined === 0}
              accent="red"
              href="/issues"
            />
            <KPIWidget
              title="RFI / open issues"
              value={e?.open_issues ?? "—"}
              secondary={`${e?.critical_issues ?? 0} critical`}
              icon={HelpCircle}
              progress={e ? Math.min(100, e.open_issues * 5) : 0}
              accent="purple"
              href="/issues"
            />
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Maintenance & compliance">
        {kpisQ.isLoading ? (
          <KpiSkeletonGrid />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KPIWidget
              title="AMC expiring soon"
              value={sm?.amc_expiring_soon ?? "—"}
              icon={ShieldCheck}
              accent="amber"
              href="/compliance/amc-dashboard"
            />
            <KPIWidget
              title="Overdue services"
              value={overdueWo}
              icon={Clock}
              accent="red"
              href="/maintenance"
            />
            <KPIWidget
              title="Utility cost (month)"
              value={sm ? fmtQar(sm.utility_cost_this_month) : "—"}
              icon={Gauge}
              accent="green"
              href="/operations/utilities"
            />
            <KPIWidget
              title="Downtime hours"
              value={sm?.downtime_hours ?? "—"}
              subtitle="MTD"
              icon={AlertTriangle}
              accent="purple"
              href="/maintenance"
            />
          </div>
        )}
      </CollapsibleSection>

      <div ref={chartsRef} className="grid gap-4 lg:grid-cols-12">
        <NeumorphicCard className="relative overflow-hidden p-6 lg:col-span-4">
          <div className="absolute inset-0 bg-gradient-to-br from-[#8B5CF6] to-[#3B82F6] opacity-[0.92]" />
          <div className="relative text-white">
            <p className="text-sm font-medium opacity-90">Site readiness</p>
            <div className="mt-6 flex justify-center">
              {kpisQ.isLoading ? (
                <Skeleton className="h-[120px] w-[120px] rounded-full bg-white/20" />
              ) : (
                <CircularProgressBadge value={readiness} size={120} positive={readiness >= 70} />
              )}
            </div>
            <p className="mt-4 text-center text-3xl font-bold">{readiness}%</p>
            <p className="mt-1 text-center text-sm opacity-80">
              {sm?.high_risk_items ?? 0} high-risk · {complianceKpis?.doc_expired ?? complianceKpis?.expired ?? "—"} docs expired · {complianceKpis?.doc_due_7 ?? "—"} due ≤7d
            </p>
            <Link href="/compliance/expiry-alerts" className="mt-2 block text-center text-xs underline opacity-90">
              View expiry alerts
            </Link>
            <Link href="/facility" className="mt-4 block text-center text-xs underline opacity-90">
              View facility readiness
            </Link>
          </div>
        </NeumorphicCard>

        <div className="flex flex-col gap-4 lg:col-span-3">
          <MiniMetricCard label="Staff present" value={e ? `${e.staff_present}/${e.staff_scheduled}` : "—"} hint="Across estate" accent="blue" />
          {showRevenue && (
            <MiniMetricCard label="Revenue today" value={e ? fmtQar(e.revenue_today) : "—"} hint={`Target ${e?.revenue_target_pct ?? "—"}%`} accent="purple" />
          )}
          <MiniMetricCard label="Compliance health" value={complianceKpis ? `${complianceKpis.compliance_health_pct}%` : "—"} hint="Register items" accent="green" />
          <MiniMetricCard label="Docs expiring ≤30d" value={complianceKpis?.doc_due_30 != null ? String(complianceKpis.doc_due_30) : "—"} hint="Legal certificates" accent="purple" />
        </div>

        <div className="lg:col-span-5">
          <Suspense fallback={<Skeleton className="h-56 rounded-2xl" />}>
            {!chartsVisible || chartsQ.isLoading ? (
              <Skeleton className="h-56 rounded-2xl" />
            ) : (
              <HomeWoTrendChart data={charts?.woTrend ?? []} />
            )}
          </Suspense>
        </div>
      </div>

      <Suspense fallback={<Skeleton className="h-52 rounded-2xl" />}>
        {!chartsVisible || chartsQ.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
          </div>
        ) : (
          <HomeBottomCharts
            siteIssueChart={charts?.siteIssues ?? []}
            utilityTrend={charts?.utilityTrend ?? []}
          />
        )}
      </Suspense>

      {showCompliance && (
        <CollapsibleSection
          title="AMC & compliance due"
          defaultOpen={false}
          onOpenChange={setComplianceOpen}
        >
          <NeumorphicCard className="overflow-hidden p-0">
            <div className="divide-y divide-[#EEF0FF]">
              {!complianceOpen ? (
                <p className="p-6 text-center text-sm text-[#9CA3AF]">Expand to load due items.</p>
              ) : renewalsLoading ? (
                <Skeleton className="m-4 h-24 rounded-2xl" />
              ) : dueSoon.length === 0 ? (
                <p className="p-6 text-center text-sm text-[#9CA3AF]">No items due soon.</p>
              ) : (
                dueSoon.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium text-[#111827]">{item.item_name}</p>
                      <p className="text-xs text-[#9CA3AF]">{item.domain} · {item.venue_scope}</p>
                    </div>
                    <Badge variant="outline" className={String(item.alert_tier) === "Expired" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                      {String(item.alert_tier)}
                    </Badge>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-[#EEF0FF] px-5 py-3 text-end">
              <Link href="/compliance/register" className="text-xs font-medium text-[#6366F1] hover:underline">
                View full register →
              </Link>
              {" · "}
              <Link href="/compliance/expiry-alerts" className="text-xs font-medium text-[#6366F1] hover:underline">
                Document expiry alerts →
              </Link>
            </div>
          </NeumorphicCard>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Recent activity" defaultOpen={false}>
        <ActivityHistory rows={activityRows} />
      </CollapsibleSection>

      {(view === "tasks" || view === "branch") && kpisQ.data?.assigned_tasks && kpisQ.data.assigned_tasks.length > 0 && (
        <CollapsibleSection title="My assigned tasks">
          <NeumorphicCard className="p-4">
            <ul className="space-y-2">
              {kpisQ.data.assigned_tasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between text-sm">
                  <Link href={`/tasks/${task.id}`} className="font-medium text-[#6366F1] hover:underline">
                    {task.title}
                  </Link>
                  <Badge variant="outline">{task.status}</Badge>
                </li>
              ))}
            </ul>
          </NeumorphicCard>
        </CollapsibleSection>
      )}

      {showCompliance && (
        <CollapsibleSection
          title="Site readiness summary"
          defaultOpen={false}
          onOpenChange={(open) => setBranchesOpen(open)}
        >
          {branchesQ.isLoading ? (
            <Skeleton className="h-48 w-full rounded-2xl" />
          ) : branchesQ.data && branchesQ.data.length > 0 ? (
            <div className="overflow-x-auto rounded-[28px] border border-white/80 bg-[#F8FAFF] shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#EEF0FF] text-left text-xs text-[#9CA3AF]">
                    <th className="px-4 py-3">Site</th>
                    <th className="px-4 py-3">Health</th>
                    <th className="px-4 py-3">Opening</th>
                    <th className="px-4 py-3">Staff</th>
                    <th className="px-4 py-3">Issues</th>
                    {showRevenue && <th className="px-4 py-3">Revenue</th>}
                  </tr>
                </thead>
                <tbody>
                  {branchesQ.data.map((b) => (
                    <tr key={b.location_id} className="border-b border-[#EEF0FF]/80">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/occ/branch/${b.location_id}`} className="text-[#6366F1] hover:underline">
                          {b.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{b.health_score}%</td>
                      <td className="px-4 py-3">{b.opening_checklist_pct}%</td>
                      <td className="px-4 py-3">{b.staff_present}/{b.staff_scheduled}</td>
                      <td className="px-4 py-3">{b.open_issues}</td>
                      {showRevenue && <td className="px-4 py-3">{fmtQar(b.revenue_today)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : branchesOpen ? (
            <p className="text-sm text-[#9CA3AF]">No branch data available.</p>
          ) : null}
        </CollapsibleSection>
      )}
    </div>
  );
}

export default HomePage;
