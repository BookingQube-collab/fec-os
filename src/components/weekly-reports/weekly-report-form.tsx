"use client";

import { Loader2, Save, Send, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { WeeklyReportAttachments } from "@/components/weekly-reports/weekly-report-attachments";
import { WeeklyReportFormSection } from "@/components/weekly-reports/weekly-report-form-section";
import { WeeklyReportNumericField } from "@/components/weekly-reports/weekly-report-numeric-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSites } from "@/hooks/queries/useSites";
import {
  applyQuickFill,
  attendancePct,
  completedSectionCount,
  FORM_SECTION_KEYS,
  isSectionComplete,
  type FormSectionKey,
  type WeeklyReportFormState,
} from "@/lib/weekly-reports/form-sections";
import { formatWeekLabel, REPORT_PRIORITIES, type ReportPriority } from "@/lib/weekly-reports/constants";
import { cn } from "@/lib/utils";

interface WeeklyReportFormProps {
  form: WeeklyReportFormState;
  setForm: React.Dispatch<React.SetStateAction<WeeklyReportFormState>>;
  openSection: FormSectionKey | null;
  setOpenSection: (key: FormSectionKey | null) => void;
  readOnly?: boolean;
  reportId?: string;
  attachments?: Array<{ id: string; file_name: string }>;
  onQuickFill?: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  saving?: boolean;
  submitting?: boolean;
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-[#334155]">{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder}
        className="resize-y min-h-[72px]"
      />
    </div>
  );
}

export function WeeklyReportForm({
  form,
  setForm,
  openSection,
  setOpenSection,
  readOnly,
  reportId,
  attachments,
  onQuickFill,
  onSaveDraft,
  onSubmit,
  saving,
  submitting,
}: WeeklyReportFormProps) {
  const { t } = useTranslation();
  const { data: sites } = useSites();
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);

  useEffect(() => {
    if (reportId) setAttachmentsOpen(true);
  }, [reportId]);

  const completed = completedSectionCount(form);
  const total = FORM_SECTION_KEYS.length;
  const progressPct = Math.round((completed / total) * 100);
  const attendance = attendancePct(form.staff_scheduled, form.staff_present);

  const patch = <K extends keyof WeeklyReportFormState>(key: K, value: WeeklyReportFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const sectionTitle = (key: FormSectionKey) => t(`weeklyReports.formSections.${key}`);

  const handleQuickFill = () => {
    setForm((f) => applyQuickFill(f));
    onQuickFill?.();
  };

  return (
    <div className="space-y-4 pb-24 md:pb-4">
      <NeumorphicCard className="p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#0B1F3A]">
              {t("weeklyReports.form.progress", { completed, total })}
            </p>
            <p className="text-xs text-[#64748B]">
              {form.reporting_week_start ? formatWeekLabel(form.reporting_week_start) : t("weeklyReports.weekStart")}
            </p>
          </div>
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" onClick={handleQuickFill}>
              <Sparkles className="mr-2 h-4 w-4" />
              {t("weeklyReports.form.quickFill")}
            </Button>
          )}
        </div>
        <Progress value={progressPct} className="mt-3 h-2" />
      </NeumorphicCard>

      <WeeklyReportFormSection
        title={sectionTitle("weekLocation")}
        subtitle={t("weeklyReports.formSections.weekLocationHint")}
        open={openSection === "weekLocation"}
        onOpenChange={(o) => setOpenSection(o ? "weekLocation" : null)}
        complete={isSectionComplete("weekLocation", form)}
        accent="blue"
      >
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-sm text-[#334155]">{t("weeklyReports.filters.location")}</Label>
            <Select
              value={form.location_id}
              onValueChange={(v) => patch("location_id", v)}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("weeklyReports.form.selectLocation")} />
              </SelectTrigger>
              <SelectContent>
                {(sites ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-[#334155]">{t("weeklyReports.weekStart")}</Label>
            <Input
              type="date"
              value={form.reporting_week_start}
              onChange={(e) => patch("reporting_week_start", e.target.value)}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-[#334155]">{t("weeklyReports.form.submittedBy")}</Label>
            <Input
              value={form.submitted_by_name}
              onChange={(e) => patch("submitted_by_name", e.target.value)}
              disabled={readOnly}
              placeholder={t("weeklyReports.form.submittedByPlaceholder")}
            />
          </div>
        </div>
      </WeeklyReportFormSection>

      <WeeklyReportFormSection
        title={sectionTitle("kpiSnapshot")}
        subtitle={t("weeklyReports.formSections.kpiSnapshotHint")}
        open={openSection === "kpiSnapshot"}
        onOpenChange={(o) => setOpenSection(o ? "kpiSnapshot" : null)}
        complete={isSectionComplete("kpiSnapshot", form)}
        accent="cyan"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-sm text-[#334155]">{t("weeklyReports.table.revenue")}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.revenue}
              onChange={(e) => patch("revenue", e.target.value)}
              disabled={readOnly}
              placeholder="0"
              className="tabular-nums"
            />
          </div>
          <WeeklyReportNumericField
            label={t("weeklyReports.table.footfall")}
            value={form.footfall}
            onChange={(v) => patch("footfall", v)}
            disabled={readOnly}
          />
          <WeeklyReportNumericField
            label={t("weeklyReports.form.staffScheduled")}
            value={form.staff_scheduled}
            onChange={(v) => patch("staff_scheduled", v)}
            disabled={readOnly}
          />
          <WeeklyReportNumericField
            label={t("weeklyReports.form.staffPresent")}
            value={form.staff_present}
            onChange={(v) => patch("staff_present", v)}
            disabled={readOnly}
          />
          <div className="space-y-1.5">
            <Label className="text-sm text-[#334155]">{t("weeklyReports.fields.attendance")}</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums text-[#334155]">
              {attendance != null ? `${attendance}%` : "—"}
            </div>
            <p className="text-xs text-muted-foreground">{t("weeklyReports.form.attendanceAuto")}</p>
          </div>
          <WeeklyReportNumericField
            label={t("weeklyReports.table.complaints")}
            value={form.customer_complaints}
            onChange={(v) => patch("customer_complaints", v)}
            disabled={readOnly}
          />
          <WeeklyReportNumericField
            label={t("weeklyReports.form.incidents")}
            value={form.incidents_count}
            onChange={(v) => patch("incidents_count", v)}
            disabled={readOnly}
          />
          <WeeklyReportNumericField
            label={t("weeklyReports.maintenance.open")}
            value={form.maintenance_open}
            onChange={(v) => patch("maintenance_open", v)}
            disabled={readOnly}
          />
          <WeeklyReportNumericField
            label={t("weeklyReports.maintenance.closed")}
            value={form.maintenance_closed}
            onChange={(v) => patch("maintenance_closed", v)}
            disabled={readOnly}
          />
          <div className="space-y-1.5">
            <Label className="text-sm text-[#334155]">{t("weeklyReports.form.complianceScore")}</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.compliance_score}
              onChange={(e) => patch("compliance_score", e.target.value)}
              disabled={readOnly}
              placeholder="0–100"
              className="tabular-nums"
            />
          </div>
        </div>
      </WeeklyReportFormSection>

      <WeeklyReportFormSection
        title={sectionTitle("operations")}
        subtitle={t("weeklyReports.formSections.operationsHint")}
        open={openSection === "operations"}
        onOpenChange={(o) => setOpenSection(o ? "operations" : null)}
        complete={isSectionComplete("operations", form)}
        accent="purple"
      >
        <div className="grid gap-4 sm:grid-cols-1">
          <TextField
            label={t("weeklyReports.form.maintenanceIssues")}
            value={form.maintenance_issues}
            onChange={(v) => patch("maintenance_issues", v)}
            disabled={readOnly}
            placeholder={t("weeklyReports.formHints.maintenanceIssues")}
          />
          <TextField
            label={t("weeklyReports.form.complianceUpdates")}
            value={form.compliance_updates}
            onChange={(v) => patch("compliance_updates", v)}
            disabled={readOnly}
            placeholder={t("weeklyReports.formHints.complianceUpdates")}
          />
          <TextField
            label={t("weeklyReports.form.inventoryIssues")}
            value={form.inventory_issues}
            onChange={(v) => patch("inventory_issues", v)}
            disabled={readOnly}
            placeholder={t("weeklyReports.formHints.inventoryIssues")}
          />
          <TextField
            label={t("weeklyReports.form.posIssues")}
            value={form.cashier_pos_issues}
            onChange={(v) => patch("cashier_pos_issues", v)}
            disabled={readOnly}
            placeholder={t("weeklyReports.formHints.posIssues")}
          />
          <TextField
            label={t("weeklyReports.form.marketingEvents")}
            value={form.marketing_events}
            onChange={(v) => patch("marketing_events", v)}
            disabled={readOnly}
            placeholder={t("weeklyReports.formHints.marketingEvents")}
          />
        </div>
      </WeeklyReportFormSection>

      <WeeklyReportFormSection
        title={sectionTitle("peopleCustomer")}
        subtitle={t("weeklyReports.formSections.peopleCustomerHint")}
        open={openSection === "peopleCustomer"}
        onOpenChange={(o) => setOpenSection(o ? "peopleCustomer" : null)}
        complete={isSectionComplete("peopleCustomer", form)}
        accent="green"
      >
        <div className="grid gap-4 sm:grid-cols-1">
          <TextField
            label={t("weeklyReports.form.absentees")}
            value={form.absentees_late}
            onChange={(v) => patch("absentees_late", v)}
            disabled={readOnly}
            placeholder={t("weeklyReports.formHints.absentees")}
          />
          <TextField
            label={t("weeklyReports.form.positiveFeedback")}
            value={form.positive_feedback}
            onChange={(v) => patch("positive_feedback", v)}
            disabled={readOnly}
            placeholder={t("weeklyReports.formHints.positiveFeedback")}
          />
          <TextField
            label={t("weeklyReports.form.incidentsDetail")}
            value={form.incidents_detail}
            onChange={(v) => patch("incidents_detail", v)}
            disabled={readOnly}
            placeholder={t("weeklyReports.formHints.incidentsDetail")}
          />
        </div>
      </WeeklyReportFormSection>

      <WeeklyReportFormSection
        title={sectionTitle("highlights")}
        subtitle={t("weeklyReports.formSections.highlightsHint")}
        open={openSection === "highlights"}
        onOpenChange={(o) => setOpenSection(o ? "highlights" : null)}
        complete={isSectionComplete("highlights", form)}
        accent="amber"
      >
        <div className="grid gap-4 sm:grid-cols-1">
          <TextField
            label={t("weeklyReports.sections.topAchievements")}
            value={form.top_achievements}
            onChange={(v) => patch("top_achievements", v)}
            disabled={readOnly}
            placeholder={t("weeklyReports.formHints.topAchievements")}
          />
          <TextField
            label={t("weeklyReports.form.challenges")}
            value={form.top_challenges}
            onChange={(v) => patch("top_challenges", v)}
            disabled={readOnly}
            placeholder={t("weeklyReports.formHints.topChallenges")}
          />
          <TextField
            label={t("weeklyReports.form.supportRequired")}
            value={form.support_required}
            onChange={(v) => patch("support_required", v)}
            disabled={readOnly}
            placeholder={t("weeklyReports.formHints.supportRequired")}
          />
          <TextField
            label={t("weeklyReports.fields.criticalIssues")}
            value={form.critical_issues}
            onChange={(v) => patch("critical_issues", v)}
            disabled={readOnly}
            placeholder={t("weeklyReports.formHints.criticalIssues")}
          />
        </div>
      </WeeklyReportFormSection>

      <WeeklyReportFormSection
        title={sectionTitle("nextWeek")}
        subtitle={t("weeklyReports.formSections.nextWeekHint")}
        open={openSection === "nextWeek"}
        onOpenChange={(o) => setOpenSection(o ? "nextWeek" : null)}
        complete={isSectionComplete("nextWeek", form)}
        accent="red"
      >
        <div className="grid gap-4 sm:grid-cols-1">
          <TextField
            label={t("weeklyReports.sections.nextWeekPriorities")}
            value={form.next_week_action_plan}
            onChange={(v) => patch("next_week_action_plan", v)}
            disabled={readOnly}
            rows={4}
            placeholder={t("weeklyReports.formHints.nextWeekActionPlan")}
          />
          <div className="space-y-1.5">
            <Label className="text-sm text-[#334155]">{t("weeklyReports.table.priority")}</Label>
            <Select
              value={form.priority}
              onValueChange={(v) => patch("priority", v as ReportPriority)}
              disabled={readOnly}
            >
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
        </div>
      </WeeklyReportFormSection>

      {reportId ? (
        <WeeklyReportFormSection
          title={t("weeklyReports.formSections.attachments")}
          subtitle={t("weeklyReports.formSections.attachmentsHint")}
          open={attachmentsOpen}
          onOpenChange={setAttachmentsOpen}
          accent="none"
        >
          <WeeklyReportAttachments reportId={reportId} attachments={attachments} disabled={readOnly} />
        </WeeklyReportFormSection>
      ) : !readOnly ? (
        <WeeklyReportFormSection
          title={t("weeklyReports.formSections.attachments")}
          subtitle={t("weeklyReports.formSections.attachmentsHint")}
          open={attachmentsOpen}
          onOpenChange={setAttachmentsOpen}
          accent="none"
        >
          <p className="text-sm text-muted-foreground">{t("weeklyReports.form.saveDraftForAttachments")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("weeklyReports.form.attachmentHint")}</p>
        </WeeklyReportFormSection>
      ) : null}

      {!readOnly && (
        <div
          className={cn(
            "flex flex-wrap gap-2",
            "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80",
            "md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none",
          )}
        >
          <Button
            variant="outline"
            onClick={onSaveDraft}
            disabled={saving || submitting || !form.location_id}
            className="flex-1 md:flex-none"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t("weeklyReports.form.saveDraft")}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={saving || submitting || !form.location_id}
            className="flex-1 md:flex-none"
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {t("weeklyReports.form.submit")}
          </Button>
        </div>
      )}
    </div>
  );
}
