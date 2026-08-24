"use client";

import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";

import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { usePeopleDashboard } from "@/hooks/queries/usePeopleDashboard";
import { usePermission } from "@/hooks/use-permission";
import { fmtQar } from "@/lib/currency";
import { useAppStore } from "@/stores/app-store";

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

export function PeopleDashboardPanel() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canSalary = usePermission("people.view_salary");
  const { data, isLoading } = usePeopleDashboard({ locationId: locationId ?? null });

  const k = data?.kpis;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <KpiSkeletonStrip count={5} />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-lg" />
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

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label={t("people.dashboard.totalStaff")} value={k?.total_staff ?? 0} tint="sky" />
        <KpiCard label={t("people.dashboard.activeStaff")} value={k?.active_staff ?? 0} tint="green" />
        <KpiCard label={t("people.dashboard.inactiveStaff")} value={k?.inactive_staff ?? 0} tint="slate" />
        <KpiCard
          label={t("people.dashboard.onLeave")}
          value={k?.on_leave ?? 0}
          tint={(k?.on_leave ?? 0) > 0 ? "amber" : "slate"}
        />
        <KpiCard label={t("people.dashboard.locations")} value={k?.locations_with_staff ?? 0} tint="sky" />
        <KpiCard label={t("people.dashboard.permanent")} value={k?.permanent ?? 0} tint="sky" />
        <KpiCard label={t("people.dashboard.temporary")} value={k?.temporary ?? 0} tint="amber" />
        <KpiCard label={t("people.dashboard.missingQid")} value={k?.missing_qid ?? 0} tint={(k?.missing_qid ?? 0) > 0 ? "amber" : "slate"} />
        <KpiCard label={t("people.dashboard.missingContact")} value={k?.missing_contact ?? 0} tint={(k?.missing_contact ?? 0) > 0 ? "amber" : "slate"} />
        <KpiCard label={t("people.dashboard.missingJoin")} value={k?.missing_joining_date ?? 0} tint={(k?.missing_joining_date ?? 0) > 0 ? "amber" : "slate"} />
        {canSalary ? (
          <>
            <KpiCard
              label={t("people.dashboard.monthlySalary")}
              value={fmtQar(k?.total_monthly_salary_qar ?? 0)}
              tint="green"
            />
            <KpiCard
              label={t("people.dashboard.missingMonthlySalary")}
              value={k?.missing_monthly_salary ?? 0}
              tint={(k?.missing_monthly_salary ?? 0) > 0 ? "amber" : "slate"}
            />
          </>
        ) : null}
      </div>

      {canSalary && data.salary_by_location ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SalaryByLocationChart rows={data.salary_by_location} />
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("people.dashboard.salaryByLocation")}</h3>
            {data.salary_by_location.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                {t("people.staff.empty")}
              </p>
            ) : (
              <div className="surface-card">
                <table className="w-full text-sm">
                  <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">{t("people.staff.code")}</th>
                      <th className="px-3 py-2 text-left">{t("people.staff.branch")}</th>
                      <th className="px-3 py-2 text-right">{t("people.dashboard.rosterHeadcount")}</th>
                      <th className="px-3 py-2 text-right">{t("people.dashboard.monthlyQar")}</th>
                      <th className="px-3 py-2 text-right">{t("people.dashboard.missingMonthly")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.salary_by_location.map((l) => (
                      <tr key={l.code} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{l.code}</td>
                        <td className="px-3 py-2 font-medium">{l.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.roster_headcount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtQar(l.monthly_salary_qar)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.missing_monthly}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(k?.daily_rate_only ?? 0) > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("people.dashboard.dailyRateOnly")}: {k?.daily_rate_only}
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
                    <th className="px-3 py-2 text-left">{t("people.staff.code")}</th>
                    <th className="px-3 py-2 text-left">{t("people.staff.branch")}</th>
                    <th className="px-3 py-2 text-right">{t("people.dashboard.headcount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staff_by_location.map((l) => (
                    <tr key={l.code} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{l.code}</td>
                      <td className="px-3 py-2 font-medium">{l.name}</td>
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
                    <th className="px-3 py-2 text-left">{t("people.staff.location")}</th>
                    <th className="px-3 py-2 text-left">{t("people.staff.hireDate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_hires.map((h) => (
                    <tr key={h.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{h.full_name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{h.job_title ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{h.location_code}</td>
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
