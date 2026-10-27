"use client";

import { memo, useCallback, useMemo, useState, type ReactNode, type UIEvent } from "react";
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
  resolveHoursBasedAttendanceStatus,
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
import { shouldVirtualizeMatrixStaff, virtualWindowRange } from "@/lib/staff-roster/virtual-window";
import { cn } from "@/lib/utils";

const MATRIX_STAFF_ROW_PX = 52;
const MATRIX_STAFF_OVERSCAN = 4;

function weekdayShort(ymd: string, locale: string) {
  const intlLocale = locale.toLowerCase().startsWith("ar") ? "ar" : "en-GB";
  return new Intl.DateTimeFormat(intlLocale, { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${ymd.slice(0, 10)}T12:00:00.000Z`),
  );
}

function monthLabel(monthKey: string, locale: string, compact = false) {
  const intlLocale = locale.toLowerCase().startsWith("ar") ? "ar" : "en-GB";
  return new Intl.DateTimeFormat(intlLocale, {
    month: compact ? "short" : "long",
    year: compact ? "2-digit" : "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthKey}-01T12:00:00.000Z`));
}

const ATT_STICKY_NO =
  "sticky start-0 z-10 w-8 border-e border-border/70 bg-card px-1 py-1 text-center tabular-nums text-muted-foreground sm:w-10 sm:px-1.5";
const ATT_STICKY_NO_TH =
  "sticky start-0 z-30 w-8 border-b border-e border-border/70 bg-card px-1 py-1 text-center font-medium sm:w-10 sm:px-1.5";
const ATT_STICKY_STAFF =
  "sticky start-8 z-10 min-w-[7.5rem] max-w-[9rem] border-e border-border/70 bg-card px-1.5 py-1.5 sm:start-10 sm:min-w-[11rem] sm:max-w-[14rem] sm:px-2";
const ATT_STICKY_STAFF_TH =
  "sticky start-8 z-30 min-w-[7.5rem] max-w-[9rem] border-b border-e border-border/70 bg-card px-1.5 py-1 text-start font-medium sm:start-10 sm:min-w-[11rem] sm:max-w-[14rem] sm:px-2";
const ATT_DAY_COL = "min-w-[3.5rem] border-b border-border/60 px-0.5 py-1 text-center font-medium sm:min-w-[4.75rem] sm:px-1";

function dayNumber(ymd: string) {
  return Number(ymd.slice(8, 10));
}

type AttendanceStaffRowProps = {
  person: { staffId: string; staffName: string | null; employeeCode: string | null; qid: string | null };
  index: number;
  dates: readonly string[];
  byStaffDate: Map<string, AttendanceMatrixRow[]>;
  offLabel: string;
  notJoinedLabel: string;
  onOpen: (entry: AttendanceMatrixRow) => void;
};

const AttendanceStaffRow = memo(function AttendanceStaffRow({
  person,
  index,
  dates,
  byStaffDate,
  offLabel,
  notJoinedLabel,
  onOpen,
}: AttendanceStaffRowProps) {
  return (
    <tr className="border-b border-border/50" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 3rem" }}>
      <td className={ATT_STICKY_NO}>{index + 1}</td>
      <td className={ATT_STICKY_STAFF}>
        <div className="truncate font-medium leading-tight">{person.staffName || "—"}</div>
        <div className="truncate text-[10px] text-muted-foreground">
          {person.employeeCode || person.qid || ""}
        </div>
      </td>
      {dates.map((ymd) => {
        const weekend = isWeekendYmd(ymd);
        const entries = byStaffDate.get(rosterMatrixCellKey(person.staffId, ymd)) ?? [];
        return (
          <td
            key={`${person.staffId}-${ymd}`}
            className={cn("align-top border-border/40 px-0.5 py-0.5", weekend ? "bg-muted/50" : "bg-card")}
          >
            {entries.length === 0 ? (
              <div className="min-h-[2.75rem]" />
            ) : (
              <div className="flex flex-col gap-0.5">
                {entries.map((entry) => {
                  const content = attendanceGridCellContent(entry);
                  const primary =
                    content.tone === "weekly_off"
                      ? offLabel
                      : content.tone === "not_joined"
                        ? notJoinedLabel
                        : content.primary;
                  return (
                    <button
                      key={entry.id ?? `${entry.staffId}-${entry.workDate}`}
                      type="button"
                      className={cn(
                        "w-full rounded-md px-1 py-1 text-center leading-tight transition-colors hover:ring-1 hover:ring-border",
                        attendanceGridCellClass(content.tone),
                      )}
                      onClick={() => onOpen(entry)}
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
                        <div className="mt-0.5 hidden truncate text-[9px] text-muted-foreground sm:block">
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
  );
});

export const AttendanceRecordsGrid = memo(function AttendanceRecordsGrid({
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
  const [scrollTop, setScrollTop] = useState(0);

  const matrix = useMemo(() => buildAttendanceMatrix(rows, dateFrom, dateTo), [rows, dateFrom, dateTo]);
  const offLabel = t("attendanceHr.reports.cellOff");
  const notJoinedLabel = t("attendanceHr.reports.statuses.not_joined");
  const staffWindow = useMemo(
    () => virtualWindowRange(matrix.staff.length, scrollTop, MATRIX_STAFF_ROW_PX, maxHeight, MATRIX_STAFF_OVERSCAN),
    [matrix.staff.length, scrollTop, maxHeight],
  );
  const virtualizeStaff = shouldVirtualizeMatrixStaff(matrix.staff.length, staffWindow.fullyInWindow);
  const visibleStaff = virtualizeStaff
    ? matrix.staff.slice(staffWindow.start, staffWindow.end)
    : matrix.staff;
  const colSpan = 2 + matrix.dates.length;
  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const top = event.currentTarget.scrollTop;
    setScrollTop((prev) => (prev === top ? prev : top));
  }, []);

  if (rows.length === 0) {
    return (
      <AttendanceRecordsTable
        rows={[]}
        empty={empty ?? <p className="text-sm text-muted-foreground">{t("attendanceHr.reports.empty")}</p>}
      />
    );
  }

  const detailCells = detail ? attendanceListingCells(detail) : null;
  const detailStatus = detail
    ? t(`attendanceHr.reports.statuses.${resolveHoursBasedAttendanceStatus(detail)}`, {
        defaultValue: detailCells?.status ?? "",
      })
    : "";

  return (
    <>
      <div
        className="overflow-auto rounded-lg border border-border/70 [contain:layout_paint]"
        style={{ maxHeight }}
        onScroll={virtualizeStaff ? onScroll : undefined}
      >
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
                  <span className="sm:hidden">{monthLabel(span.monthKey, i18n.language, true)}</span>
                  <span className="hidden sm:inline">{monthLabel(span.monthKey, i18n.language)}</span>
                </th>
              ))}
            </tr>
            <tr className="bg-card">
              <th className={ATT_STICKY_NO_TH}>{t("attendanceHr.reports.colNo")}</th>
              <th className={ATT_STICKY_STAFF_TH}>{t("attendanceHr.reports.colStaff")}</th>
              {matrix.dates.map((ymd) => {
                const weekend = isWeekendYmd(ymd);
                return (
                  <th
                    key={`wd-${ymd}`}
                    className={cn(
                      ATT_DAY_COL,
                      weekend ? "bg-muted/60 text-muted-foreground" : "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {weekdayShort(ymd, i18n.language)}
                  </th>
                );
              })}
            </tr>
            <tr className="bg-card">
              <th className="sticky start-0 z-30 w-8 border-b border-e border-border/70 bg-card sm:w-10" />
              <th className="sticky start-8 z-30 border-b border-e border-border/70 bg-card sm:start-10" />
              {matrix.dates.map((ymd) => {
                const weekend = isWeekendYmd(ymd);
                return (
                  <th
                    key={`dn-${ymd}`}
                    className={cn(
                      "border-b border-border/60 px-0.5 py-1 text-center tabular-nums font-semibold sm:px-1",
                      weekend ? "bg-muted/40" : "bg-card",
                    )}
                  >
                    {dayNumber(ymd)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {virtualizeStaff && staffWindow.topPad > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={colSpan} style={{ height: staffWindow.topPad, padding: 0, border: 0 }} />
              </tr>
            ) : null}
            {visibleStaff.map((person, offset) => {
              const index = virtualizeStaff ? staffWindow.start + offset : offset;
              return (
                <AttendanceStaffRow
                  key={person.staffId}
                  person={person}
                  index={index}
                  dates={matrix.dates}
                  byStaffDate={matrix.byStaffDate}
                  offLabel={offLabel}
                  notJoinedLabel={notJoinedLabel}
                  onOpen={setDetail}
                />
              );
            })}
            {virtualizeStaff && staffWindow.bottomPad > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={colSpan} style={{ height: staffWindow.bottomPad, padding: 0, border: 0 }} />
              </tr>
            ) : null}
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
                  [t("people.attendance.shiftStart"), detailCells.shiftStart],
                  [t("attendanceHr.reports.colIn"), detailCells.firstCheckIn],
                  [t("attendanceHr.reports.colOut"), detailCells.lastCheckOut],
                  [t("people.attendance.totalHours"), detailCells.totalHours],
                  [t("attendanceHr.reports.colLate"), detailCells.latePunch],
                  [t("people.attendance.overtime"), detailCells.overtime],
                  [t("people.attendance.overtimeHours"), detailCells.overtimeHours],
                  [t("attendanceHr.reports.colStatus"), detailStatus],
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
});
