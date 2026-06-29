"use client";

import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";

import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { usePeopleDashboard } from "@/hooks/queries/usePeopleDashboard";
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

function KpiCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

export function PeopleDashboardPanel() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
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
        <KpiCard label={t("people.dashboard.totalStaff")} value={k?.total_staff ?? 0} />
        <KpiCard
          label={t("people.dashboard.activeStaff")}
          value={k?.active_staff ?? 0}
          tone="text-emerald-600"
        />
        <KpiCard
          label={t("people.dashboard.onLeave")}
          value={k?.on_leave ?? 0}
          tone={(k?.on_leave ?? 0) > 0 ? "text-amber-600" : undefined}
        />
        <KpiCard label={t("people.dashboard.terminated")} value={k?.terminated ?? 0} />
        <KpiCard label={t("people.dashboard.locations")} value={k?.locations_with_staff ?? 0} />
      </div>

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
            <div className="overflow-hidden rounded-lg border border-border">
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
            <div className="overflow-hidden rounded-lg border border-border">
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
