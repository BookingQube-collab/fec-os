"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

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

type Site = { id: string; code?: string | null; name?: string | null };

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
                  {formatLocationLabel(site.code, site.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {onDateFrom ? (
        <div className="min-w-0">
          <Label htmlFor="people-event-from">{t("peopleEvent.filters.from")}</Label>
          <Input
            id="people-event-from"
            type="date"
            value={dateFrom ?? ""}
            onChange={(e) => onDateFrom(e.target.value)}
          />
        </div>
      ) : null}
      {onDateTo ? (
        <div className="min-w-0">
          <Label htmlFor="people-event-to">{t("peopleEvent.filters.to")}</Label>
          <Input
            id="people-event-to"
            type="date"
            value={dateTo ?? ""}
            onChange={(e) => onDateTo(e.target.value)}
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
