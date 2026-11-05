"use client";

import { FecPageHeader } from "@/components/fec";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { EventCorrectionsPanel } from "@/components/events/event-corrections-panel";
import { EventWorkspaceNav } from "@/components/events/event-workspace-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvent } from "@/hooks/queries/useEvents";
import { usePermission } from "@/hooks/use-permission";
import { listEventCorrections, listEventMissedPunchDays } from "@/lib/event-corrections.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function EventCorrectionsPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const eventQ = useEvent(id);
  // submitMissedPunchRequest is gated on hr.employee_app (same as My Day).
  const canSubmit = usePermission("hr.employee_app");

  const missedQ = useQuery({
    queryKey: [...queryKeys.events.staffing(id), "missed-punches"],
    queryFn: () => listEventMissedPunchDays({ eventId: id }),
    enabled: Boolean(id),
    staleTime: STALE.events,
  });
  const corrQ = useQuery({
    queryKey: [...queryKeys.events.staffing(id), "corrections"],
    queryFn: () => listEventCorrections({ eventId: id }),
    enabled: Boolean(id),
    staleTime: STALE.events,
  });

  const ev = eventQ.data?.event;
  const title = ev?.name || ev?.event_name || t("nav.events");

  function refresh() {
    void qc.invalidateQueries({ queryKey: [...queryKeys.events.staffing(id), "missed-punches"] });
    void qc.invalidateQueries({ queryKey: [...queryKeys.events.staffing(id), "corrections"] });
    void qc.invalidateQueries({ queryKey: [...queryKeys.events.staffing(id), "schedule"] });
  }

  return (
    <div className="space-y-4">
      <FecPageHeader title={t("events.workspace.corrections")} subtitle={title} />
      <EventWorkspaceNav eventId={id} />
      {missedQ.isLoading || corrQ.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : missedQ.isError || corrQ.isError ? (
        <p className="text-sm text-destructive">
          {(missedQ.error as Error)?.message || (corrQ.error as Error)?.message}
        </p>
      ) : (
        <EventCorrectionsPanel
          eventId={id}
          days={missedQ.data?.days ?? []}
          corrections={corrQ.data?.corrections ?? []}
          canSubmit={Boolean(canSubmit)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
