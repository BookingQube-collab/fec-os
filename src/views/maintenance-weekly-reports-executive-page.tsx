"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MaintenanceWeeklyReportsLayout } from "@/components/maintenance-weekly-reports/MaintenanceWeeklyReportsLayout";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMaintenanceExecutiveReports } from "@/hooks/queries/useMaintenanceWeeklyReports";
import { usePermission } from "@/hooks/use-permission";
import {
  deleteMaintenanceExecutiveReport,
  generateMaintenanceExecutiveReport,
} from "@/lib/maintenance-weekly-reports.functions";
import { formatWeekLabel, weekStartMonday } from "@/lib/maintenance-weekly-reports/constants";
import { queryKeys } from "@/lib/query-keys";

export default function MaintenanceWeeklyReportsExecutivePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canExecutive = usePermission("maintenance.weekly_report.executive");
  const [weekStart, setWeekStart] = useState(weekStartMonday());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; weekLabel: string } | null>(null);

  const { data: reports = [], isLoading } = useMaintenanceExecutiveReports(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMaintenanceExecutiveReport({ id }),
    onSuccess: () => {
      toast.success(t("maintenanceWeeklyReports.executive.deleteSuccess"));
      setDeleteTarget(null);
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.weeklyReports.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateMut = useMutation({
    mutationFn: () => generateMaintenanceExecutiveReport({ reporting_week_start: weekStart }),
    onSuccess: (row) => {
      toast.success(t("maintenanceWeeklyReports.generateSuccess"));
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.weeklyReports.all });
      window.location.href = `/maintenance/weekly-report/executive/${row.id}`;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <MaintenanceWeeklyReportsLayout>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#0B1F3A]">
            {t("maintenanceWeeklyReports.nav.executive")}
          </h2>
          <p className="mt-1 text-sm text-[#64748B]">{t("maintenanceWeeklyReports.executive.subtitle")}</p>
        </div>
        {canExecutive && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("maintenanceWeeklyReports.filters.week")}</label>
              <input
                type="date"
                className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
              />
            </div>
            <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending}>
              {generateMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {t("maintenanceWeeklyReports.generateExecutive")}
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("maintenanceWeeklyReports.loading")}</p>
      ) : reports.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("maintenanceWeeklyReports.noReports")}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("maintenanceWeeklyReports.table.week")}</TableHead>
                <TableHead>{t("maintenanceWeeklyReports.table.status")}</TableHead>
                <TableHead>{t("maintenanceWeeklyReports.created")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={String(r.id)}>
                  <TableCell>{formatWeekLabel(String(r.reporting_week_start))}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{String(r.status)}</Badge>
                  </TableCell>
                  <TableCell>{new Date(String(r.created_at)).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/maintenance/weekly-report/executive/${r.id}`}>
                          <Download className="mr-1 h-3.5 w-3.5" />
                          {t("maintenanceWeeklyReports.viewReport")}
                        </Link>
                      </Button>
                      {canExecutive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            setDeleteTarget({
                              id: String(r.id),
                              weekLabel: formatWeekLabel(String(r.reporting_week_start)),
                            })
                          }
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          {t("maintenanceWeeklyReports.executive.delete")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("maintenanceWeeklyReports.executive.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("maintenanceWeeklyReports.executive.deleteConfirmBody", { week: deleteTarget?.weekLabel })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              {t("maintenanceWeeklyReports.executive.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MaintenanceWeeklyReportsLayout>
  );
}
