"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, Printer, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ExecutiveReportView } from "@/components/weekly-reports/executive-report-view";
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
import { Button } from "@/components/ui/button";
import { useExecutiveReportDetail } from "@/hooks/queries/useWeeklyReports";
import { usePermission } from "@/hooks/use-permission";
import { downloadExecutiveWeeklyReportPdf } from "@/lib/pdf/executive-weekly-report";
import { deleteExecutiveReport } from "@/lib/weekly-reports.functions";
import { formatWeekLabel } from "@/lib/weekly-reports/constants";
import { queryKeys } from "@/lib/query-keys";
import { normalizeExecutiveContent } from "@/lib/weekly-reports/executive-assembler";
import type { ExecutiveWeeklyReport } from "@/lib/weekly-reports/executive-report-types";

function resolveReportContent(data: Record<string, unknown>): ExecutiveWeeklyReport | null {
  const structured = normalizeExecutiveContent(data.content);
  if (structured) return structured;
  return null;
}

export default function ExecutiveWeeklyReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { t } = useTranslation();
  const canExecutive = usePermission("weekly_reports.executive");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading, error } = useExecutiveReportDetail(id);

  const deleteMut = useMutation({
    mutationFn: () => deleteExecutiveReport({ id }),
    onSuccess: () => {
      toast.success(t("weeklyReports.executive.deleteSuccess"));
      void qc.invalidateQueries({ queryKey: queryKeys.weeklyReports.all });
      router.push("/operations/weekly-reports/executive");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const report = data ? resolveReportContent(data as Record<string, unknown>) : null;
  const weekLabel = data?.reporting_week_start
    ? formatWeekLabel(String(data.reporting_week_start))
    : "";

  const onPrint = () => window.print();
  const onPdf = async () => {
    if (!report) return;
    try {
      await downloadExecutiveWeeklyReportPdf(report);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (isLoading) {
    return (
      <WeeklyReportsLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t("weeklyReports.loading")}
        </div>
      </WeeklyReportsLayout>
    );
  }

  if (error || !data || !report) {
    return (
      <WeeklyReportsLayout>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("weeklyReports.notFound")}</p>
          <Button variant="link" asChild className="mt-2">
            <Link href="/operations/weekly-reports/executive">{t("weeklyReports.back")}</Link>
          </Button>
        </div>
      </WeeklyReportsLayout>
    );
  }

  return (
    <WeeklyReportsLayout>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/operations/weekly-reports/executive">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("weeklyReports.back")}
          </Link>
        </Button>
        <div className="flex gap-2">
          {canExecutive && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-1 h-4 w-4" />
              {t("common.delete")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onPrint}>
            <Printer className="mr-1 h-4 w-4" />
            {t("weeklyReports.print")}
          </Button>
          <Button size="sm" onClick={onPdf}>
            <Download className="mr-1 h-4 w-4" />
            {t("weeklyReports.downloadPdf")}
          </Button>
        </div>
      </div>
      <ExecutiveReportView report={report} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("weeklyReports.executive.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("weeklyReports.executive.deleteDescription", { week: weekLabel })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
            >
              {deleteMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WeeklyReportsLayout>
  );
}
