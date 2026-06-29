"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Flag, Loader2, MessageSquarePlus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MaintenanceWeeklyReportsLayout } from "@/components/maintenance-weekly-reports/MaintenanceWeeklyReportsLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMaintenanceWeeklyReports } from "@/hooks/queries/useMaintenanceWeeklyReports";
import { usePermission } from "@/hooks/use-permission";
import {
  addMaintenanceReportComment,
  reviewMaintenanceWeeklyReport,
} from "@/lib/maintenance-weekly-reports.functions";
import {
  formatWeekLabel,
  MAINTENANCE_TEAM_LABELS,
  REPORT_PRIORITIES,
  statusRag,
  WEEKLY_REPORT_STATUS_LABELS,
  weekStartMonday,
} from "@/lib/maintenance-weekly-reports/constants";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const RAG_CLASS = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
  gray: "bg-slate-100 text-slate-700",
};

export default function MaintenanceWeeklyReportsReviewPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canReview = usePermission("maintenance.weekly_report.review");
  const [weekStart, setWeekStart] = useState(weekStartMonday());
  const [remarks, setRemarks] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = useMemo(() => ({ weekStart, team: null, status: null }), [weekStart]);
  const { data: reports = [], isLoading } = useMaintenanceWeeklyReports(filters);

  const reviewMut = useMutation({
    mutationFn: (action: "approve" | "send_back" | "mark_reviewed" | "flag_missing") =>
      reviewMaintenanceWeeklyReport({
        id: selectedId!,
        action,
        remarks: remarks || undefined,
        priority: priority as "critical" | "high" | "medium" | "low",
        missing_info_flag: action === "flag_missing",
      }),
    onSuccess: () => {
      toast.success(t("maintenanceWeeklyReports.review.saved"));
      setRemarks("");
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.weeklyReports.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remarksMut = useMutation({
    mutationFn: () =>
      addMaintenanceReportComment({
        maintenance_weekly_report_id: selectedId!,
        comment_text: remarks,
        priority: priority as "critical" | "high" | "medium" | "low",
        is_internal: true,
      }),
    onSuccess: () => {
      toast.success(t("maintenanceWeeklyReports.review.remarksSaved"));
      setRemarks("");
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.weeklyReports.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = reports.find((r) => r.id === selectedId);

  useEffect(() => {
    if (!selected) return;
    setPriority(selected.priority);
    setRemarks(selected.review_remarks ?? "");
  }, [selected]);

  const reviewPanel = (
    <div className="space-y-3 rounded-lg border bg-card p-4 lg:sticky lg:top-4">
      <h3 className="font-medium">{t("maintenanceWeeklyReports.review.panel")}</h3>
      {!canReview ? (
        <p className="text-sm text-muted-foreground">{t("maintenanceWeeklyReports.review.noAccess")}</p>
      ) : !selected ? (
        <p className="text-sm text-muted-foreground">{t("maintenanceWeeklyReports.review.selectHint")}</p>
      ) : (
        <>
          <p className="text-sm font-medium">
            {MAINTENANCE_TEAM_LABELS[selected.team]}
            {selected.locations ? ` — ${selected.locations.code}` : ""} — {formatWeekLabel(selected.reporting_week_start)}
          </p>
          {selected.missing_info_flag && (
            <p className="text-xs text-amber-700">{t("maintenanceWeeklyReports.review.missingFlag")}</p>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("maintenanceWeeklyReports.review.remarksLabel")}</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={t("maintenanceWeeklyReports.review.remarksPlaceholder")}
              rows={4}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("maintenanceWeeklyReports.table.priority")}</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => reviewMut.mutate("approve")} disabled={reviewMut.isPending}>
              <Check className="mr-1 h-3.5 w-3.5" />
              {t("maintenanceWeeklyReports.review.approve")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => reviewMut.mutate("mark_reviewed")} disabled={reviewMut.isPending}>
              {t("maintenanceWeeklyReports.review.markReviewed")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => reviewMut.mutate("send_back")} disabled={reviewMut.isPending}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              {t("maintenanceWeeklyReports.review.sendBack")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => reviewMut.mutate("flag_missing")} disabled={reviewMut.isPending}>
              <Flag className="mr-1 h-3.5 w-3.5" />
              {t("maintenanceWeeklyReports.review.flagMissing")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => remarksMut.mutate()} disabled={remarksMut.isPending || !remarks.trim()}>
              <MessageSquarePlus className="mr-1 h-3.5 w-3.5" />
              {t("maintenanceWeeklyReports.review.addRemarks")}
            </Button>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/maintenance/weekly-report/${selected.id}`}>{t("maintenanceWeeklyReports.view")}</Link>
          </Button>
        </>
      )}
    </div>
  );

  return (
    <MaintenanceWeeklyReportsLayout>
      <div>
        <h2 className="font-display text-xl font-semibold text-[#0B1F3A]">
          {t("maintenanceWeeklyReports.nav.review")}
        </h2>
        <p className="mt-1 text-sm text-[#64748B]">{t("maintenanceWeeklyReports.review.subtitle")}</p>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs text-muted-foreground">{t("maintenanceWeeklyReports.filters.week")}</label>
        <input
          type="date"
          className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("maintenanceWeeklyReports.loading")}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                  <TableRow>
                    <TableHead>{t("maintenanceWeeklyReports.table.team")}</TableHead>
                    <TableHead>{t("maintenanceWeeklyReports.table.location")}</TableHead>
                    <TableHead>{t("maintenanceWeeklyReports.table.status")}</TableHead>
                  <TableHead>{t("maintenanceWeeklyReports.table.priority")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id} className={selectedId === r.id ? "bg-muted/50" : undefined}>
                    <TableCell>{MAINTENANCE_TEAM_LABELS[r.team]}</TableCell>
                    <TableCell>{r.locations?.code ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={cn(RAG_CLASS[statusRag(r.status)])}>
                        {WEEKLY_REPORT_STATUS_LABELS[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{r.priority}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setSelectedId(r.id)}>
                        {t("maintenanceWeeklyReports.review.select")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {reviewPanel}
        </div>
      )}
    </MaintenanceWeeklyReportsLayout>
  );
}
