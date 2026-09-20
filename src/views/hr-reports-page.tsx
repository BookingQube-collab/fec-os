"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileBarChart } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrKpiTile } from "@/components/hr/hr-kpi-tile";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { DownloadReportButton } from "@/components/reports/download-report-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { defaultPayrollPeriod, formatPayrollRange, monthBounds } from "@/lib/attendance-hr/roster-period";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { getHrReportsSummary, runHrCatalogReport } from "@/lib/hr-reports.functions";
import { HR_REPORT_IDS, type HrReportId } from "@/lib/hr-reports";
import { useReportExport } from "@/hooks/use-report-export";
import { useSites } from "@/hooks/queries/useSites";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { useAppStore } from "@/stores/app-store";
import { downloadCsvContent } from "@/lib/staff-import";

export default function HrReportsPage() {
  const { t, i18n } = useTranslation();
  const storeLocationId = useAppStore((s) => s.currentLocationId);
  const [locationId, setLocationId] = useState(storeLocationId || "all");
  const [departmentId, setDepartmentId] = useState("all");
  const [category, setCategory] = useState("all");
  const [designation, setDesignation] = useState("");
  const [status, setStatus] = useState("all");
  const [employeeId, setEmployeeId] = useState("");
  const [reportId, setReportId] = useState<HrReportId>("employee_master");
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

  const catalogIds = (report.data?.catalog ?? []).map((c) => c.id as HrReportId);
  const activeId = catalogIds.includes(reportId) ? reportId : (catalogIds[0] ?? "employee_master");

  const catalog = useQuery({
    queryKey: queryKeys.people.hrReports({
      view: "catalog",
      reportId: activeId,
      locationId: loc,
      departmentId: departmentId === "all" ? null : departmentId,
      category: category === "all" ? null : category,
      designation: designation || null,
      status: status === "all" ? null : status,
      employeeId: employeeId || null,
      dateFrom,
      dateTo,
    }),
    queryFn: () =>
      runHrCatalogReport({
        reportId: activeId,
        locationId: loc,
        departmentId: departmentId === "all" ? null : departmentId,
        category: category === "all" ? null : category,
        designation: designation || null,
        status: status === "all" ? null : status,
        employeeId: employeeId.trim() || null,
        dateFrom,
        dateTo,
      }),
    staleTime: STALE.people,
    enabled: Boolean(report.data),
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

  const columns = useMemo(() => catalog.data?.columns ?? [], [catalog.data?.columns]);
  const rows = useMemo(() => catalog.data?.rows ?? [], [catalog.data?.rows]);
  const tabLabel = t(`hr.reports.catalog.${activeId}`, { defaultValue: activeId });

  const exportRows = useMemo(
    () =>
      rows.map((row) => {
        const out: Record<string, unknown> = {};
        for (const col of columns) out[col.key] = row[col.key] ?? null;
        return out;
      }),
    [rows, columns],
  );

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: `HR_${activeId}`,
    title: `${t("hr.reports.title")} — ${tabLabel}`,
    venueLabel: loc
      ? formatLocationLabel(
          sites?.find((s) => s.id === loc)?.code,
          sites?.find((s) => s.id === loc)?.name,
        )
      : t("common.allBranches"),
    filters: {
      from: dateFrom,
      to: dateTo,
      department: departmentId === "all" ? null : departmentId,
      category: category === "all" ? null : category,
      designation: designation || null,
      status: status === "all" ? null : status,
      employee: employeeId || null,
    },
    kpis: [{ label: t("hr.reports.rowCount"), value: rows.length }],
    columns: columns.map((c) => ({ key: c.key, header: c.header, format: "text" as const })),
    rows: exportRows,
  });

  const exportCsv = () => {
    if (!columns.length) return;
    const lines = [
      columns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(","),
      ...rows.map((row) =>
        columns.map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`).join(","),
      ),
    ];
    downloadCsvContent(lines.join("\n"), `hr-${activeId}.csv`);
  };

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
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
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
              <div>
                <Label>{t("hr.reports.filters.category")}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    {["permanent", "secondment", "joker", "family_visa", "higher_mgmt", "operations"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("hr.reports.filters.status")}</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    {["active", "on_leave", "serving_notice", "pending", "submitted", "approved"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("hr.reports.filters.designation")}</Label>
                <Input
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder={t("hr.reports.filters.designationHint")}
                />
              </div>
              <div>
                <Label>{t("hr.reports.filters.employeeId")}</Label>
                <Input
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="UUID"
                />
              </div>
              <div>
                <Label>{t("hr.reports.filters.departmentId")}</Label>
                <Input
                  value={departmentId === "all" ? "" : departmentId}
                  onChange={(e) => setDepartmentId(e.target.value.trim() || "all")}
                  placeholder="UUID"
                />
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
            <div className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-[220px] flex-1">
                  <Label>{t("hr.reports.catalogTitle")}</Label>
                  <Select value={activeId} onValueChange={(v) => setReportId(v as HrReportId)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(catalogIds.length ? catalogIds : [...HR_REPORT_IDS]).map((id) => (
                        <SelectItem key={id} value={id}>
                          {t(`hr.reports.catalog.${id}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DownloadReportButton
                  onCsv={exportCsv}
                  onPdf={() => void exportPdf()}
                  onExcel={() => void exportExcel()}
                  disabled={!rows.length || catalog.data?.denied}
                  label={t("hr.reports.exportNamed", { name: tabLabel })}
                  csvLabel={t("hr.reports.exportCsv")}
                  pdfLabel={t("hr.reports.exportPdf")}
                  excelLabel={t("hr.reports.exportExcel")}
                />
              </div>

              {catalog.data?.denied ? (
                <HrEmptyState message={t("hr.reports.denied")} icon={FileBarChart} />
              ) : catalog.isLoading ? (
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : rows.length === 0 ? (
                <HrEmptyState message={t("hr.reports.emptyCatalog")} icon={FileBarChart} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                        {columns.map((c) => (
                          <th key={c.key} className="px-2 py-2 font-medium">
                            {c.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 200).map((row, i) => (
                        <tr key={i} className="border-b border-border/60">
                          {columns.map((c) => (
                            <td key={c.key} className="px-2 py-1.5 tabular-nums">
                              {row[c.key] == null || row[c.key] === "" ? "—" : String(row[c.key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 200 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("hr.reports.truncated", { shown: 200, total: rows.length })}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </HrPanel>

          <HrPanel delay={metrics.length + 2}>
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
