"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { PeopleEventFilters } from "@/components/people/people-event-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSites } from "@/hooks/queries/useSites";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { canActorPerform } from "@/lib/arcade/access";
import { toCsv } from "@/lib/csv-parse";
import type { Capability } from "@/lib/rbac";
import {
  bulkCloseEventStaffAssignments,
  bulkDeleteEventStaffAssignments,
  bulkReopenEventStaffAssignments,
  bulkUpdateEventStaffAssignmentDates,
} from "@/lib/event-staff-assignments.functions";
import {
  assignmentTypeLabel,
  EVENT_STAFF_ASSIGNMENT_TYPES,
} from "@/lib/events/staff-assignments";
import { findStaffingShortageDays } from "@/lib/events/staffing-shortage";
import { getEventSchedule } from "@/lib/event-schedule.functions";
import {
  listPeopleEventCrew,
  listPeopleEventOptions,
} from "@/lib/people-event-workforce.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { downloadCsvContent } from "@/lib/staff-import";

function uuidOrEmpty(v: string | null): string {
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : "";
}

export default function PeopleEventCrewPage() {
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
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [assignmentType, setAssignmentType] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "closed">("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [busy, setBusy] = useState(false);

  const eventsQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-options", locationId || null],
    queryFn: () => listPeopleEventOptions({ locationId: locationId || null }),
    staleTime: STALE.events,
  });

  const crewQ = useQuery({
    queryKey: [
      ...queryKeys.people.all,
      "event-crew",
      eventId || null,
      locationId || null,
      assignmentType,
      status,
      search.trim() || null,
    ],
    queryFn: () =>
      listPeopleEventCrew({
        eventId: eventId || null,
        locationId: locationId || null,
        assignmentType: assignmentType === "all" ? null : assignmentType,
        status,
        search: search.trim() || null,
      }),
    staleTime: STALE.people,
  });

  const rows = crewQ.data?.rows ?? [];
  const events = eventsQ.data?.events ?? [];
  const selectedIds = useMemo(() => [...selected], [selected]);

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(rows.map((r) => r.id)) : new Set());
  }

  function toggleOne(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function refresh() {
    await qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "event-crew"] });
    setSelected(new Set());
  }

  const shortageQ = useQuery({
    queryKey: [...queryKeys.people.all, "event-crew-shortage", eventId || null],
    queryFn: async () => {
      if (!eventId) return [] as ReturnType<typeof findStaffingShortageDays>;
      const [crew, schedule] = await Promise.all([
        listPeopleEventCrew({ eventId, status: "all" }),
        getEventSchedule({ eventId }),
      ]);
      return findStaffingShortageDays({
        assignments: crew.rows.map((r) => ({
          staff_id: r.staffId,
          date_from: r.dateFrom,
          date_to: r.dateTo,
          status: r.status,
        })),
        slots: schedule.slots.map((s) => ({
          work_date: s.work_date,
          staff_id: s.staff_id,
        })),
        minScheduled: 1,
      });
    },
    enabled: Boolean(eventId) && canView,
    staleTime: STALE.events,
  });

  async function runBulk(
    action: "close" | "reopen" | "remove" | "dates",
  ) {
    if (!selectedIds.length) return;
    const byEvent = new Map<string, string[]>();
    for (const row of rows) {
      if (!selected.has(row.id)) continue;
      const list = byEvent.get(row.eventId) ?? [];
      list.push(row.id);
      byEvent.set(row.eventId, list);
    }
    if (action === "dates" && (!bulkFrom || !bulkTo)) {
      toast.error(t("peopleEvent.bulk.needDates"));
      return;
    }
    if (action === "reopen") {
      const ok = window.confirm(t("peopleEvent.bulk.reopenConfirm", { n: selectedIds.length }));
      if (!ok) return;
    }
    setBusy(true);
    try {
      let total = 0;
      for (const [evId, ids] of byEvent) {
        if (action === "close") {
          const res = await bulkCloseEventStaffAssignments({ eventId: evId, ids });
          total += res.closed;
        } else if (action === "reopen") {
          const res = await bulkReopenEventStaffAssignments({ eventId: evId, ids });
          total += res.reopened;
        } else if (action === "remove") {
          const res = await bulkDeleteEventStaffAssignments({ eventId: evId, ids });
          total += res.removed;
        } else {
          const res = await bulkUpdateEventStaffAssignmentDates({
            eventId: evId,
            ids,
            date_from: bulkFrom,
            date_to: bulkTo,
          });
          total += res.updated;
        }
      }
      await refresh();
      toast.success(
        action === "close"
          ? t("peopleEvent.bulk.closed", { n: total })
          : action === "reopen"
            ? t("peopleEvent.bulk.reopened", { n: total })
            : action === "remove"
              ? t("peopleEvent.bulk.removed", { n: total })
              : t("peopleEvent.bulk.datesUpdated", { n: total }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const csv = toCsv(
      [
        "event",
        "event_number",
        "employee_code",
        "staff_name",
        "assignment_type",
        "role_label",
        "date_from",
        "date_to",
        "pay_on_event_run",
        "status",
        "site",
      ],
      rows.map((r) => [
        r.eventName ?? "",
        r.eventNumber ?? "",
        r.employeeCode ?? "",
        r.staffName ?? "",
        r.assignmentType,
        r.roleLabel,
        r.dateFrom,
        r.dateTo,
        r.payOnEventRun ? "true" : "false",
        r.status,
        r.locationName ?? "",
      ]),
    );
    downloadCsvContent(csv, "event-crew.csv");
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
        <HrSection
          icon={Users}
          kicker={t("peopleEvent.kicker")}
          title={t("peopleEvent.crew.title")}
          subtitle={t("peopleEvent.crew.subtitle")}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!rows.length} onClick={exportCsv}>
                <Download className="me-1.5 h-3.5 w-3.5" />
                {t("peopleEvent.bulk.exportCsv")}
              </Button>
              {eventId ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/events/${eventId}/staffing`}>
                    <ExternalLink className="me-1.5 h-3.5 w-3.5" />
                    {t("peopleEvent.links.openEventStaffing")}
                  </Link>
                </Button>
              ) : null}
            </div>
          }
        >
          <HrPanel delay={0}>
            <PeopleEventFilters
              events={events}
              sites={sites ?? []}
              eventId={eventId}
              locationId={locationId}
              search={search}
              onEventId={setEventId}
              onLocationId={setLocationId}
              onSearch={setSearch}
            >
              <div className="min-w-0">
                <label className="mb-1.5 block text-sm font-medium">
                  {t("peopleEvent.filters.type")}
                </label>
                <Select value={assignmentType} onValueChange={setAssignmentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    {EVENT_STAFF_ASSIGNMENT_TYPES.map((x) => (
                      <SelectItem key={x} value={x}>
                        {assignmentTypeLabel(x)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <label className="mb-1.5 block text-sm font-medium">
                  {t("peopleEvent.filters.status")}
                </label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as "all" | "active" | "closed")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    <SelectItem value="active">{t("peopleEvent.status.active")}</SelectItem>
                    <SelectItem value="closed">{t("peopleEvent.status.closed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PeopleEventFilters>
          </HrPanel>

          {eventId && (shortageQ.data?.length ?? 0) > 0 ? (
            <HrPanel delay={0.5}>
              <div className="space-y-2 p-4">
                <p className="text-sm font-medium">{t("peopleEvent.shortage.title")}</p>
                <p className="text-xs text-muted-foreground">{t("peopleEvent.shortage.hint")}</p>
                <ul className="space-y-1 text-sm">
                  {(shortageQ.data ?? []).slice(0, 8).map((a) => (
                    <li key={a.workDate} className="text-amber-800 dark:text-amber-200">
                      {t("peopleEvent.shortage.day", {
                        date: a.workDate,
                        scheduled: a.scheduledCount,
                        crew: a.coveringCrewCount,
                        deficit: a.deficit,
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            </HrPanel>
          ) : null}

          {canEdit && selectedIds.length > 0 ? (
            <HrPanel delay={1}>
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
                <p className="text-sm text-muted-foreground">
                  {t("peopleEvent.bulk.selected", { n: selectedIds.length })}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void runBulk("close")}
                >
                  {t("peopleEvent.bulk.close")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void runBulk("reopen")}
                >
                  {t("peopleEvent.bulk.reopen")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void runBulk("remove")}
                >
                  {t("peopleEvent.bulk.remove")}
                </Button>
                <Input
                  type="date"
                  className="w-auto"
                  value={bulkFrom}
                  onChange={(e) => setBulkFrom(e.target.value)}
                />
                <Input
                  type="date"
                  className="w-auto"
                  value={bulkTo}
                  onChange={(e) => setBulkTo(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={busy || !bulkFrom || !bulkTo}
                  onClick={() => void runBulk("dates")}
                >
                  {t("peopleEvent.bulk.updateDates")}
                </Button>
              </div>
            </HrPanel>
          ) : null}

          {!canEdit ? (
            <p className="px-1 text-xs text-muted-foreground">{t("peopleEvent.crew.viewOnlyHint")}</p>
          ) : null}

          <HrPanel delay={2}>
            <div className="hr-table-wrap p-2 sm:p-4">
              <table>
                <thead>
                  <tr>
                    {canEdit ? (
                      <th className="w-10">
                        <Checkbox
                          checked={rows.length > 0 && selected.size === rows.length}
                          onCheckedChange={(v) => toggleAll(Boolean(v))}
                          aria-label={t("peopleEvent.bulk.selectAll")}
                        />
                      </th>
                    ) : null}
                    <th>{t("peopleEvent.columns.event")}</th>
                    <th>{t("peopleEvent.columns.person")}</th>
                    <th>{t("peopleEvent.columns.type")}</th>
                    <th>{t("peopleEvent.columns.dates")}</th>
                    <th>{t("peopleEvent.columns.status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {crewQ.isLoading ? (
                    <tr>
                      <td colSpan={canEdit ? 7 : 6}>{t("common.loading")}</td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 7 : 6}>
                        <HrEmptyState message={t("peopleEvent.crew.empty")} icon={Users} />
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id}>
                        {canEdit ? (
                          <td>
                            <Checkbox
                              checked={selected.has(r.id)}
                              onCheckedChange={(v) => toggleOne(r.id, Boolean(v))}
                              aria-label={r.staffName ?? r.id}
                            />
                          </td>
                        ) : null}
                        <td className="font-medium">
                          <div className="flex flex-col gap-0.5">
                            <span>{r.eventName ?? "—"}</span>
                            <span className="text-xs text-muted-foreground">
                              {r.locationName ?? ""}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-col gap-0.5">
                            <span>{r.staffName ?? "—"}</span>
                            <span className="text-xs text-muted-foreground">
                              {r.employeeCode ?? ""} · {r.roleLabel}
                            </span>
                          </div>
                        </td>
                        <td>
                          <Badge variant="secondary">{assignmentTypeLabel(r.assignmentType)}</Badge>
                        </td>
                        <td className="whitespace-nowrap text-xs">
                          {r.dateFrom} → {r.dateTo}
                        </td>
                        <td>
                          <Badge variant={r.status === "closed" ? "outline" : "secondary"}>
                            {r.status}
                          </Badge>
                        </td>
                        <td className="text-end">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/events/${r.eventId}/staffing`}>
                              {t("peopleEvent.links.setup")}
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
  );
}
