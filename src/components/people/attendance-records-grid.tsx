"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AttendanceRecordsTable } from "@/components/people/attendance-records-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  attendanceListingCells,
  type AttendanceListingSource,
} from "@/lib/attendance-display";
import {
  attendanceGridCellClass,
  attendanceGridCellContent,
  buildAttendanceMatrix,
  isWeekendYmd,
  rosterMatrixCellKey,
  type AttendanceMatrixRow,
} from "@/lib/attendance-hr/attendance-matrix";
import { cn } from "@/lib/utils";

function weekdayShort(ymd: string, locale: string) {
  const intlLocale = locale.toLowerCase().startsWith("ar") ? "ar" : "en-GB";
  return new Intl.DateTimeFormat(intlLocale, { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${ymd.slice(0, 10)}T12:00:00.000Z`),
  );
}

function monthLabel(monthKey: string, locale: string) {
  const intlLocale = locale.toLowerCase().startsWith("ar") ? "ar" : "en-GB";
  return new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${monthKey}-01T12:00:00.000Z`),
  );
}

function dayNumber(ymd: string) {
  return Number(ymd.slice(8, 10));
}

export function AttendanceRecordsGrid({
  rows,
  dateFrom,
  dateTo,
  empty,
  maxHeight = 560,
}: {
  rows: AttendanceListingSource[];
  dateFrom: string;
  dateTo: string;
  empty?: ReactNode;
  maxHeight?: number;
}) {
  const { t, i18n } = useTranslation();
  const [detail, setDetail] = useState<AttendanceMatrixRow | null>(null);

  const matrix = useMemo(() => buildAttendanceMatrix(rows, dateFrom, dateTo), [rows, dateFrom, dateTo]);

  if (rows.length === 0) {
    return (
      <AttendanceRecordsTable
        rows={[]}
        empty={empty ?? <p className="text-sm text-muted-foreground">{t("attendanceHr.reports.empty")}</p>}
      />
    );
  }

  const detailCells = detail ? attendanceListingCells(detail) : null;

  return (
    <>
      <div className="overflow-auto rounded-lg border border-border/70" style={{ maxHeight }}>
        <table className="min-w-max border-collapse text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted/80">
              <th
                colSpan={2}
                className="sticky start-0 z-30 border-b border-e border-border/70 bg-muted/95 px-2 py-1.5 text-start font-semibold"
              >
                {t("attendanceHr.reports.colEmployee")}
              </th>
              {matrix.monthSpans.map((span) => (
                <th
                  key={span.monthKey}
                  colSpan={span.count}
                  className="border-b border-border/70 px-1 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {monthLabel(span.monthKey, i18n.language)}
                </th>
              ))}
            </tr>
            <tr className="bg-card">
              <th className="sticky start-0 z-30 w-10 border-b border-e border-border/70 bg-card px-1.5 py-1 text-center font-medium">
                {t("attendanceHr.reports.colNo")}
              </th>
              <th className="sticky start-10 z-30 min-w-[11rem] border-b border-e border-border/70 bg-card px-2 py-1 text-start font-medium">
                {t("attendanceHr.reports.colStaff")}
              </th>
              {matrix.dates.map((ymd) => {
                const weekend = isWeekendYmd(ymd);
                return (
                  <th
                    key={`wd-${ymd}`}
                    className={cn(
                      "min-w-[4.75rem] border-b border-border/60 px-1 py-1 text-center font-medium",
                      weekend ? "bg-destructive/10 text-destructive" : "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {weekdayShort(ymd, i18n.language)}
                  </th>
                );
              })}
            </tr>
            <tr className="bg-card">
              <th className="sticky start-0 z-30 border-b border-e border-border/70 bg-card" />
              <th className="sticky start-10 z-30 border-b border-e border-border/70 bg-card" />
              {matrix.dates.map((ymd) => {
                const weekend = isWeekendYmd(ymd);
                return (
                  <th
                    key={`dn-${ymd}`}
                    className={cn(
                      "border-b border-border/60 px-1 py-1 text-center tabular-nums font-semibold",
                      weekend ? "bg-destructive/5" : "bg-card",
                    )}
                  >
                    {dayNumber(ymd)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.staff.map((person, index) => (
              <tr key={person.staffId} className="border-b border-border/50">
                <td className="sticky start-0 z-10 border-e border-border/70 bg-card px-1.5 py-1 text-center tabular-nums text-muted-foreground">
                  {index + 1}
                </td>
                <td className="sticky start-10 z-10 min-w-[11rem] max-w-[14rem] border-e border-border/70 bg-card px-2 py-1.5">
                  <div className="truncate font-medium leading-tight">{person.staffName || "—"}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {person.employeeCode || person.qid || ""}
                  </div>
                </td>
                {matrix.dates.map((ymd) => {
                  const weekend = isWeekendYmd(ymd);
                  const entries = matrix.byStaffDate.get(rosterMatrixCellKey(person.staffId, ymd)) ?? [];
                  return (
                    <td
                      key={`${person.staffId}-${ymd}`}
                      className={cn(
                        "align-top border-border/40 px-0.5 py-0.5",
                        weekend ? "bg-muted/50" : "bg-card",
                      )}
                    >
                      {entries.length === 0 ? (
                        <div className="min-h-[2.75rem]" />
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {entries.map((entry) => {
                            const content = attendanceGridCellContent(entry);
                            const primary =
                              content.tone === "weekly_off"
                                ? t("attendanceHr.reports.cellOff")
                                : content.primary;
                            return (
                              <button
                                key={entry.id ?? `${entry.staffId}-${entry.workDate}`}
                                type="button"
                                className={cn(
                                  "w-full rounded-md px-1 py-1 text-center leading-tight transition-colors hover:ring-1 hover:ring-border",
                                  attendanceGridCellClass(content.tone),
                                )}
                                onClick={() => setDetail(entry)}
                                aria-label={`${person.staffName || "—"} · ${ymd} · ${content.statusLabel}`}
                              >
                                {content.secondary == null ? (
                                  <div className="text-[11px] font-semibold uppercase tracking-wide">{primary}</div>
                                ) : (
                                  <div className="tabular-nums">
                                    <div className={cn(content.tone === "late" && "font-semibold text-rose-700 dark:text-rose-300")}>
                                      {primary}
                                    </div>
                                    <div className="text-muted-foreground">{content.secondary}</div>
                                  </div>
                                )}
                                {content.meta ? (
                                  <div className="mt-0.5 text-[9px] tabular-nums text-muted-foreground">{content.meta}</div>
                                ) : null}
                                {entry.locationLabel ? (
                                  <div className="mt-0.5 truncate text-[9px] text-muted-foreground">
                                    {entry.locationLabel.split("—")[0]?.trim() || entry.locationLabel}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("attendanceHr.reports.cellDetailTitle")}</DialogTitle>
            <DialogDescription>
              {detail
                ? `${detail.userName} · ${detail.work_date.slice(0, 10)}${
                    detail.locationLabel ? ` · ${detail.locationLabel}` : ""
                  }`
                : null}
            </DialogDescription>
          </DialogHeader>
          {detailCells ? (
            <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-2 text-sm">
              {(
                [
                  [t("attendanceHr.reports.colLocation"), detailCells.location],
                  [t("people.attendance.userName"), detailCells.userName],
                  [t("people.attendance.deviceUserId"), detailCells.deviceUserId],
                  [t("attendanceHr.reports.colDate"), detailCells.date],
                  [t("people.attendance.reportingTime"), detailCells.reportingTime],
                  [t("attendanceHr.reports.colIn"), detailCells.firstCheckIn],
                  [t("attendanceHr.reports.colOut"), detailCells.lastCheckOut],
                  [t("people.attendance.totalHours"), detailCells.totalHours],
                  [t("attendanceHr.reports.colLate"), detailCells.latePunch],
                  [t("people.attendance.overtime"), detailCells.overtime],
                  [t("people.attendance.overtimeHours"), detailCells.overtimeHours],
                  [t("attendanceHr.reports.colStatus"), detailCells.status],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
