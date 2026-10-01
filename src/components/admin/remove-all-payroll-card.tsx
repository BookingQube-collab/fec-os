"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetAllPayroll } from "@/lib/hr-payroll.functions";
import { PAYROLL_RESET_CONFIRMATION } from "@/lib/hr-payroll";
import { queryKeys } from "@/lib/query-keys";

export function RemoveAllPayrollCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const confirmed = phrase.trim() === PAYROLL_RESET_CONFIRMATION;

  const resetMut = useMutation({
    mutationFn: () => resetAllPayroll({ confirmation: phrase.trim() }),
    onSuccess: (result) => {
      toast.success(
        t("adminPayrollReset.success", {
          periods: result.periods,
          lines: result.lines,
          payslips: result.payslips,
          locks: result.locks,
          adjustments: result.adjustments,
          overrides: result.overrides,
          batches: result.importBatches,
          files: result.payslipFiles,
          notifications: result.notifications,
          ot: result.otClaimsReleased,
          air: result.airTicketsReleased,
        }),
      );
      if (result.payslipFileWarning) toast.warning(result.payslipFileWarning);
      setOpen(false);
      setPhrase("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (e: Error) => toast.error(e.message || t("adminPayrollReset.failed")),
  });

  const close = () => {
    if (resetMut.isPending) return;
    setOpen(false);
    setPhrase("");
  };

  return (
    <>
      <div className="rounded-2xl border border-destructive/40 bg-card p-4 shadow-elevated-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="icon-well text-destructive">
              <Trash2 className="h-4 w-4 stroke-[1.5]" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{t("adminPayrollReset.title")}</p>
              <p className="text-xs text-muted-foreground">{t("adminPayrollReset.cardBody")}</p>
            </div>
          </div>
          <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
            {t("adminPayrollReset.open")}
          </Button>
        </div>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
          else setOpen(true);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminPayrollReset.dialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>{t("adminPayrollReset.cannotUndo")}</p>
                <div>
                  <p className="font-medium text-foreground">{t("adminPayrollReset.removedHeading")}</p>
                  <ul className="mt-1 list-disc space-y-0.5 ps-4">
                    <li>{t("adminPayrollReset.removedPeriods")}</li>
                    <li>{t("adminPayrollReset.removedLines")}</li>
                    <li>{t("adminPayrollReset.removedPayslips")}</li>
                    <li>{t("adminPayrollReset.removedLocks")}</li>
                    <li>{t("adminPayrollReset.removedAdjustments")}</li>
                    <li>{t("adminPayrollReset.removedOverrides")}</li>
                    <li>{t("adminPayrollReset.removedBatches")}</li>
                    <li>{t("adminPayrollReset.removedNotifications")}</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-foreground">{t("adminPayrollReset.keptHeading")}</p>
                  <ul className="mt-1 list-disc space-y-0.5 ps-4">
                    <li>{t("adminPayrollReset.keptPeople")}</li>
                    <li>{t("adminPayrollReset.keptAttendance")}</li>
                    <li>{t("adminPayrollReset.keptHr")}</li>
                    <li>{t("adminPayrollReset.keptPolicy")}</li>
                    <li>{t("adminPayrollReset.releasedOt")}</li>
                    <li>{t("adminPayrollReset.releasedAir")}</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="payroll-reset-confirm">{t("adminPayrollReset.typeLabel", { phrase: PAYROLL_RESET_CONFIRMATION })}</Label>
            <Input
              id="payroll-reset-confirm"
              value={phrase}
              autoComplete="off"
              spellCheck={false}
              disabled={resetMut.isPending}
              placeholder={PAYROLL_RESET_CONFIRMATION}
              onChange={(e) => setPhrase(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMut.isPending} onClick={close}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={!confirmed || resetMut.isPending}
              onClick={() => {
                if (!confirmed) return;
                resetMut.mutate();
              }}
            >
              {resetMut.isPending ? <Loader2 className="animate-spin" /> : null}
              {t("adminPayrollReset.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
