"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { runSecurityChecklist } from "@/lib/diagnostics.functions";
import type { SecurityArea, SecurityCheckStatus, SecurityChecklistReport } from "@/lib/diagnostics/security-checklist";

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

const STATUS_VARIANT: Record<SecurityCheckStatus, "success" | "info" | "destructive" | "warning"> = {
  pass: "success",
  fixed: "info",
  failed: "destructive",
  not_auto_fixable: "warning",
};

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
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
        <SecurityChecklistResults report={report} />
      )}
    </section>
  );
}

function SecurityChecklistResults({ report }: { report: SecurityChecklistReport }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">
          {t("diagnostics.security.summary", {
            pass: report.counts.pass,
            fixed: report.counts.fixed,
            failed: report.counts.failed,
            notAutoFixable: report.counts.not_auto_fixable,
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("diagnostics.security.ranAt", { when: formatWhen(report.ranAt) })}
        </p>
        <p className="text-xs text-muted-foreground">{t("diagnostics.security.resolvedNote")}</p>
      </div>
      {AREAS.map((area) => {
        const rows = report.checks.filter((item) => item.area === area);
        if (rows.length === 0) return null;
        return (
          <NeumorphicCard key={area} className="p-0">
            <div className="border-b border-border/80 px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">{t(`diagnostics.security.areas.${area}`)}</h3>
            </div>
            <div className="divide-y divide-border/70">
              {rows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {t(`diagnostics.security.checks.${row.i18nKey}.title`)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{t(row.detailKey, row.params)}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[row.status]}>{t(`diagnostics.security.status.${row.status}`)}</Badge>
                </div>
              ))}
            </div>
          </NeumorphicCard>
        );
      })}
    </div>
  );
}
