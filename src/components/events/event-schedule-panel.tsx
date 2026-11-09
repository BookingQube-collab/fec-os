"use client";

/* Hallmark · redesign · Event schedule panel (People Shift Coverage manage chrome)
 * theme: studied-DNA (mockup purple #7c3aed) · designed-as-app
 * summary variant keeps compact Ops hub layout; manage matches Event Shifts mockup
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CheckCircle2,
  Filter,
  HardHat,
  Info,
  Layers,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Settings2,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  FecDropdown as DropdownMenu,
  FecDropdownContent as DropdownMenuContent,
  FecDropdownItem as DropdownMenuItem,
  FecDropdownTrigger as DropdownMenuTrigger,
} from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  formatShiftDate,
  formatShiftTimeRange,
  groupScheduleShifts,
  roleBadgeTone,
  type ShiftGroupRow,
} from "@/lib/people-event-shifts-display";
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

const ROLE_TONE_CLASS: Record<ReturnType<typeof roleBadgeTone>, string> = {
  crew: "bg-violet-50 text-[#7c3aed] border-violet-100",
  cleaner: "bg-sky-50 text-sky-700 border-sky-100",
  management: "bg-indigo-50 text-indigo-700 border-indigo-100",
  labour: "bg-orange-50 text-orange-700 border-orange-100",
  neutral: "bg-muted text-muted-foreground border-border/60",
};

const ROLE_ICON: Record<ReturnType<typeof roleBadgeTone>, LucideIcon> = {
  crew: Users,
  cleaner: Sparkles,
  management: UserRound,
  labour: HardHat,
  neutral: Layers,
};

function RoleBadge({ label, roleKey }: { label: string; roleKey: string }) {
  const tone = roleBadgeTone(roleKey);
  const Icon = ROLE_ICON[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        ROLE_TONE_CLASS[tone],
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

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
  variant = "manage",
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
  /** summary = read-only Ops hub (no create / seed / process / device save). */
  variant?: "manage" | "summary";
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";
  const isSummary = variant === "summary";
  const addSectionRef = useRef<HTMLElement | null>(null);
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
  const [devicesEditing, setDevicesEditing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<EventCrewScheduleCategory | "all">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  function focusAddSection(mode: "role" | "individual") {
    if (mode === "role") setStaffId("");
    addSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
    enabled: !isSummary,
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

  const shiftGroups = useMemo(() => {
    return groupScheduleShifts(filteredSlots, attendance, {
      roleLabelOf: (slot) => {
        const role = roleForSlot(slot);
        if (role) return role.name;
        return slot.role_label?.trim() || categoryLabel(categoryForSlot(slot));
      },
      roleKeyOf: (slot) => {
        const role = roleForSlot(slot);
        if (role) return role.code || role.name;
        return categoryForSlot(slot);
      },
      isLabourOf: (slot) => {
        const role = roleForSlot(slot);
        if (role) return isLabourEventRole(role);
        return isLabourStyleEventCrewCategory(categoryForSlot(slot));
      },
    });
    // Helpers close over latest role/staff maps; language refreshes labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSlots, attendance, activeRoles, useEventRoles, headOfficeLocationId, staff, locale]);

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

  const editAllowed = canEdit && !crewClosed && !isSummary;
  const devicesEditable = canEdit && !isSummary;
  const linkedDevices = (devicesQ.data?.devices ?? []).filter((d) => selectedDevices.has(d.id));

  async function saveDevices() {
    setBusy(true);
    try {
      await setEventAttendanceDevices({
        eventId,
        deviceIds: [...selectedDevices],
      });
      onChanged();
      setDevicesEditing(false);
      toast.success(t("events.schedule.devicesSaved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeGroup(group: ShiftGroupRow) {
    setBusy(true);
    try {
      for (const slot of group.slots) {
        await deleteEventScheduleSlot({ id: slot.id });
      }
      setSelectedGroups((prev) => {
        const next = new Set(prev);
        next.delete(group.key);
        return next;
      });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleGroup(key: string, checked: boolean) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleAllGroups(checked: boolean) {
    if (!checked) {
      setSelectedGroups(new Set());
      return;
    }
    setSelectedGroups(new Set(shiftGroups.map((g) => g.key)));
  }

  if (isSummary) {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">{t("events.schedule.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("peopleEvent.shifts.summaryHint")}</p>
          </div>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("peopleEvent.shifts.empty")}</p>
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
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.items.map((slot) => {
                          const att = attByKey.get(`${slot.staff_id}|${slot.work_date}`);
                          return (
                            <TableRow key={slot.id}>
                              <TableCell>{slot.staff_name ?? "—"}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{slot.work_date}</TableCell>
                              <TableCell className="text-xs">
                                {labourGroup
                                  ? labourHoursLabel(att?.worked_minutes)
                                  : `${slot.scheduled_in}–${slot.scheduled_out}`}
                              </TableCell>
                              <TableCell>
                                {att ? (
                                  <Badge variant={att.missed_punch ? "destructive" : "secondary"}>
                                    {att.status}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Event devices banner */}
      <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-[#7c3aed]">
              <Layers className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">
                {t("events.schedule.devicesTitle")}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("events.schedule.devicesHint")}
              </p>
              {devicesQ.isLoading ? (
                <p className="mt-2 text-xs text-muted-foreground">{t("common.loading")}</p>
              ) : (devicesQ.data?.devices.length ?? 0) === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">{t("events.schedule.devicesNone")}</p>
              ) : linkedDevices.length > 0 && !devicesEditing ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {linkedDevices.map((d) => (
                    <span
                      key={d.id}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">
                        {d.deviceName}
                        {d.deviceCode ? ` · ${d.deviceCode}` : ""}
                        {d.serialNumber ? ` · ${d.serialNumber}` : ""}
                      </span>
                    </span>
                  ))}
                </div>
              ) : linkedDevices.length === 0 && !devicesEditing ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("peopleEvent.shifts.devicesNoneLinked")}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {devicesEditable ? (
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-xl"
                disabled={busy || (devicesQ.data?.devices.length ?? 0) === 0}
                onClick={() => setDevicesEditing((v) => !v)}
              >
                <Pencil className="me-1.5 h-3.5 w-3.5" aria-hidden />
                {t("peopleEvent.shifts.devicesEdit")}
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline" className="h-9 rounded-xl">
              <Link href="/people/attendance/settings">
                <Settings2 className="me-1.5 h-3.5 w-3.5" aria-hidden />
                {t("peopleEvent.shifts.manageDevices")}
              </Link>
            </Button>
          </div>
        </div>

        {devicesEditing && devicesEditable ? (
          <div className="mt-4 space-y-3 border-t border-border/50 pt-4">
            {(devicesQ.data?.devices.length ?? 0) === 0 ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/people/attendance/settings">{t("events.schedule.devicesOpenAdmin")}</Link>
              </Button>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(devicesQ.data?.devices ?? []).map((d) => (
                    <label
                      key={d.id}
                      className="flex items-start gap-2 rounded-xl border border-border/40 px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={selectedDevices.has(d.id)}
                        disabled={busy}
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
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="rounded-xl bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    disabled={busy}
                    onClick={() => void saveDevices()}
                  >
                    {t("events.schedule.devicesSave")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl"
                    disabled={busy}
                    onClick={() => {
                      setSelectedDevices(new Set(deviceIds));
                      setDevicesEditing(false);
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>

      {/* Toolbar */}
      <section className="rounded-2xl border border-black/5 bg-white p-3 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-[#7c3aed]" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">{t("events.schedule.title")}</h2>
              {crewClosed ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t("events.schedule.crewClosed")}
                </p>
              ) : null}
            </div>
          </div>
          {editAllowed ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-xl"
                disabled={busy}
                onClick={() => focusAddSection("role")}
              >
                <Plus className="me-1.5 h-3.5 w-3.5" aria-hidden />
                {t("events.schedule.createByRole")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-xl"
                disabled={busy}
                onClick={() => focusAddSection("individual")}
              >
                <UserRound className="me-1.5 h-3.5 w-3.5" aria-hidden />
                {t("events.schedule.createIndividual")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-xl"
                disabled={busy}
                onClick={() => void seed()}
              >
                <Users className="me-1.5 h-3.5 w-3.5" aria-hidden />
                {t("events.schedule.seedFromCrew")}
              </Button>
              <Input
                type="date"
                className="h-9 w-auto rounded-xl"
                value={processFrom}
                onChange={(e) => setProcessFrom(e.target.value)}
                aria-label={t("events.schedule.processFrom")}
              />
              <span className="text-muted-foreground" aria-hidden>
                –
              </span>
              <Input
                type="date"
                className="h-9 w-auto rounded-xl"
                value={processTo}
                onChange={(e) => setProcessTo(e.target.value)}
                aria-label={t("events.schedule.processTo")}
              />
              <Button
                size="sm"
                className="h-9 rounded-xl bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                disabled={busy || slots.length === 0}
                onClick={() => void process()}
              >
                <Play className="me-1.5 h-3.5 w-3.5" aria-hidden />
                {t("events.schedule.processAttendance")}
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      {/* Two-column body */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {editAllowed ? (
          <section
            id="event-shift-add"
            ref={addSectionRef}
            className={cn(
              "h-fit rounded-2xl border bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)]",
              slots.length === 0 ? "border-[#7c3aed]/35 ring-1 ring-[#7c3aed]/15" : "border-black/5",
            )}
          >
            <h2 className="text-sm font-semibold text-foreground">
              {addShiftMode === "labour_days"
                ? t("events.schedule.addLabourDaysForRole")
                : t("peopleEvent.shifts.addShiftForRole")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {addShiftMode === "labour_days"
                ? t("events.schedule.addLabourDaysHint")
                : t("events.schedule.addSlotHint")}
            </p>

            <div
              className="mt-3 flex flex-wrap gap-1.5"
              role="group"
              aria-label={t("events.schedule.addRole")}
            >
              {useEventRoles
                ? activeRoles.map((role) => {
                    const active = addEventRoleId === role.id;
                    const tone = roleBadgeTone(role.code || role.name);
                    const Icon = ROLE_ICON[tone];
                    return (
                      <Button
                        key={role.id}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className={cn(
                          "h-8 rounded-full px-3 text-xs",
                          active && "bg-[#7c3aed] text-white hover:bg-[#6d28d9]",
                        )}
                        onClick={() => selectAddEventRole(role.id)}
                      >
                        <Icon className="me-1.5 h-3.5 w-3.5" aria-hidden />
                        {role.name}
                      </Button>
                    );
                  })
                : EVENT_CREW_SCHEDULE_CATEGORY_ORDER.map((cat) => {
                    const active = addRole === cat;
                    const tone = roleBadgeTone(cat);
                    const Icon = ROLE_ICON[tone];
                    return (
                      <Button
                        key={cat}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className={cn(
                          "h-8 rounded-full px-3 text-xs",
                          active && "bg-[#7c3aed] text-white hover:bg-[#6d28d9]",
                        )}
                        onClick={() => selectAddRole(cat)}
                      >
                        <Icon className="me-1.5 h-3.5 w-3.5" aria-hidden />
                        {categoryLabel(cat)}
                      </Button>
                    );
                  })}
            </div>

            <div className="mt-4 space-y-3">
              {addShiftMode === "labour_days" ? (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                      {t("events.schedule.dateFrom")}
                    </label>
                    <Input
                      type="date"
                      className="h-10 rounded-xl"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                      {t("events.schedule.dateTo")}
                    </label>
                    <Input
                      type="date"
                      className="h-10 rounded-xl"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                        {t("events.roles.hoursPerDay")}
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        step={0.5}
                        className="h-10 rounded-xl"
                        value={
                          labourHours ||
                          String(selectedEventRole?.default_hours_per_day || labourBaselineHours)
                        }
                        onChange={(e) => setLabourHours(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                        {t("events.roles.dayRate")}
                      </label>
                      <Input
                        type="number"
                        min={0}
                        className="h-10 rounded-xl"
                        value={labourDayRate}
                        onChange={(e) => setLabourDayRate(e.target.value)}
                        placeholder={t("events.roles.dayRateOptional")}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                      {t("peopleEvent.shifts.shiftDate")}
                    </label>
                    <Input
                      type="date"
                      className="h-10 rounded-xl"
                      value={workDate}
                      onChange={(e) => setWorkDate(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                        {t("events.schedule.scheduledIn")}
                      </label>
                      <Input
                        type="time"
                        className="h-10 rounded-xl"
                        value={scheduledIn}
                        onChange={(e) => setScheduledIn(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                        {t("events.schedule.scheduledOut")}
                      </label>
                      <Input
                        type="time"
                        className="h-10 rounded-xl"
                        value={scheduledOut}
                        onChange={(e) => setScheduledOut(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  {t("peopleEvent.shifts.assignCrew")}
                </label>
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
                  aria-label={t("peopleEvent.shifts.assignCrew")}
                  triggerClassName="h-10 rounded-xl"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {staffForAddRole.length === 0
                    ? (selectedEventRole
                        ? eventRoleAllowsPeopleFallback(selectedEventRole)
                        : eventCrewScheduleAllowsPeopleFallback(addRole))
                      ? t("events.schedule.noStaffForManagementHint")
                      : t("events.schedule.noStaffForRoleHint")
                    : t("events.schedule.optionalStaffHint")}
                </p>
              </div>

              <Button
                className="h-11 w-full rounded-xl bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                disabled={
                  busy ||
                  (addShiftMode === "labour_days" ? !dateFrom || !dateTo : !workDate)
                }
                onClick={() => void addSlot()}
              >
                <Plus className="me-1.5 h-4 w-4" aria-hidden />
                {staffId
                  ? addShiftMode === "labour_days"
                    ? t("events.schedule.addLabourDaysOne")
                    : t("events.schedule.addSlotOne")
                  : addShiftMode === "labour_days"
                    ? t("events.schedule.addLabourDaysForRole")
                    : t("peopleEvent.shifts.addShiftForRole")}
              </Button>

              <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/80 px-3 py-2.5 text-xs text-sky-900">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <p>
                  {t("events.schedule.addModeEventDayHint")}{" "}
                  <Link
                    href={`/events/${eventId}/corrections`}
                    className="font-semibold underline underline-offset-2"
                  >
                    {t("events.schedule.openCorrections")}
                  </Link>
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section className="h-fit rounded-2xl border border-black/5 bg-white p-4 text-sm text-muted-foreground shadow-[0_4px_20px_rgba(124,58,237,0.06)]">
            {crewClosed
              ? t("events.schedule.crewClosed")
              : t("peopleEvent.shifts.viewOnlyHint")}
          </section>
        )}

        {/* Scheduled shifts table */}
        <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {t("peopleEvent.shifts.tableTitle", { n: shiftGroups.length })}
            </h2>
            <div className="flex items-center gap-2">
              {useEventRoles ? (
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-9 w-[10.5rem] rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("events.schedule.categories.all")} ({slots.length})
                    </SelectItem>
                    {activeRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={categoryFilter}
                  onValueChange={(v) =>
                    setCategoryFilter(v as EventCrewScheduleCategory | "all")
                  }
                >
                  <SelectTrigger className="h-9 w-[10.5rem] rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("events.schedule.categories.all")} ({categoryCounts.all})
                    </SelectItem>
                    {EVENT_CREW_SCHEDULE_CATEGORY_ORDER.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {categoryLabel(cat)} ({categoryCounts[cat]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-border/70 text-muted-foreground">
                <Filter className="h-3.5 w-3.5" aria-hidden />
              </span>
            </div>
          </div>

          {slots.length === 0 ? (
            <div className="space-y-1 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">{t("events.schedule.empty")}</p>
              {editAllowed ? (
                <p className="text-xs text-muted-foreground">{t("events.schedule.emptyRoleHint")}</p>
              ) : null}
            </div>
          ) : shiftGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("events.schedule.emptyCategory")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          shiftGroups.length > 0 &&
                          selectedGroups.size === shiftGroups.length
                        }
                        onCheckedChange={(v) => toggleAllGroups(Boolean(v))}
                        aria-label={t("peopleEvent.bulk.selectAll")}
                      />
                    </TableHead>
                    <TableHead>{t("peopleEvent.columns.date")}</TableHead>
                    <TableHead>{t("peopleEvent.shifts.colRole")}</TableHead>
                    <TableHead>{t("peopleEvent.shifts.colTime")}</TableHead>
                    <TableHead>{t("peopleEvent.shifts.colCrew")}</TableHead>
                    <TableHead>{t("peopleEvent.columns.status")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shiftGroups.map((group) => (
                    <TableRow key={group.key}>
                      <TableCell>
                        <Checkbox
                          checked={selectedGroups.has(group.key)}
                          onCheckedChange={(v) => toggleGroup(group.key, Boolean(v))}
                          aria-label={group.roleLabel}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatShiftDate(group.workDate, locale)}
                      </TableCell>
                      <TableCell>
                        <RoleBadge label={group.roleLabel} roleKey={group.roleKey} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {group.isLabour
                          ? t("events.schedule.columns.labourDay")
                          : formatShiftTimeRange(group.scheduledIn, group.scheduledOut)}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm font-medium">
                        {group.crewCount}
                      </TableCell>
                      <TableCell>
                        {group.covered ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                            {t("peopleEvent.shifts.statusCovered")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
                            {t("peopleEvent.shifts.statusUncovered")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editAllowed ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 rounded-lg"
                                disabled={busy}
                                aria-label={t("common.actions")}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => void removeGroup(group)}
                              >
                                {t("common.remove")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
