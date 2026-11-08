"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { FecPageHeader } from "@/components/fec";
import { EventStaffingPanel } from "@/components/events/event-staffing-panel";
import { EventWorkforcePeopleLinks } from "@/components/events/event-workforce-people-links";
import { EventWorkspaceNav } from "@/components/events/event-workspace-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvent, useEventRoles, useEventStaffAssignments } from "@/hooks/queries/useEvents";

/**
 * Event Ops Staffing tab — hub + read-only summary.
 * Create/manage crew and roles live in People & HR → Events.
 */
export default function EventStaffingPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const eventQ = useEvent(id);
  const staffingQ = useEventStaffAssignments(id);
  const rolesQ = useEventRoles(id);

  const ev = eventQ.data?.event;
  const title = ev?.name || ev?.event_name || t("nav.events");
  const payload = staffingQ.data;

  return (
    <div className="space-y-4">
      <FecPageHeader
        title={t("events.workspace.staffing")}
        subtitle={title}
        actions={
          payload ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {t("events.staffing.counts.total", { n: payload.counts.total })}
              </Badge>
              {payload.crewReadinessMet ? (
                <Badge variant="outline">{t("events.staffing.crewReady")}</Badge>
              ) : null}
            </div>
          ) : null
        }
      />
      <EventWorkspaceNav eventId={id} />
      <EventWorkforcePeopleLinks eventId={id} focus="crew" />

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/events/${id}/schedule`}>{t("peopleEvent.links.openEventSchedule")}</Link>
        </Button>
        {rolesQ.data?.roles?.some((r) => r.is_active !== false) ? (
          <div className="flex flex-wrap gap-1.5">
            <span className="self-center text-xs text-muted-foreground">
              {t("peopleEvent.staffingHub.rolesLabel")}
            </span>
            {rolesQ.data.roles
              .filter((r) => r.is_active !== false)
              .map((r) => (
                <Badge key={r.id ?? r.code} variant="secondary">
                  {r.name}
                </Badge>
              ))}
          </div>
        ) : null}
      </div>

      {staffingQ.isLoading || eventQ.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : staffingQ.isError ? (
        <p className="text-sm text-destructive">{(staffingQ.error as Error).message}</p>
      ) : (
        <EventStaffingPanel
          eventId={id}
          eventName={title}
          assignments={payload?.assignments ?? []}
          roles={rolesQ.data?.roles ?? []}
          staff={[]}
          canEdit={false}
          canHire={false}
          defaultFrom={payload?.eventWindow.dateFrom ?? ""}
          defaultTo={payload?.eventWindow.dateTo ?? ""}
          onChanged={() => undefined}
          variant="summary"
        />
      )}
    </div>
  );
}
