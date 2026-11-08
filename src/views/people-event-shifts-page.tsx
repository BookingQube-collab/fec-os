"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EventScheduleWorkspace } from "@/components/events/event-schedule-workspace";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { PeopleEventFilters } from "@/components/people/people-event-filters";
import { PeopleEventWorkforceTabs } from "@/components/people/people-event-workforce-tabs";
import { useSites } from "@/hooks/queries/useSites";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { canActorPerform } from "@/lib/arcade/access";
import type { Capability } from "@/lib/rbac";
import { listPeopleEventOptions } from "@/lib/people-event-workforce.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

function uuidOrEmpty(v: string | null): string {
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : "";
}

export default function PeopleEventShiftsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { data: sites } = useSites();
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
        icon={CalendarClock}
        kicker={t("peopleEvent.kicker")}
        title={t("peopleEvent.shifts.title")}
        subtitle={t("peopleEvent.shifts.subtitle")}
      >
        <PeopleEventWorkforceTabs active="shifts" variant="pills" />
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
            <HrEmptyState message={t("peopleEvent.shifts.pickEvent")} icon={CalendarClock} />
          </HrPanel>
        ) : (
          <HrPanel delay={1}>
            <div className="p-4 sm:p-5">
              <EventScheduleWorkspace eventId={eventId} />
            </div>
          </HrPanel>
        )}
      </HrSection>
    </HrShell>
  );
}
