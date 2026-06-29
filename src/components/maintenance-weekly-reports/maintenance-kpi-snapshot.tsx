"use client";

import { useTranslation } from "react-i18next";

import type { MaintenanceReportTeam } from "@/lib/maintenance-weekly-reports/constants";

export function MaintenanceKpiSnapshotView({
  team,
  snapshot,
}: {
  team: MaintenanceReportTeam;
  snapshot: Record<string, unknown>;
}) {
  const { t } = useTranslation();

  if (team === "maintenance") {
    const summary = (snapshot.summary ?? {}) as Record<string, number>;
    const kpis = [
      ["Raised", summary.raised],
      ["Completed", summary.completed],
      ["Pending", summary.pending],
      ["Overdue", summary.overdue],
      ["SLA %", `${summary.sla_compliance_pct ?? 100}%`],
      ["Avg resolution (h)", summary.avg_resolution_hours],
      ["PM done", summary.pm_completed],
      ["PM pending", summary.pm_pending],
    ];
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">{t("maintenanceWeeklyReports.kpi.maintenanceTitle")}</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {kpis.map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="mt-1 text-lg font-semibold">{String(value ?? 0)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const kpis = [
    ["Submitted", snapshot.requests_submitted],
    ["Completed", snapshot.requests_completed],
    ["Pending", snapshot.requests_pending],
    ["Urgent", snapshot.requests_urgent],
    ["Items dispatched", snapshot.items_dispatched],
    ["Avg fulfillment (d)", snapshot.avg_fulfillment_days],
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("maintenanceWeeklyReports.kpi.logisticsTitle")}</h3>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {kpis.map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{String(label)}</div>
            <div className="mt-1 text-lg font-semibold">{String(value ?? 0)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
