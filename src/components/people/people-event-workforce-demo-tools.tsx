"use client";

/**
 * HOO-only Seed / Delete / Reset & seed event workforce tools.
 * Includes From–To shift date range. Event-scoped only (not monthly roster).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PeopleEventDateRangeControl } from "@/components/people/people-event-date-range-control";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import {
  EVENT_WORKFORCE_DEMO_COUNTS,
  EVENT_WORKFORCE_DEMO_DELETE_CONFIRMATION,
  EVENT_WORKFORCE_DEMO_MAX_DAYS,
  mayManageEventWorkforceDemo,
  QATAR_EVENT_DEMO_DAY_RATES_QAR,
  validateDemoDateRange,
} from "@/lib/events/event-workforce-demo";
import {
  deleteEventWorkforceDemo,
  resetAndSeedEventWorkforceDemo,
  seedEventWorkforceDemo,
} from "@/lib/people-event-workforce-demo.functions";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const from = new Date(Date.UTC(y, m, d));
  const to = new Date(Date.UTC(y, m, d + 2));
  const ymd = (dt: Date) => dt.toISOString().slice(0, 10);
  return { from: ymd(from), to: ymd(to) };
}

export function PeopleEventWorkforceDemoTools({
  eventId,
  className,
  dateFrom: controlledFrom,
  dateTo: controlledTo,
  onDateFromChange,
  onDateToChange,
}: {
  /** Required for seed/delete — event-scoped location only. */
  eventId: string | null | undefined;
  className?: string;
  /** Optional controlled From–To (e.g. Event Attendance page filters). */
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const roles = useUserRoles();
  const { profile } = useAuth();
  const canHoo = mayManageEventWorkforceDemo({
    roles,
    jobTitle: profile?.job_title,
  });

  const initial = useMemo(() => defaultRange(), []);
  const [internalFrom, setInternalFrom] = useState(initial.from);
  const [internalTo, setInternalTo] = useState(initial.to);
  const dateFrom = controlledFrom ?? internalFrom;
  const dateTo = controlledTo ?? internalTo;
  const setDateFrom = onDateFromChange ?? setInternalFrom;
  const setDateTo = onDateToChange ?? setInternalTo;
  const [seedOpen, setSeedOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [wipeAll, setWipeAll] = useState(true);

  if (!canHoo) return null;

  const rangeError = validateDemoDateRange(dateFrom, dateTo);
  const canSeed = Boolean(eventId) && !rangeError;
  const confirmed = phrase.trim() === EVENT_WORKFORCE_DEMO_DELETE_CONFIRMATION;

  const invalidate = () => {
    if (!eventId) return;
    void qc.invalidateQueries({ queryKey: queryKeys.events.staffing(eventId) });
    void qc.invalidateQueries({ queryKey: queryKeys.events.roles(eventId) });
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "event-attendance"] });
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "event-crew"] });
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "event-options"] });
    void qc.invalidateQueries({
      queryKey: queryKeys.people.hrPayrollPeriods({ periodKind: "event" }),
    });
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "event-payroll-line-stats"] });
    // Hub overview aggregates share these prefixes — ensure seeded data refreshes there too.
    void qc.invalidateQueries({ queryKey: [...queryKeys.people.all] });
    void qc.invalidateQueries({ queryKey: queryKeys.events.all });
  };

  const toastSeedSuccess = (result: {
    days: number;
    staffEnsured: number;
    shifts: number;
    attendanceDays: number;
    payrollLines: number;
    payrollHint: string | null;
  }) => {
    toast.success(
      t("peopleEvent.demo.seedSuccess", {
        days: result.days,
        staff: result.staffEnsured,
        shifts: result.shifts,
        attendance: result.attendanceDays,
        payroll: result.payrollLines,
      }),
    );
    if (result.payrollHint) {
      toast.message(result.payrollHint);
    }
  };

  const seedMut = useMutation({
    mutationFn: () =>
      seedEventWorkforceDemo({
        eventId: eventId!,
        dateFrom,
        dateTo,
      }),
    onSuccess: (result) => {
      toastSeedSuccess(result);
      setSeedOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || t("peopleEvent.demo.seedFailed")),
  });

  const resetMut = useMutation({
    mutationFn: () =>
      resetAndSeedEventWorkforceDemo({
        eventId: eventId!,
        dateFrom,
        dateTo,
        confirmation: phrase.trim(),
      }),
    onSuccess: (result) => {
      toastSeedSuccess(result);
      setResetOpen(false);
      setPhrase("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || t("peopleEvent.demo.resetFailed")),
  });

  const deleteMut = useMutation({
    mutationFn: () =>
      deleteEventWorkforceDemo({
        eventId: eventId!,
        confirmation: phrase.trim(),
        wipeAllEventWorkforce: wipeAll,
      }),
    onSuccess: (result) => {
      toast.success(
        t("peopleEvent.demo.deleteSuccess", {
          attendance: result.attendanceSummaries,
          shifts: result.shifts,
          assignments: result.assignments,
          roles: result.rolesRemoved,
          payroll: result.payrollPeriods,
        }),
      );
      setDeleteOpen(false);
      setPhrase("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || t("peopleEvent.demo.deleteFailed")),
  });

  const busy = seedMut.isPending || deleteMut.isPending || resetMut.isPending;

  return (
    <>
      <section
        className={cn(
          "rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 shadow-sm",
          className,
        )}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-950">{t("peopleEvent.demo.title")}</p>
            <p className="mt-0.5 text-xs text-amber-900/80">{t("peopleEvent.demo.subtitle")}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("peopleEvent.demo.mixHint", {
                crew: EVENT_WORKFORCE_DEMO_COUNTS.crew,
                cashier: EVENT_WORKFORCE_DEMO_COUNTS.cashier,
                labour: EVENT_WORKFORCE_DEMO_COUNTS.labour,
                labourRate: QATAR_EVENT_DEMO_DAY_RATES_QAR.labour,
                maxDays: EVENT_WORKFORCE_DEMO_MAX_DAYS,
              })}
            </p>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end lg:w-auto">
            <PeopleEventDateRangeControl
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFrom={setDateFrom}
              onDateTo={setDateTo}
              fromId="demo-date-from"
              toId="demo-date-to"
              disabled={busy}
              showIcon={false}
              className="w-full border-border/70 sm:min-w-[18rem]"
            />

            <Button
              type="button"
              size="sm"
              disabled={!canSeed || busy}
              onClick={() => {
                setPhrase("");
                setResetOpen(true);
              }}
              className="h-10 rounded-xl bg-amber-700 px-4 text-white hover:bg-amber-800"
            >
              <RotateCcw className="me-1.5 h-3.5 w-3.5" aria-hidden />
              {t("peopleEvent.demo.resetSeed")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSeed || busy}
              onClick={() => setSeedOpen(true)}
              className="h-10 rounded-xl bg-[#7c3aed] px-4 text-white hover:bg-[#6d28d9]"
            >
              <Database className="me-1.5 h-3.5 w-3.5" aria-hidden />
              {t("peopleEvent.demo.seed")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={!eventId || busy}
              onClick={() => setDeleteOpen(true)}
              className="h-10 rounded-xl"
            >
              <Trash2 className="me-1.5 h-3.5 w-3.5" aria-hidden />
              {t("peopleEvent.demo.delete")}
            </Button>
          </div>
        </div>
        {!eventId ? (
          <p className="mt-2 text-xs text-amber-900">{t("peopleEvent.demo.needEvent")}</p>
        ) : rangeError ? (
          <p className="mt-2 text-xs text-destructive">{rangeError}</p>
        ) : null}
        <p className="mt-2 text-[11px] text-muted-foreground">{t("peopleEvent.demo.rosterBoundary")}</p>
      </section>

      <AlertDialog open={seedOpen} onOpenChange={(o) => !busy && setSeedOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("peopleEvent.demo.seedDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {t("peopleEvent.demo.seedDialogBody", {
                    from: dateFrom,
                    to: dateTo,
                    crew: EVENT_WORKFORCE_DEMO_COUNTS.crew,
                    cashier: EVENT_WORKFORCE_DEMO_COUNTS.cashier,
                    labour: EVENT_WORKFORCE_DEMO_COUNTS.labour,
                  })}
                </p>
                <p>
                  {t("peopleEvent.demo.seedDialogRates", {
                    labour: QATAR_EVENT_DEMO_DAY_RATES_QAR.labour,
                    cleaner: QATAR_EVENT_DEMO_DAY_RATES_QAR.cleaner,
                    maintenance: QATAR_EVENT_DEMO_DAY_RATES_QAR.maintenance,
                  })}
                </p>
                <p className="text-xs">{t("peopleEvent.demo.seedDialogPayroll")}</p>
                <p className="text-xs">{t("peopleEvent.demo.rosterBoundary")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <Button
              type="button"
              disabled={busy || !canSeed}
              className="bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
              onClick={() => seedMut.mutate()}
            >
              {seedMut.isPending ? <Loader2 className="animate-spin" /> : null}
              {t("peopleEvent.demo.seedConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={resetOpen}
        onOpenChange={(o) => {
          if (busy) return;
          setResetOpen(o);
          if (!o) setPhrase("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("peopleEvent.demo.resetDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {t("peopleEvent.demo.resetDialogBody", {
                    from: dateFrom,
                    to: dateTo,
                  })}
                </p>
                <ul className="list-disc space-y-0.5 ps-4">
                  <li>{t("peopleEvent.demo.deleteItemAttendance")}</li>
                  <li>{t("peopleEvent.demo.deleteItemShifts")}</li>
                  <li>{t("peopleEvent.demo.deleteItemAssignments")}</li>
                  <li>{t("peopleEvent.demo.deleteItemRoles")}</li>
                  <li>{t("peopleEvent.demo.deleteItemPayroll")}</li>
                </ul>
                <p className="text-xs">{t("peopleEvent.demo.seedDialogPayroll")}</p>
                <p className="text-xs font-medium text-foreground">
                  {t("peopleEvent.demo.deleteKeepsEvent")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="demo-reset-confirm">
              {t("peopleEvent.demo.typeLabel", { phrase: EVENT_WORKFORCE_DEMO_DELETE_CONFIRMATION })}
            </Label>
            <Input
              id="demo-reset-confirm"
              value={phrase}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              placeholder={EVENT_WORKFORCE_DEMO_DELETE_CONFIRMATION}
              onChange={(e) => setPhrase(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <Button
              type="button"
              disabled={!confirmed || busy || !canSeed}
              className="bg-amber-700 text-white hover:bg-amber-800"
              onClick={() => resetMut.mutate()}
            >
              {resetMut.isPending ? <Loader2 className="animate-spin" /> : null}
              {t("peopleEvent.demo.resetConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (busy) return;
          setDeleteOpen(o);
          if (!o) setPhrase("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("peopleEvent.demo.deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{t("peopleEvent.demo.deleteDialogBody")}</p>
                <ul className="list-disc space-y-0.5 ps-4">
                  <li>{t("peopleEvent.demo.deleteItemAttendance")}</li>
                  <li>{t("peopleEvent.demo.deleteItemShifts")}</li>
                  <li>{t("peopleEvent.demo.deleteItemAssignments")}</li>
                  <li>{t("peopleEvent.demo.deleteItemRoles")}</li>
                  <li>{t("peopleEvent.demo.deleteItemPayroll")}</li>
                </ul>
                <p className="text-xs font-medium text-foreground">
                  {t("peopleEvent.demo.deleteKeepsEvent")}
                </p>
                <div className="flex items-start gap-2 pt-1">
                  <Checkbox
                    id="demo-wipe-all"
                    checked={wipeAll}
                    onCheckedChange={(v) => setWipeAll(Boolean(v))}
                    disabled={busy}
                  />
                  <Label htmlFor="demo-wipe-all" className="text-xs font-normal leading-snug">
                    {t("peopleEvent.demo.wipeAllLabel")}
                  </Label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="demo-delete-confirm">
              {t("peopleEvent.demo.typeLabel", { phrase: EVENT_WORKFORCE_DEMO_DELETE_CONFIRMATION })}
            </Label>
            <Input
              id="demo-delete-confirm"
              value={phrase}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              placeholder={EVENT_WORKFORCE_DEMO_DELETE_CONFIRMATION}
              onChange={(e) => setPhrase(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={!confirmed || busy || !eventId}
              onClick={() => deleteMut.mutate()}
            >
              {deleteMut.isPending ? <Loader2 className="animate-spin" /> : null}
              {t("peopleEvent.demo.deleteConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
