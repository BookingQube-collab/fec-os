"use client";

import { FecPageHeader } from "@/components/fec";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { EventWorkspaceNav } from "@/components/events/event-workspace-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvent } from "@/hooks/queries/useEvents";
import { usePermission } from "@/hooks/use-permission";
import {
  createEventPayrollPeriod,
  getEventPayrollPeriod,
  noteEventAssignmentsClosed,
} from "@/lib/event-payroll.functions";
import { generatePayrollLines } from "@/lib/hr-payroll.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function EventPayrollPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const eventQ = useEvent(id);
  const canGenerate = usePermission("payroll.generate");
  const canView = usePermission("payroll.view");
  const [busy, setBusy] = useState(false);

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

  async function closeNotes() {
    if (!period?.id) return;
    setBusy(true);
    try {
      const res = await noteEventAssignmentsClosed({ eventId: id, periodId: period.id });
      toast.success(t("events.payroll.toasts.closed", { n: res.updated }));
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
      {periodQ.isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : (
        <section className="space-y-3 rounded-2xl border border-border/40 bg-card p-4">
          <p className="text-sm text-muted-foreground">{t("events.payroll.hint")}</p>
          {period ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{period.status}</Badge>
              <span className="text-sm">
                {period.displayName ?? period.month}: {period.dateFrom} → {period.dateTo}
              </span>
              <Button asChild size="sm" variant="outline">
                <Link href={`/people/payroll/${period.id}`}>{t("events.payroll.openPeriod")}</Link>
              </Button>
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
              {period ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void closeNotes()}>
                  {t("events.payroll.closeAssignments")}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("events.payroll.needsGenerate")}</p>
          )}
        </section>
      )}
    </div>
  );
}
