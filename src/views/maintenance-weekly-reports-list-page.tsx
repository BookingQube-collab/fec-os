"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Loader2, Plus } from "lucide-react";

import { MaintenanceWeeklyReportsLayout } from "@/components/maintenance-weekly-reports/MaintenanceWeeklyReportsLayout";
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
import { useMaintenanceWeeklyReports } from "@/hooks/queries/useMaintenanceWeeklyReports";
import { useSites } from "@/hooks/queries/useSites";
import { useReportExport } from "@/hooks/use-report-export";
import { usePermission } from "@/hooks/use-permission";
import {
  formatWeekLabel,
  MAINTENANCE_REPORT_TEAMS,
  MAINTENANCE_TEAM_LABELS,
  statusRag,
  WEEKLY_REPORT_STATUS_LABELS,
  WEEKLY_REPORT_STATUSES,
  weekStartMonday,
} from "@/lib/maintenance-weekly-reports/constants";
import { cn } from "@/lib/utils";

const RAG_CLASS = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
  gray: "bg-slate-100 text-slate-700",
};

export default function MaintenanceWeeklyReportsListPage() {
  const { t } = useTranslation();
  const canSubmitMaintenance = usePermission("maintenance.weekly_report.submit");
  const canSubmitLogistics = usePermission("maintenance.logistics_submit");
  const canSubmit = canSubmitMaintenance || canSubmitLogistics;
  const { data: sites = [] } = useSites();
  const [weekStart, setWeekStart] = useState(weekStartMonday());
  const [team, setTeam] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [locationId, setLocationId] = useState<string>("all");

  const filters = useMemo(
    () => ({
      weekStart,
      team: team === "all" ? null : team,
      status: status === "all" ? null : status,
      locationId: locationId === "all" ? null : locationId,
    }),
    [weekStart, team, status, locationId],
  );

  const { data: reports = [], isLoading } = useMaintenanceWeeklyReports(filters);

  const exportRows = reports.map((r) => ({
    team: MAINTENANCE_TEAM_LABELS[r.team],
    location: r.locations ? `${r.locations.code} — ${r.locations.name}` : "—",
    week: formatWeekLabel(r.reporting_week_start),
    status: WEEKLY_REPORT_STATUS_LABELS[r.status],
    priority: r.priority,
    submitted_by: r.submitted_by_name ?? "—",
  }));

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "maintenance_weekly_reports",
    title: t("maintenanceWeeklyReports.title"),
    venueLabel: "All teams",
    filters: { week: formatWeekLabel(weekStart), team, status, location: locationId },
    kpis: [
      { label: "Reports", value: reports.length },
      { label: "Submitted", value: reports.filter((r) => r.status !== "draft").length },
    ],
    columns: [
      { key: "team", header: "Team" },
      { key: "location", header: "Location" },
      { key: "week", header: "Week" },
      { key: "status", header: "Status" },
      { key: "priority", header: "Priority" },
      { key: "submitted_by", header: "Submitted by" },
    ],
    rows: exportRows,
  });

  return (
    <MaintenanceWeeklyReportsLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#0B1F3A]">
            {t("maintenanceWeeklyReports.list.title")}
          </h2>
          <p className="mt-1 text-sm text-[#64748B]">{t("maintenanceWeeklyReports.list.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportPdf()}>
            {t("maintenanceWeeklyReports.export.pdf")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportExcel()}>
            {t("maintenanceWeeklyReports.export.excel")}
          </Button>
          {canSubmit && (
            <Button size="sm" asChild>
              <Link href="/maintenance/weekly-report/new">
                <Plus className="me-1 h-4 w-4" />
                {t("maintenanceWeeklyReports.list.newReport")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("maintenanceWeeklyReports.filters.week")}</label>
          <input
            type="date"
            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("maintenanceWeeklyReports.filters.team")}</label>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("maintenanceWeeklyReports.filters.allTeams")}</SelectItem>
              {MAINTENANCE_REPORT_TEAMS.map((tm) => (
                <SelectItem key={tm} value={tm}>
                  {MAINTENANCE_TEAM_LABELS[tm]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("maintenanceWeeklyReports.filters.location")}</label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("maintenanceWeeklyReports.filters.allLocations")}</SelectItem>
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("maintenanceWeeklyReports.filters.status")}</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("maintenanceWeeklyReports.filters.allStatuses")}</SelectItem>
              {WEEKLY_REPORT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {WEEKLY_REPORT_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("maintenanceWeeklyReports.loading")}
        </div>
      ) : reports.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-8 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("maintenanceWeeklyReports.list.empty")}</p>
          {canSubmit && (
            <Button className="mt-3" size="sm" asChild>
              <Link href="/maintenance/weekly-report/new">{t("maintenanceWeeklyReports.list.createFirst")}</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("maintenanceWeeklyReports.table.team")}</TableHead>
                <TableHead>{t("maintenanceWeeklyReports.table.location")}</TableHead>
                <TableHead>{t("maintenanceWeeklyReports.table.week")}</TableHead>
                <TableHead>{t("maintenanceWeeklyReports.table.status")}</TableHead>
                <TableHead>{t("maintenanceWeeklyReports.table.priority")}</TableHead>
                <TableHead>{t("maintenanceWeeklyReports.table.submittedBy")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{MAINTENANCE_TEAM_LABELS[r.team]}</TableCell>
                  <TableCell>{r.locations ? `${r.locations.code} — ${r.locations.name}` : "—"}</TableCell>
                  <TableCell>{formatWeekLabel(r.reporting_week_start)}</TableCell>
                  <TableCell>
                    <Badge className={cn(RAG_CLASS[statusRag(r.status)])}>
                      {WEEKLY_REPORT_STATUS_LABELS[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">{r.priority}</TableCell>
                  <TableCell>{r.submitted_by_name ?? "—"}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/maintenance/weekly-report/${r.id}`}>{t("maintenanceWeeklyReports.view")}</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </MaintenanceWeeklyReportsLayout>
  );
}
