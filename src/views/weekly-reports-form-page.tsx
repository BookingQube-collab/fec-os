"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { WeeklyReportsLayout } from "@/components/weekly-reports/WeeklyReportsLayout";
import { WeeklyReportForm } from "@/components/weekly-reports/weekly-report-form";
import { Button } from "@/components/ui/button";
import { useWeeklyReport } from "@/hooks/queries/useWeeklyReports";
import { useAuth } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { useAppStore } from "@/stores/app-store";
import { saveWeeklyReportDraft, submitWeeklyReport } from "@/lib/weekly-reports.functions";
import { EDITABLE_STATUSES, weekStartMonday } from "@/lib/weekly-reports/constants";
import type { FormSectionKey, WeeklyReportFormState } from "@/lib/weekly-reports/form-sections";
import { queryKeys } from "@/lib/query-keys";

const emptyForm = (): WeeklyReportFormState => ({
  location_id: "",
  reporting_week_start: weekStartMonday(),
  submitted_by_name: "",
  revenue: "",
  footfall: "",
  staff_scheduled: "0",
  staff_present: "0",
  absentees_late: "",
  customer_complaints: "0",
  positive_feedback: "",
  incidents_count: "0",
  incidents_detail: "",
  maintenance_issues: "",
  maintenance_open: "0",
  maintenance_closed: "0",
  compliance_updates: "",
  compliance_score: "",
  inventory_issues: "",
  cashier_pos_issues: "",
  marketing_events: "",
  top_achievements: "",
  top_challenges: "",
  support_required: "",
  next_week_action_plan: "",
  critical_issues: "",
  priority: "medium",
});

export default function WeeklyReportsFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === "new";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  const canSubmit = usePermission("weekly_reports.submit");
  const storeLocationId = useAppStore((s) => s.currentLocationId);
  const { data: existing, isLoading } = useWeeklyReport(isNew ? null : id);

  const [form, setForm] = useState<WeeklyReportFormState>(emptyForm);
  const [openSection, setOpenSection] = useState<FormSectionKey | null>("weekLocation");
  const [savedReportId, setSavedReportId] = useState<string | undefined>();

  const defaultSubmitter =
    profile?.display_name ?? user?.email?.split("@")[0] ?? "";

  useEffect(() => {
    if (isNew) {
      setForm((f) => ({
        ...f,
        location_id: searchParams.get("locationId") ?? storeLocationId ?? f.location_id,
        reporting_week_start: searchParams.get("weekStart") ?? f.reporting_week_start,
        submitted_by_name: f.submitted_by_name || defaultSubmitter,
      }));
      return;
    }
    if (!existing) return;
    setForm({
      location_id: existing.location_id,
      reporting_week_start: existing.reporting_week_start,
      submitted_by_name: existing.submitted_by_name ?? "",
      revenue: existing.revenue != null ? String(existing.revenue) : "",
      footfall: existing.footfall != null ? String(existing.footfall) : "",
      staff_scheduled: String(existing.staff_scheduled),
      staff_present: String(existing.staff_present),
      absentees_late: existing.absentees_late ?? "",
      customer_complaints: String(existing.customer_complaints),
      positive_feedback: existing.positive_feedback ?? "",
      incidents_count: String(existing.incidents_count),
      incidents_detail: existing.incidents_detail ?? "",
      maintenance_issues: existing.maintenance_issues ?? "",
      maintenance_open: String(existing.maintenance_open),
      maintenance_closed: String(existing.maintenance_closed),
      compliance_updates: existing.compliance_updates ?? "",
      compliance_score: existing.compliance_score != null ? String(existing.compliance_score) : "",
      inventory_issues: existing.inventory_issues ?? "",
      cashier_pos_issues: existing.cashier_pos_issues ?? "",
      marketing_events: existing.marketing_events ?? "",
      top_achievements: existing.top_achievements ?? "",
      top_challenges: existing.top_challenges ?? "",
      support_required: existing.support_required ?? "",
      next_week_action_plan: existing.next_week_action_plan ?? "",
      critical_issues: existing.critical_issues ?? "",
      priority: existing.priority,
    });
  }, [existing, isNew, searchParams, storeLocationId, defaultSubmitter]);

  const readOnly =
    !canSubmit || Boolean(existing && !EDITABLE_STATUSES.includes(existing.status));

  const payload = () => ({
    id: isNew ? savedReportId : id,
    location_id: form.location_id,
    reporting_week_start: form.reporting_week_start,
    submitted_by_name: form.submitted_by_name || undefined,
    revenue: form.revenue ? Number(form.revenue) : null,
    footfall: form.footfall ? Number(form.footfall) : null,
    staff_scheduled: Number(form.staff_scheduled) || 0,
    staff_present: Number(form.staff_present) || 0,
    absentees_late: form.absentees_late || null,
    customer_complaints: Number(form.customer_complaints) || 0,
    positive_feedback: form.positive_feedback || null,
    incidents_count: Number(form.incidents_count) || 0,
    incidents_detail: form.incidents_detail || null,
    maintenance_issues: form.maintenance_issues || null,
    maintenance_open: Number(form.maintenance_open) || 0,
    maintenance_closed: Number(form.maintenance_closed) || 0,
    compliance_updates: form.compliance_updates || null,
    compliance_score: form.compliance_score ? Number(form.compliance_score) : null,
    inventory_issues: form.inventory_issues || null,
    cashier_pos_issues: form.cashier_pos_issues || null,
    marketing_events: form.marketing_events || null,
    top_achievements: form.top_achievements || null,
    top_challenges: form.top_challenges || null,
    support_required: form.support_required || null,
    next_week_action_plan: form.next_week_action_plan || null,
    critical_issues: form.critical_issues || null,
    priority: form.priority,
  });

  async function runAction<T>(action: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>) {
    const result = await action();
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }

  const saveMut = useMutation({
    mutationFn: () => runAction(() => saveWeeklyReportDraft(payload())),
    onSuccess: (row) => {
      toast.success(t("weeklyReports.form.saved"));
      setSavedReportId(row.id);
      void qc.invalidateQueries({ queryKey: queryKeys.weeklyReports.all });
      if (isNew) {
        router.replace(`/operations/weekly-reports/${row.id}`, { scroll: false });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitMut = useMutation({
    mutationFn: () => runAction(() => submitWeeklyReport(payload())),
    onSuccess: () => {
      toast.success(t("weeklyReports.form.submitted"));
      void qc.invalidateQueries({ queryKey: queryKeys.weeklyReports.all });
      router.push("/operations/weekly-reports");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isNew && isLoading) {
    return (
      <WeeklyReportsLayout>
        <div className="flex items-center gap-2 p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("weeklyReports.loading")}
        </div>
      </WeeklyReportsLayout>
    );
  }

  const effectiveReportId = savedReportId ?? (isNew ? undefined : id);
  const attachments =
    existing?.attachments?.map((a) => ({
      id: String((a as { id: string }).id),
      file_name: String((a as { file_name: string }).file_name),
    })) ?? [];

  return (
    <WeeklyReportsLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#0B1F3A]">
            {isNew ? t("weeklyReports.form.newTitle") : t("weeklyReports.form.editTitle")}
          </h2>
          {readOnly && (
            <p className="mt-1 text-sm text-amber-700">
              {!canSubmit ? t("weeklyReports.noAccess") : t("weeklyReports.form.readOnly")}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/operations/weekly-reports">{t("weeklyReports.back")}</Link>
        </Button>
      </div>

      <div className="mt-4">
        <WeeklyReportForm
          form={form}
          setForm={setForm}
          openSection={openSection}
          setOpenSection={setOpenSection}
          readOnly={readOnly}
          reportId={effectiveReportId}
          attachments={attachments}
          onQuickFill={() => toast.info(t("weeklyReports.form.quickFillApplied"))}
          onSaveDraft={() => saveMut.mutate()}
          onSubmit={() => submitMut.mutate()}
          saving={saveMut.isPending}
          submitting={submitMut.isPending}
        />
      </div>
    </WeeklyReportsLayout>
  );
}
