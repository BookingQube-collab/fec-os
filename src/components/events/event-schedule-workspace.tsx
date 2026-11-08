"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  EventSchedulePanel,
  type EventScheduleStaffOption,
} from "@/components/events/event-schedule-panel";
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

/**
 * Shared crew-schedule body for Ops Event → Crew schedule (summary) and People → Event shifts (manage).
 * Loads schedule / staffing / roles and renders EventSchedulePanel (no page chrome).
 */
export function EventScheduleWorkspace({
  eventId,
  variant = "manage",
}: {
  eventId: string;
  variant?: "manage" | "summary";
}) {
  const qc = useQueryClient();
  const eventQ = useEvent(eventId);
  const options = useEventOptions();
  const staffingQ = useEventStaffAssignments(eventId);
  const rolesQ = useEventRoles(eventId);
  const canEdit = usePermission("events.edit");
  const scheduleQ = useQuery({
    queryKey: [...queryKeys.events.staffing(eventId), "schedule"],
    queryFn: () => getEventSchedule({ eventId }),
    enabled: Boolean(eventId),
    staleTime: STALE.events,
  });

  const ev = eventQ.data?.event;
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

  if (scheduleQ.isLoading || staffingQ.isLoading) {
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }

  if (scheduleQ.isError) {
    return <p className="text-sm text-destructive">{(scheduleQ.error as Error).message}</p>;
  }

  const manage = variant === "manage";

  return (
    <EventSchedulePanel
      eventId={eventId}
      slots={scheduleQ.data?.slots ?? []}
      attendance={scheduleQ.data?.attendance ?? []}
      staff={scheduleStaff}
      roles={rolesQ.data?.roles ?? []}
      canEdit={manage && canEdit}
      defaultDate={defaultDate}
      crewClosed={Boolean(scheduleQ.data?.crewClosed)}
      deviceIds={scheduleQ.data?.deviceIds ?? []}
      headOfficeLocationId={headOfficeLocationId}
      variant={variant}
      onChanged={() => {
        void qc.invalidateQueries({
          queryKey: [...queryKeys.events.staffing(eventId), "schedule"],
        });
        void qc.invalidateQueries({ queryKey: queryKeys.events.staffing(eventId) });
        void qc.invalidateQueries({ queryKey: queryKeys.events.roles(eventId) });
        void qc.invalidateQueries({ queryKey: queryKeys.events.detail(eventId) });
      }}
    />
  );
}
