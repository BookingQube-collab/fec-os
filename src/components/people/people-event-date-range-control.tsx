"use client";

import { CalendarDays } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/**
 * Native date fields inside a single chrome shell.
 * Hide the WebKit calendar glyph (Windows/Chrome clips it in narrow flex rows)
 * and stretch an invisible indicator so the whole field still opens the picker.
 * Intrinsic date min-width is reset so From/To can share one row without overflow.
 */
const dateInputClassName = cn(
  "relative h-8 min-h-8 min-w-[6.75rem] flex-1 border-0 bg-transparent px-1 py-0",
  "appearance-none text-sm leading-8 text-foreground shadow-none outline-none",
  "scheme-light tabular-nums",
  "focus-visible:rounded-md focus-visible:ring-1 focus-visible:ring-[#7c3aed]/40",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "[&::-webkit-datetime-edit]:min-w-0",
  "[&::-webkit-datetime-edit-fields-wrapper]:min-w-0",
  "[&::-webkit-datetime-edit-fields-wrapper]:p-0",
  "[&::-webkit-calendar-picker-indicator]:absolute",
  "[&::-webkit-calendar-picker-indicator]:inset-0",
  "[&::-webkit-calendar-picker-indicator]:h-full",
  "[&::-webkit-calendar-picker-indicator]:w-full",
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
  "[&::-webkit-calendar-picker-indicator]:opacity-0",
);

/**
 * Inline From–To date pair for People → Event workforce filters.
 * One horizontal row with a single Lucide calendar cue (no stacked native icons).
 */
export function PeopleEventDateRangeControl({
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  fromId,
  toId,
  disabled,
  showIcon = true,
  className,
}: {
  dateFrom: string;
  dateTo: string;
  onDateFrom: (value: string) => void;
  onDateTo: (value: string) => void;
  fromId?: string;
  toId?: string;
  disabled?: boolean;
  showIcon?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const autoId = useId();
  const fromInputId = fromId ?? `${autoId}-from`;
  const toInputId = toId ?? `${autoId}-to`;

  return (
    <div
      className={cn(
        "flex h-10 w-full min-w-0 items-center gap-1 rounded-xl border border-input bg-white px-2 shadow-sm",
        className,
      )}
      role="group"
      aria-label={t("peopleEvent.filters.dateRange")}
    >
      {showIcon ? (
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#7c3aed]" aria-hidden />
      ) : null}
      <label className="sr-only" htmlFor={fromInputId}>
        {t("peopleEvent.filters.from")}
      </label>
      <input
        id={fromInputId}
        type="date"
        value={dateFrom}
        max={dateTo || undefined}
        disabled={disabled}
        onChange={(e) => onDateFrom(e.target.value)}
        className={dateInputClassName}
      />
      <span className="shrink-0 select-none text-muted-foreground" aria-hidden>
        –
      </span>
      <label className="sr-only" htmlFor={toInputId}>
        {t("peopleEvent.filters.to")}
      </label>
      <input
        id={toInputId}
        type="date"
        value={dateTo}
        min={dateFrom || undefined}
        disabled={disabled}
        onChange={(e) => onDateTo(e.target.value)}
        className={dateInputClassName}
      />
    </div>
  );
}
