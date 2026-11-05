"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Download, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { PeopleEventFilters } from "@/components/people/people-event-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSites } from "@/hooks/queries/useSites";
import { toCsv } from "@/lib/csv-parse";
import {
  listPeopleEventAttendance,
  listPeopleEventOptions,
} from "@/lib/people-event-workforce.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { downloadCsvContent } from "@/lib/staff-import";

function uuidOrEmpty(v: string | null): string {
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : "";
}

function ymdOrEmpty(v: string | null): string {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

export default function PeopleEventAttendancePage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { data: sites } = useSites();
  const [eventId, setEventId] = useState(() => uuidOrEmpty(searchParams.get("eventId")));
  const [locationId, setLocationId] = useState(() => uuidOrEmpty(searchParams.get("locationId")));
  const [dateFrom, setDateFrom] = useState(() => ymdOrEmpty(searchParams.get("from")));
  const [dateTo, setDateTo] = useState(() => ymdOrEmpty(searchParams.get("to")));
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  const eventsQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-options", locationId || null],
    queryFn: () => listPeopleEventOptions({ locationId: locationId || null }),
    staleTime: STALE.events,
  });

  const attendanceQ = useQuery({
    queryKey: [
      ...queryKeys.people.all,
      "event-attendance",
      eventId || null,
      locationId || null,
      dateFrom || null,
      dateTo || null,
      search.trim() || null,
    ],
    queryFn: () =>
      listPeopleEventAttendance({
        eventId: eventId || null,
        locationId: locationId || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        search: search.trim() || null,
      }),
    staleTime: STALE.people,
  });

  const rows = attendanceQ.data?.rows ?? [];
  const events = eventsQ.data?.events ?? [];

  const exportCsv = useMemo(() => {
    return () => {
      const csv = toCsv(
        [
          "event",
          "employee_code",
          "staff_name",
          "work_date",
          "status",
          "actual_in",
          "actual_out",
          "late_minutes",
          "ot_minutes",
          "worked_minutes",
          "missed_punch",
        ],
        rows.map((r) => [
          r.eventName ?? r.eventId,
          r.employeeCode ?? "",
          r.staffName ?? "",
          r.workDate,
          r.status,
          r.actualIn ?? "",
          r.actualOut ?? "",
          r.lateMinutes,
          r.overtimeMinutes,
          r.workedMinutes,
          r.missedPunch ? "true" : "false",
        ]),
      );
      downloadCsvContent(csv, `event-attendance-${dateFrom || "all"}-${dateTo || "all"}.csv`);
    };
  }, [rows, dateFrom, dateTo]);

  return (
    <CapabilityGate
      capability="attendance.view"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("peopleEvent.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={CalendarClock}
          kicker={t("peopleEvent.kicker")}
          title={t("peopleEvent.attendance.title")}
          subtitle={t("peopleEvent.attendance.subtitle")}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!rows.length}
                onClick={() => exportCsv()}
              >
                <Download className="me-1.5 h-3.5 w-3.5" />
                {t("peopleEvent.bulk.exportCsv")}
              </Button>
              {eventId ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/events/${eventId}/schedule`}>
                    <ExternalLink className="me-1.5 h-3.5 w-3.5" />
                    {t("peopleEvent.links.openEventSchedule")}
                  </Link>
                </Button>
              ) : null}
            </div>
          }
        >
          <HrPanel delay={0}>
            <PeopleEventFilters
              events={events}
              sites={sites ?? []}
              eventId={eventId}
              locationId={locationId}
              dateFrom={dateFrom}
              dateTo={dateTo}
              search={search}
              onEventId={setEventId}
              onLocationId={setLocationId}
              onDateFrom={setDateFrom}
              onDateTo={setDateTo}
              onSearch={setSearch}
            />
          </HrPanel>

          <HrPanel delay={1}>
            <div className="hr-table-wrap p-2 sm:p-4">
              <table>
                <thead>
                  <tr>
                    <th>{t("peopleEvent.columns.event")}</th>
                    <th>{t("peopleEvent.columns.person")}</th>
                    <th>{t("peopleEvent.columns.date")}</th>
                    <th>{t("peopleEvent.columns.status")}</th>
                    <th>{t("peopleEvent.columns.shift")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {attendanceQ.isLoading ? (
                    <tr>
                      <td colSpan={6}>{t("common.loading")}</td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <HrEmptyState message={t("peopleEvent.attendance.empty")} icon={CalendarClock} />
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id}>
                        <td className="font-medium">{r.eventName ?? "—"}</td>
                        <td>
                          <div className="flex flex-col gap-0.5">
                            <span>{r.staffName ?? "—"}</span>
                            <span className="text-xs text-muted-foreground">
                              {r.employeeCode ?? ""}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap text-xs">{r.workDate}</td>
                        <td>
                          <Badge variant={r.missedPunch ? "destructive" : "secondary"}>
                            {r.status}
                            {r.lateMinutes > 0 ? ` · late ${r.lateMinutes}m` : ""}
                            {r.overtimeMinutes > 0 ? ` · OT ${r.overtimeMinutes}m` : ""}
                          </Badge>
                        </td>
                        <td className="text-xs text-muted-foreground">
                          {(r.actualIn ?? "—").slice(11, 16) || "—"}–
                          {(r.actualOut ?? "—").slice(11, 16) || "—"}
                        </td>
                        <td className="text-end">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/events/${r.eventId}/corrections`}>
                              {t("peopleEvent.links.corrections")}
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}
