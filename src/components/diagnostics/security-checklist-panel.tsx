"use client";

import { useMutation } from "@tanstack/react-query";
import { ChevronDown, Loader2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { runSecurityChecklist } from "@/lib/diagnostics.functions";
import type {
  SecurityArea,
  SecurityCheckResult,
  SecurityCheckStatus,
  SecurityChecklistReport,
} from "@/lib/diagnostics/security-checklist";
import { cn } from "@/lib/utils";

const AREAS: SecurityArea[] = [
  "input",
  "auth",
  "rbac",
  "data",
  "crypto",
  "database",
  "api",
  "errors",
  "logging",
  "dependencies",
  "code",
  "operations",
];

const STATUS_ORDER: SecurityCheckStatus[] = ["not_auto_fixable", "failed", "fixed", "pass"];

const STATUS_VARIANT: Record<SecurityCheckStatus, "success" | "info" | "destructive" | "warning"> = {
  pass: "success",
  fixed: "info",
  failed: "destructive",
  not_auto_fixable: "warning",
};

const STATUS_ACCENT: Record<SecurityCheckStatus, "green" | "blue" | "red" | "amber"> = {
  pass: "green",
  fixed: "blue",
  failed: "red",
  not_auto_fixable: "amber",
};

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function defaultOpen(report: SecurityChecklistReport): Record<SecurityCheckStatus, boolean> {
  return {
    not_auto_fixable: true,
    failed: report.counts.failed > 0,
    fixed: report.counts.fixed > 0,
    pass: false,
  };
}

export function SecurityChecklistPanel() {
  const { t } = useTranslation();
  const run = useMutation({
    mutationFn: () => runSecurityChecklist(),
    onSuccess: (report) => {
      toast.success(
        t("diagnostics.security.toast", {
          pass: report.counts.pass,
          fixed: report.counts.fixed,
          failed: report.counts.failed,
          notAutoFixable: report.counts.not_auto_fixable,
        }),
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const report = run.data;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("diagnostics.security.title")}</h2>
          <p className="max-w-3xl text-xs text-muted-foreground">{t("diagnostics.security.subtitle")}</p>
        </div>
        <Button size="sm" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {t("diagnostics.security.action")}
        </Button>
      </div>

      {!report ? (
        <NeumorphicCard className="p-4">
          <p className="text-sm text-muted-foreground">{t("diagnostics.security.empty")}</p>
        </NeumorphicCard>
      ) : (
        <SecurityChecklistResults key={report.ranAt} report={report} />
      )}
    </section>
  );
}

function SecurityChecklistResults({ report }: { report: SecurityChecklistReport }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => defaultOpen(report));
  const grouped = useMemo(() => {
    const buckets = Object.fromEntries(STATUS_ORDER.map((status) => [status, [] as SecurityCheckResult[]])) as Record<
      SecurityCheckStatus,
      SecurityCheckResult[]
    >;
    for (const check of report.checks) buckets[check.status].push(check);
    return buckets;
  }, [report.checks]);

  function focusGroup(status: SecurityCheckStatus) {
    setOpen((current) => ({ ...current, [status]: true }));
    requestAnimationFrame(() => {
      document.getElementById(`security-group-${status}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STATUS_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            className="text-start"
            onClick={() => focusGroup(status)}
            aria-controls={`security-group-${status}`}
          >
            <NeumorphicCard accent={STATUS_ACCENT[status]} className="h-full p-4">
              <p className="text-xs text-muted-foreground">{t(`diagnostics.security.status.${status}`)}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{report.counts[status]}</p>
            </NeumorphicCard>
          </button>
        ))}
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {t("diagnostics.security.ranAt", { when: formatWhen(report.ranAt) })}
        </p>
        <p className="text-xs text-muted-foreground">{t("diagnostics.security.resolvedNote")}</p>
      </div>
      {STATUS_ORDER.map((status) => (
        <CheckGroup
          key={status}
          status={status}
          rows={grouped[status]}
          open={open[status]}
          onOpenChange={(next) => setOpen((current) => ({ ...current, [status]: next }))}
        />
      ))}
    </div>
  );
}

function CheckGroup({
  status,
  rows,
  open,
  onOpenChange,
}: {
  status: SecurityCheckStatus;
  rows: SecurityCheckResult[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const byArea = AREAS.map((area) => ({
    area,
    rows: rows.filter((row) => row.area === area),
  })).filter((group) => group.rows.length > 0);

  return (
    <NeumorphicCard id={`security-group-${status}`} accent={STATUS_ACCENT[status]} className="scroll-mt-24 p-0">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <button type="button" className="group flex w-full items-start justify-between gap-3 px-4 py-3 text-start">
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {t(`diagnostics.security.status.${status}`)}
                </span>
                <Badge variant={STATUS_VARIANT[status]}>{rows.length}</Badge>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t(`diagnostics.security.groupHint.${status}`)}
              </span>
            </span>
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {rows.length === 0 ? (
            <p className="border-t border-border/70 px-4 py-3 text-xs text-muted-foreground">
              {t("diagnostics.security.groupEmpty")}
            </p>
          ) : (
            <div className="border-t border-border/70">
              {byArea.map((group) => (
                <div key={group.area}>
                  <p className="bg-muted/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(`diagnostics.security.areas.${group.area}`)}
                    <span className="ms-2 tabular-nums">{group.rows.length}</span>
                  </p>
                  <div className="divide-y divide-border/70">
                    {group.rows.map((row) => (
                      <CheckRow key={row.id} row={row} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </NeumorphicCard>
  );
}

function CheckRow({ row }: { row: SecurityCheckResult }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{t(`diagnostics.security.checks.${row.i18nKey}.title`)}</p>
        <p className={cn("mt-1 text-xs leading-relaxed text-muted-foreground")}>{t(row.detailKey, row.params)}</p>
      </div>
      <Badge variant={STATUS_VARIANT[row.status]}>{t(`diagnostics.security.status.${row.status}`)}</Badge>
    </div>
  );
}
