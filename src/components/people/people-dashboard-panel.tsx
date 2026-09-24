"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePeopleDashboard } from "@/hooks/queries/usePeopleDashboard";
import { useStaff } from "@/hooks/queries/usePeople";
import { usePermission } from "@/hooks/use-permission";
import { getHrOverview } from "@/lib/hr-overview.functions";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { fmtQar } from "@/lib/currency";
import {
  computeStaffDirectoryKpis,
  filterStaffDirectory,
} from "@/lib/staff-directory-kpis";
import {
  computeHrAttention,
  hrAlertSeverityLabel,
  type HrAlertSeverity,
} from "@/lib/staff-hr-alerts";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

const PeopleDashboardCharts = dynamic(
  () =>
    import("@/components/people/people-dashboard-charts").then((m) => m.PeopleDashboardCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-lg" />
        ))}
      </div>
    ),
  },
);

const SalaryByLocationChart = dynamic(
  () =>
    import("@/components/people/people-dashboard-charts").then((m) => m.SalaryByLocationChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-72 rounded-lg" />,
  },
);

function KpiCard({ label, value, tint }: { label: string; value: string | number; tint: KpiTint }) {
  return <TintedKpiCard title={label} value={value} tint={tint} compact />;
}

function severityBadgeVariant(
  severity: HrAlertSeverity,
): "destructive" | "warning" | "info" | "muted" | "outline" {
  if (severity === "expired" || severity === "critical") return "destructive";
  if (severity === "urgent") return "warning";
  if (severity === "watch") return "info";
  return "muted";
}

function employeesHref(filter: {
  expiry?: string;
  missing?: boolean;
  status?: string | null;
  type?: string;
  /** When true, show all statuses (clears default active filter). */
  allStatuses?: boolean;
}): string {
  const params = new URLSearchParams({ tab: "staff" });
  if (filter.expiry) params.set("expiry", filter.expiry);
  if (filter.missing) params.set("missing", "1");
  if (filter.type) params.set("type", filter.type);
  if (filter.allStatuses || filter.expiry === "exiting" || filter.expiry === "new_joiners" || filter.missing) {
    params.set("status", "");
  } else if (filter.status != null && filter.status !== "") {
    params.set("status", filter.status);
  }
  return `/people?${params.toString()}`;
}

export function PeopleDashboardPanel() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canSalary = usePermission("people.view_salary");
  const { data, isLoading } = usePeopleDashboard({ locationId: locationId ?? null });
  const { data: staff = [] } = useStaff(locationId ?? null, { includeArchived: true });
  const overview = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "hr-overview", locationId: locationId ?? null }),
    queryFn: () => getHrOverview({ locationId: locationId || null }),
    staleTime: STALE.people,
  });

  const k = data?.kpis;

  // Primary headcount KPIs from full roster (not status-filtered) so Overview reflects org truth
  const rosterKpis = computeStaffDirectoryKpis(staff);
  const attention = computeHrAttention(staff).filter((b) => b.count > 0);
  const missingFiltered = filterStaffDirectory(staff, {
    q: "",
    loc: "",
    position: "",
    department: "",
    type: "",
    e3: "",
    status: "",
    nationality: "",
    gender: "",
    sponsorship: "",
    missing: true,
    expiry: "",
    sort: "name",
  });
  const completionPct =
    staff.length === 0
      ? 100
      : Math.round(((staff.length - missingFiltered.length) / staff.length) * 100);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <KpiSkeletonStrip count={6} />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {t("people.dashboard.loadError")}
      </div>
    );
  }

  const primary = [
    {
      label: t("people.dashboard.kpiTotal", "Total"),
      value: rosterKpis.total || k?.total_staff || 0,
      tint: "sky" as const,
      href: employeesHref({ allStatuses: true }),
    },
    {
      label: t("people.dashboard.kpiActive", "Active"),
      value: rosterKpis.active || k?.active_staff || 0,
      tint: "green" as const,
      href: employeesHref({ status: "active" }),
    },
    {
      label: t("people.dashboard.kpiSecondment", "Secondment"),
      value: rosterKpis.secondment,
      tint: "orange" as const,
      href: employeesHref({ status: "secondment" }),
    },
    {
      label: t("people.dashboard.kpiTemporary", "Temporary / project"),
      value: rosterKpis.temporary || k?.temporary || 0,
      tint: "amber" as const,
      href: employeesHref({ type: "temporary", allStatuses: true }),
    },
    {
      label: t("people.dashboard.kpiNewJoiners", "New joiners (90d)"),
      value: rosterKpis.newJoiners,
      tint: "sky" as const,
      href: employeesHref({ expiry: "new_joiners" }),
    },
    {
      label: t("people.dashboard.kpiExiting", "Exiting"),
      value: rosterKpis.exiting,
      tint: (rosterKpis.exiting > 0 ? "amber" : "slate") as KpiTint,
      href: employeesHref({ expiry: "exiting" }),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t("people.dashboard.headcountTitle", "Headcount")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("people.dashboard.headcountHint", "Primary workforce snapshot. Click a card to open Employees with that filter.")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {primary.map((item) => (
            <Link key={item.label} href={item.href} className="text-start transition-opacity hover:opacity-90">
              <KpiCard label={item.label} value={item.value} tint={item.tint} />
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">
              {t("people.dashboard.attentionTitle", "HR attention required")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t(
                "people.dashboard.attentionHint",
                "Document expiry, missing fields, and probation — severity is labeled, not color-only.",
              )}
            </p>
          </div>
          <Link
            href={employeesHref({ missing: true })}
            className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t("people.dashboard.dataQuality", "Data quality")}: {completionPct}%{" "}
            {t("people.dashboard.profilesComplete", "profiles complete")}
          </Link>
        </div>

        {!attention.length ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t("people.dashboard.attentionEmpty", "Nothing urgent in the current roster scope.")}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((bucket) => (
              <Link
                key={bucket.key}
                href={employeesHref(bucket.filter)}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-card/50 px-4 py-3 transition-colors hover:bg-muted/40",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{bucket.title}</p>
                  <Badge variant={severityBadgeVariant(bucket.severity)} className="mt-1.5 text-[10px]">
                    {hrAlertSeverityLabel(bucket.severity)}
                  </Badge>
                </div>
                <span className="text-xl font-semibold tabular-nums">{bucket.count}</span>
              </Link>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {(overview.data?.pendingLeave ?? 0) > 0 ? (
            <span>
              {t("people.dashboard.pendingLeave")}: {overview.data?.pendingLeave}
            </span>
          ) : null}
          {canSalary && (overview.data?.payrollBlocked ?? 0) > 0 ? (
            <span>
              {t("people.dashboard.payrollBlocked")}: {overview.data?.payrollBlocked}
            </span>
          ) : null}
          <Link href="/people?tab=documents" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t("people.dashboard.openDocuments", "Open documents & expiry")}
          </Link>
        </div>
      </section>

      {canSalary && data.salary_by_location ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SalaryByLocationChart rows={data.salary_by_location} />
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("people.dashboard.salaryByLocation")}</h3>
            <KpiCard
              label={t("people.dashboard.monthlySalary")}
              value={fmtQar(k?.total_monthly_salary_qar ?? 0)}
              tint="green"
            />
            {(k?.missing_monthly_salary ?? 0) > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("people.dashboard.missingMonthlySalary")}: {k?.missing_monthly_salary}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      <PeopleDashboardCharts
        staffByLocation={data.staff_by_location}
        staffByJobTitle={data.staff_by_job_title}
        staffByDepartment={data.staff_by_department}
        staffByStatus={data.staff_by_status}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">{t("people.dashboard.byLocation")}</h3>
          {data.staff_by_location.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t("people.staff.empty")}
            </p>
          ) : (
            <div className="surface-card">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("people.staff.location")}</th>
                    <th className="px-3 py-2 text-right">{t("people.dashboard.headcount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staff_by_location.map((l) => (
                    <tr key={l.code} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{formatLocationLabel(l.code, l.name)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">{t("people.dashboard.recentHires")}</h3>
          {data.recent_hires.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t("people.dashboard.noRecentHires")}
            </p>
          ) : (
            <div className="surface-card">
              <table className="w-full text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("people.staff.name")}</th>
                    <th className="px-3 py-2 text-left">{t("people.staff.title")}</th>
                    <th className="px-3 py-2 text-left">{t("people.staff.hireDate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_hires.map((h) => (
                    <tr key={h.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">
                        <Link href={`/people/staff/${h.id}`} className="hover:underline">
                          {h.full_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{h.job_title ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{h.hire_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
