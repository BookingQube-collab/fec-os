"use client";

import { FecPageHeader } from "@/components/fec";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { EventWorkforcePeopleLinks } from "@/components/events/event-workforce-people-links";
import { EventWorkspaceNav } from "@/components/events/event-workspace-nav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvent } from "@/hooks/queries/useEvents";
import { usePermission } from "@/hooks/use-permission";
import {
  closeEventCrew,
  createEventPayrollPeriod,
  getEventPayrollPeriod,
  reopenEventCrew,
} from "@/lib/event-payroll.functions";
import { generatePayrollLines, getPayrollExportMatrix } from "@/lib/hr-payroll.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { downloadCsvContent } from "@/lib/staff-import";

function matrixToCsv(matrix: string[][]): string {
  return matrix
    .map((row) =>
      row
        .map((cell) => {
          const v = String(cell ?? "");
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(","),
    )
    .join("\n");
}

export default function EventPayrollPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const eventQ = useEvent(id);
  const canGenerate = usePermission("payroll.generate");
  const canView = usePermission("payroll.view");
  const canExport = usePermission("payroll.export_wps");
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);

  const periodQ = useQuery({
    queryKey: [...queryKeys.events.staffing(id), "payroll"],
    queryFn: () => getEventPayrollPeriod({ eventId: id }),
    enabled: Boolean(id) && canView,
    staleTime: STALE.events,
  });

  const ev = eventQ.data?.event;
  const title = ev?.name || ev?.event_name || t("nav.events");
  const period = periodQ.data?.period ?? null;

  async function ensurePeriod() {
    setBusy(true);
    try {
      const created = await createEventPayrollPeriod({ eventId: id });
      await qc.invalidateQueries({ queryKey: [...queryKeys.events.staffing(id), "payroll"] });
      toast.success(
        created.reused ? t("events.payroll.toasts.exists") : t("events.payroll.toasts.created"),
      );
      return created.id;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    try {
      let periodId = period?.id ?? null;
      if (!periodId) periodId = await ensurePeriod();
      if (!periodId) return;
      const res = await generatePayrollLines({ periodId });
      await qc.invalidateQueries({ queryKey: [...queryKeys.events.staffing(id), "payroll"] });
      toast.success(t("events.payroll.toasts.generated", { n: res.inserted }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function closeCrew() {
    setBusy(true);
    try {
      const res = await closeEventCrew({
        eventId: id,
        periodId: period?.id ?? null,
        parkEventHires: true,
      });
      await qc.invalidateQueries({ queryKey: [...queryKeys.events.staffing(id)] });
      toast.success(
        t("events.payroll.toasts.closed", {
          n: res.closedAssignments,
          parked: res.parkedHires,
        }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmClose(false);
    }
  }

  async function reopenCrew() {
    setBusy(true);
    try {
      const res = await reopenEventCrew({
        eventId: id,
        unparkEventHires: true,
      });
      await qc.invalidateQueries({ queryKey: [...queryKeys.events.staffing(id)] });
      toast.success(
        t("events.payroll.toasts.reopened", {
          n: res.reopenedAssignments,
          unparked: res.unparkedHires,
        }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmReopen(false);
    }
  }

  async function exportLines() {
    if (!period?.id) return;
    setBusy(true);
    try {
      const res = await getPayrollExportMatrix({
        periodId: period.id,
        method: "bank_transfer",
      });
      downloadCsvContent(
        matrixToCsv(res.matrix),
        `event-payroll-${period.month}-${period.id.slice(0, 8)}.csv`,
      );
      toast.success(t("events.payroll.toasts.exported"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <FecPageHeader title={t("events.workspace.pay")} subtitle={title} />
        <EventWorkspaceNav eventId={id} />
        <p className="text-sm text-muted-foreground">{t("events.payroll.noAccess")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FecPageHeader title={t("events.workspace.pay")} subtitle={title} />
      <EventWorkspaceNav eventId={id} />
      <EventWorkforcePeopleLinks eventId={id} focus="payroll" />
      {periodQ.isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : (
        <section className="space-y-3 rounded-2xl border border-border/40 bg-card p-4">
          <p className="text-sm text-muted-foreground">{t("events.payroll.hint")}</p>
          <div className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground/80">{t("events.payroll.policyTitle")}</p>
            <ul className="list-disc ps-4 space-y-0.5">
              <li>{t("events.payroll.policyHoCutoff")}</li>
              <li>{t("events.payroll.policyHoMode")}</li>
              <li>{t("events.payroll.policyVenue")}</li>
              <li>{t("events.payroll.policyPunches")}</li>
              <li>{t("events.payroll.policyLoaned")}</li>
              <li>{t("events.payroll.policyEventOnly")}</li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">{t("events.payroll.wpsGap")}</p>
          {period ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{period.status}</Badge>
              <span className="text-sm">
                {period.displayName ?? period.month}: {period.dateFrom} → {period.dateTo}
              </span>
              <Button asChild size="sm" variant="outline">
                <Link href={`/people/payroll/${period.id}`}>{t("events.payroll.openPeriod")}</Link>
              </Button>
              {canExport ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void exportLines()}>
                  {t("events.payroll.exportLines")}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("events.payroll.noneYet")}</p>
          )}
          {canGenerate ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => void ensurePeriod()}>
                {t("events.payroll.createPeriod")}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void generate()}>
                {t("events.payroll.generate")}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmClose(true)}>
                {t("events.payroll.closeAssignments")}
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmReopen(true)}>
                {t("events.payroll.reopenAssignments")}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("events.payroll.needsGenerate")}</p>
          )}
        </section>
      )}

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("events.payroll.closeConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("events.payroll.closeConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void closeCrew()}>
              {t("events.payroll.closeAssignments")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReopen} onOpenChange={setConfirmReopen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("events.payroll.reopenConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("events.payroll.reopenConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void reopenCrew()}>
              {t("events.payroll.reopenAssignments")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
