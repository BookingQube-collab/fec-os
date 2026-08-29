"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileBarChart } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrKpiTile } from "@/components/hr/hr-kpi-tile";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
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

  const metrics = [
    { key: "leaveDays", value: report.data?.leaveDaysInPeriod ?? "—", tone: "mustard" as const, span: "wide" as const },
    { key: "syncedLeave", value: report.data?.syncedLeaveDays ?? "—", tone: "ok" as const, span: "default" as const },
    { key: "leaveStatusDays", value: report.data?.attendance.leaveStatusDays ?? "—", tone: "cream" as const, span: "default" as const },
    { key: "presentDays", value: report.data?.attendance.presentDays ?? "—", tone: "charcoal" as const, span: "tall" as const },
    { key: "absentDays", value: report.data?.attendance.absentDays ?? "—", tone: "alert" as const, span: "default" as const },
    { key: "otHours", value: report.data?.attendance.overtimeHours ?? "—", tone: "info" as const, span: "default" as const },
    { key: "expiringDocs", value: report.data?.expiringDocs ?? "—", tone: "mustard" as const, span: "wide" as const },
  ];

  return (
    <CapabilityGate
      capability="hr.manage"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.reports.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={FileBarChart}
          kicker={t("hr.reports.kicker")}
          title={t("hr.reports.title")}
          subtitle={t("hr.reports.subtitle", { range: formatPayrollRange(dateFrom, dateTo, i18n.language) })}
        >
          <HrPanel delay={0}>
            <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
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
            </div>
          </HrPanel>

          <div className="hr-kpi-grid">
            {metrics.map((m, i) => (
              <HrKpiTile
                key={m.key}
                label={t(`hr.reports.${m.key}`)}
                value={m.value}
                tone={m.tone}
                span={m.span}
                delay={i + 1}
              />
            ))}
          </div>

          <HrPanel delay={metrics.length + 1}>
            <div className="space-y-2 p-4 sm:p-5">
              <h2 className="text-sm font-semibold tracking-tight">{t("hr.reports.headcountBySite")}</h2>
              {(report.data?.headcountBySite ?? []).length === 0 ? (
                <HrEmptyState message={t("hr.reports.empty")} icon={FileBarChart} />
              ) : (
                (report.data?.headcountBySite ?? []).map((row) => (
                  <div key={row.locationId ?? "none"} className="hr-list-row text-sm">
                    <span>{row.label}</span>
                    <span className="font-semibold tabular-nums tracking-tight">{row.headcount}</span>
                  </div>
                ))
              )}
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}
