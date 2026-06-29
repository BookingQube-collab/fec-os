"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAttendanceDailySummary } from "@/hooks/queries/usePeopleExtended";
import {
  attendanceDateRange,
  buildAttendanceCsv,
  computeHoursWorked,
  formatHoursValue,
  formatLocationLabel,
  formatOvertimeHours,
  formatPunchTime12h,
  formatWorkDateDdMmYyyy,
  getAttendanceStatusDisplay,
  hasOvertime,
  type AttendanceSummaryRow,
} from "@/lib/attendance-display";
import { downloadCsvContent } from "@/lib/staff-import";

type DatePreset = "week" | "month";

export function AttendanceTablePanel({ locationId }: { locationId: string }) {
  const { t } = useTranslation();
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [search, setSearch] = useState("");

  const { from, to } = useMemo(() => attendanceDateRange(datePreset), [datePreset]);

  const { data, isLoading } = useAttendanceDailySummary(locationId, {
    dateFrom: from,
    dateTo: to,
  });

  const filtered = useMemo(() => {
    const rows = (data ?? []) as AttendanceSummaryRow[];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const name = row.staff?.full_name?.toLowerCase() ?? "";
      const code = row.staff?.employee_code?.toLowerCase() ?? "";
      return name.includes(q) || code.includes(q);
    });
  }, [data, search]);

  const exportCsv = () => {
    const csv = buildAttendanceCsv(filtered);
    downloadCsvContent(csv, `attendance-${from}-to-${to}.csv`);
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {t("people.attendance.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={t("people.attendance.searchStaff")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="w-[9.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">{t("people.attendance.lastWeek")}</SelectItem>
              <SelectItem value="month">{t("people.attendance.lastMonth")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!filtered.length}
          onClick={exportCsv}
        >
          <Download className="h-3.5 w-3.5" />
          <span className="ml-1.5">{t("people.attendance.exportCsv")}</span>
        </Button>
      </div>

      {!filtered.length ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <p>{t("people.attendance.empty")}</p>
          <p className="mt-2 text-xs">{t("people.attendance.emptyHint")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface/60 hover:bg-surface/60">
                <TableHead className="whitespace-nowrap text-xs uppercase tracking-wider">
                  {t("people.attendance.location")}
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase tracking-wider">
                  {t("people.attendance.userName")}
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase tracking-wider">
                  {t("people.attendance.date")}
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase tracking-wider">
                  {t("people.attendance.firstCheckIn")}
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase tracking-wider">
                  {t("people.attendance.lastCheckOut")}
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase tracking-wider">
                  {t("people.attendance.totalHours")}
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase tracking-wider">
                  {t("people.attendance.overtime")}
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase tracking-wider">
                  {t("people.attendance.overtimeHours")}
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs uppercase tracking-wider">
                  {t("people.attendance.status")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const hours = computeHoursWorked(row.actual_in, row.actual_out);
                const statusDisplay = getAttendanceStatusDisplay(row);
                const ot = hasOvertime(row);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="min-w-[10rem] text-xs text-muted-foreground">
                      {formatLocationLabel(row.location)}
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      {row.staff?.full_name ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap text-xs">
                      {formatWorkDateDdMmYyyy(row.work_date)}
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap text-xs">
                      {formatPunchTime12h(row.actual_in) || "—"}
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap text-xs">
                      {formatPunchTime12h(row.actual_out) || "—"}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">{formatHoursValue(hours)}</TableCell>
                    <TableCell className="text-xs">
                      {ot ? t("people.training.yes") : t("people.training.no")}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {ot ? formatOvertimeHours(row.overtime_minutes) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusDisplay.badgeClass}>
                        {statusDisplay.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
