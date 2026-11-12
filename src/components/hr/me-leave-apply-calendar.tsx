"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { SupportedLanguage } from "@/i18n";
import {
  addMonths,
  buildMonthWeeks,
  formatMonthTitle,
  monthDateRange,
  rosterWeekStartsOn,
  weekdayLabels,
} from "@/lib/daily-ops/roster-calendar-utils";
import { countLeaveDays } from "@/lib/hr-leave";
import { cn } from "@/lib/utils";

export type MeLeaveApplyCalendarProps = {
  dateFrom: string;
  dateTo: string;
  onChange: (next: { dateFrom: string; dateTo: string }) => void;
  /** YYYY-MM currently shown — parent can load roster OFF markers for this month. */
  visibleMonth?: string;
  onVisibleMonthChange?: (ym: string) => void;
  /** Roster week-off dates (YYYY-MM-DD) for the visible month. */
  weekOffDates?: ReadonlySet<string> | readonly string[];
  /** Pending / approved leave dates already on file. */
  leaveDates?: ReadonlySet<string> | readonly string[];
  /** Optional hire date — days before hire are muted (still selectable for corrections). */
  hireDate?: string | null;
  className?: string;
};

function toSet(input?: ReadonlySet<string> | readonly string[]): Set<string> {
  if (!input) return new Set();
  return input instanceof Set ? input : new Set(input);
}

/**
 * Month calendar for employee leave apply — tap start, then end.
 * Same entitlement engine runs on the server; this only selects dates.
 */
export function MeLeaveApplyCalendar({
  dateFrom,
  dateTo,
  onChange,
  visibleMonth,
  onVisibleMonthChange,
  weekOffDates,
  leaveDates,
  hireDate,
  className,
}: MeLeaveApplyCalendarProps) {
  const { t, i18n } = useTranslation();
  const language = (i18n.language?.startsWith("ar") ? "ar" : "en") as SupportedLanguage;
  const weekStartsOn = rosterWeekStartsOn(language);
  const labels = weekdayLabels(language, weekStartsOn);

  const initialYm = (dateFrom || dateTo || new Date().toISOString().slice(0, 10)).slice(0, 7);
  const [internalMonth, setInternalMonth] = useState(initialYm);
  const month = visibleMonth ?? internalMonth;
  const setMonth = (next: string | ((prev: string) => string)) => {
    const value = typeof next === "function" ? next(month) : next;
    if (!visibleMonth) setInternalMonth(value);
    onVisibleMonthChange?.(value);
  };
  const weeks = useMemo(() => buildMonthWeeks(month, weekStartsOn), [month, weekStartsOn]);
  const offSet = useMemo(() => toSet(weekOffDates), [weekOffDates]);
  const leaveSet = useMemo(() => toSet(leaveDates), [leaveDates]);
  const rangeEnd = dateTo || dateFrom;
  const selectedDays = dateFrom ? countLeaveDays(dateFrom, rangeEnd || dateFrom) : 0;

  function pick(day: string) {
    if (!dateFrom || (dateFrom && dateTo && dateFrom !== dateTo)) {
      onChange({ dateFrom: day, dateTo: day });
      return;
    }
    if (day < dateFrom) {
      onChange({ dateFrom: day, dateTo: dateFrom });
      return;
    }
    onChange({ dateFrom, dateTo: day });
  }

  function clear() {
    onChange({ dateFrom: "", dateTo: "" });
  }

  const range = monthDateRange(month);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            {t("hr.leave.applyCalendarTitle", { defaultValue: "Select leave dates" })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("hr.leave.applyCalendarHint", {
              defaultValue: "Tap a start day, then an end day. Weekly OFF is marked for sandwich checks.",
            })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9"
            aria-label={t("common.previous", { defaultValue: "Previous" })}
            onClick={() => setMonth((m) => addMonths(m, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-medium">
            {formatMonthTitle(month, language)}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9"
            aria-label={t("common.next", { defaultValue: "Next" })}
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-medium text-muted-foreground">
        {labels.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flatMap((week) =>
          week.map((cell) => {
            const inRange =
              Boolean(dateFrom) &&
              cell.date >= dateFrom &&
              cell.date <= (rangeEnd || dateFrom);
            const isEdge = cell.date === dateFrom || cell.date === rangeEnd;
            const isOff = offSet.has(cell.date);
            const hasLeave = leaveSet.has(cell.date);
            const beforeHire = Boolean(hireDate && cell.date < hireDate);
            return (
              <button
                key={cell.date}
                type="button"
                disabled={!cell.inMonth}
                onClick={() => pick(cell.date)}
                className={cn(
                  "relative flex min-h-10 flex-col items-center justify-center rounded-lg border text-xs transition",
                  !cell.inMonth && "pointer-events-none opacity-30",
                  cell.inMonth && "border-border/60 bg-background hover:border-primary/40",
                  inRange && "border-primary/50 bg-primary/15",
                  isEdge && "border-primary bg-primary text-primary-foreground hover:bg-primary",
                  cell.isToday && !inRange && "ring-1 ring-primary/40",
                  beforeHire && "opacity-60",
                )}
                aria-label={cell.date}
                aria-pressed={inRange}
              >
                <span className="font-semibold tabular-nums">{cell.dayOfMonth}</span>
                <span className="mt-0.5 flex gap-0.5">
                  {isOff ? (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isEdge ? "bg-primary-foreground/80" : "bg-slate-500",
                      )}
                      title={t("hr.leave.weekOffMark", { defaultValue: "Weekly OFF" })}
                    />
                  ) : null}
                  {hasLeave ? (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isEdge ? "bg-amber-200" : "bg-amber-500",
                      )}
                      title={t("hr.leave.pendingMark", { defaultValue: "Existing leave" })}
                    />
                  ) : null}
                </span>
              </button>
            );
          }),
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          {dateFrom
            ? t("hr.leave.selectedRange", {
                from: dateFrom,
                to: rangeEnd || dateFrom,
                days: selectedDays,
                defaultValue: "{{from}} → {{to}} · {{days}} day(s)",
              })
            : t("hr.leave.selectedRangeEmpty", { defaultValue: "No dates selected yet." })}
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            {t("hr.leave.weekOffMark", { defaultValue: "Weekly OFF" })}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {t("hr.leave.pendingMark", { defaultValue: "Existing leave" })}
          </span>
          {dateFrom ? (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={clear}>
              {t("hr.leave.clearDates", { defaultValue: "Clear dates" })}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="sr-only">
        {t("hr.leave.applyCalendarMonthRange", {
          from: range.from,
          to: range.to,
          defaultValue: "Showing {{from}} to {{to}}",
        })}
      </p>
    </div>
  );
}
