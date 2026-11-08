"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addEventScheduleForRole,
  deleteEventScheduleSlot,
  listEventLinkableDevices,
  processEventAttendance,
  seedEventScheduleFromCrew,
  setEventAttendanceDevices,
} from "@/lib/event-schedule.functions";
import {
  EVENT_CREW_SCHEDULE_CATEGORY_ORDER,
  eventCrewScheduleAddShiftMode,
  eventCrewScheduleAllowsPeopleFallback,
  groupByEventCrewScheduleCategory,
  isLabourStyleEventCrewCategory,
  resolveEventCrewScheduleCategory,
  selectStaffOptionsForScheduleCategory,
  type EventCrewScheduleCategory,
} from "@/lib/events/crew-schedule-categories";
import {
  eventRoleAllowsPeopleFallback,
  eventRoleScheduleMode,
  isLabourEventRole,
  matchEventRole,
  type EventRoleRow,
} from "@/lib/events/event-roles";
import {
  LABOUR_DAY_BASELINE_HOURS,
  LABOUR_DAY_DEFAULT_SCHEDULED_IN,
  LABOUR_DAY_DEFAULT_SCHEDULED_OUT,
} from "@/lib/events/event-schedule";
import type { EventScheduleAttendanceRow, EventScheduleSlotRow } from "@/lib/events/types";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";

export type EventScheduleStaffOption = {
  id: string;
  full_name: string;
  job_title?: string | null;
  location_id?: string | null;
  /** Event Staffing role when sourced from assignments. */
  role_label?: string | null;
  event_role_id?: string | null;
  /**
   * staffing = this event's Staffing crew.
   * head_office = Head Office People catalog (Management only).
   */
  source?: "staffing" | "head_office";
};

export function EventSchedulePanel({
  eventId,
  slots,
  attendance,
  staff,
  roles = [],
  canEdit,
  defaultDate,
  crewClosed = false,
  deviceIds = [],
  headOfficeLocationId = null,
  onChanged,
}: {
  eventId: string;
  slots: EventScheduleSlotRow[];
  attendance: EventScheduleAttendanceRow[];
  staff: EventScheduleStaffOption[];
  roles?: EventRoleRow[];
  canEdit: boolean;
  defaultDate: string;
  crewClosed?: boolean;
  deviceIds?: string[];
  headOfficeLocationId?: string | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const activeRoles = roles.filter((r) => r.is_active !== false).sort((a, b) => a.sort_order - b.sort_order);
  const useEventRoles = activeRoles.length > 0;
  const [busy, setBusy] = useState(false);
  const [addRole, setAddRole] = useState<EventCrewScheduleCategory>("crew");
  const [addEventRoleId, setAddEventRoleId] = useState<string>("");
  const [staffId, setStaffId] = useState("");
  const [workDate, setWorkDate] = useState(defaultDate);
  const [dateFrom, setDateFrom] = useState(defaultDate);
  const [dateTo, setDateTo] = useState(defaultDate);
  const [scheduledIn, setScheduledIn] = useState("09:00");
  const [scheduledOut, setScheduledOut] = useState("18:00");
  const [labourHours, setLabourHours] = useState("");
  const [labourDayRate, setLabourDayRate] = useState("");
  const labourBaselineHours = LABOUR_DAY_BASELINE_HOURS;
  const [processFrom, setProcessFrom] = useState("");
  const [processTo, setProcessTo] = useState("");
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(() => new Set(deviceIds));
  const [categoryFilter, setCategoryFilter] = useState<EventCrewScheduleCategory | "all">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  useEffect(() => {
    if (!useEventRoles) return;
    if (!addEventRoleId || !activeRoles.some((r) => r.id === addEventRoleId)) {
      setAddEventRoleId(activeRoles[0]?.id ?? "");
    }
  }, [useEventRoles, activeRoles, addEventRoleId]);

  const selectedEventRole = activeRoles.find((r) => r.id === addEventRoleId) ?? null;

  const devicesQ = useQuery({
    queryKey: [...queryKeys.events.staffing(eventId), "devices"],
    queryFn: () => listEventLinkableDevices({ eventId }),
    staleTime: STALE.events,
  });

  useEffect(() => {
    setSelectedDevices(new Set(deviceIds));
  }, [deviceIds]);

  const attByKey = new Map(attendance.map((a) => [`${a.staff_id}|${a.work_date}`, a]));
  const staffById = new Map(staff.map((s) => [s.id, s]));

  function categoryForSlot(slot: EventScheduleSlotRow): EventCrewScheduleCategory {
    const person = staffById.get(slot.staff_id);
    return resolveEventCrewScheduleCategory({
      role_label: slot.role_label,
      job_title: slot.staff_job_title ?? person?.job_title ?? null,
      is_head_office:
        slot.staff_is_head_office ??
        Boolean(headOfficeLocationId && person?.location_id === headOfficeLocationId),
    });
  }

  function categoryForStaff(person: EventScheduleStaffOption): EventCrewScheduleCategory {
    return resolveEventCrewScheduleCategory({
      role_label: person.role_label ?? null,
      job_title: person.job_title ?? null,
      is_head_office:
        person.source === "head_office" ||
        Boolean(headOfficeLocationId && person.location_id === headOfficeLocationId),
    });
  }

  const categoryLabel = (cat: EventCrewScheduleCategory) =>
    t(`events.schedule.categories.${cat}`);

  function roleForPerson(person: EventScheduleStaffOption) {
    return matchEventRole(activeRoles, {
      event_role_id: person.event_role_id ?? null,
      role_label: person.role_label ?? null,
      job_title: person.job_title ?? null,
      is_head_office:
        person.source === "head_office" ||
        Boolean(headOfficeLocationId && person.location_id === headOfficeLocationId),
    });
  }

  function roleForSlot(slot: EventScheduleSlotRow) {
    const person = staffById.get(slot.staff_id);
    return matchEventRole(activeRoles, {
      event_role_id: (slot as { event_role_id?: string | null }).event_role_id ?? person?.event_role_id ?? null,
      role_label: slot.role_label,
      job_title: slot.staff_job_title ?? person?.job_title ?? null,
      is_head_office:
        slot.staff_is_head_office ??
        Boolean(headOfficeLocationId && person?.location_id === headOfficeLocationId),
    });
  }

  const filteredSlots = useEventRoles
    ? roleFilter === "all"
      ? slots
      : slots.filter((slot) => roleForSlot(slot)?.id === roleFilter)
    : categoryFilter === "all"
      ? slots
      : slots.filter((slot) => categoryForSlot(slot) === categoryFilter);

  const groupedSlots = useEventRoles
    ? (() => {
        const buckets = new Map<string, EventScheduleSlotRow[]>();
        for (const role of activeRoles) buckets.set(role.id, []);
        const other: EventScheduleSlotRow[] = [];
        for (const slot of filteredSlots) {
          const role = roleForSlot(slot);
          if (role && buckets.has(role.id)) buckets.get(role.id)!.push(slot);
          else other.push(slot);
        }
        return [
          ...activeRoles
            .map((role) => ({
              category: role.code as EventCrewScheduleCategory,
              role,
              items: buckets.get(role.id) ?? [],
            }))
            .filter((g) => g.items.length > 0),
          ...(other.length
            ? [{ category: "crew" as EventCrewScheduleCategory, role: null, items: other }]
            : []),
        ];
      })()
    : groupByEventCrewScheduleCategory(filteredSlots, categoryForSlot).map((g) => ({
        ...g,
        role: null as EventRoleRow | null,
      }));

  const addShiftMode = selectedEventRole
    ? eventRoleScheduleMode(selectedEventRole.kind)
    : eventCrewScheduleAddShiftMode(addRole);

  const staffForAddRole = useEventRoles && selectedEventRole
    ? staff.filter((person) => {
        if (person.source === "head_office") {
          return eventRoleAllowsPeopleFallback(selectedEventRole);
        }
        return roleForPerson(person)?.id === selectedEventRole.id;
      })
    : staff.filter((person) =>
        selectStaffOptionsForScheduleCategory(
          [
            {
              staff_id: person.id,
              role_label: person.role_label ?? null,
              job_title: person.job_title ?? null,
              is_head_office:
                person.source === "head_office" ||
                Boolean(headOfficeLocationId && person.location_id === headOfficeLocationId),
              source: person.source ?? (person.role_label ? "staffing" : "head_office"),
            },
          ],
          addRole,
        ).length > 0,
      );

  const categoryCounts: Record<EventCrewScheduleCategory | "all", number> = {
    all: slots.length,
    crew: 0,
    cleaner: 0,
    maintenance: 0,
    management: 0,
  };
  for (const slot of slots) {
    categoryCounts[categoryForSlot(slot)] += 1;
  }

  function selectAddRole(next: EventCrewScheduleCategory) {
    setAddRole(next);
    setStaffId((prev) => {
      if (!prev) return prev;
      const person = staffById.get(prev);
      if (!person) return "";
      return categoryForStaff(person) === next ? prev : "";
    });
  }

  function selectAddEventRole(roleId: string) {
    setAddEventRoleId(roleId);
    const role = activeRoles.find((r) => r.id === roleId);
    setLabourHours(role ? String(role.default_hours_per_day || 10) : "");
    setLabourDayRate(
      role?.default_day_rate_qar != null ? String(role.default_day_rate_qar) : "",
    );
    setStaffId((prev) => {
      if (!prev || !role) return prev;
      const person = staffById.get(prev);
      if (!person) return "";
      return roleForPerson(person)?.id === roleId ? prev : "";
    });
  }

  async function seed() {
    setBusy(true);
    try {
      const res = await seedEventScheduleFromCrew({ eventId });
      onChanged();
      toast.success(t("events.schedule.toasts.seeded", { n: res.inserted }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function process() {
    setBusy(true);
    try {
      const res = await processEventAttendance({
        eventId,
        dateFrom: processFrom || null,
        dateTo: processTo || null,
      });
      onChanged();
      toast.success(
        t("events.schedule.toasts.processed", { days: res.upserted, punches: res.punches }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addSlot() {
    if (addShiftMode === "labour_days") {
      if (!dateFrom || !dateTo) return;
    } else if (!workDate) {
      return;
    }
    setBusy(true);
    try {
      const res = await addEventScheduleForRole({
        eventId,
        event_role_id: selectedEventRole?.id ?? null,
        category: selectedEventRole ? undefined : addRole,
        staff_id: staffId || null,
        fallback_staff_ids: staffForAddRole.map((s) => s.id),
        work_date: addShiftMode === "event_day" ? workDate : null,
        date_from: addShiftMode === "labour_days" ? dateFrom : null,
        date_to: addShiftMode === "labour_days" ? dateTo : null,
        scheduled_in:
          addShiftMode === "labour_days" ? LABOUR_DAY_DEFAULT_SCHEDULED_IN : scheduledIn,
        scheduled_out:
          addShiftMode === "labour_days" ? LABOUR_DAY_DEFAULT_SCHEDULED_OUT : scheduledOut,
        hours_per_day:
          addShiftMode === "labour_days"
            ? Number(labourHours) || selectedEventRole?.default_hours_per_day || labourBaselineHours
            : null,
        day_rate_qar:
          addShiftMode === "labour_days"
            ? labourDayRate === ""
              ? selectedEventRole?.default_day_rate_qar ?? null
              : Math.max(0, Number(labourDayRate) || 0)
            : null,
      });
      setStaffId("");
      onChanged();
      if (staffId) {
        toast.success(
          addShiftMode === "labour_days"
            ? t("events.schedule.toasts.savedLabourDays", { n: res.inserted })
            : t("events.schedule.toasts.saved"),
        );
      } else if (addShiftMode === "labour_days") {
        toast.success(
          t("events.schedule.toasts.savedLabourDaysForRole", {
            n: res.inserted,
            people: res.staffCount,
            role: categoryLabel(addRole),
          }),
        );
      } else {
        toast.success(
          t("events.schedule.toasts.savedForRole", {
            n: res.inserted,
            people: res.staffCount,
            role: categoryLabel(addRole),
          }),
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function labourHoursLabel(workedMinutes: number | null | undefined): string {
    if (workedMinutes == null || workedMinutes <= 0) {
      return t("events.schedule.labourDayPending", { hours: labourBaselineHours });
    }
    const hours = Math.round((workedMinutes / 60) * 10) / 10;
    return t("events.schedule.labourDayHours", {
      worked: hours,
      baseline: labourBaselineHours,
    });
  }

  const editAllowed = canEdit && !crewClosed;

  async function saveDevices() {
    setBusy(true);
    try {
      await setEventAttendanceDevices({
        eventId,
        deviceIds: [...selectedDevices],
      });
      onChanged();
      toast.success(t("events.schedule.devicesSaved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t("events.schedule.devicesTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("events.schedule.devicesHint")}</p>
        </div>
        {devicesQ.isLoading ? (
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
        ) : (devicesQ.data?.devices.length ?? 0) === 0 ? (
          <div className="space-y-2 rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-3">
            <p className="text-xs text-muted-foreground">{t("events.schedule.devicesNone")}</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/people/attendance/settings">{t("events.schedule.devicesOpenAdmin")}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {(devicesQ.data?.devices ?? []).map((d) => (
              <label
                key={d.id}
                className="flex items-start gap-2 rounded-lg border border-border/40 px-2 py-1.5 text-sm"
              >
                <Checkbox
                  checked={selectedDevices.has(d.id)}
                  disabled={!canEdit || busy}
                  onCheckedChange={(v) => {
                    setSelectedDevices((prev) => {
                      const next = new Set(prev);
                      if (v) next.add(d.id);
                      else next.delete(d.id);
                      return next;
                    });
                  }}
                />
                <span className="min-w-0">
                  <span className="font-medium">{d.deviceName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {d.deviceCode}
                    {d.locationId == null ? ` · ${t("events.schedule.devicesEventPool")}` : ""}
                    {d.hostSite ? ` · ${t("events.schedule.devicesHostSite")}` : ""}
                    {d.serialNumber ? ` · ${d.serialNumber}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        {canEdit ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveDevices()}>
            {t("events.schedule.devicesSave")}
          </Button>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border/40 bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t("events.schedule.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("events.schedule.hint")}</p>
            {crewClosed ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {t("events.schedule.crewClosed")}
              </p>
            ) : null}
          </div>
          {editAllowed ? (
            <div className="flex flex-wrap items-end gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void seed()}>
                {t("events.schedule.seedFromCrew")}
              </Button>
              <Input
                type="date"
                className="h-8 w-auto"
                value={processFrom}
                onChange={(e) => setProcessFrom(e.target.value)}
                aria-label={t("events.schedule.processFrom")}
              />
              <Input
                type="date"
                className="h-8 w-auto"
                value={processTo}
                onChange={(e) => setProcessTo(e.target.value)}
                aria-label={t("events.schedule.processTo")}
              />
              <Button size="sm" disabled={busy || slots.length === 0} onClick={() => void process()}>
                {t("events.schedule.processAttendance")}
              </Button>
            </div>
          ) : null}
        </div>

        {slots.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label={t("events.schedule.categoryFilter")}>
            {useEventRoles ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant={roleFilter === "all" ? "default" : "outline"}
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={() => setRoleFilter("all")}
                >
                  {t("events.schedule.categories.all")} ({slots.length})
                </Button>
                {activeRoles.map((role) => {
                  const count = slots.filter((s) => roleForSlot(s)?.id === role.id).length;
                  return (
                    <Button
                      key={role.id}
                      type="button"
                      size="sm"
                      variant={roleFilter === role.id ? "default" : "outline"}
                      className={cn("h-7 rounded-full px-3 text-xs", count === 0 && "opacity-60")}
                      onClick={() => {
                        setRoleFilter(role.id);
                        selectAddEventRole(role.id);
                      }}
                    >
                      {role.name} ({count})
                    </Button>
                  );
                })}
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant={categoryFilter === "all" ? "default" : "outline"}
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={() => setCategoryFilter("all")}
                >
                  {t("events.schedule.categories.all")} ({categoryCounts.all})
                </Button>
                {EVENT_CREW_SCHEDULE_CATEGORY_ORDER.map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    size="sm"
                    variant={categoryFilter === cat ? "default" : "outline"}
                    className={cn("h-7 rounded-full px-3 text-xs", categoryCounts[cat] === 0 && "opacity-60")}
                    onClick={() => {
                      setCategoryFilter(cat);
                      selectAddRole(cat);
                    }}
                  >
                    {categoryLabel(cat)} ({categoryCounts[cat]})
                  </Button>
                ))}
              </>
            )}
          </div>
        ) : null}

        {slots.length === 0 ? (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t("events.schedule.empty")}</p>
            {editAllowed ? (
              <p className="text-xs text-muted-foreground">{t("events.schedule.emptyRoleHint")}</p>
            ) : null}
          </div>
        ) : filteredSlots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("events.schedule.emptyCategory")}</p>
        ) : (
          <div className="space-y-4">
            {groupedSlots.map((group) => {
              const labourGroup = group.role
                ? isLabourEventRole(group.role)
                : isLabourStyleEventCrewCategory(group.category);
              return (
              <div key={group.role?.id ?? group.category}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.role?.name ?? categoryLabel(group.category)}
                  </h3>
                  <span className="text-[11px] text-muted-foreground">({group.items.length})</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("events.schedule.columns.person")}</TableHead>
                      <TableHead>{t("events.schedule.columns.date")}</TableHead>
                      <TableHead>
                        {labourGroup
                          ? t("events.schedule.columns.labourDay")
                          : t("events.schedule.columns.shift")}
                      </TableHead>
                      <TableHead>{t("events.schedule.columns.attendance")}</TableHead>
                      {editAllowed ? <TableHead className="w-24" /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.items.map((slot) => {
                      const att = attByKey.get(`${slot.staff_id}|${slot.work_date}`);
                      const labourRow = labourGroup;
                      return (
                        <TableRow key={slot.id}>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span>{slot.staff_name ?? "—"}</span>
                              {slot.role_label ? (
                                <span className="text-[11px] text-muted-foreground">{slot.role_label}</span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{slot.work_date}</TableCell>
                          <TableCell className="text-xs">
                            {labourRow
                              ? labourHoursLabel(att?.worked_minutes)
                              : `${slot.scheduled_in}–${slot.scheduled_out}`}
                          </TableCell>
                          <TableCell>
                            {att ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={att.missed_punch ? "destructive" : "secondary"}>
                                  {att.status}
                                  {att.late_minutes > 0 ? ` · late ${att.late_minutes}m` : ""}
                                  {!labourRow && att.overtime_minutes > 0
                                    ? ` · OT ${att.overtime_minutes}m`
                                    : ""}
                                </Badge>
                                {att.missed_punch ? (
                                  <Button asChild size="sm" variant="link" className="h-auto px-0 text-xs">
                                    <Link href={`/events/${eventId}/corrections#mp-${att.id}`}>
                                      {t("events.schedule.fixLink")}
                                    </Link>
                                  </Button>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          {editAllowed ? (
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={async () => {
                                  setBusy(true);
                                  try {
                                    await deleteEventScheduleSlot({ id: slot.id });
                                    onChanged();
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              >
                                {t("common.remove")}
                              </Button>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              );
            })}
          </div>
        )}
      </section>

      {editAllowed ? (
        <section
          className={cn(
            "rounded-2xl border bg-card p-4",
            slots.length === 0 ? "border-primary/40 ring-1 ring-primary/15" : "border-border/40",
          )}
        >
          <div className="mb-3">
            <h2 className="text-sm font-semibold">
              {addShiftMode === "labour_days"
                ? t("events.schedule.addLabourDaysForRole")
                : t("events.schedule.addSlotForRole")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {addShiftMode === "labour_days"
                ? t("events.schedule.addLabourDaysHint")
                : t("events.schedule.addSlotHint")}
            </p>
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label={t("events.schedule.addRole")}>
            {useEventRoles
              ? activeRoles.map((role) => (
                  <Button
                    key={role.id}
                    type="button"
                    size="sm"
                    variant={addEventRoleId === role.id ? "default" : "outline"}
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => selectAddEventRole(role.id)}
                  >
                    {role.name}
                  </Button>
                ))
              : EVENT_CREW_SCHEDULE_CATEGORY_ORDER.map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    size="sm"
                    variant={addRole === cat ? "default" : "outline"}
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => selectAddRole(cat)}
                  >
                    {categoryLabel(cat)}
                  </Button>
                ))}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            {addShiftMode === "labour_days"
              ? t("events.schedule.addModeLabourHint")
              : t("events.schedule.addModeEventDayHint")}
          </p>
          <div
            className={cn(
              "grid gap-2 md:grid-cols-2",
              addShiftMode === "labour_days" ? "lg:grid-cols-6" : "lg:grid-cols-5",
            )}
          >
            {addShiftMode === "labour_days" ? (
              <>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label={t("events.schedule.dateFrom")}
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label={t("events.schedule.dateTo")}
                />
                <Input
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  value={
                    labourHours ||
                    String(selectedEventRole?.default_hours_per_day || labourBaselineHours)
                  }
                  onChange={(e) => setLabourHours(e.target.value)}
                  aria-label={t("events.roles.hoursPerDay")}
                  placeholder={t("events.roles.hoursPerDay")}
                />
                <Input
                  type="number"
                  min={0}
                  value={labourDayRate}
                  onChange={(e) => setLabourDayRate(e.target.value)}
                  aria-label={t("events.roles.dayRate")}
                  placeholder={t("events.roles.dayRateOptional")}
                />
              </>
            ) : (
              <>
                <Input
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  aria-label={t("events.schedule.columns.date")}
                />
                <Input
                  type="time"
                  value={scheduledIn}
                  onChange={(e) => setScheduledIn(e.target.value)}
                  aria-label={t("events.schedule.scheduledIn")}
                />
                <Input
                  type="time"
                  value={scheduledOut}
                  onChange={(e) => setScheduledOut(e.target.value)}
                  aria-label={t("events.schedule.scheduledOut")}
                />
              </>
            )}
            <Button
              size="sm"
              disabled={
                busy ||
                (addShiftMode === "labour_days" ? !dateFrom || !dateTo : !workDate)
              }
              onClick={() => void addSlot()}
            >
              {staffId
                ? addShiftMode === "labour_days"
                  ? t("events.schedule.addLabourDaysOne")
                  : t("events.schedule.addSlotOne")
                : addShiftMode === "labour_days"
                  ? t("events.schedule.addLabourDaysForRole")
                  : t("events.schedule.addSlotForRole")}
            </Button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-5">
            <div className="md:col-span-2 lg:col-span-2">
              <SearchableSelect
                value={staffId}
                onValueChange={setStaffId}
                emptyOption={{ value: "", label: t("events.schedule.allStaffInRole") }}
                options={staffForAddRole.map((s) => ({
                  value: s.id,
                  label: s.job_title ? `${s.full_name} · ${s.job_title}` : s.full_name,
                  keywords: `${s.full_name} ${s.job_title ?? ""}`,
                }))}
                placeholder={t("events.schedule.optionalStaff")}
                searchPlaceholder={t("events.schedule.staffSearch")}
                noMatchesLabel={t("events.schedule.staffSearchEmpty")}
                aria-label={t("events.schedule.optionalStaff")}
              />
            </div>
            <p className="text-xs text-muted-foreground md:col-span-2 lg:col-span-3 self-center">
              {staffForAddRole.length === 0
                ? (selectedEventRole
                    ? eventRoleAllowsPeopleFallback(selectedEventRole)
                    : eventCrewScheduleAllowsPeopleFallback(addRole))
                  ? t("events.schedule.noStaffForManagementHint")
                  : t("events.schedule.noStaffForRoleHint")
                : t("events.schedule.optionalStaffHint")}
            </p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("events.schedule.correctionsHint")}{" "}
            <Link
              href={`/events/${eventId}/corrections`}
              className="underline underline-offset-2"
            >
              {t("events.schedule.openCorrections")}
            </Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
