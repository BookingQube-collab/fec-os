"use client";

import { useTranslation } from "react-i18next";

import { DailyOpsPageShell } from "@/components/daily-ops/DailyOpsLayout";
import { KpiStrip } from "@/components/compliance/compliance-page-shell";
import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { useDailyOpsKpis } from "@/hooks/queries/useDailyOps";
import { usePermission } from "@/hooks/use-permission";
import { kpiTone } from "@/lib/daily-ops/constants";
import { useAppStore } from "@/stores/app-store";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const KPI_KEYS = [
  { key: "active_employees", labelKey: "dailyOps.kpis.activeEmployees", invert: true },
  { key: "open_incidents", labelKey: "dailyOps.kpis.openIncidents" },
  { key: "critical_open_incidents", labelKey: "dailyOps.kpis.criticalIncidents" },
  { key: "items_needing_reorder", labelKey: "dailyOps.kpis.reorderItems" },
  { key: "open_maintenance_issues", labelKey: "dailyOps.kpis.openMaintenance" },
  { key: "urgent_maintenance_open", labelKey: "dailyOps.kpis.urgentMaintenance" },
  { key: "open_complaints", labelKey: "dailyOps.kpis.openComplaints" },
  { key: "briefings_filed_today", labelKey: "dailyOps.kpis.briefingsToday", invert: true },
] as const;

function DailyOpsDashboardPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canViewAll = usePermission("daily_ops.view_all");
  const { data, isLoading } = useDailyOpsKpis(locationId);

  return (
    <DailyOpsPageShell
        title={t("dailyOps.dashboard.title")}
        subtitle={t("dailyOps.dashboard.subtitle")}
      >
        {isLoading ? (
          <KpiSkeletonStrip count={8} />
        ) : (
          <KpiStrip
            items={KPI_KEYS.map(({ key, labelKey, ...rest }) => {
              const value = Number(data?.[key as keyof typeof data] ?? 0);
              const invert = "invert" in rest && rest.invert;
              const tone = invert
                ? value > 0 ? "text-emerald-600" : "text-amber-600"
                : kpiTone(key, value);
              return {
                label: t(labelKey),
                value,
                tone,
              };
            })}
          />
        )}

        {canViewAll && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t("dailyOps.dashboard.byLocation")}</h3>
            {isLoading ? (
              <div className="space-y-2 rounded-lg border border-border bg-card p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : (data?.by_location?.length ?? 0) > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("dailyOps.table.venue")}</TableHead>
                      <TableHead>{t("dailyOps.kpis.activeEmployees")}</TableHead>
                      <TableHead>{t("dailyOps.kpis.openIncidents")}</TableHead>
                      <TableHead>{t("dailyOps.kpis.criticalIncidents")}</TableHead>
                      <TableHead>{t("dailyOps.kpis.reorderItems")}</TableHead>
                      <TableHead>{t("dailyOps.kpis.openMaintenance")}</TableHead>
                      <TableHead>{t("dailyOps.kpis.openComplaints")}</TableHead>
                      <TableHead>{t("dailyOps.kpis.briefingsToday")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.by_location.map((row) => (
                      <TableRow key={row.location_id}>
                        <TableCell className="font-medium">{row.code}</TableCell>
                        <TableCell>{row.active_employees}</TableCell>
                        <TableCell className={row.open_incidents > 0 ? "text-amber-600" : "text-emerald-600"}>
                          {row.open_incidents}
                        </TableCell>
                        <TableCell className={row.critical_open_incidents > 0 ? "text-red-600" : "text-emerald-600"}>
                          {row.critical_open_incidents}
                        </TableCell>
                        <TableCell className={row.items_needing_reorder > 0 ? "text-amber-600" : "text-emerald-600"}>
                          {row.items_needing_reorder}
                        </TableCell>
                        <TableCell className={row.open_maintenance_issues > 0 ? "text-amber-600" : "text-emerald-600"}>
                          {row.open_maintenance_issues}
                        </TableCell>
                        <TableCell className={row.open_complaints > 0 ? "text-amber-600" : "text-emerald-600"}>
                          {row.open_complaints}
                        </TableCell>
                        <TableCell className={row.briefings_filed_today > 0 ? "text-emerald-600" : "text-amber-600"}>
                          {row.briefings_filed_today}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No location breakdown available.</p>
            )}
          </div>
        )}
      </DailyOpsPageShell>
  );
}

export default DailyOpsDashboardPage;
