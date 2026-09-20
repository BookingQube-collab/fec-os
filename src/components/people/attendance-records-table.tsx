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
  latePunchCellClass,
  latePunchRowClass,
  resolveOvertimeMinutes,
  resolveReportingDisplayIso,
  resolveTotalHoursWorked,
  type AttendanceListingSource,
} from "@/lib/attendance-display";
import { cn } from "@/lib/utils";

const HEAD_CLASS = "whitespace-nowrap text-xs uppercase tracking-wider";

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

  return (
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
              <TableCell className="px-4 py-8" colSpan={13}>
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => {
              const hours = resolveTotalHoursWorked(row);
              const statusDisplay = getAttendanceStatusDisplay(row);
              const otMinutes = resolveOvertimeMinutes(row);
              const ot = otMinutes > 0;
              const late = hasLatePunch(row.late_minutes);
              const rowTint = statusDisplay.rowClass || latePunchRowClass(row.late_minutes);
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
                      {statusDisplay.label}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
