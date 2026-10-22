"use client";

import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
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
  lateMinutes?: number;
  earlyLeaveMinutes?: number;
  overtimeMinutes?: number;
  workedMinutes?: number;
  scheduledIn?: string | null;
  scheduledOut?: string | null;
};

export type EmployeeAttendanceRosterHint = {
  workDate: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  locationLabel?: string;
  isWeekOff?: boolean;
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

/** Compact 1–2 char code for narrow calendar cells (full label lives in day detail). */
function statusShortCode(
  t: (key: string, opts?: { defaultValue?: string }) => string,
  status: string,
  missedPunch: boolean,
): string {
  if (missedPunch || status === "missed_punch") {
    return t("hr.me.attendanceCode.missed_punch", { defaultValue: "MP" });
  }
  const key = `hr.me.attendanceCode.${status}`;
  const code = t(key, { defaultValue: "" });
  if (code && code !== key) return code;
  const fallback: Record<string, string> = {
    present: "P",
    absent: "A",
    late: "L",
    weekly_off: "WO",
    public_holiday: "PH",
    annual_leave: "AL",
    sick_leave: "SL",
    unpaid_leave: "UL",
    short_hours: "UH",
    incomplete: "IN",
    overtime: "OT",
    review_required: "RV",
    not_started: "NS",
    not_joined: "NJ",
    unscheduled: "US",
    early_leave: "ED",
    early_departure: "ED",
    missed_punch: "MP",
  };
  return fallback[status] ?? status.slice(0, 2).toUpperCase();
}

function minutesFromIsoPair(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round(ms / 60_000);
}

function minutesFromHmPair(workDate: string, startHm: string | null | undefined, endHm: string | null | undefined): number | null {
  if (!startHm || !endHm || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return null;
  const start = new Date(`${workDate}T${startHm}:00+03:00`);
  let end = new Date(`${workDate}T${endHm}:00+03:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

function resolveExpectedMinutes(
  row: EmployeeAttendanceCalendarRow,
  roster: EmployeeAttendanceRosterHint | null | undefined,
): number | null {
  const fromSchedule = minutesFromIsoPair(row.scheduledIn, row.scheduledOut);
  if (fromSchedule != null && fromSchedule > 0) return fromSchedule;
  const fromRoster = minutesFromHmPair(row.workDate, roster?.shiftStart, roster?.shiftEnd);
  if (fromRoster != null && fromRoster > 0) return fromRoster;
  return null;
}

function resolveWorkedHoursDisplay(
  row: EmployeeAttendanceCalendarRow,
  todayYmd: string,
): { hours: number | null; tillNow: boolean } {
  if (row.actualIn && row.actualOut) {
    return { hours: computeHoursWorked(row.actualIn, row.actualOut), tillNow: false };
  }
  if (row.actualIn && !row.actualOut && row.workDate === todayYmd) {
    const ms = Date.now() - new Date(row.actualIn).getTime();
    if (Number.isFinite(ms) && ms >= 0) {
      return { hours: Math.round((ms / 3_600_000) * 100) / 100, tillNow: true };
    }
  }
  const worked = Number(row.workedMinutes ?? 0);
  if (worked > 0) return { hours: Math.round((worked / 60) * 100) / 100, tillNow: false };
  return { hours: null, tillNow: false };
}

function resolveShortfallHours(
  row: EmployeeAttendanceCalendarRow,
  expectedMinutes: number | null,
  workedHours: number | null,
): number | null {
  const early = Number(row.earlyLeaveMinutes ?? 0);
  if (early > 0) return Math.round((early / 60) * 100) / 100;
  if (expectedMinutes == null || workedHours == null) return null;
  const shortfall = expectedMinutes / 60 - workedHours;
  if (shortfall <= 0.01) return null;
  return Math.round(shortfall * 100) / 100;
}

function DetailFact({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[11px]">{label}</p>
      <p
        className={cn(
          "mt-0.5 break-words text-sm font-medium text-foreground",
          emphasize && "text-amber-700 dark:text-amber-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function AttendanceDayDetail({
  row,
  roster,
  todayYmd,
  onSelect,
  selected,
  compact,
}: {
  row: EmployeeAttendanceCalendarRow;
  roster?: EmployeeAttendanceRosterHint | null;
  todayYmd: string;
  onSelect?: () => void;
  selected?: boolean;
  /** Compact list row (month list); full card is the selected-day panel. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const needsPunch =
    row.missedPunch ||
    row.status === "missed_punch" ||
    Boolean(row.actualIn) !== Boolean(row.actualOut);
  const statusLabel = labelOrRaw(t, `attendanceHr.reports.statuses.${row.status}`, row.status);
  const expectedMinutes = resolveExpectedMinutes(row, roster);
  const { hours: workedHours, tillNow } = resolveWorkedHoursDisplay(row, todayYmd);
  const shortfall = resolveShortfallHours(row, expectedMinutes, workedHours);
  const showUnder =
    shortfall != null &&
    shortfall > 0 &&
    (row.status === "short_hours" ||
      row.status === "early_leave" ||
      row.status === "early_departure" ||
      row.status === "incomplete" ||
      tillNow ||
      Number(row.earlyLeaveMinutes ?? 0) > 0);

  const shiftLabel =
    roster?.isWeekOff
      ? t("people.roster.dutyOff")
      : roster?.shiftStart && roster?.shiftEnd
        ? `${roster.shiftStart}–${roster.shiftEnd}`
        : roster?.shiftStart
          ? roster.shiftStart
          : row.scheduledIn && row.scheduledOut
            ? `${formatPunchTime12h(row.scheduledIn)} – ${formatPunchTime12h(row.scheduledOut)}`
            : null;

  if (compact) {
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
              {row.locationLabel || "—"} · {formatPunchTime12h(row.actualIn) || "—"} –{" "}
              {formatPunchTime12h(row.actualOut) || "—"} · {formatHoursValue(workedHours)}h
              {tillNow ? ` (${t("hr.me.attendanceHoursTillNow")})` : ""}
              {showUnder && shortfall != null
                ? ` · ${t("hr.me.attendanceUnderHoursShort", { hours: formatHoursValue(shortfall) })}`
                : ""}
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
        <Badge variant={attendanceBadgeVariant(row.status, row.missedPunch)}>{statusLabel}</Badge>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm sm:p-4",
        needsPunch && "border-amber-300/70 bg-amber-500/5",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{formatWorkDateDdMmYyyy(row.workDate)}</p>
          {row.locationLabel ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{row.locationLabel}</span>
            </p>
          ) : null}
        </div>
        <Badge variant={attendanceBadgeVariant(row.status, row.missedPunch)}>{statusLabel}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <DetailFact label={t("hr.me.attendancePunchIn")} value={formatPunchTime12h(row.actualIn) || "—"} />
        <DetailFact label={t("hr.me.attendancePunchOut")} value={formatPunchTime12h(row.actualOut) || "—"} />
        <DetailFact
          label={
            tillNow ? t("hr.me.attendanceHoursWorkedTillNow") : t("hr.me.attendanceHoursWorked")
          }
          value={`${formatHoursValue(workedHours)}h`}
        />
        {expectedMinutes != null ? (
          <DetailFact
            label={t("hr.me.attendanceExpectedHours")}
            value={`${formatHoursValue(Math.round((expectedMinutes / 60) * 100) / 100)}h`}
          />
        ) : null}
        {showUnder && shortfall != null ? (
          <DetailFact
            label={
              tillNow ? t("hr.me.attendanceUnderHoursTillNow") : t("hr.me.attendanceUnderHours")
            }
            value={`${formatHoursValue(shortfall)}h`}
            emphasize
          />
        ) : null}
        {shiftLabel ? <DetailFact label={t("hr.me.attendanceRosterShift")} value={shiftLabel} /> : null}
        {Number(row.lateMinutes ?? 0) > 0 ? (
          <DetailFact
            label={t("hr.me.attendanceLateMinutes")}
            value={t("hr.me.attendanceMinutesValue", {
              minutes: Math.round(Number(row.lateMinutes)),
            })}
          />
        ) : null}
        {Number(row.overtimeMinutes ?? 0) > 0 ? (
          <DetailFact
            label={t("hr.me.attendanceOtMinutes")}
            value={t("hr.me.attendanceMinutesValue", {
              minutes: Math.round(Number(row.overtimeMinutes)),
            })}
          />
        ) : null}
      </div>

      <div className="mt-3">
        <MissedPunchRequestButton
          summaryId={row.id}
          missedPunch={row.missedPunch}
          status={row.status}
          actualIn={row.actualIn}
          actualOut={row.actualOut}
        />
      </div>
    </div>
  );
}

type EmployeeAttendanceCalendarProps = {
  yearMonth: string;
  onYearMonthChange: (ym: string) => void;
  rows: EmployeeAttendanceCalendarRow[];
  rosterRows?: EmployeeAttendanceRosterHint[];
  isLoading?: boolean;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  todayYmd: string;
};

export function EmployeeAttendanceCalendar({
  yearMonth,
  onYearMonthChange,
  rows,
  rosterRows,
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

  const rosterByDate = useMemo(() => {
    const map = new Map<string, EmployeeAttendanceRosterHint>();
    for (const row of rosterRows ?? []) map.set(row.workDate.slice(0, 10), row);
    return map;
  }, [rosterRows]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => b.workDate.localeCompare(a.workDate)),
    [rows],
  );

  const selectedRow = selectedDate ? (byDate.get(selectedDate) ?? null) : null;
  const selectedRoster = selectedDate ? (rosterByDate.get(selectedDate) ?? null) : null;

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
        <div className="mb-3 flex items-center gap-2 sm:mb-4 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
              onClick={() => onYearMonthChange(addMonths(yearMonth, -1))}
              aria-label={t("hr.me.rosterPrevMonth")}
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <h3 className="min-w-0 flex-1 truncate text-center text-base font-semibold text-foreground sm:text-lg">
              {monthTitle}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
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
            className="shrink-0 rounded-full"
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
                        "grid grid-cols-7 gap-0.5 rounded-xl p-0.5 sm:gap-1",
                        currentWeek && "bg-[#EEF2FF] ring-1 ring-[#818CF8]/40",
                      )}
                    >
                      {week.map((cell) => {
                        const row = byDate.get(cell.date);
                        const selected = selectedDate === cell.date;
                        const cue = row ? statusCueClass(row.status, row.missedPunch) : "";
                        const statusLabel = row
                          ? labelOrRaw(t, `attendanceHr.reports.statuses.${row.status}`, row.status)
                          : "";
                        const code = row ? statusShortCode(t, row.status, row.missedPunch) : "";

                        return (
                          <button
                            key={cell.date}
                            type="button"
                            onClick={() => onSelectDate(cell.date)}
                            aria-label={
                              row
                                ? `${cell.dayOfMonth}, ${statusLabel}`
                                : String(cell.dayOfMonth)
                            }
                            title={statusLabel || undefined}
                            className={cn(
                              "flex min-h-[2.75rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-transparent px-0.5 py-1 transition-colors sm:min-h-[4.25rem] sm:gap-1 sm:p-1.5",
                              "hover:border-border hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              !cell.inMonth && "opacity-45",
                              cell.isToday && !selected && "border-ring bg-card shadow-sm",
                              selected && "border-[#6366F1] bg-card shadow-sm ring-1 ring-[#6366F1]/50",
                              row && cell.inMonth && !selected && cue,
                            )}
                          >
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
                              <>
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 shrink-0 rounded-full",
                                    statusDotClass(row.status, row.missedPunch),
                                  )}
                                  aria-hidden
                                />
                                <span className="max-w-full truncate text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground sm:text-[10px]">
                                  {code}
                                </span>
                              </>
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

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-[11px] text-[#64748B] sm:mt-4 sm:gap-x-4 sm:text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded bg-[#EEF2FF] ring-1 ring-[#818CF8]/40" />
            {t("hr.me.attendanceLegendCurrentWeek")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#22C55E]" />
            {t("hr.me.attendanceCode.present", { defaultValue: "P" })} ·{" "}
            {t("attendanceHr.reports.statuses.present")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#EF4444]" />
            {t("hr.me.attendanceCode.absent", { defaultValue: "A" })} ·{" "}
            {t("attendanceHr.reports.statuses.absent")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#F59E0B]" />
            {t("hr.me.attendanceCode.weekly_off", { defaultValue: "WO" })} ·{" "}
            {t("attendanceHr.reports.statuses.weekly_off")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#F97316]" />
            {t("hr.me.attendanceCode.late", { defaultValue: "L" })} ·{" "}
            {t("attendanceHr.reports.statuses.late")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#F97316]" />
            {t("hr.me.attendanceCode.short_hours", { defaultValue: "UH" })} ·{" "}
            {t("attendanceHr.reports.statuses.short_hours")}
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
          <AttendanceDayDetail row={selectedRow} roster={selectedRoster} todayYmd={todayYmd} />
        ) : selectedDate ? (
          selectedRoster ? (
            <div className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm sm:p-4">
              <p className="text-sm text-muted-foreground">{t("hr.me.attendanceNoDay")}</p>
              {(selectedRoster.shiftStart || selectedRoster.isWeekOff) && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <DetailFact
                    label={t("hr.me.attendanceRosterShift")}
                    value={
                      selectedRoster.isWeekOff
                        ? t("people.roster.dutyOff")
                        : selectedRoster.shiftStart && selectedRoster.shiftEnd
                          ? `${selectedRoster.shiftStart}–${selectedRoster.shiftEnd}`
                          : selectedRoster.shiftStart ?? "—"
                    }
                  />
                  {selectedRoster.locationLabel ? (
                    <DetailFact
                      label={t("hr.me.location")}
                      value={selectedRoster.locationLabel}
                    />
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <p className="hd-empty">{t("hr.me.attendanceNoDay")}</p>
          )
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
                  <AttendanceDayDetail
                    row={row}
                    roster={rosterByDate.get(row.workDate) ?? null}
                    todayYmd={todayYmd}
                    compact
                    onSelect={() => onSelectDate(row.workDate)}
                  />
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
