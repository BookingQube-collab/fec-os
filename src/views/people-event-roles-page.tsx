"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EventRolesPanel } from "@/components/events/event-roles-panel";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { PeopleEventFilters } from "@/components/people/people-event-filters";
import { PeopleEventWorkforceTabs } from "@/components/people/people-event-workforce-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventRoles } from "@/hooks/queries/useEvents";
import { useSites } from "@/hooks/queries/useSites";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { canActorPerform } from "@/lib/arcade/access";
import type { Capability } from "@/lib/rbac";
import { listPeopleEventOptions } from "@/lib/people-event-workforce.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

function uuidOrEmpty(v: string | null): string {
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : "";
}

export default function PeopleEventRolesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const { data: sites } = useSites();
  const canEdit = usePermission("events.edit");
  const roles = useUserRoles();
  const { profile } = useAuth();
  const actorOpts = {
    jobTitle: profile?.job_title,
    staffRole: profile?.staff_role,
    department: profile?.department,
  };
  const canView = (["people.view_roster", "events.view", "attendance.view"] as Capability[]).some(
    (cap) => canActorPerform(roles, cap, actorOpts),
  );
  const [eventId, setEventId] = useState(() => uuidOrEmpty(searchParams.get("eventId")));
  const [locationId, setLocationId] = useState(() => uuidOrEmpty(searchParams.get("locationId")));

  const eventsQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-options", locationId || null],
    queryFn: () => listPeopleEventOptions({ locationId: locationId || null }),
    staleTime: STALE.events,
    enabled: canView,
  });

  const rolesQ = useEventRoles(eventId || null);

  function refresh() {
    if (!eventId) return;
    void qc.invalidateQueries({ queryKey: queryKeys.events.roles(eventId) });
    void qc.invalidateQueries({ queryKey: queryKeys.events.detail(eventId) });
  }

  if (!canView) {
    return (
      <HrShell>
        <HrPanel>
          <HrEmptyState message={t("peopleEvent.noAccess")} />
        </HrPanel>
      </HrShell>
    );
  }

  const events = eventsQ.data?.events ?? [];

  return (
    <HrShell>
      <HrSection
        icon={Settings2}
        kicker={t("peopleEvent.kicker")}
        title={t("peopleEvent.roles.title")}
        subtitle={t("peopleEvent.roles.subtitle")}
      >
        <PeopleEventWorkforceTabs active="roles" variant="pills" />
        <HrPanel delay={0}>
          <PeopleEventFilters
            events={events}
            sites={sites ?? []}
            eventId={eventId}
            locationId={locationId}
            onEventId={setEventId}
            onLocationId={setLocationId}
          />
        </HrPanel>

        {!eventId ? (
          <HrPanel delay={1}>
            <HrEmptyState message={t("peopleEvent.roles.pickEvent")} icon={Settings2} />
          </HrPanel>
        ) : rolesQ.isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : rolesQ.isError ? (
          <p className="text-sm text-destructive">{(rolesQ.error as Error).message}</p>
        ) : (
          <HrPanel delay={1} className="p-4 sm:p-5">
            <EventRolesPanel
              eventId={eventId}
              roles={rolesQ.data?.roles ?? []}
              canEdit={canEdit}
              onChanged={refresh}
            />
          </HrPanel>
        )}
      </HrSection>
    </HrShell>
  );
}
