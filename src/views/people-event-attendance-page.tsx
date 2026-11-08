"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Download, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { AttendanceKpiStrip } from "@/components/people/attendance-kpi-strip";
import { AttendanceRecordsTable } from "@/components/people/attendance-records-table";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { PeopleEventFilters } from "@/components/people/people-event-filters";
import { PeopleEventWorkforceTabs } from "@/components/people/people-event-workforce-tabs";
import { Button } from "@/components/ui/button";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useSites } from "@/hooks/queries/useSites";
import {
  buildAttendanceCsv,
  computeAttendanceKpis,
  type AttendanceListingSource,
} from "@/lib/attendance-display";
import {
  isEventMissedPunchRow,
  mayModifyEventMissedPunch,
  toEventAttendanceListingSource,
  toEventAttendanceSummaryRow,
} from "@/lib/people-event-attendance-display";
import {
  listPeopleEventAttendance,
  listPeopleEventOptions,
  type PeopleEventAttendanceRow,
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
  const { profile } = useAuth();
  const roles = useUserRoles();
  const canModifyMissed = mayModifyEventMissedPunch({
    roles,
    jobTitle: profile?.job_title,
  });

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

  const rowById = useMemo(() => {
    const map = new Map<string, PeopleEventAttendanceRow>();
    for (const row of rows) map.set(row.id, row);
    return map;
  }, [rows]);

  const listingRows = useMemo(() => rows.map(toEventAttendanceListingSource), [rows]);
  const summaryRows = useMemo(() => rows.map(toEventAttendanceSummaryRow), [rows]);
  const kpis = useMemo(() => computeAttendanceKpis(summaryRows), [summaryRows]);
  const openMissedCount = useMemo(
    () => rows.filter(isEventMissedPunchRow).length,
    [rows],
  );

  const exportCsv = () => {
    const csv = buildAttendanceCsv(summaryRows);
    downloadCsvContent(csv, `event-attendance-${dateFrom || "all"}-${dateTo || "all"}.csv`);
  };

  const renderActions = (listing: AttendanceListingSource) => {
    const source = listing.id ? rowById.get(listing.id) : undefined;
    if (!source) return null;
    const missed = isEventMissedPunchRow(source);
    if (!missed) {
      return (
        <Button asChild size="sm" variant="ghost">
          <Link href={`/people/event-shifts?eventId=${encodeURIComponent(source.eventId)}`}>
            {t("peopleEvent.links.openShifts")}
          </Link>
        </Button>
      );
    }
    if (canModifyMissed) {
      return (
        <Button asChild size="sm" variant="secondary">
          <Link href={`/events/${source.eventId}/corrections#mp-${source.id}`}>
            {t("peopleEvent.attendance.modifyMissed")}
          </Link>
        </Button>
      );
    }
    return (
      <Button asChild size="sm" variant="ghost">
        <Link href={`/events/${source.eventId}/corrections#mp-${source.id}`}>
          {t("peopleEvent.attendance.viewMissed")}
        </Link>
      </Button>
    );
  };

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
                  <Link href={`/people/event-shifts?eventId=${encodeURIComponent(eventId)}`}>
                    <ExternalLink className="me-1.5 h-3.5 w-3.5" />
                    {t("peopleEvent.links.openShifts")}
                  </Link>
                </Button>
              ) : null}
            </div>
          }
        >
          <PeopleEventWorkforceTabs active="attendance" />
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
            <div className="space-y-4 p-2 sm:p-4">
              <AttendanceKpiStrip
                kpis={kpis}
                openExceptionsCount={openMissedCount}
                isLoading={attendanceQ.isLoading}
              />
              <p className="text-xs text-muted-foreground">
                {canModifyMissed
                  ? t("peopleEvent.attendance.hooModifyHint")
                  : t("peopleEvent.attendance.viewOnlyMissedHint")}
              </p>
              {attendanceQ.isLoading ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  {t("common.loading")}
                </div>
              ) : (
                <AttendanceRecordsTable
                  rows={listingRows}
                  empty={<HrEmptyState message={t("peopleEvent.attendance.empty")} icon={CalendarClock} />}
                  rowActions={renderActions}
                  actionsHeader={t("common.actions")}
                />
              )}
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}
