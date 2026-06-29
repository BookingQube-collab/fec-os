"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Loader2, Plus } from "lucide-react";

import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { WeeklyReportsLayout } from "@/components/weekly-reports/WeeklyReportsLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWeeklyReports } from "@/hooks/queries/useWeeklyReports";
import { useSites } from "@/hooks/queries/useSites";
import { useReportExport } from "@/hooks/use-report-export";
import { usePermission } from "@/hooks/use-permission";
import {
  formatWeekLabel,
  statusRag,
  WEEKLY_REPORT_STATUS_LABELS,
  WEEKLY_REPORT_STATUSES,
  weekStartMonday,
} from "@/lib/weekly-reports/constants";
import { cn } from "@/lib/utils";

const RAG_CLASS = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
  gray: "bg-slate-100 text-slate-700",
};

export default function WeeklyReportsListPage() {
  const { t } = useTranslation();
  const canSubmit = usePermission("weekly_reports.submit");
  const { data: sites } = useSites();
  const [weekStart, setWeekStart] = useState(weekStartMonday());
  const [locationId, setLocationId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const filters = useMemo(
    () => ({
      weekStart,
      locationId: locationId === "all" ? null : locationId,
      status: status === "all" ? null : status,
    }),
    [weekStart, locationId, status],
  );

  const { data: reports = [], isLoading } = useWeeklyReports(filters);

  const exportRows = reports.map((r) => ({
    location: r.locations?.name ?? "—",
    week: formatWeekLabel(r.reporting_week_start),
    status: WEEKLY_REPORT_STATUS_LABELS[r.status],
    revenue: r.revenue ?? 0,
    footfall: r.footfall ?? 0,
    complaints: r.customer_complaints,
    priority: r.priority,
  }));

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "weekly_reports",
    title: t("weeklyReports.title"),
    venueLabel: locationId === "all" ? "All locations" : sites?.find((s) => s.id === locationId)?.name ?? "—",
    filters: { week: formatWeekLabel(weekStart), status },
    kpis: [
      { label: "Reports", value: reports.length },
      { label: "Submitted", value: reports.filter((r) => r.status !== "draft").length },
    ],
    columns: [
      { key: "location", header: "Location" },
      { key: "week", header: "Week" },
      { key: "status", header: "Status" },
      { key: "revenue", header: "Revenue", format: "qar" },
      { key: "footfall", header: "Footfall" },
      { key: "complaints", header: "Complaints" },
      { key: "priority", header: "Priority" },
    ],
    rows: exportRows,
  });

  return (
    <WeeklyReportsLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#0B1F3A]">{t("weeklyReports.list.title")}</h2>
          <p className="mt-1 text-sm text-[#64748B]">{t("weeklyReports.list.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportPdf()}>{t("weeklyReports.export.pdf")}</Button>
          <Button variant="outline" size="sm" onClick={() => exportExcel()}>{t("weeklyReports.export.excel")}</Button>
        </div>
      </div>

      <NeumorphicCard className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-3">
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-[#64748B]">{t("weeklyReports.filters.week")}</label>
            <input
              type="date"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>
          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-[#64748B]">{t("weeklyReports.filters.location")}</label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("weeklyReports.filters.allLocations")}</SelectItem>
                {(sites ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-[#64748B]">{t("weeklyReports.filters.status")}</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("weeklyReports.filters.allStatuses")}</SelectItem>
                {WEEKLY_REPORT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{WEEKLY_REPORT_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          </div>
          {canSubmit && (
            <Button asChild>
              <Link href="/operations/weekly-reports/new">
                <Plus className="me-1 h-4 w-4" />
                {t("weeklyReports.list.newReport")}
              </Link>
            </Button>
          )}
        </div>
      </NeumorphicCard>

      <NeumorphicCard className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("weeklyReports.loading")}
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8 opacity-40" />
            <p>{t("weeklyReports.list.empty")}</p>
            {canSubmit && (
              <Button asChild>
                <Link href="/operations/weekly-reports/new">
                  <Plus className="me-1 h-4 w-4" />
                  {t("weeklyReports.list.createFirst")}
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("weeklyReports.table.location")}</TableHead>
                  <TableHead>{t("weeklyReports.table.week")}</TableHead>
                  <TableHead>{t("weeklyReports.table.status")}</TableHead>
                  <TableHead className="text-end">{t("weeklyReports.table.revenue")}</TableHead>
                  <TableHead className="text-end">{t("weeklyReports.table.footfall")}</TableHead>
                  <TableHead className="text-end">{t("weeklyReports.table.complaints")}</TableHead>
                  <TableHead>{t("weeklyReports.table.priority")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.locations?.name ?? "—"}</TableCell>
                    <TableCell>{formatWeekLabel(r.reporting_week_start)}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-normal", RAG_CLASS[statusRag(r.status)])}>
                        {WEEKLY_REPORT_STATUS_LABELS[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">{r.revenue != null ? `QAR ${Number(r.revenue).toLocaleString()}` : "—"}</TableCell>
                    <TableCell className="text-end">{r.footfall ?? "—"}</TableCell>
                    <TableCell className="text-end">{r.customer_complaints}</TableCell>
                    <TableCell className="capitalize">{r.priority}</TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/operations/weekly-reports/${r.id}`}>{t("weeklyReports.view")}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </NeumorphicCard>
    </WeeklyReportsLayout>
  );
}
