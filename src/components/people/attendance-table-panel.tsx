"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStaff } from "@/hooks/queries/usePeople";
import { useAttendanceDailySummary } from "@/hooks/queries/usePeopleExtended";
import { AttendanceKpiStrip } from "@/components/people/attendance-kpi-strip";
import { AttendanceRecordsTable } from "@/components/people/attendance-records-table";
import { formatPayrollRange } from "@/lib/attendance-hr/roster-period";
import {
  attendanceDateRange,
  buildAttendanceCsv,
  computeAttendanceKpis,
  resolveAttendanceDateRange,
  todayIsoDate,
  toAttendanceListingSource,
  type AttendanceDatePreset,
  type AttendanceSummaryRow,
} from "@/lib/attendance-display";
import { downloadCsvContent } from "@/lib/staff-import";

export function AttendanceTablePanel({
  locationId,
  openExceptionsCount,
}: {
  locationId: string;
  openExceptionsCount?: number;
}) {
  const { t, i18n } = useTranslation();
  const monthRange = useMemo(() => attendanceDateRange("month"), []);
  const [datePreset, setDatePreset] = useState<AttendanceDatePreset>("month");
  const [dateFrom, setDateFrom] = useState(monthRange.from);
  const [dateTo, setDateTo] = useState(monthRange.to);
  const [search, setSearch] = useState("");
  const [staffFilter, setStaffFilter] = useState("all");

  const { data: staffList } = useStaff(locationId);

  const { from, to } = useMemo(
    () => resolveAttendanceDateRange(datePreset, dateFrom, dateTo),
    [datePreset, dateFrom, dateTo],
  );

  const applyPreset = (preset: AttendanceDatePreset) => {
    setDatePreset(preset);
    if (preset !== "custom") {
      const range = attendanceDateRange(preset);
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  };

  const { data, isLoading } = useAttendanceDailySummary(locationId, {
    dateFrom: from,
    dateTo: to,
  });

  const filtered = useMemo(() => {
    const rows = (data ?? []) as AttendanceSummaryRow[];
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (staffFilter !== "all" && row.staff_id !== staffFilter) return false;
      if (!q) return true;
      const name = row.staff?.full_name?.toLowerCase() ?? "";
      const code = row.staff?.employee_code?.toLowerCase() ?? "";
      return name.includes(q) || code.includes(q);
    });
  }, [data, search, staffFilter]);

  const kpis = useMemo(() => computeAttendanceKpis(filtered), [filtered]);

  const exportCsv = () => {
    const csv = buildAttendanceCsv(filtered);
    downloadCsvContent(csv, `attendance-${from}-to-${to}.csv`);
  };

  return (
    <div className="space-y-4">
      <AttendanceKpiStrip
        kpis={kpis}
        openExceptionsCount={openExceptionsCount}
        isLoading={isLoading}
      />

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="relative min-w-0 sm:col-span-2 xl:col-span-2">
            <Label className="mb-1 block text-xs text-muted-foreground">{t("people.attendance.searchStaff")}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="min-h-10 ps-8"
                placeholder={t("people.attendance.searchStaff")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="min-w-0">
            <Label className="mb-1 block text-xs text-muted-foreground">{t("people.attendance.filterUser")}</Label>
            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger className="min-h-10 w-full">
                <SelectValue placeholder={t("people.attendance.allUsers")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("people.attendance.allUsers")}</SelectItem>
                {(staffList ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label className="mb-1 block text-xs text-muted-foreground">{t("people.attendance.datePreset")}</Label>
            <Select value={datePreset} onValueChange={(v) => applyPreset(v as AttendanceDatePreset)}>
              <SelectTrigger className="min-h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">{t("people.attendance.lastWeek")}</SelectItem>
                <SelectItem value="month">{t("people.attendance.lastMonth")}</SelectItem>
                <SelectItem value="custom">{t("people.attendance.customRange")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label className="mb-1 block text-xs text-muted-foreground">{t("people.attendance.dateFrom")}</Label>
            <Input
              type="date"
              className="min-h-10 w-full"
              value={dateFrom}
              max={dateTo || todayIsoDate()}
              onChange={(e) => {
                setDatePreset("custom");
                setDateFrom(e.target.value);
              }}
            />
          </div>
          <div className="min-w-0">
            <Label className="mb-1 block text-xs text-muted-foreground">{t("people.attendance.dateTo")}</Label>
            <Input
              type="date"
              className="min-h-10 w-full"
              value={dateTo}
              min={dateFrom}
              max={todayIsoDate()}
              onChange={(e) => {
                setDatePreset("custom");
                setDateTo(e.target.value);
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatPayrollRange(from, to, i18n.language)}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-10 w-full sm:w-auto"
            disabled={!filtered.length}
            onClick={exportCsv}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="ms-1.5">{t("people.attendance.exportCsv")}</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("people.attendance.loading")}
        </div>
      ) : !filtered.length ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <p>{t("people.attendance.empty")}</p>
          <p className="mt-2 text-xs">{t("people.attendance.emptyHint")}</p>
        </div>
      ) : (
        <AttendanceRecordsTable rows={filtered.map(toAttendanceListingSource)} />
      )}
    </div>
  );
}
