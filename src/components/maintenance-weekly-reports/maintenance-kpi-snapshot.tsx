"use client";

import { useTranslation } from "react-i18next";

import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
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
          {kpis.map(([label, value], i) => (
            <TintedKpiCard
              key={String(label)}
              title={String(label)}
              value={String(value ?? 0)}
              tint={(["sky", "green", "orange", "red", "green", "amber", "green", "amber"] as KpiTint[])[i] ?? "sky"}
              compact
            />
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
          {kpis.map(([label, value], i) => (
            <TintedKpiCard
              key={String(label)}
              title={String(label)}
              value={String(value ?? 0)}
              tint={(["sky", "green", "orange", "red", "amber", "slate"] as KpiTint[])[i] ?? "sky"}
              compact
            />
          ))}
        </div>
    </div>
  );
}
