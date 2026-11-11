"use client";

import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PeopleEventOption } from "@/lib/people-event-workforce.functions";
import { peopleEventSelectLabel } from "@/lib/people-event-selection";
import { cn } from "@/lib/utils";

/** Compact Event dropdown for shared People Events chrome. */
export function PeopleEventSharedEventSelect({
  eventId,
  events,
  onEventIdChange,
  allowAll = true,
  disabled = false,
  className,
  triggerClassName,
}: {
  eventId: string;
  events: PeopleEventOption[];
  onEventIdChange: (eventId: string) => void;
  /** When true, includes an “All events” option that clears selection. */
  allowAll?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}) {
  const { t } = useTranslation();
  const selected = events.find((ev) => ev.id === eventId);
  const triggerLabel = eventId
    ? selected
      ? peopleEventSelectLabel(selected)
      : t("peopleEvent.demo.pickEvent")
    : allowAll
      ? t("peopleEvent.filters.allEvents")
      : t("peopleEvent.demo.pickEvent");

  return (
    <div className={cn("min-w-0", className)}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("peopleEvent.filters.event")}
      </label>
      <div className="relative">
        <CalendarDays
          className="pointer-events-none absolute start-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Select
          value={eventId || "all"}
          onValueChange={(v) => onEventIdChange(v === "all" ? "" : v)}
          disabled={disabled}
        >
          <SelectTrigger
            className={cn("h-10 min-w-[12rem] rounded-xl ps-9 sm:min-w-[16rem]", triggerClassName)}
          >
            <SelectValue placeholder={triggerLabel}>{triggerLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {allowAll ? (
              <SelectItem value="all">{t("peopleEvent.filters.allEvents")}</SelectItem>
            ) : (
              <SelectItem value="all">{t("peopleEvent.demo.pickEvent")}</SelectItem>
            )}
            {events.map((ev) => (
              <SelectItem key={ev.id} value={ev.id}>
                {peopleEventSelectLabel(ev)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
