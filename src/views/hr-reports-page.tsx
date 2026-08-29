"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileBarChart } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { defaultPayrollPeriod, formatPayrollRange, monthBounds } from "@/lib/attendance-hr/roster-period";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { getHrReportsSummary } from "@/lib/hr-reports.functions";
import { useSites } from "@/hooks/queries/useSites";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { useAppStore } from "@/stores/app-store";

export default function HrReportsPage() {
  const { t, i18n } = useTranslation();
  const storeLocationId = useAppStore((s) => s.currentLocationId);
  const [locationId, setLocationId] = useState(storeLocationId || "all");
  const [{ month, dateFrom, dateTo }, setPeriod] = useState(() =>
    defaultPayrollPeriod(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" })),
  );
  const { data: sites } = useSites();
  const loc = locationId === "all" ? null : locationId;

  const report = useQuery({
    queryKey: queryKeys.people.hrReports({ locationId: loc, dateFrom, dateTo }),
    queryFn: () => getHrReportsSummary({ locationId: loc, dateFrom, dateTo }),
    staleTime: STALE.people,
  });

  return (
    <CapabilityGate
      capability="hr.manage"
      fallback={<p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">{t("hr.reports.noAccess")}</p>}
    >
      <div className="space-y-6">
        <PageHeader
          icon={FileBarChart}
          kicker={t("hr.reports.kicker")}
          title={t("hr.reports.title")}
          subtitle={t("hr.reports.subtitle", { range: formatPayrollRange(dateFrom, dateTo, i18n.language) })}
        />

        <NeumorphicCard className="grid gap-3 p-5 sm:grid-cols-3">
          <div>
            <Label>{t("hr.payroll.month")}</Label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setPeriod({ month: e.target.value, ...monthBounds(e.target.value) })}
            />
          </div>
          <div>
            <Label>{t("hr.payroll.location")}</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.allBranches")}</SelectItem>
                {(sites ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {formatLocationLabel(s.code, s.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button asChild size="sm">
              <a href={report.data?.payrollExportHref ?? "#"}>{t("hr.reports.payrollWorkbook")}</a>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={report.data?.attendanceReportsHref ?? "/people/attendance/reports"}>
                {t("hr.reports.attendanceLink")}
              </Link>
            </Button>
          </div>
        </NeumorphicCard>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NeumorphicCard className="p-4">
            <p className="text-xs text-muted-foreground">{t("hr.reports.leaveDays")}</p>
            <p className="text-2xl font-semibold tabular-nums">{report.data?.leaveDaysInPeriod ?? "—"}</p>
          </NeumorphicCard>
          <NeumorphicCard className="p-4">
            <p className="text-xs text-muted-foreground">{t("hr.reports.syncedLeave")}</p>
            <p className="text-2xl font-semibold tabular-nums">{report.data?.syncedLeaveDays ?? "—"}</p>
          </NeumorphicCard>
          <NeumorphicCard className="p-4">
            <p className="text-xs text-muted-foreground">{t("hr.reports.leaveStatusDays")}</p>
            <p className="text-2xl font-semibold tabular-nums">{report.data?.attendance.leaveStatusDays ?? "—"}</p>
          </NeumorphicCard>
          <NeumorphicCard className="p-4">
            <p className="text-xs text-muted-foreground">{t("hr.reports.presentDays")}</p>
            <p className="text-2xl font-semibold tabular-nums">{report.data?.attendance.presentDays ?? "—"}</p>
          </NeumorphicCard>
          <NeumorphicCard className="p-4">
            <p className="text-xs text-muted-foreground">{t("hr.reports.absentDays")}</p>
            <p className="text-2xl font-semibold tabular-nums">{report.data?.attendance.absentDays ?? "—"}</p>
          </NeumorphicCard>
          <NeumorphicCard className="p-4">
            <p className="text-xs text-muted-foreground">{t("hr.reports.otHours")}</p>
            <p className="text-2xl font-semibold tabular-nums">{report.data?.attendance.overtimeHours ?? "—"}</p>
          </NeumorphicCard>
          <NeumorphicCard className="p-4">
            <p className="text-xs text-muted-foreground">{t("hr.reports.expiringDocs")}</p>
            <p className="text-2xl font-semibold tabular-nums">{report.data?.expiringDocs ?? "—"}</p>
          </NeumorphicCard>
        </div>

        <NeumorphicCard className="space-y-2 p-5">
          <h2 className="text-sm font-semibold">{t("hr.reports.headcountBySite")}</h2>
          {(report.data?.headcountBySite ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("hr.reports.empty")}</p>
          ) : (
            (report.data?.headcountBySite ?? []).map((row) => (
              <div key={row.locationId ?? "none"} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                <span>{row.label}</span>
                <span className="font-semibold tabular-nums">{row.headcount}</span>
              </div>
            ))
          )}
        </NeumorphicCard>
      </div>
    </CapabilityGate>
  );
}
