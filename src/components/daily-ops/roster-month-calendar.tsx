"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SupportedLanguage } from "@/i18n";
import {
  addMonths,
  buildMonthWeeks,
  dateInUploadPeriod,
  formatMonthTitle,
  formatShiftTime,
  groupShiftsByDate,
  isCurrentWeek,
  rosterWeekStartsOn,
  type RosterShiftRow,
  type RosterUploadRow,
  weekdayLabels,
  weekHasRosterUpload,
} from "@/lib/daily-ops/roster-calendar-utils";
import { cn } from "@/lib/utils";

const PREVIEW_COUNT = 2;

type RosterMonthCalendarProps = {
  yearMonth: string;
  onYearMonthChange: (ym: string) => void;
  shifts: RosterShiftRow[];
  uploads: RosterUploadRow[];
  isLoading?: boolean;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  language: SupportedLanguage;
};

export function RosterMonthCalendar({
  yearMonth,
  onYearMonthChange,
  shifts,
  uploads,
  isLoading,
  selectedDate,
  onSelectDate,
  language,
}: RosterMonthCalendarProps) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const weekStartsOn = rosterWeekStartsOn(language);

  const weeks = useMemo(
    () => buildMonthWeeks(yearMonth, weekStartsOn),
    [yearMonth, weekStartsOn],
  );
  const shiftsByDate = useMemo(() => groupShiftsByDate(shifts), [shifts]);
  const weekdays = useMemo(() => weekdayLabels(language, weekStartsOn), [language, weekStartsOn]);
  const monthTitle = formatMonthTitle(yearMonth, language);

  const selectedShifts = selectedDate ? (shiftsByDate.get(selectedDate) ?? []) : [];

  return (
    <>
      <NeumorphicCard className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => onYearMonthChange(addMonths(yearMonth, -1))}
              aria-label={t("dailyOps.roster.prevMonth")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="min-w-[10rem] text-center font-display text-lg font-semibold text-[#0B1F3A]">
              {monthTitle}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => onYearMonthChange(addMonths(yearMonth, 1))}
              aria-label={t("dailyOps.roster.nextMonth")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => onYearMonthChange(today.slice(0, 7))}
          >
            {t("dailyOps.roster.today")}
          </Button>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-1">
          {weekdays.map((label) => (
            <div
              key={label}
              className="py-1 text-center text-xs font-medium uppercase tracking-wide text-[#64748B]"
            >
              {label}
            </div>
          ))}
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("dailyOps.loading")}</p>
        ) : (
          <div className="space-y-1">
            {weeks.map((week, wi) => {
              const weekDates = week.map((d) => d.date);
              const currentWeek = isCurrentWeek(weekDates, today);
              const hasUpload = weekHasRosterUpload(weekDates, uploads);

              return (
                <div
                  key={wi}
                  className={cn(
                    "grid grid-cols-7 gap-1 rounded-xl p-0.5",
                    currentWeek && "bg-[#EEF2FF] ring-1 ring-[#818CF8]/40",
                    !currentWeek && hasUpload && "bg-[#F0FDF4]/60 ring-1 ring-[#86EFAC]/50",
                  )}
                >
                  {week.map((cell) => {
                    const dayShifts = shiftsByDate.get(cell.date) ?? [];
                    const inUploadPeriod = dateInUploadPeriod(cell.date, uploads);
                    const preview = dayShifts.slice(0, PREVIEW_COUNT);
                    const extra = dayShifts.length - preview.length;

                    return (
                      <button
                        key={cell.date}
                        type="button"
                        onClick={() => onSelectDate(cell.date)}
                        className={cn(
                          "flex min-h-[5.5rem] flex-col rounded-lg border border-transparent p-1.5 text-start transition-colors sm:min-h-[6.5rem] sm:p-2",
                          "hover:border-[#CBD5E1] hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]",
                          !cell.inMonth && "opacity-45",
                          cell.isToday && "border-[#6366F1] bg-white shadow-sm",
                          inUploadPeriod && cell.inMonth && !cell.isToday && "bg-white/70",
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between gap-1">
                          <span
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                              cell.isToday
                                ? "bg-[#6366F1] text-white"
                                : "text-[#0B1F3A]",
                            )}
                          >
                            {cell.dayOfMonth}
                          </span>
                          {dayShifts.length > 0 && (
                            <Badge
                              variant="secondary"
                              className="h-5 px-1.5 text-[10px] font-normal"
                            >
                              {dayShifts.length}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                          {preview.map((shift) => (
                            <div
                              key={String(shift.id ?? shift.starts_at)}
                              className="truncate text-[10px] leading-tight text-[#475569] sm:text-[11px]"
                            >
                              <span className="font-medium text-[#0B1F3A]">
                                {shift.staff?.full_name ?? "—"}
                              </span>
                              <span className="text-[#94A3B8]">
                                {" "}
                                {formatShiftTime(shift.starts_at)}–{formatShiftTime(shift.ends_at)}
                              </span>
                            </div>
                          ))}
                          {extra > 0 && (
                            <span className="text-[10px] text-[#6366F1]">
                              {t("dailyOps.roster.moreShifts", { count: extra })}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-[#64748B]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded bg-[#EEF2FF] ring-1 ring-[#818CF8]/40" />
            {t("dailyOps.roster.legendCurrentWeek")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded bg-[#F0FDF4]/60 ring-1 ring-[#86EFAC]/50" />
            {t("dailyOps.roster.legendRosterWeek")}
          </span>
        </div>
      </NeumorphicCard>

      <Dialog open={!!selectedDate} onOpenChange={(open) => !open && onSelectDate(null)}>
        <DialogContent className="max-w-lg sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {selectedDate
                ? t("dailyOps.roster.dayDetailTitle", {
                    date: new Date(selectedDate + "T12:00:00").toLocaleDateString(
                      language === "ar" ? "ar" : "en-US",
                      { weekday: "long", month: "long", day: "numeric", year: "numeric" },
                    ),
                  })
                : ""}
            </DialogTitle>
          </DialogHeader>
          {selectedShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("dailyOps.roster.scheduleEmpty")}</p>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dailyOps.roster.name")}</TableHead>
                    <TableHead>{t("dailyOps.roster.shift")}</TableHead>
                    <TableHead>{t("dailyOps.roster.role")}</TableHead>
                    <TableHead>{t("dailyOps.roster.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedShifts.map((row) => (
                    <TableRow key={String(row.id ?? row.starts_at)}>
                      <TableCell>{row.staff?.full_name ?? "—"}</TableCell>
                      <TableCell>
                        {formatShiftTime(row.starts_at)} – {formatShiftTime(row.ends_at)}
                      </TableCell>
                      <TableCell>{row.role_label ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
