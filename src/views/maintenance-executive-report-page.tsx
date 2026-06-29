"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MaintenanceWeeklyReportsLayout } from "@/components/maintenance-weekly-reports/MaintenanceWeeklyReportsLayout";
import { MaintenanceKpiSnapshotView } from "@/components/maintenance-weekly-reports/maintenance-kpi-snapshot";
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
import { Button } from "@/components/ui/button";
import { useMaintenanceExecutiveReportDetail } from "@/hooks/queries/useMaintenanceWeeklyReports";
import { useReportExport } from "@/hooks/use-report-export";
import { usePermission } from "@/hooks/use-permission";
import { deleteMaintenanceExecutiveReport } from "@/lib/maintenance-weekly-reports.functions";
import { formatWeekLabel } from "@/lib/maintenance-weekly-reports/constants";
import type { MaintenanceExecutiveContent } from "@/lib/queries/maintenance-weekly-reports.core";
import { queryKeys } from "@/lib/query-keys";

export default function MaintenanceExecutiveReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { t } = useTranslation();
  const canExecutive = usePermission("maintenance.weekly_report.executive");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading, error } = useMaintenanceExecutiveReportDetail(id);
  const content = (data?.content ?? null) as MaintenanceExecutiveContent | null;
  const weekLabel = data?.reporting_week_start ? formatWeekLabel(String(data.reporting_week_start)) : "";
  const combined = (content?.combined_kpis ?? {}) as Record<string, number>;

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "maintenance_executive_weekly",
    title: t("maintenanceWeeklyReports.executive.reportTitle"),
    venueLabel: weekLabel,
    filters: {},
    kpis: [
      { label: "WO Raised", value: combined.work_orders_raised ?? 0 },
      { label: "WO Completed", value: combined.work_orders_completed ?? 0 },
      { label: "SLA %", value: `${combined.sla_compliance_pct ?? 100}%` },
      { label: "Logistics requests", value: combined.logistics_requests ?? 0 },
      { label: "Items dispatched", value: combined.items_dispatched ?? 0 },
    ],
    columns: [
      { key: "action", header: "Action" },
      { key: "owner", header: "Owner" },
      { key: "priority", header: "Priority" },
    ],
    rows: (content?.action_tracker ?? []).map((a) => ({
      action: a.action,
      owner: a.owner,
      priority: a.priority,
    })),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteMaintenanceExecutiveReport({ id }),
    onSuccess: () => {
      toast.success(t("maintenanceWeeklyReports.executive.deleteSuccess"));
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.weeklyReports.all });
      router.push("/maintenance/weekly-report/executive");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <MaintenanceWeeklyReportsLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t("maintenanceWeeklyReports.loading")}
        </div>
      </MaintenanceWeeklyReportsLayout>
    );
  }

  if (error || !content) {
    return (
      <MaintenanceWeeklyReportsLayout>
        <p className="text-sm text-destructive">{t("maintenanceWeeklyReports.executive.notFound")}</p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href="/maintenance/weekly-report/executive">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            {t("maintenanceWeeklyReports.nav.executive")}
          </Link>
        </Button>
      </MaintenanceWeeklyReportsLayout>
    );
  }

  return (
    <MaintenanceWeeklyReportsLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#0B1F3A]">
            {t("maintenanceWeeklyReports.executive.reportTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{weekLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void exportPdf()}>
            {t("maintenanceWeeklyReports.export.pdf")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportExcel()}>
            {t("maintenanceWeeklyReports.export.excel")}
          </Button>
          {canExecutive && (
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t("maintenanceWeeklyReports.executive.delete")}
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/maintenance/weekly-report/executive">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              {t("maintenanceWeeklyReports.nav.executive")}
            </Link>
          </Button>
        </div>
      </div>

      <section className="mt-6 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-medium">{t("maintenanceWeeklyReports.executive.summary")}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{content.executive_summary}</p>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {content.maintenance && (
          <section className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-medium">{t("maintenanceWeeklyReports.kpi.maintenanceTitle")}</h3>
            <MaintenanceKpiSnapshotView
              team="maintenance"
              snapshot={(content.maintenance.kpi_snapshot ?? {}) as Record<string, unknown>}
            />
            {content.maintenance.top_achievements ? (
              <div>
                <h4 className="text-xs font-medium uppercase text-muted-foreground">{t("maintenanceWeeklyReports.form.achievements")}</h4>
                <p className="mt-1 text-sm whitespace-pre-wrap">{String(content.maintenance.top_achievements)}</p>
              </div>
            ) : null}
          </section>
        )}
        {content.logistics && (
          <section className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-medium">{t("maintenanceWeeklyReports.kpi.logisticsTitle")}</h3>
            <MaintenanceKpiSnapshotView
              team="logistics"
              snapshot={(content.logistics.kpi_snapshot ?? {}) as Record<string, unknown>}
            />
            {content.logistics.top_achievements ? (
              <div>
                <h4 className="text-xs font-medium uppercase text-muted-foreground">{t("maintenanceWeeklyReports.form.achievements")}</h4>
                <p className="mt-1 text-sm whitespace-pre-wrap">{String(content.logistics.top_achievements)}</p>
              </div>
            ) : null}
          </section>
        )}
      </div>

      {content.action_tracker.length > 0 && (
        <section className="mt-4 rounded-lg border bg-card p-4">
          <h3 className="font-medium">{t("maintenanceWeeklyReports.executive.actions")}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {content.action_tracker.map((a, i) => (
              <li key={i}>
                [{a.priority}] {a.owner}: {a.action}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("maintenanceWeeklyReports.executive.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("maintenanceWeeklyReports.executive.deleteConfirmBody", { week: weekLabel })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMut.mutate()}
            >
              {t("maintenanceWeeklyReports.executive.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MaintenanceWeeklyReportsLayout>
  );
}
