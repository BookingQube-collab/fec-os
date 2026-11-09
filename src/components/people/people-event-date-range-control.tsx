"use client";

import { CalendarDays } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const dateInputClassName =
  "h-8 min-h-8 w-0 min-w-0 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-1 focus-visible:ring-[#7c3aed]/40";

/**
 * Inline From–To date pair for People → Event workforce filters.
 * Stays one horizontal row (no wrap) so narrow grid columns don’t stack/clip.
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
        "flex h-10 min-w-0 items-center gap-1.5 overflow-hidden rounded-xl border border-input bg-white px-2.5 shadow-sm",
        className,
      )}
      role="group"
      aria-label={t("peopleEvent.filters.dateRange")}
    >
      {showIcon ? (
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
      <label className="sr-only" htmlFor={fromInputId}>
        {t("peopleEvent.filters.from")}
      </label>
      <Input
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
      <Input
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
