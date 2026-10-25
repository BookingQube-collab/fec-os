"use client";

import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatHoursValue,
  formatLatePunch,
  formatOvertimeHours,
  formatPunchTime12h,
  formatReportingTime12h,
  formatWorkDateDdMmYyyy,
  getAttendanceStatusDisplay,
  hasLatePunch,
  resolveHoursBasedAttendanceStatus,
  latePunchCellClass,
  resolveOvertimeMinutes,
  resolveReportingDisplayIso,
  resolveTotalHoursWorked,
  type AttendanceListingSource,
} from "@/lib/attendance-display";
import { cn } from "@/lib/utils";

const HEAD_CLASS = "whitespace-nowrap text-xs uppercase tracking-wider";
const COL_COUNT = 13;
/** Columns before TOTAL HOURS WORKED (location → last check-out). */
const HOURS_COL_INDEX = 8;

const HOURS_EXCLUDED_STATUSES = new Set(["weekly_off", "week_off", "comp_off", "annual_leave"]);

function normalizeListingStatusKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isExcludedFromListingHours(status: string | null | undefined): boolean {
  return HOURS_EXCLUDED_STATUSES.has(normalizeListingStatusKey(status));
}

function expectedHoursForListingRow(row: AttendanceListingSource): number | null {
  if (row.expected_minutes != null && Number.isFinite(Number(row.expected_minutes))) {
    const mins = Number(row.expected_minutes);
    if (mins > 0) return Math.round((mins / 60) * 100) / 100;
  }
  if (row.scheduled_in && row.scheduled_out) {
    const ms = new Date(row.scheduled_out).getTime() - new Date(row.scheduled_in).getTime();
    if (Number.isFinite(ms) && ms > 0) return Math.round((ms / 3_600_000) * 100) / 100;
  }
  return null;
}

/** Sum of listing TOTAL HOURS WORKED values (same as column cells). Excludes weekly off / comp off. */
export function sumListingTotalHours(rows: AttendanceListingSource[]): number {
  let total = 0;
  for (const row of rows) {
    if (isExcludedFromListingHours(row.status)) continue;
    const hours = resolveTotalHoursWorked(row);
    if (hours != null) total += hours;
  }
  return Math.round(total * 100) / 100;
}

/** Worked / required / shortfall for the filtered listing (excludes weekly off / comp off). */
export function sumListingHoursSummary(rows: AttendanceListingSource[]): {
  workedHours: number;
  requiredHours: number;
  shortfallHours: number;
} {
  let worked = 0;
  let required = 0;
  for (const row of rows) {
    if (isExcludedFromListingHours(row.status)) continue;
    const hours = resolveTotalHoursWorked(row);
    if (hours != null && hours > 0) worked += hours;
    const expected = expectedHoursForListingRow(row);
    if (expected != null && expected > 0) required += expected;
  }
  const workedHours = Math.round(worked * 100) / 100;
  const requiredHours = Math.round(required * 100) / 100;
  const shortfallHours =
    requiredHours > workedHours ? Math.round((requiredHours - workedHours) * 100) / 100 : 0;
  return { workedHours, requiredHours, shortfallHours };
}

export type AttendanceMapStaffOption = {
  id: string;
  full_name: string;
  employee_code: string;
  qid?: string | null;
  location_id?: string | null;
  is_roaming?: boolean | null;
  work_location_ids?: string[] | null;
};

function staffAtLocation(s: AttendanceMapStaffOption, locationId: string | null | undefined) {
  if (!locationId) return true;
  if (s.location_id === locationId) return true;
  if (s.is_roaming) return true;
  return Boolean(s.work_location_ids?.includes(locationId));
}

export function AttendanceHoursSummaryStrip({ rows }: { rows: AttendanceListingSource[] }) {
  const { t } = useTranslation();
  const hoursSummary = sumListingHoursSummary(rows);
  if (rows.length === 0) return null;
  return (
    <div
      className="rounded-2xl border-2 border-[#1a1a1a]/18 bg-white p-3 shadow-sm sm:p-4"
      style={{ color: "#1a1a1a" }}
      role="region"
      aria-label={t("attendanceHr.reports.hoursSummary")}
    >
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#1a1a1a] sm:text-sm">
        {t("attendanceHr.reports.hoursSummary")}
      </p>
      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <div className="min-w-0 rounded-xl border border-[#1a1a1a]/12 bg-[#F8F6F1] px-3 py-2.5">
          <p className="text-xs font-semibold text-[#3F3A36] sm:text-sm">
            {t("attendanceHr.reports.hoursWorked")}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums leading-none text-[#1a1a1a] sm:text-2xl">
            {formatHoursValue(hoursSummary.workedHours)}h
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-[#1a1a1a]/12 bg-[#F8F6F1] px-3 py-2.5">
          <p className="text-xs font-semibold text-[#3F3A36] sm:text-sm">
            {t("attendanceHr.reports.hoursRequired")}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums leading-none text-[#1a1a1a] sm:text-2xl">
            {formatHoursValue(hoursSummary.requiredHours)}h
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-[#1a1a1a]/12 bg-[#FFF7ED] px-3 py-2.5">
          <p className="text-xs font-semibold text-[#9A3412] sm:text-sm">
            {t("attendanceHr.reports.hoursShortfall")}
          </p>
          <p
            className={cn(
              "mt-1 text-xl font-bold tabular-nums leading-none sm:text-2xl",
              hoursSummary.shortfallHours > 0 ? "text-[#C2410C]" : "text-[#1a1a1a]",
            )}
          >
            {hoursSummary.shortfallHours > 0
              ? `${formatHoursValue(hoursSummary.shortfallHours)}h`
              : "—"}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-snug text-[#3F3A36] sm:text-sm">
        {t("attendanceHr.reports.hoursExcludeNote")}
      </p>
    </div>
  );
}

export function AttendanceRecordsTable({
  rows,
  empty,
  mapStaffOptions,
  mappingBusyIds,
  onMapStaff,
}: {
  rows: AttendanceListingSource[];
  empty?: ReactNode;
  /** When set, unmapped rows with a biometric mapping id get an inline staff picker. */
  mapStaffOptions?: AttendanceMapStaffOption[];
  mappingBusyIds?: ReadonlySet<string>;
  onMapStaff?: (row: AttendanceListingSource, staffId: string) => void;
}) {
  const { t } = useTranslation();
  const [draftByMapping, setDraftByMapping] = useState<Record<string, string>>({});
  const canInlineMap = Boolean(mapStaffOptions && onMapStaff);
  const totalHoursSum = sumListingTotalHours(rows);

  return (
    <div className="space-y-3">
      <AttendanceHoursSummaryStrip rows={rows} />

      <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface/60 hover:bg-surface/60">
            <TableHead className={HEAD_CLASS}>{t("people.attendance.location")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.userName")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.deviceUserId")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.date")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.reportingTime")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.shiftStart")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.firstCheckIn")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.lastCheckOut")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.totalHours")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.latePunch")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.overtime")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.overtimeHours")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell className="px-4 py-8" colSpan={COL_COUNT}>
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => {
              const hours = resolveTotalHoursWorked(row);
              const statusDisplay = getAttendanceStatusDisplay(row);
              const statusKey = resolveHoursBasedAttendanceStatus(row);
              const otMinutes = resolveOvertimeMinutes(row);
              const ot = otMinutes > 0;
              const late = hasLatePunch(row.late_minutes);
              const rowTint = statusDisplay.rowClass;
              const mappingId = row.biometricMappingId ?? "";
              const showMap =
                canInlineMap && row.userNameUnmapped && Boolean(mappingId) && Boolean(row.locationId);
              const busy = mappingId ? Boolean(mappingBusyIds?.has(mappingId)) : false;
              const draftStaffId = mappingId ? (draftByMapping[mappingId] ?? "") : "";
              const staffForRow = showMap
                ? (mapStaffOptions ?? []).filter((s) => staffAtLocation(s, row.locationId))
                : [];
              return (
                <TableRow
                  key={row.id ?? `${row.userName}-${row.work_date}-${index}`}
                  className={cn("hover:bg-transparent", rowTint)}
                >
                  <TableCell className="min-w-[10rem] text-xs text-muted-foreground">
                    {row.locationLabel}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "min-w-[12rem]",
                      row.userNameUnmapped ? "text-muted-foreground" : "font-semibold text-foreground",
                    )}
                  >
                    <div className={cn("whitespace-nowrap", !row.userNameUnmapped && "font-semibold")}>
                      {row.userName}
                    </div>
                    {row.userNameUnmapped ? (
                      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        {t("attendanceHr.reports.unmapped")}
                        {row.deviceUserId?.trim() ? ` · ${row.deviceUserId.trim()}` : ""}
                      </div>
                    ) : null}
                    {showMap ? (
                      <CapabilityGate capability="attendance.map_users">
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <SearchableSelect
                            value={draftStaffId}
                            disabled={busy}
                            onValueChange={(value) => {
                              setDraftByMapping((prev) => ({ ...prev, [mappingId]: value }));
                            }}
                            placeholder={t("attendanceHr.reports.mapStaffPlaceholder")}
                            emptyOption={{
                              value: "",
                              label: t("attendanceHr.reports.mapStaffPlaceholder"),
                            }}
                            triggerClassName="h-auto min-h-8 min-w-44 max-w-64 px-2 text-left text-xs font-normal"
                            options={staffForRow.map((s) => ({
                              value: s.id,
                              label: s.full_name,
                              description: `${s.employee_code}${s.qid ? ` · ${s.qid}` : ""}`,
                              keywords: `${s.full_name} ${s.employee_code} ${s.qid ?? ""}`,
                            }))}
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            disabled={busy || !draftStaffId}
                            onClick={() => {
                              if (!draftStaffId || !onMapStaff) return;
                              onMapStaff(row, draftStaffId);
                            }}
                          >
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              t("attendanceHr.mapping.saveMap")
                            )}
                          </Button>
                        </div>
                      </CapabilityGate>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums whitespace-nowrap">
                    {row.deviceUserId?.trim() || "—"}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap text-xs">
                    {formatWorkDateDdMmYyyy(row.work_date)}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap text-xs">
                    {formatReportingTime12h(resolveReportingDisplayIso(row)) || "—"}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap text-xs">
                    {formatReportingTime12h(row.scheduled_in) || "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "tabular-nums whitespace-nowrap text-xs",
                      latePunchCellClass(row.late_minutes),
                    )}
                  >
                    {formatPunchTime12h(row.actual_in) || "—"}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap text-xs">
                    {formatPunchTime12h(row.actual_out) || "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-xs">{formatHoursValue(hours)}</TableCell>
                  <TableCell
                    className={cn("tabular-nums text-xs", late ? latePunchCellClass(row.late_minutes) : "")}
                  >
                    {formatLatePunch(row.late_minutes)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {ot ? t("people.training.yes") : t("people.training.no")}
                  </TableCell>
                  <TableCell className="tabular-nums text-xs">
                    {ot ? formatOvertimeHours(otMinutes) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusDisplay.badgeClass}>
                      {t(`attendanceHr.reports.statuses.${statusKey}`, { defaultValue: statusDisplay.label })}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
        {rows.length > 0 ? (
          <TableFooter className="sticky bottom-0 z-[1] border-t-2 border-[#1a1a1a]/15 bg-white">
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={HOURS_COL_INDEX}
                className="px-4 text-right text-xs font-bold uppercase tracking-wider text-[#1a1a1a]"
              >
                {t("people.attendance.widgets.totalHours")}
              </TableCell>
              <TableCell className="tabular-nums text-sm font-bold text-[#1a1a1a]">
                {formatHoursValue(totalHoursSum)}h
              </TableCell>
              <TableCell colSpan={COL_COUNT - HOURS_COL_INDEX - 1} />
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
      </div>
    </div>
  );
}
