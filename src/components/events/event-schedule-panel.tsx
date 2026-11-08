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
  groupByEventCrewScheduleCategory,
  isLabourStyleEventCrewCategory,
  resolveEventCrewScheduleCategory,
  type EventCrewScheduleCategory,
} from "@/lib/events/crew-schedule-categories";
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
};

export function EventSchedulePanel({
  eventId,
  slots,
  attendance,
  staff,
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
  canEdit: boolean;
  defaultDate: string;
  crewClosed?: boolean;
  deviceIds?: string[];
  headOfficeLocationId?: string | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [addRole, setAddRole] = useState<EventCrewScheduleCategory>("crew");
  const [staffId, setStaffId] = useState("");
  const [workDate, setWorkDate] = useState(defaultDate);
  const [dateFrom, setDateFrom] = useState(defaultDate);
  const [dateTo, setDateTo] = useState(defaultDate);
  const [scheduledIn, setScheduledIn] = useState("09:00");
  const [scheduledOut, setScheduledOut] = useState("18:00");
  const labourBaselineHours = LABOUR_DAY_BASELINE_HOURS;
  const [processFrom, setProcessFrom] = useState("");
  const [processTo, setProcessTo] = useState("");
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(() => new Set(deviceIds));
  const [categoryFilter, setCategoryFilter] = useState<EventCrewScheduleCategory | "all">("all");

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
      role_label: null,
      job_title: person.job_title ?? null,
      is_head_office: Boolean(headOfficeLocationId && person.location_id === headOfficeLocationId),
    });
  }

  const categoryLabel = (cat: EventCrewScheduleCategory) =>
    t(`events.schedule.categories.${cat}`);

  const filteredSlots =
    categoryFilter === "all"
      ? slots
      : slots.filter((slot) => categoryForSlot(slot) === categoryFilter);
  const groupedSlots = groupByEventCrewScheduleCategory(filteredSlots, categoryForSlot);
  const addShiftMode = eventCrewScheduleAddShiftMode(addRole);
  const staffForAddRole = staff.filter((person) => categoryForStaff(person) === addRole);

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
        category: addRole,
        staff_id: staffId || null,
        fallback_staff_ids: staffForAddRole.map((s) => s.id),
        work_date: addShiftMode === "event_day" ? workDate : null,
        date_from: addShiftMode === "labour_days" ? dateFrom : null,
        date_to: addShiftMode === "labour_days" ? dateTo : null,
        scheduled_in:
          addShiftMode === "labour_days" ? LABOUR_DAY_DEFAULT_SCHEDULED_IN : scheduledIn,
        scheduled_out:
          addShiftMode === "labour_days" ? LABOUR_DAY_DEFAULT_SCHEDULED_OUT : scheduledOut,
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
            {groupedSlots.map((group) => (
              <div key={group.category}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {categoryLabel(group.category)}
                  </h3>
                  <span className="text-[11px] text-muted-foreground">({group.items.length})</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("events.schedule.columns.person")}</TableHead>
                      <TableHead>{t("events.schedule.columns.date")}</TableHead>
                      <TableHead>
                        {isLabourStyleEventCrewCategory(group.category)
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
                      const labourRow = isLabourStyleEventCrewCategory(group.category);
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
            ))}
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
            {EVENT_CREW_SCHEDULE_CATEGORY_ORDER.map((cat) => (
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
              addShiftMode === "labour_days" ? "lg:grid-cols-4" : "lg:grid-cols-5",
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
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm md:col-span-2 lg:col-span-2"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              aria-label={t("events.schedule.optionalStaff")}
            >
              <option value="">{t("events.schedule.allStaffInRole")}</option>
              {staffForAddRole.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                  {s.job_title ? ` · ${s.job_title}` : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground md:col-span-2 lg:col-span-3 self-center">
              {staffForAddRole.length === 0
                ? t("events.schedule.noStaffForRoleHint")
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
