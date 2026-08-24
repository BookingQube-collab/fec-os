"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { EventHealthBadge } from "@/components/events/event-health-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useEventsCalendar } from "@/hooks/queries/useEvents";
import { useAppStore } from "@/stores/app-store";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}

export default function EventsCalendarPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const cal = useEventsCalendar(month, locationId);
  const events = cal.data ?? [];

  const grid = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells: Array<{ date: string | null; day: number | null }> = [];
    for (let i = 0; i < startPad; i += 1) cells.push({ date: null, day: null });
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        date: `${month}-${String(day).padStart(2, "0")}`,
        day,
      });
    }
    return cells;
  }, [month]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("events.kicker")}
        title={t("events.calendar.title")}
        subtitle={t("events.calendar.subtitle")}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              {t("events.calendar.prev")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMonth(monthKey(new Date()))}>
              {t("events.calendar.today")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
              {t("events.calendar.next")}
            </Button>
          </div>
        }
      />

      <p className="text-sm font-semibold tabular-nums">{month}</p>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-border/40 bg-border/40">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-card px-2 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
            {t(`events.calendar.dow.${d}`)}
          </div>
        ))}
        {grid.map((cell, idx) => {
          const dayEvents = cell.date
            ? events.filter((e) => {
                const from = e.setup_start ?? e.event_start;
                const to = e.dismantle_date ?? e.event_end ?? e.event_start;
                if (!from && !to) return false;
                return (from ?? to!) <= cell.date! && (to ?? from!) >= cell.date!;
              })
            : [];
          return (
            <div key={`${cell.date ?? "x"}-${idx}`} className="min-h-24 bg-card p-1.5">
              <p className="text-[11px] tabular-nums text-muted-foreground">{cell.day ?? ""}</p>
              <div className="mt-1 space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className="block truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium"
                  >
                    {event.name}
                  </Link>
                ))}
                {dayEvents.length > 3 ? (
                  <p className="text-[10px] text-muted-foreground">+{dayEvents.length - 3}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        {events.map((event) => (
          <Link key={event.id} href={`/events/${event.id}`} className="flex items-center justify-between rounded-xl border border-border/40 bg-card px-3 py-2 text-sm">
            <span>
              {event.event_number} · {event.name}
            </span>
            <EventHealthBadge rag={event.health_rag} />
          </Link>
        ))}
      </div>
    </div>
  );
}
