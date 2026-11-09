"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { PeopleEventDateRangeControl } from "@/components/people/people-event-date-range-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatLocationLabel } from "@/lib/locations/normalize";
import type { PeopleEventOption } from "@/lib/people-event-workforce.functions";

type Site = { id: string; code?: string | null; name?: string | null; label?: string | null };

/**
 * Shared People → Event workforce filter bar.
 * Pass `sites` already scoped to event-linked locations (see `eventSiteOptionsFromEvents`) —
 * never the full FEC mall roster from `useSites()`.
 */
export function PeopleEventFilters({
  events,
  sites,
  eventId,
  locationId,
  dateFrom,
  dateTo,
  search,
  onEventId,
  onLocationId,
  onDateFrom,
  onDateTo,
  onSearch,
  children,
}: {
  events: PeopleEventOption[];
  sites?: Site[];
  eventId: string;
  locationId: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  onEventId: (v: string) => void;
  onLocationId: (v: string) => void;
  onDateFrom?: (v: string) => void;
  onDateTo?: (v: string) => void;
  onSearch?: (v: string) => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const showDates = Boolean(onDateFrom && onDateTo);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
      <div className="min-w-0">
        <Label>{t("peopleEvent.filters.event")}</Label>
        <Select value={eventId || "all"} onValueChange={(v) => onEventId(v === "all" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder={t("peopleEvent.filters.allEvents")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("peopleEvent.filters.allEvents")}</SelectItem>
            {events.map((ev) => (
              <SelectItem key={ev.id} value={ev.id}>
                {ev.eventNumber ? `${ev.eventNumber} · ` : ""}
                {ev.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {sites ? (
        <div className="min-w-0">
          <Label>{t("peopleEvent.filters.site")}</Label>
          <Select
            value={locationId || "all"}
            onValueChange={(v) => onLocationId(v === "all" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.allBranches")}</SelectItem>
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.label?.trim() || formatLocationLabel(site.code, site.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {showDates ? (
        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
          <Label>{t("peopleEvent.filters.dateRange")}</Label>
          <PeopleEventDateRangeControl
            dateFrom={dateFrom ?? ""}
            dateTo={dateTo ?? ""}
            onDateFrom={onDateFrom!}
            onDateTo={onDateTo!}
            fromId="people-event-from"
            toId="people-event-to"
          />
        </div>
      ) : null}
      {onSearch ? (
        <div className="min-w-0 lg:col-span-2">
          <Label htmlFor="people-event-search">{t("peopleEvent.filters.search")}</Label>
          <Input
            id="people-event-search"
            value={search ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t("peopleEvent.filters.searchPlaceholder")}
          />
        </div>
      ) : null}
      {children}
    </div>
  );
}
