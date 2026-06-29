"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Flag, Loader2, MessageSquarePlus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { WeeklyReportsLayout } from "@/components/weekly-reports/WeeklyReportsLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWeeklyReports } from "@/hooks/queries/useWeeklyReports";
import { usePermission } from "@/hooks/use-permission";
import { addWeeklyReportComment, reviewWeeklyReport } from "@/lib/weekly-reports.functions";
import {
  formatWeekLabel,
  REPORT_PRIORITIES,
  REPORT_PRIORITY_LABELS,
  statusRag,
  WEEKLY_REPORT_STATUS_LABELS,
  weekStartMonday,
} from "@/lib/weekly-reports/constants";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const RAG_CLASS = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
  gray: "bg-slate-100 text-slate-700",
};

export default function WeeklyReportsReviewPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canReview = usePermission("weekly_reports.review");
  const [weekStart, setWeekStart] = useState(weekStartMonday());
  const [remarks, setRemarks] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = useMemo(() => ({ weekStart, locationId: null, status: null }), [weekStart]);
  const { data: reports = [], isLoading } = useWeeklyReports(filters);

  const reviewMut = useMutation({
    mutationFn: (action: "approve" | "send_back" | "mark_reviewed" | "flag_missing") =>
      reviewWeeklyReport({
        id: selectedId!,
        action,
        remarks: remarks || undefined,
        priority: priority as "critical" | "high" | "medium" | "low",
        missing_info_flag: action === "flag_missing",
      }),
    onSuccess: () => {
      toast.success(t("weeklyReports.review.saved"));
      setRemarks("");
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: queryKeys.weeklyReports.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remarksMut = useMutation({
    mutationFn: () =>
      addWeeklyReportComment({
        weekly_report_id: selectedId!,
        comment_text: remarks,
        priority: priority as "critical" | "high" | "medium" | "low",
        is_internal: true,
      }),
    onSuccess: () => {
      toast.success(t("weeklyReports.review.remarksSaved"));
      setRemarks("");
      void qc.invalidateQueries({ queryKey: queryKeys.weeklyReports.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = reports.find((r) => r.id === selectedId);

  useEffect(() => {
    if (!selected) return;
    setPriority(selected.priority);
    setRemarks(selected.review_remarks ?? "");
  }, [selected]);

  const selectReport = (reportId: string) => {
    setSelectedId(reportId);
  };

  const reviewPanel = (
    <div className="rounded-lg border bg-card p-4 space-y-3 lg:sticky lg:top-4">
      <h3 className="font-medium">{t("weeklyReports.review.panel")}</h3>
      {!canReview ? (
        <p className="text-sm text-muted-foreground">{t("weeklyReports.review.noAccess")}</p>
      ) : !selected ? (
        <p className="text-sm text-muted-foreground">{t("weeklyReports.review.selectHint")}</p>
      ) : (
        <>
          <p className="text-sm font-medium">
            {selected.locations?.name} — {formatWeekLabel(selected.reporting_week_start)}
          </p>
          {selected.missing_info_flag && (
            <p className="text-xs text-amber-700">{t("weeklyReports.review.missingFlag")}</p>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("weeklyReports.review.remarksLabel")}</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={t("weeklyReports.review.remarksPlaceholder")}
              rows={4}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("weeklyReports.table.priority")}</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {REPORT_PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => reviewMut.mutate("approve")} disabled={reviewMut.isPending || remarksMut.isPending}>
              <Check className="mr-1 h-3.5 w-3.5" /> {t("weeklyReports.review.approve")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => reviewMut.mutate("send_back")}
              disabled={reviewMut.isPending || remarksMut.isPending}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> {t("weeklyReports.review.sendBack")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => reviewMut.mutate("mark_reviewed")}
              disabled={reviewMut.isPending || remarksMut.isPending}
            >
              {t("weeklyReports.review.markReviewed")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => reviewMut.mutate("flag_missing")}
              disabled={reviewMut.isPending || remarksMut.isPending}
            >
              <Flag className="mr-1 h-3.5 w-3.5" /> {t("weeklyReports.review.flagMissing")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => remarksMut.mutate()}
              disabled={reviewMut.isPending || remarksMut.isPending || !remarks.trim()}
            >
              {remarksMut.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquarePlus className="mr-1 h-3.5 w-3.5" />
              )}
              {t("weeklyReports.review.addRemarks")}
            </Button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <WeeklyReportsLayout>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#0B1F3A]">{t("weeklyReports.nav.review")}</h2>
          <p className="mt-1 text-sm text-[#64748B]">{t("weeklyReports.review.subtitle")}</p>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("weeklyReports.weekStart")}</label>
          <input
            type="date"
            className="rounded-lg border px-3 py-2 text-sm"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="order-1 lg:order-2 lg:col-span-1">{reviewPanel}</div>

        <div className="order-2 lg:order-1 lg:col-span-2 overflow-x-auto rounded-lg border bg-card">
          {isLoading ? (
            <p className="p-8 text-sm text-muted-foreground">
              <Loader2 className="inline h-4 w-4 animate-spin" /> {t("weeklyReports.loading")}
            </p>
          ) : reports.length === 0 ? (
            <p className="p-8 text-sm text-muted-foreground">{t("weeklyReports.list.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("weeklyReports.table.location")}</TableHead>
                  <TableHead>{t("weeklyReports.table.status")}</TableHead>
                  <TableHead>{t("weeklyReports.table.priority")}</TableHead>
                  <TableHead className="text-end">{t("weeklyReports.table.revenue")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow
                    key={r.id}
                    className={cn("cursor-pointer", selectedId === r.id && "bg-muted/40")}
                    onClick={() => selectReport(r.id)}
                  >
                    <TableCell>{r.locations?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-normal", RAG_CLASS[statusRag(r.status)])}>
                        {WEEKLY_REPORT_STATUS_LABELS[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {REPORT_PRIORITY_LABELS[r.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      {r.revenue != null ? `QAR ${Number(r.revenue).toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant={selectedId === r.id ? "secondary" : "ghost"}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectReport(r.id);
                        }}
                      >
                        {t("weeklyReports.review.select")}
                      </Button>
                      <Button variant="link" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                        <Link href={`/operations/weekly-reports/${r.id}`}>{t("weeklyReports.view")}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </WeeklyReportsLayout>
  );
}
