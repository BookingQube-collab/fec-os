"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { EventHealthBadge } from "@/components/events/event-health-badge";
import type { EventListRow } from "@/lib/events/types";
import { cn } from "@/lib/utils";

function toDate(iso: string) {
  return new Date(`${iso}T00:00:00`);
}

function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function eventSpan(event: EventListRow) {
  const from = event.setup_start ?? event.event_start;
  const to = event.dismantle_date ?? event.event_end ?? event.event_start;
  if (!from && !to) return null;
  return { from: from ?? to!, to: to ?? from! };
}

export function EventsPortfolioTimeline({
  events,
  month,
}: {
  events: EventListRow[];
  /** YYYY-MM — used to center the viewport when event dates are sparse. */
  month: string;
}) {
  const { t } = useTranslation();

  const model = useMemo(() => {
    const spans = events
      .map((event) => {
        const span = eventSpan(event);
        if (!span) return null;
        return { event, ...span };
      })
      .filter(Boolean) as Array<{ event: EventListRow; from: string; to: string }>;

    const [y, m] = month.split("-").map(Number);
    const monthStart = `${month}-01`;
    const monthEndDate = new Date(y, m, 0);
    const monthEnd = iso(monthEndDate);

    const dates = spans.flatMap((s) => [s.from, s.to]);
    dates.push(monthStart, monthEnd);
    if (!dates.length) return null;

    const min = dates.reduce((a, b) => (a < b ? a : b));
    const max = dates.reduce((a, b) => (a > b ? a : b));
    const start = toDate(min);
    const end = toDate(max);
    const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const unit = spanDays > 60 ? 7 : 1;
    const cols = Math.ceil(spanDays / unit);
    const headers = Array.from({ length: cols }, (_, i) => iso(addDays(start, i * unit)));
    const pos = (from: string, to: string) => {
      const a = toDate(from);
      const b = toDate(to);
      const left = Math.max(0, (a.getTime() - start.getTime()) / 86_400_000 / unit);
      const width = Math.max(0.8, (b.getTime() - a.getTime()) / 86_400_000 / unit + (unit === 1 ? 1 : 0));
      return { left: (left / cols) * 100, width: (width / cols) * 100 };
    };

    const today = iso(new Date());
    const todayLeft = (() => {
      const day = toDate(today);
      if (day < start || day > addDays(end, 1)) return null;
      const left = Math.max(0, (day.getTime() - start.getTime()) / 86_400_000 / unit);
      return (left / cols) * 100;
    })();

    return { headers, cols, pos, rows: spans, todayLeft, unit };
  }, [events, month]);

  if (!model || !model.rows.length) {
    return <p className="text-sm text-muted-foreground">{t("events.calendar.timelineEmpty")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/40 bg-card">
      <div className="min-w-[720px] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("events.calendar.timelineTitle")}
            </p>
            <p className="text-[11px] text-muted-foreground">{t("events.calendar.timelineHint")}</p>
          </div>
        </div>
        <div
          className="mb-1 grid text-[10px] uppercase tracking-wide text-muted-foreground"
          style={{ gridTemplateColumns: `200px repeat(${model.cols}, minmax(0,1fr))` }}
        >
          <span>{t("events.calendar.timelineEvent")}</span>
          {model.headers.map((h) => (
            <span key={h} className="truncate px-0.5">
              {model.unit >= 7 ? h.slice(5) : h.slice(8)}
            </span>
          ))}
        </div>
        <div className="relative space-y-1 pt-4">
          {model.todayLeft != null ? (
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-10"
              style={{ left: `calc(200px + (100% - 200px) * ${model.todayLeft / 100})` }}
            >
              <span className="absolute -top-4 start-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary-foreground">
                {t("events.plan.today")}
              </span>
              <span className="absolute inset-y-0 w-px bg-primary/60" />
            </div>
          ) : null}
          {model.rows.map(({ event, from, to }) => {
            const bar = model.pos(from, to);
            return (
              <div
                key={event.id}
                className="grid items-center gap-y-0"
                style={{ gridTemplateColumns: "200px 1fr", minHeight: 28 }}
              >
                <div className="flex min-w-0 items-center gap-1 pe-2">
                  <Link href={`/events/${event.id}`} className="truncate text-xs font-medium hover:underline">
                    {event.event_number ? `${event.event_number} · ` : ""}
                    {event.name}
                  </Link>
                  <EventHealthBadge rag={event.health_rag} />
                </div>
                <div className="relative h-5 rounded bg-muted/30">
                  <Link
                    href={`/events/${event.id}/plan`}
                    className={cn(
                      "absolute top-1 h-3 rounded bg-primary/70 hover:bg-primary",
                      event.health_rag === "critical" || event.health_rag === "red"
                        ? "bg-rag-red/80"
                        : event.health_rag === "amber"
                          ? "bg-rag-amber/80"
                          : null,
                    )}
                    style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                    title={`${from} – ${to}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
