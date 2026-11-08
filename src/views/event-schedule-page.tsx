"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { FecPageHeader } from "@/components/fec";
import { EventScheduleWorkspace } from "@/components/events/event-schedule-workspace";
import { EventWorkforcePeopleLinks } from "@/components/events/event-workforce-people-links";
import { EventWorkspaceNav } from "@/components/events/event-workspace-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEvent } from "@/hooks/queries/useEvents";
import { getEventSchedule } from "@/lib/event-schedule.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

/**
 * Event Ops Crew schedule tab — hub + read-only summary.
 * Create/manage shifts live in People & HR → Events → Shifts.
 */
export default function EventSchedulePage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const eventQ = useEvent(id);
  const scheduleQ = useQuery({
    queryKey: [...queryKeys.events.staffing(id), "schedule"],
    queryFn: () => getEventSchedule({ eventId: id }),
    enabled: Boolean(id),
    staleTime: STALE.events,
  });
  const ev = eventQ.data?.event;
  const title = ev?.name || ev?.event_name || t("nav.events");
  const peopleShiftsHref = `/people/event-shifts?eventId=${encodeURIComponent(id)}`;
  const slotCount = scheduleQ.data?.slots?.length ?? 0;

  return (
    <div className="space-y-4">
      <FecPageHeader
        title={t("events.workspace.crewSchedule")}
        subtitle={title}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{t("peopleEvent.shifts.hubBadge")}</Badge>
            {scheduleQ.data ? (
              <Badge variant="outline">
                {t("peopleEvent.shifts.slotCount", { n: slotCount })}
              </Badge>
            ) : null}
          </div>
        }
      />
      <EventWorkspaceNav eventId={id} />
      <EventWorkforcePeopleLinks eventId={id} focus="shifts" />

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm">
          <Link href={peopleShiftsHref}>{t("peopleEvent.shifts.manageShifts")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/events/${id}/staffing`}>{t("peopleEvent.links.openEventStaffing")}</Link>
        </Button>
      </div>

      <EventScheduleWorkspace eventId={id} variant="summary" />
    </div>
  );
}
