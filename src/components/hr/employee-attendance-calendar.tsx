"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { MissedPunchRequestButton } from "@/components/attendance-hr/missed-punch-approval-queue";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SupportedLanguage } from "@/i18n";
import {
  computeHoursWorked,
  formatHoursValue,
  formatPunchTime12h,
  formatWorkDateDdMmYyyy,
} from "@/lib/attendance-display";
import {
  addMonths,
  buildMonthWeeks,
  formatMonthTitle,
  isCurrentWeek,
  rosterWeekStartsOn,
  weekdayLabels,
} from "@/lib/daily-ops/roster-calendar-utils";
import { cn } from "@/lib/utils";

export type EmployeeAttendanceCalendarRow = {
  id: string;
  workDate: string;
  status: string;
  missedPunch: boolean;
  actualIn: string | null;
  actualOut: string | null;
  locationLabel: string;
};

export function attendanceBadgeVariant(
  status: string,
  missedPunch: boolean,
): "destructive" | "warning" | "success" | "muted" {
  if (missedPunch || status === "absent" || status === "missed_punch") return "destructive";
  if (
    status === "late" ||
    status === "early_leave" ||
    status === "early_departure" ||
    status === "short_hours" ||
    status === "incomplete" ||
    status === "review_required"
  ) {
    return "warning";
  }
  if (status === "present" || status === "overtime") return "success";
  return "muted";
}

function statusCueClass(status: string, missedPunch: boolean): string {
  if (missedPunch || status === "absent" || status === "missed_punch") {
    return "bg-[#FEF2F2] ring-1 ring-[#FECACA]/70";
  }
  if (status === "present" || status === "overtime") {
    return "bg-[#F0FDF4] ring-1 ring-[#86EFAC]/50";
  }
  if (
    status === "weekly_off" ||
    status === "public_holiday" ||
    status === "annual_leave" ||
    status === "sick_leave" ||
    status === "unpaid_leave"
  ) {
    return "bg-[#FFFBEB] ring-1 ring-[#FCD34D]/60";
  }
  if (
    status === "late" ||
    status === "early_leave" ||
    status === "early_departure" ||
    status === "short_hours" ||
    status === "incomplete" ||
    status === "review_required"
  ) {
    return "bg-[#FFF7ED] ring-1 ring-[#FDBA74]/60";
  }
  return "bg-white/70";
}

function statusDotClass(status: string, missedPunch: boolean): string {
  if (missedPunch || status === "absent" || status === "missed_punch") return "bg-[#EF4444]";
  if (status === "present" || status === "overtime") return "bg-[#22C55E]";
  if (
    status === "weekly_off" ||
    status === "public_holiday" ||
    status === "annual_leave" ||
    status === "sick_leave" ||
    status === "unpaid_leave"
  ) {
    return "bg-[#F59E0B]";
  }
  if (
    status === "late" ||
    status === "early_leave" ||
    status === "early_departure" ||
    status === "short_hours" ||
    status === "incomplete" ||
    status === "review_required"
  ) {
    return "bg-[#F97316]";
  }
  return "bg-[#94A3B8]";
}

function labelOrRaw(t: (key: string) => string, key: string, raw: string) {
  const label = t(key);
  return label === key ? raw.replace(/_/g, " ") : label;
}

function AttendanceDayDetail({
  row,
  onSelect,
  selected,
}: {
  row: EmployeeAttendanceCalendarRow;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const { t } = useTranslation();
  const needsPunch =
    row.missedPunch ||
    row.status === "missed_punch" ||
    Boolean(row.actualIn) !== Boolean(row.actualOut);

  return (
    <div
      className={cn(
        "hd-row",
        needsPunch && "bg-amber-500/10",
        selected && "ring-1 ring-[#6366F1]/40",
      )}
    >
      <div className="min-w-0">
        <button
          type="button"
          className="w-full rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onSelect}
        >
          <p className="hd-row__title">{formatWorkDateDdMmYyyy(row.workDate)}</p>
          <p className="hd-row__meta">
            {row.locationLabel} · {formatPunchTime12h(row.actualIn) || "—"} –{" "}
            {formatPunchTime12h(row.actualOut) || "—"} ·{" "}
            {formatHoursValue(computeHoursWorked(row.actualIn, row.actualOut))}h
          </p>
        </button>
        <MissedPunchRequestButton
          summaryId={row.id}
          missedPunch={row.missedPunch}
          status={row.status}
          actualIn={row.actualIn}
          actualOut={row.actualOut}
        />
      </div>
      <Badge variant={attendanceBadgeVariant(row.status, row.missedPunch)}>
        {labelOrRaw(t, `attendanceHr.reports.statuses.${row.status}`, row.status)}
      </Badge>
    </div>
  );
}

type EmployeeAttendanceCalendarProps = {
  yearMonth: string;
  onYearMonthChange: (ym: string) => void;
  rows: EmployeeAttendanceCalendarRow[];
  isLoading?: boolean;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  todayYmd: string;
};

export function EmployeeAttendanceCalendar({
  yearMonth,
  onYearMonthChange,
  rows,
  isLoading,
  selectedDate,
  onSelectDate,
  todayYmd,
}: EmployeeAttendanceCalendarProps) {
  const { t, i18n } = useTranslation();
  const language: SupportedLanguage = i18n.language?.startsWith("ar") ? "ar" : "en";
  const weekStartsOn = rosterWeekStartsOn(language);

  const weeks = useMemo(() => buildMonthWeeks(yearMonth, weekStartsOn), [yearMonth, weekStartsOn]);
  const weekdays = useMemo(() => weekdayLabels(language, weekStartsOn), [language, weekStartsOn]);
  const monthTitle = formatMonthTitle(yearMonth, language);

  const byDate = useMemo(() => {
    const map = new Map<string, EmployeeAttendanceCalendarRow>();
    for (const row of rows) map.set(row.workDate.slice(0, 10), row);
    return map;
  }, [rows]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => b.workDate.localeCompare(a.workDate)),
    [rows],
  );

  const selectedRow = selectedDate ? (byDate.get(selectedDate) ?? null) : null;

  useEffect(() => {
    if (selectedDate) return;
    if (todayYmd.startsWith(yearMonth)) {
      onSelectDate(todayYmd);
      return;
    }
    const firstInMonth = sortedRows.find((row) => row.workDate.startsWith(yearMonth));
    if (firstInMonth) onSelectDate(firstInMonth.workDate);
  }, [selectedDate, todayYmd, yearMonth, sortedRows, onSelectDate]);

  return (
    <div className="space-y-4">
      <NeumorphicCard className="p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4 sm:gap-3">
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => onYearMonthChange(addMonths(yearMonth, -1))}
              aria-label={t("hr.me.rosterPrevMonth")}
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <h3 className="min-w-[9rem] text-center text-base font-semibold text-foreground sm:min-w-[10rem] sm:text-lg">
              {monthTitle}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => onYearMonthChange(addMonths(yearMonth, 1))}
              aria-label={t("hr.me.rosterNextMonth")}
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => {
              onYearMonthChange(todayYmd.slice(0, 7));
              onSelectDate(todayYmd);
            }}
          >
            {t("hr.me.attendanceToday")}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[17.5rem]">
            <div className="mb-2 grid grid-cols-7 gap-1">
              {weekdays.map((label) => (
                <div
                  key={label}
                  title={label}
                  className="truncate py-1 text-center text-[10px] font-medium uppercase tracking-wide text-[#64748B] sm:text-xs"
                >
                  {label}
                </div>
              ))}
            </div>

            {isLoading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : (
              <div className="space-y-1">
                {weeks.map((week, wi) => {
                  const weekDates = week.map((d) => d.date);
                  const currentWeek = isCurrentWeek(weekDates, todayYmd);

                  return (
                    <div
                      key={wi}
                      className={cn(
                        "grid grid-cols-7 gap-1 rounded-xl p-0.5",
                        currentWeek && "bg-[#EEF2FF] ring-1 ring-[#818CF8]/40",
                      )}
                    >
                      {week.map((cell) => {
                        const row = byDate.get(cell.date);
                        const selected = selectedDate === cell.date;
                        const cue = row ? statusCueClass(row.status, row.missedPunch) : "";

                        return (
                          <button
                            key={cell.date}
                            type="button"
                            onClick={() => onSelectDate(cell.date)}
                            className={cn(
                              "flex min-h-[3.5rem] min-w-0 flex-col rounded-lg border border-transparent p-1 text-start transition-colors sm:min-h-[5rem] sm:p-1.5",
                              "hover:border-border hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              !cell.inMonth && "opacity-45",
                              cell.isToday && !selected && "border-ring bg-card shadow-sm",
                              selected && "border-[#6366F1] bg-card shadow-sm ring-1 ring-[#6366F1]/50",
                              row && cell.inMonth && !selected && cue,
                            )}
                          >
                            <div className="flex items-center justify-between gap-0.5">
                              <span
                                className={cn(
                                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                                  cell.isToday || selected
                                    ? "bg-primary text-primary-foreground"
                                    : "text-foreground",
                                )}
                              >
                                {cell.dayOfMonth}
                              </span>
                              {row ? (
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2",
                                    statusDotClass(row.status, row.missedPunch),
                                  )}
                                  aria-hidden
                                />
                              ) : null}
                            </div>
                            {row ? (
                              <span className="mt-auto line-clamp-2 text-[9px] font-medium leading-tight text-muted-foreground sm:text-[10px]">
                                {labelOrRaw(t, `attendanceHr.reports.statuses.${row.status}`, row.status)}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[#64748B] sm:mt-4 sm:gap-4 sm:text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded bg-[#EEF2FF] ring-1 ring-[#818CF8]/40" />
            {t("hr.me.attendanceLegendCurrentWeek")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#22C55E]" />
            {t("attendanceHr.reports.statuses.present")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#EF4444]" />
            {t("attendanceHr.reports.statuses.absent")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#F59E0B]" />
            {t("attendanceHr.reports.statuses.weekly_off")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#F97316]" />
            {t("attendanceHr.reports.statuses.late")}
          </span>
        </div>
      </NeumorphicCard>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {selectedDate
            ? t("hr.me.attendanceDayDetail", {
                date: formatWorkDateDdMmYyyy(selectedDate),
              })
            : t("hr.me.attendancePickDay")}
        </h3>
        {selectedRow ? (
          <AttendanceDayDetail row={selectedRow} />
        ) : selectedDate ? (
          <p className="hd-empty">{t("hr.me.attendanceNoDay")}</p>
        ) : null}
      </div>

      {sortedRows.some((row) => row.workDate !== selectedDate) ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {t("hr.me.attendanceMonthList")}
          </h3>
          <ul>
            {sortedRows
              .filter((row) => row.workDate !== selectedDate)
              .map((row) => (
                <li key={row.id}>
                  <AttendanceDayDetail row={row} onSelect={() => onSelectDate(row.workDate)} />
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
