"use client";

/* Hallmark · redesign · Event Roles page · mockup-faithful
 * macrostructure: Stat-Led workbench · theme: studied-DNA (mockup purple #7c3aed)
 * design-system: FEC People/HR · designed-as-app · sibling: Event Crew / Overview
 * previous: HrSection + dense panel · this: KPI strip + filter bar + two-column roles
 */

import Link from "next/link";
import { useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Layers, Plus, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EventRolesPanel, type EventRolesPanelHandle } from "@/components/events/event-roles-panel";
import { EventRolesKpiStrip } from "@/components/people/event-roles-kpi-strip";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrShell } from "@/components/hr/hr-shell";
import { PeopleEventSharedEventSelect } from "@/components/people/people-event-shared-event-select";
import { PeopleEventWorkforceTabs } from "@/components/people/people-event-workforce-tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventRoles } from "@/hooks/queries/useEvents";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { usePeopleEventSelection } from "@/hooks/use-people-event-selection";
import { usePermission } from "@/hooks/use-permission";
import { canActorPerform } from "@/lib/arcade/access";
import { toCsv } from "@/lib/csv-parse";
import type { Capability } from "@/lib/rbac";
import { peopleEventHref } from "@/lib/people-event-selection";
import { listPeopleEventOptions } from "@/lib/people-event-workforce.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { downloadCsvContent } from "@/lib/staff-import";

export default function PeopleEventRolesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { eventId, setEventId } = usePeopleEventSelection();
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
  const panelRef = useRef<EventRolesPanelHandle>(null);

  const eventsQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-options"],
    queryFn: () => listPeopleEventOptions({ locationId: null }),
    staleTime: STALE.events,
    enabled: canView,
  });

  const rolesQ = useEventRoles(eventId || null);

  const allEvents = eventsQ.data?.events ?? [];
  const selectedEvent = useMemo(
    () => allEvents.find((ev) => ev.id === eventId) ?? null,
    [allEvents, eventId],
  );

  const roleRows = rolesQ.data?.roles ?? [];
  const activeRoles = useMemo(
    () => roleRows.filter((r) => r.is_active !== false),
    [roleRows],
  );
  const shiftCount = useMemo(
    () => activeRoles.filter((r) => r.kind === "shift").length,
    [activeRoles],
  );
  const labourCount = useMemo(
    () => activeRoles.filter((r) => r.kind === "labour").length,
    [activeRoles],
  );

  function refresh() {
    if (!eventId) return;
    void qc.invalidateQueries({ queryKey: queryKeys.events.roles(eventId) });
    void qc.invalidateQueries({ queryKey: queryKeys.events.detail(eventId) });
  }

  function exportCsv() {
    if (!activeRoles.length) return;
    const csv = toCsv(
      [
        "code",
        "name",
        "kind",
        "default_hours_per_day",
        "default_day_rate_qar",
        "sort_order",
        "is_active",
        "event_number",
        "event_name",
      ],
      activeRoles.map((r) => [
        r.code,
        r.name,
        r.kind,
        String(r.default_hours_per_day ?? ""),
        r.default_day_rate_qar == null ? "" : String(r.default_day_rate_qar),
        String(r.sort_order ?? ""),
        r.is_active === false ? "false" : "true",
        selectedEvent?.eventNumber ?? "",
        selectedEvent?.name ?? "",
      ]),
    );
    const slug = selectedEvent?.eventNumber || selectedEvent?.name || "event";
    downloadCsvContent(csv, `event-roles-${slug}.csv`);
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

  return (
    <HrShell>
      <div className="ea-event-roles space-y-5">
        <header className="relative overflow-hidden rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.55]"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 100% 0%, rgba(124,58,237,0.12), transparent 55%), radial-gradient(ellipse 50% 40% at 0% 100%, rgba(167,139,250,0.10), transparent 50%)",
            }}
          />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-100 text-[#7c3aed]">
                <Layers className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">
                  <Link
                    href={peopleEventHref("/people/events", eventId)}
                    className="hover:text-[#7c3aed] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
                  >
                    {t("peopleEvent.hub.breadcrumb")}
                  </Link>
                </p>
                <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
                  {t("peopleEvent.roles.title")}
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {t("peopleEvent.roles.subtitle")}
                </p>
              </div>
            </div>

            <div className="relative flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end lg:w-auto lg:justify-end">
              <PeopleEventSharedEventSelect
                eventId={eventId}
                events={allEvents}
                onEventIdChange={setEventId}
                className="w-full sm:w-auto"
                triggerClassName="border-border/80 bg-white"
              />
              {canEdit ? (
                <Button
                  size="sm"
                  disabled={!eventId}
                  onClick={() => panelRef.current?.focusAddRole()}
                  className="h-10 rounded-xl bg-[#7c3aed] px-4 text-white hover:bg-[#6d28d9] focus-visible:ring-[#7c3aed]/40"
                >
                  <Plus className="me-1.5 h-3.5 w-3.5" aria-hidden />
                  {t("peopleEvent.roles.addRole")}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={!eventId || !activeRoles.length}
                onClick={exportCsv}
                className="h-10 rounded-xl border-border/80 bg-white"
              >
                <Download className="me-1.5 h-3.5 w-3.5" aria-hidden />
                {t("common.export")}
              </Button>
            </div>
          </div>
        </header>

        <PeopleEventWorkforceTabs active="roles" variant="pills" eventId={eventId} />

        <EventRolesKpiStrip
          hasEvent={Boolean(eventId)}
          isLoading={Boolean(eventId) && rolesQ.isLoading}
          kpis={{
            eventName: selectedEvent?.name ?? null,
            eventNumber: selectedEvent?.eventNumber ?? null,
            totalRoles: activeRoles.length,
            shiftRoles: shiftCount,
            labourRoles: labourCount,
          }}
        />

        {!eventId ? (
          <section className="rounded-2xl border border-black/5 bg-white p-8 shadow-[0_4px_20px_rgba(124,58,237,0.06)]">
            <HrEmptyState message={t("peopleEvent.roles.pickEvent")} icon={Settings2} />
          </section>
        ) : rolesQ.isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : rolesQ.isError ? (
          <p className="text-sm text-destructive">{(rolesQ.error as Error).message}</p>
        ) : (
          <EventRolesPanel
            ref={panelRef}
            layout="page"
            eventId={eventId}
            roles={activeRoles}
            canEdit={canEdit}
            onChanged={refresh}
          />
        )}
      </div>
    </HrShell>
  );
}
