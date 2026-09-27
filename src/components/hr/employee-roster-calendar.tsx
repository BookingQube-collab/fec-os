"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { SupportedLanguage } from "@/i18n";
import { rosterDayStatusFromRow } from "@/lib/attendance-hr/roster-register-scope";
import {
  addMonths,
  buildMonthWeeks,
  formatMonthTitle,
  rosterWeekStartsOn,
  toDateStr,
  weekdayLabels,
} from "@/lib/daily-ops/roster-calendar-utils";
import { cn } from "@/lib/utils";

export type EmployeeRosterCalendarRow = {
  id: string;
  workDate: string;
  locationLabel: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  isWeekOff: boolean;
  leaveType: string | null;
};

function rosterShiftLabel(row: EmployeeRosterCalendarRow, t: (key: string) => string) {
  const status = rosterDayStatusFromRow(row);
  if (status === "weekly_off") return t("people.roster.dutyOff");
  if (status === "annual_leave") return t("people.roster.dutyAnnualLeave");
  if (status === "sick_leave") return t("people.roster.dutySickLeave");
  if (status === "comp_off") return t("people.roster.dutyCompOff");
  if (row.shiftStart && row.shiftEnd) return `${row.shiftStart}–${row.shiftEnd}`;
  if (row.shiftStart) return row.shiftStart;
  return t("people.roster.dutyYes");
}

/** Calendar month that contains today when it overlaps the loaded roster, otherwise the period start. */
export function defaultRosterCalendarMonth(dateFrom?: string | null, dateTo?: string | null): string {
  const today = toDateStr(new Date());
  const from = dateFrom?.slice(0, 10);
  const to = dateTo?.slice(0, 10);
  if (from && to && today >= from && today <= to) return today.slice(0, 7);
  if (from && /^\d{4}-\d{2}/.test(from)) return from.slice(0, 7);
  return today.slice(0, 7);
}

function ShiftTime({ start, end }: { start: string; end: string }) {
  return (
    <span className="mt-1 block text-[10px] font-semibold leading-tight tabular-nums text-foreground sm:text-[11px]">
      {start}
      <span className="font-normal text-muted-foreground">–</span>
      <wbr />
      {end}
    </span>
  );
}

export function EmployeeRosterCalendar({
  rows,
  dateFrom,
  dateTo,
}: {
  rows: EmployeeRosterCalendarRow[];
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const language: SupportedLanguage = i18n.language?.startsWith("ar") ? "ar" : "en";
  const weekStartsOn = rosterWeekStartsOn(language);
  const fallbackMonth = defaultRosterCalendarMonth(dateFrom, dateTo);
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const minMonth = dateFrom?.slice(0, 7) ?? fallbackMonth;
  const maxMonth = dateTo?.slice(0, 7) ?? fallbackMonth;
  const yearMonth = pickedMonth ?? fallbackMonth;
  const from = dateFrom?.slice(0, 10) ?? "";
  const to = dateTo?.slice(0, 10) ?? "";

  const weeks = useMemo(() => buildMonthWeeks(yearMonth, weekStartsOn), [yearMonth, weekStartsOn]);
  const weekdays = useMemo(() => weekdayLabels(language, weekStartsOn), [language, weekStartsOn]);
  const byDate = useMemo(() => {
    const map = new Map<string, EmployeeRosterCalendarRow>();
    for (const row of rows) map.set(row.workDate.slice(0, 10), row);
    return map;
  }, [rows]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            disabled={yearMonth <= minMonth}
            onClick={() => setPickedMonth(addMonths(yearMonth, -1))}
            aria-label={t("hr.me.rosterPrevMonth")}
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <p className="min-w-[8.5rem] text-center text-sm font-semibold text-foreground">
            {formatMonthTitle(yearMonth, language)}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            disabled={yearMonth >= maxMonth}
            onClick={() => setPickedMonth(addMonths(yearMonth, 1))}
            aria-label={t("hr.me.rosterNextMonth")}
          >
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </div>
        {yearMonth !== fallbackMonth ? (
          <Button type="button" variant="ghost" size="sm" className="px-2 text-xs" onClick={() => setPickedMonth(null)}>
            {t("hr.me.rosterThisMonth")}
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[17.5rem]">
          <div className="mb-1 grid grid-cols-7 gap-1">
            {weekdays.map((label) => (
              <div
                key={label}
                title={label}
                className="truncate py-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {weeks.map((week) => (
              <div key={week[0]?.date ?? "week"} className="grid grid-cols-7 gap-1">
                {week.map((cell) => {
                  const row = byDate.get(cell.date);
                  const covered = Boolean(from && to && cell.date >= from && cell.date <= to);
                  const status = row ? rosterDayStatusFromRow(row) : null;
                  const off = status != null && status !== "on_duty";
                  const label = row ? rosterShiftLabel(row, t) : "";
                  const showRange = Boolean(row && status === "on_duty" && row.shiftStart && row.shiftEnd);

                  return (
                    <div
                      key={cell.date}
                      title={row ? [label, row.locationLabel].filter(Boolean).join(" · ") : undefined}
                      className={cn(
                        "flex min-h-[3.35rem] min-w-0 flex-col rounded-md border border-border/50 bg-background/50 p-1 sm:min-h-[4.25rem] sm:rounded-lg sm:p-1.5",
                        !covered && "opacity-40",
                        cell.isToday && "border-primary/60 bg-primary/5",
                        covered && off && "bg-muted/70",
                      )}
                    >
                      <span
                        className={cn(
                          "text-[11px] font-semibold leading-none tabular-nums sm:text-xs",
                          cell.isToday ? "text-primary" : "text-foreground",
                        )}
                      >
                        {cell.dayOfMonth}
                      </span>
                      {row ? (
                        showRange && row.shiftStart && row.shiftEnd ? (
                          <ShiftTime start={row.shiftStart} end={row.shiftEnd} />
                        ) : (
                          <span
                            className={cn(
                              "mt-1 line-clamp-3 text-[10px] font-medium leading-tight sm:text-[11px]",
                              off ? "text-muted-foreground" : "text-foreground",
                            )}
                          >
                            {label}
                          </span>
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
