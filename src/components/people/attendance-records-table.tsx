"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  computeHoursWorked,
  formatHoursValue,
  formatOvertimeHours,
  formatPunchTime12h,
  formatWorkDateDdMmYyyy,
  getAttendanceStatusDisplay,
  hasOvertime,
  type AttendanceListingSource,
} from "@/lib/attendance-display";
import { cn } from "@/lib/utils";

const HEAD_CLASS = "whitespace-nowrap text-xs uppercase tracking-wider";

export function AttendanceRecordsTable({
  rows,
  empty,
}: {
  rows: AttendanceListingSource[];
  empty?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface/60 hover:bg-surface/60">
            <TableHead className={HEAD_CLASS}>{t("people.attendance.location")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.userName")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.date")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.firstCheckIn")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.lastCheckOut")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.totalHours")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.overtime")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.overtimeHours")}</TableHead>
            <TableHead className={HEAD_CLASS}>{t("people.attendance.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell className="px-4 py-8" colSpan={9}>
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => {
              const hours = computeHoursWorked(row.actual_in, row.actual_out);
              const statusDisplay = getAttendanceStatusDisplay(row);
              const ot = hasOvertime(row);
              return (
                <TableRow key={row.id ?? `${row.userName}-${row.work_date}-${index}`}>
                  <TableCell className="min-w-[10rem] text-xs text-muted-foreground">
                    {row.locationLabel}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "whitespace-nowrap",
                      row.userNameUnmapped ? "text-muted-foreground" : "font-semibold text-foreground",
                    )}
                  >
                    {row.userName}
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
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
