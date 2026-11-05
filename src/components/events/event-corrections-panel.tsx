"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { submitMissedPunchRequest } from "@/lib/attendance-hr.functions";
import type { EventCorrectionRow, EventMissedPunchDayRow } from "@/lib/events/types";

export function EventCorrectionsPanel({
  eventId,
  days,
  corrections,
  canSubmit,
  onChanged,
}: {
  eventId: string;
  days: EventMissedPunchDayRow[];
  corrections: EventCorrectionRow[];
  canSubmit: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { in: string; out: string; reason: string }>>(
    {},
  );

  const draftFor = (summaryId: string) =>
    drafts[summaryId] ?? { in: "", out: "", reason: "Event missed punch correction" };

  const openDays = useMemo(
    () => days.filter((d) => !d.openCorrectionId || d.openCorrectionStatus === "change_required"),
    [days],
  );

  async function submit(day: EventMissedPunchDayRow) {
    const draft = draftFor(day.summaryId);
    if (!draft.in && !draft.out) {
      toast.error(t("events.corrections.needTimes"));
      return;
    }
    setBusyId(day.summaryId);
    try {
      await submitMissedPunchRequest({
        summaryId: day.summaryId,
        reason: draft.reason.trim() || `Event ${eventId.slice(0, 8)} missed punch`,
        punchInTime: draft.in || null,
        punchOutTime: draft.out || null,
      });
      toast.success(t("events.corrections.toasts.submitted"));
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/40 bg-card p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">{t("events.corrections.missedTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("events.corrections.missedHint")}</p>
        </div>
        {openDays.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("events.corrections.missedEmpty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("events.schedule.columns.person")}</TableHead>
                <TableHead>{t("events.schedule.columns.date")}</TableHead>
                <TableHead>{t("events.schedule.columns.attendance")}</TableHead>
                {canSubmit ? <TableHead>{t("events.corrections.fix")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {openDays.map((day) => {
                const draft = draftFor(day.summaryId);
                return (
                  <TableRow key={day.summaryId} id={`mp-${day.summaryId}`}>
                    <TableCell>{day.staff_name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{day.work_date}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{day.status}</Badge>
                    </TableCell>
                    {canSubmit ? (
                      <TableCell>
                        <div className="flex flex-wrap items-end gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground">In</label>
                            <Input
                              type="time"
                              className="h-8 w-[7.5rem]"
                              value={draft.in}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [day.summaryId]: { ...draft, in: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Out</label>
                            <Input
                              type="time"
                              className="h-8 w-[7.5rem]"
                              value={draft.out}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [day.summaryId]: { ...draft, out: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <Button
                            size="sm"
                            disabled={busyId === day.summaryId}
                            onClick={() => void submit(day)}
                          >
                            {t("events.corrections.submit")}
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {t("events.corrections.approvalHint")}{" "}
          <Link href="/me" className="underline underline-offset-2">
            {t("events.corrections.myDayLink")}
          </Link>
        </p>
      </section>

      <section className="rounded-2xl border border-border/40 bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">{t("events.corrections.queueTitle")}</h2>
        {corrections.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("events.corrections.queueEmpty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("events.schedule.columns.person")}</TableHead>
                <TableHead>{t("events.schedule.columns.date")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>#</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {corrections.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.staff_name ?? "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{c.work_date ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{c.request_number ?? c.id.slice(0, 8)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
