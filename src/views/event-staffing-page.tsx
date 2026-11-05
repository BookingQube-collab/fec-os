"use client";

import { FecPageHeader } from "@/components/fec";

import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { EventStaffingPanel } from "@/components/events/event-staffing-panel";
import { EventWorkspaceNav } from "@/components/events/event-workspace-nav";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvent, useEventOptions, useEventStaffAssignments } from "@/hooks/queries/useEvents";
import { usePermission } from "@/hooks/use-permission";
import { queryKeys } from "@/lib/query-keys";

export default function EventStaffingPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const eventQ = useEvent(id);
  const staffingQ = useEventStaffAssignments(id);
  const options = useEventOptions();
  const canEdit = usePermission("events.edit");
  const canHire = usePermission("people.edit_roster");

  const ev = eventQ.data?.event;
  const title = ev?.name || ev?.event_name || t("nav.events");
  const payload = staffingQ.data;
  const defaults = useMemo(() => {
    const from =
      payload?.eventWindow.dateFrom ??
      ev?.event_start ??
      new Date().toISOString().slice(0, 10);
    const to = payload?.eventWindow.dateTo ?? ev?.event_end ?? from;
    return { from, to };
  }, [payload?.eventWindow, ev?.event_start, ev?.event_end]);

  function refresh() {
    void qc.invalidateQueries({ queryKey: queryKeys.events.staffing(id) });
    void qc.invalidateQueries({ queryKey: queryKeys.events.detail(id) });
    void qc.invalidateQueries({ queryKey: queryKeys.events.options() });
  }

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
      {staffingQ.isLoading || eventQ.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : staffingQ.isError ? (
        <p className="text-sm text-destructive">{(staffingQ.error as Error).message}</p>
      ) : (
        <EventStaffingPanel
          eventId={id}
          eventName={title}
          assignments={payload?.assignments ?? []}
          staff={(options.data?.staff as Array<{
            id: string;
            full_name: string;
            employee_code?: string | null;
            employment_type?: string | null;
            status?: string | null;
            job_title?: string | null;
          }>) ?? []}
          canEdit={canEdit}
          canHire={canHire}
          defaultFrom={defaults.from}
          defaultTo={defaults.to}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
