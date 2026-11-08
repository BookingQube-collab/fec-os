"use client";

import { FecPageHeader } from "@/components/fec";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  EventSchedulePanel,
  type EventScheduleStaffOption,
} from "@/components/events/event-schedule-panel";
import { EventWorkforcePeopleLinks } from "@/components/events/event-workforce-people-links";
import { EventWorkspaceNav } from "@/components/events/event-workspace-nav";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useEvent,
  useEventOptions,
  useEventRoles,
  useEventStaffAssignments,
} from "@/hooks/queries/useEvents";
import { usePermission } from "@/hooks/use-permission";
import { getEventSchedule } from "@/lib/event-schedule.functions";
import { isEventAssignmentClosed } from "@/lib/events/staff-assignments";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function EventSchedulePage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const eventQ = useEvent(id);
  const options = useEventOptions();
  const staffingQ = useEventStaffAssignments(id);
  const rolesQ = useEventRoles(id);
  const canEdit = usePermission("events.edit");
  const scheduleQ = useQuery({
    queryKey: [...queryKeys.events.staffing(id), "schedule"],
    queryFn: () => getEventSchedule({ eventId: id }),
    enabled: Boolean(id),
    staleTime: STALE.events,
  });

  const ev = eventQ.data?.event;
  const title = ev?.name || ev?.event_name || t("nav.events");
  const defaultDate = ev?.event_start?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const headOfficeLocationId =
    scheduleQ.data?.headOfficeLocationId ??
    (
      options.data?.locations as Array<{ id: string; code?: string | null }> | undefined
    )?.find((loc) => (loc.code ?? "").toUpperCase() === "HO")?.id ??
    null;

  /**
   * Crew / Cleaner / Maintenance: Staffing for this event only.
   * Management: Staffing + Head Office people (pmStaff / HO home location).
   */
  const scheduleStaff = useMemo((): EventScheduleStaffOption[] => {
    const byId = new Map<string, EventScheduleStaffOption>();

    for (const row of staffingQ.data?.assignments ?? []) {
      if (isEventAssignmentClosed(row)) continue;
      if (byId.has(row.staff_id)) continue;
      byId.set(row.staff_id, {
        id: row.staff_id,
        full_name: row.staff_name ?? "—",
        job_title: row.staff_job_title ?? null,
        location_id: row.staff_location_id ?? null,
        role_label: row.role_label ?? null,
        event_role_id: row.event_role_id ?? null,
        source: "staffing",
      });
    }

    const hoCatalog =
      (options.data?.pmStaff as
        | Array<{
            id: string;
            full_name: string;
            job_title?: string | null;
            location_id?: string | null;
          }>
        | undefined) ??
      (
        options.data?.staff as
          | Array<{
              id: string;
              full_name: string;
              job_title?: string | null;
              location_id?: string | null;
            }>
          | undefined
      )?.filter(
        (s) =>
          Boolean(headOfficeLocationId) && s.location_id === headOfficeLocationId,
      ) ??
      [];

    for (const person of hoCatalog) {
      const existing = byId.get(person.id);
      if (existing) continue;
      byId.set(person.id, {
        id: person.id,
        full_name: person.full_name,
        job_title: person.job_title ?? null,
        location_id: person.location_id ?? null,
        role_label: null,
        source: "head_office",
      });
    }

    return [...byId.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [staffingQ.data?.assignments, options.data?.pmStaff, options.data?.staff, headOfficeLocationId]);

  return (
    <div className="space-y-4">
      <FecPageHeader title={t("events.workspace.crewSchedule")} subtitle={title} />
      <EventWorkspaceNav eventId={id} />
      <EventWorkforcePeopleLinks eventId={id} focus="crew" />
      {scheduleQ.isLoading || staffingQ.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : scheduleQ.isError ? (
        <p className="text-sm text-destructive">{(scheduleQ.error as Error).message}</p>
      ) : (
        <EventSchedulePanel
          eventId={id}
          slots={scheduleQ.data?.slots ?? []}
          attendance={scheduleQ.data?.attendance ?? []}
          staff={scheduleStaff}
          roles={rolesQ.data?.roles ?? []}
          canEdit={canEdit}
          defaultDate={defaultDate}
          crewClosed={Boolean(scheduleQ.data?.crewClosed)}
          deviceIds={scheduleQ.data?.deviceIds ?? []}
          headOfficeLocationId={headOfficeLocationId}
          onChanged={() => {
            void qc.invalidateQueries({ queryKey: [...queryKeys.events.staffing(id), "schedule"] });
            void qc.invalidateQueries({ queryKey: queryKeys.events.staffing(id) });
            void qc.invalidateQueries({ queryKey: queryKeys.events.roles(id) });
            void qc.invalidateQueries({ queryKey: queryKeys.events.detail(id) });
          }}
        />
      )}
    </div>
  );
}
