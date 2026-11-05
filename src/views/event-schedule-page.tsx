"use client";

import { FecPageHeader } from "@/components/fec";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { EventSchedulePanel } from "@/components/events/event-schedule-panel";
import { EventWorkspaceNav } from "@/components/events/event-workspace-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvent, useEventOptions } from "@/hooks/queries/useEvents";
import { usePermission } from "@/hooks/use-permission";
import { getEventSchedule } from "@/lib/event-schedule.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function EventSchedulePage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const eventQ = useEvent(id);
  const options = useEventOptions();
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

  return (
    <div className="space-y-4">
      <FecPageHeader title={t("events.workspace.crewSchedule")} subtitle={title} />
      <EventWorkspaceNav eventId={id} />
      {scheduleQ.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : scheduleQ.isError ? (
        <p className="text-sm text-destructive">{(scheduleQ.error as Error).message}</p>
      ) : (
        <EventSchedulePanel
          eventId={id}
          slots={scheduleQ.data?.slots ?? []}
          attendance={scheduleQ.data?.attendance ?? []}
          staff={(options.data?.staff as Array<{ id: string; full_name: string }>) ?? []}
          canEdit={canEdit}
          defaultDate={defaultDate}
          crewClosed={Boolean(scheduleQ.data?.crewClosed)}
          onChanged={() => {
            void qc.invalidateQueries({ queryKey: [...queryKeys.events.staffing(id), "schedule"] });
            void qc.invalidateQueries({ queryKey: queryKeys.events.detail(id) });
          }}
        />
      )}
    </div>
  );
}
