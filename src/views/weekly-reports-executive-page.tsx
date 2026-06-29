"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { WeeklyReportsLayout } from "@/components/weekly-reports/WeeklyReportsLayout";
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
import { useExecutiveReports } from "@/hooks/queries/useWeeklyReports";
import { usePermission } from "@/hooks/use-permission";
import { deleteExecutiveReport, generateExecutiveReport } from "@/lib/weekly-reports.functions";
import { formatWeekLabel, weekStartMonday } from "@/lib/weekly-reports/constants";
import { queryKeys } from "@/lib/query-keys";

export default function WeeklyReportsExecutivePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canExecutive = usePermission("weekly_reports.executive");
  const [weekStart, setWeekStart] = useState(weekStartMonday());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; weekLabel: string } | null>(null);

  const { data: reports = [], isLoading } = useExecutiveReports(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteExecutiveReport({ id }),
    onSuccess: () => {
      toast.success(t("weeklyReports.executive.deleteSuccess"));
      setDeleteTarget(null);
      void qc.invalidateQueries({ queryKey: queryKeys.weeklyReports.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateMut = useMutation({
    mutationFn: () => generateExecutiveReport({ reporting_week_start: weekStart }),
    onSuccess: (row) => {
      toast.success(t("weeklyReports.generateSuccess"));
      void qc.invalidateQueries({ queryKey: queryKeys.weeklyReports.all });
      window.location.href = `/operations/weekly-reports/executive/${row.id}`;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <WeeklyReportsLayout>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#0B1F3A]">{t("weeklyReports.nav.executive")}</h2>
          <p className="mt-1 text-sm text-[#64748B]">{t("weeklyReports.executive.subtitle")}</p>
        </div>
        {canExecutive && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("weeklyReports.weekStart")}</label>
              <input
                type="date"
                className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
              />
            </div>
            <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending}>
              {generateMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {t("weeklyReports.generateExecutive")}
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("weeklyReports.loading")}</p>
      ) : reports.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("weeklyReports.noReports")}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("weeklyReports.week")}</TableHead>
                <TableHead>{t("weeklyReports.fields.status")}</TableHead>
                <TableHead>{t("weeklyReports.generationMode")}</TableHead>
                <TableHead>{t("weeklyReports.created")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={String(r.id)}>
                  <TableCell>{formatWeekLabel(String(r.reporting_week_start))}</TableCell>
                  <TableCell><Badge variant="secondary">{String(r.status)}</Badge></TableCell>
                  <TableCell>{r.ai_generated ? t("weeklyReports.aiGenerated") : t("weeklyReports.ruleBased")}</TableCell>
                  <TableCell>{new Date(String(r.created_at)).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/operations/weekly-reports/executive/${r.id}`}>
                          <Download className="mr-1 h-3.5 w-3.5" />
                          {t("weeklyReports.viewReport")}
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
                          {t("common.delete")}
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("weeklyReports.executive.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("weeklyReports.executive.deleteDescription", { week: deleteTarget?.weekLabel ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              {deleteMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WeeklyReportsLayout>
  );
}
