"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  deleteEventScheduleSlot,
  processEventAttendance,
  seedEventScheduleFromCrew,
  upsertEventScheduleSlot,
} from "@/lib/event-schedule.functions";
import type { EventScheduleAttendanceRow, EventScheduleSlotRow } from "@/lib/events/types";

export function EventSchedulePanel({
  eventId,
  slots,
  attendance,
  staff,
  canEdit,
  defaultDate,
  crewClosed = false,
  onChanged,
}: {
  eventId: string;
  slots: EventScheduleSlotRow[];
  attendance: EventScheduleAttendanceRow[];
  staff: Array<{ id: string; full_name: string }>;
  canEdit: boolean;
  defaultDate: string;
  crewClosed?: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [workDate, setWorkDate] = useState(defaultDate);
  const [scheduledIn, setScheduledIn] = useState("09:00");
  const [scheduledOut, setScheduledOut] = useState("18:00");

  const attByKey = new Map(attendance.map((a) => [`${a.staff_id}|${a.work_date}`, a]));

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
      const res = await processEventAttendance({ eventId });
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
    if (!staffId || !workDate) return;
    setBusy(true);
    try {
      await upsertEventScheduleSlot({
        eventId,
        staff_id: staffId,
        work_date: workDate,
        scheduled_in: scheduledIn,
        scheduled_out: scheduledOut,
      });
      setStaffId("");
      onChanged();
      toast.success(t("events.schedule.toasts.saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const editAllowed = canEdit && !crewClosed;

  return (
    <div className="space-y-4">
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
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void seed()}>
                {t("events.schedule.seedFromCrew")}
              </Button>
              <Button size="sm" disabled={busy || slots.length === 0} onClick={() => void process()}>
                {t("events.schedule.processAttendance")}
              </Button>
            </div>
          ) : null}
        </div>

        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("events.schedule.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("events.schedule.columns.person")}</TableHead>
                <TableHead>{t("events.schedule.columns.date")}</TableHead>
                <TableHead>{t("events.schedule.columns.shift")}</TableHead>
                <TableHead>{t("events.schedule.columns.attendance")}</TableHead>
                {editAllowed ? <TableHead className="w-24" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {slots.map((slot) => {
                const att = attByKey.get(`${slot.staff_id}|${slot.work_date}`);
                return (
                  <TableRow key={slot.id}>
                    <TableCell>{slot.staff_name ?? "—"}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{slot.work_date}</TableCell>
                    <TableCell className="text-xs">
                      {slot.scheduled_in}–{slot.scheduled_out}
                    </TableCell>
                    <TableCell>
                      {att ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={att.missed_punch ? "destructive" : "secondary"}>
                            {att.status}
                            {att.late_minutes > 0 ? ` · late ${att.late_minutes}m` : ""}
                            {att.overtime_minutes > 0 ? ` · OT ${att.overtime_minutes}m` : ""}
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
        )}
      </section>

      {editAllowed ? (
        <section className="rounded-2xl border border-border/40 bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("events.schedule.addSlot")}</h2>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            >
              <option value="">{t("events.overview.selectStaff")}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
            <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
            <Input type="time" value={scheduledIn} onChange={(e) => setScheduledIn(e.target.value)} />
            <Input type="time" value={scheduledOut} onChange={(e) => setScheduledOut(e.target.value)} />
            <Button size="sm" disabled={!staffId || busy} onClick={() => void addSlot()}>
              {t("events.schedule.addSlot")}
            </Button>
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
