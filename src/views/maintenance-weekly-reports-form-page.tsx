"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MaintenanceWeeklyReportsLayout } from "@/components/maintenance-weekly-reports/MaintenanceWeeklyReportsLayout";
import { MaintenanceKpiSnapshotView } from "@/components/maintenance-weekly-reports/maintenance-kpi-snapshot";
import { MaintenanceWeeklyReportAttachments } from "@/components/maintenance-weekly-reports/maintenance-weekly-report-attachments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMaintenanceWeeklyReportSubmission } from "@/hooks/queries/useMaintenanceWeeklyReports";
import { useSites } from "@/hooks/queries/useSites";
import { useAuth } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import {
  EDITABLE_STATUSES,
  MAINTENANCE_REPORT_TEAMS,
  MAINTENANCE_TEAM_LABELS,
  REPORT_PRIORITIES,
  WEEKLY_REPORT_STATUS_LABELS,
  weekStartMonday,
  type MaintenanceReportTeam,
} from "@/lib/maintenance-weekly-reports/constants";
import {
  aiAutoFillMaintenanceWeeklyReport,
  refreshMaintenanceReportKpis,
  saveMaintenanceWeeklyReportDraft,
  submitMaintenanceWeeklyReport,
} from "@/lib/maintenance-weekly-reports.functions";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";

interface FormState {
  team: MaintenanceReportTeam;
  location_id: string;
  reporting_week_start: string;
  submitted_by_name: string;
  top_achievements: string;
  top_challenges: string;
  support_required: string;
  next_week_action_plan: string;
  critical_issues: string;
  operational_notes: string;
  priority: string;
}

const emptyForm = (locationId = ""): FormState => ({
  team: "maintenance",
  location_id: locationId,
  reporting_week_start: weekStartMonday(),
  submitted_by_name: "",
  top_achievements: "",
  top_challenges: "",
  support_required: "",
  next_week_action_plan: "",
  critical_issues: "",
  operational_notes: "",
  priority: "medium",
});

export default function MaintenanceWeeklyReportsFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === "new";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  const { data: sites = [] } = useSites();
  const currentLocationId = useAppStore((s) => s.currentLocationId);
  const canSubmitMaintenance = usePermission("maintenance.weekly_report.submit");
  const canSubmitLogistics = usePermission("maintenance.logistics_submit");
  const { data: existing, isLoading } = useMaintenanceWeeklyReportSubmission(isNew ? null : id);

  const [form, setForm] = useState<FormState>(emptyForm());
  const [kpiSnapshot, setKpiSnapshot] = useState<Record<string, unknown>>({});
  const [savedReportId, setSavedReportId] = useState<string | undefined>();

  const defaultSubmitter = profile?.display_name ?? user?.email?.split("@")[0] ?? "";
  const reportId = savedReportId ?? (isNew ? undefined : id);
  const editable = isNew || (existing ? EDITABLE_STATUSES.includes(existing.status) : false);

  const availableTeams = useMemo(
    () =>
      MAINTENANCE_REPORT_TEAMS.filter((tm) =>
        tm === "maintenance" ? canSubmitMaintenance : canSubmitLogistics,
      ),
    [canSubmitMaintenance, canSubmitLogistics],
  );

  const teamParam = searchParams.get("team");
  const weekStartParam = searchParams.get("weekStart");
  const locationParam = searchParams.get("locationId");

  const defaultLocationId = useMemo(() => {
    if (locationParam && sites.some((s) => s.id === locationParam)) return locationParam;
    if (currentLocationId && sites.some((s) => s.id === currentLocationId)) return currentLocationId;
    return sites[0]?.id ?? "";
  }, [locationParam, currentLocationId, sites]);

  useEffect(() => {
    if (isNew) {
      const teamFromUrl = teamParam as MaintenanceReportTeam | null;
      const defaultTeam =
        teamFromUrl && availableTeams.includes(teamFromUrl)
          ? teamFromUrl
          : (availableTeams[0] ?? "maintenance");
      setForm((f) => {
        const nextWeekStart = weekStartParam ?? f.reporting_week_start;
        const nextSubmitter = f.submitted_by_name || defaultSubmitter;
        const nextLocation = f.location_id || defaultLocationId;
        if (
          f.team === defaultTeam &&
          f.reporting_week_start === nextWeekStart &&
          f.submitted_by_name === nextSubmitter &&
          f.location_id === nextLocation
        ) {
          return f;
        }
        return {
          ...f,
          team: defaultTeam,
          location_id: nextLocation,
          reporting_week_start: nextWeekStart,
          submitted_by_name: nextSubmitter,
        };
      });
      return;
    }
    if (!existing) return;
    setForm({
      team: existing.team,
      location_id: existing.location_id,
      reporting_week_start: existing.reporting_week_start,
      submitted_by_name: existing.submitted_by_name ?? "",
      top_achievements: existing.top_achievements ?? "",
      top_challenges: existing.top_challenges ?? "",
      support_required: existing.support_required ?? "",
      next_week_action_plan: existing.next_week_action_plan ?? "",
      critical_issues: existing.critical_issues ?? "",
      operational_notes: existing.operational_notes ?? "",
      priority: existing.priority,
    });
    setKpiSnapshot(existing.kpi_snapshot ?? {});
    setSavedReportId(existing.id);
  }, [isNew, existing, teamParam, weekStartParam, defaultSubmitter, availableTeams, defaultLocationId]);

  const refreshKpisMut = useMutation({
    mutationFn: () => {
      if (!form.location_id) throw new Error(t("maintenanceWeeklyReports.form.selectLocation"));
      return refreshMaintenanceReportKpis({
        team: form.team,
        location_id: form.location_id,
        reporting_week_start: form.reporting_week_start,
      });
    },
    onSuccess: (data) => {
      setKpiSnapshot(data as Record<string, unknown>);
      toast.success(t("maintenanceWeeklyReports.form.kpisRefreshed"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const aiFillMut = useMutation({
    mutationFn: () => {
      if (!form.location_id) throw new Error(t("maintenanceWeeklyReports.form.selectLocation"));
      return aiAutoFillMaintenanceWeeklyReport({
        team: form.team,
        location_id: form.location_id,
        reporting_week_start: form.reporting_week_start,
        submitted_by_name: form.submitted_by_name || undefined,
        kpi_snapshot: Object.keys(kpiSnapshot).length > 0 ? kpiSnapshot : undefined,
      });
    },
    onSuccess: (result) => {
      setForm((f) => ({
        ...f,
        ...result.fields,
      }));
      toast.success(
        result.ai_generated
          ? t("maintenanceWeeklyReports.form.aiFilled")
          : t("maintenanceWeeklyReports.form.aiFilledFallback"),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function runAction<T>(action: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>) {
    const result = await action();
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }

  const saveMut = useMutation({
    mutationFn: (submit: boolean) => {
      if (!form.location_id) throw new Error(t("maintenanceWeeklyReports.form.selectLocation"));
      const payload = {
        id: reportId,
        ...form,
        priority: form.priority as "critical" | "high" | "medium" | "low",
        refresh_kpis: Object.keys(kpiSnapshot).length === 0,
      };
      return runAction(() =>
        submit ? submitMaintenanceWeeklyReport(payload) : saveMaintenanceWeeklyReportDraft(payload),
      );
    },
    onSuccess: (row, submit) => {
      setSavedReportId(row.id);
      toast.success(submit ? t("maintenanceWeeklyReports.form.submitted") : t("maintenanceWeeklyReports.form.saved"));
      void qc.invalidateQueries({ queryKey: queryKeys.maintenance.weeklyReports.all });
      if (submit) router.push(`/maintenance/weekly-report/${row.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading && !isNew) {
    return (
      <MaintenanceWeeklyReportsLayout>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("maintenanceWeeklyReports.loading")}
        </div>
      </MaintenanceWeeklyReportsLayout>
    );
  }

  const locationLabel = existing?.locations
    ? `${existing.locations.name} (${existing.locations.code})`
    : sites.find((s) => s.id === form.location_id)?.name;

  return (
    <MaintenanceWeeklyReportsLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#0B1F3A]">
            {isNew ? t("maintenanceWeeklyReports.form.newTitle") : t("maintenanceWeeklyReports.form.editTitle")}
          </h2>
          {existing && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{WEEKLY_REPORT_STATUS_LABELS[existing.status]}</Badge>
              {existing.locations && (
                <Badge variant="outline">
                  {existing.locations.code} — {existing.locations.name}
                </Badge>
              )}
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/maintenance/weekly-report">← {t("maintenanceWeeklyReports.nav.reports")}</Link>
        </Button>
      </div>

      {!editable && existing && (
        <p className="mt-3 text-sm text-amber-700">{t("maintenanceWeeklyReports.form.readOnly")}</p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("maintenanceWeeklyReports.filters.team")}</Label>
              <Select
                value={form.team}
                disabled={!isNew || !editable}
                onValueChange={(v) => setForm((f) => ({ ...f, team: v as MaintenanceReportTeam }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTeams.map((tm) => (
                    <SelectItem key={tm} value={tm}>
                      {MAINTENANCE_TEAM_LABELS[tm]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("maintenanceWeeklyReports.filters.week")}</Label>
              <input
                type="date"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                disabled={!editable}
                value={form.reporting_week_start}
                onChange={(e) => setForm((f) => ({ ...f, reporting_week_start: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("maintenanceWeeklyReports.filters.location")}</Label>
            <Select
              value={form.location_id}
              disabled={!isNew || !editable || sites.length === 0}
              onValueChange={(v) => {
                setForm((f) => ({ ...f, location_id: v }));
                setKpiSnapshot({});
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("maintenanceWeeklyReports.form.selectLocation")} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.code} — {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isNew && locationLabel && (
              <p className="text-xs text-muted-foreground">{locationLabel}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{t("maintenanceWeeklyReports.form.submittedBy")}</Label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              disabled={!editable}
              value={form.submitted_by_name}
              onChange={(e) => setForm((f) => ({ ...f, submitted_by_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("maintenanceWeeklyReports.table.priority")}</Label>
            <Select
              value={form.priority}
              disabled={!editable}
              onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}
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

        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{t("maintenanceWeeklyReports.kpi.autoTitle")}</h3>
            {editable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshKpisMut.mutate()}
                disabled={refreshKpisMut.isPending || !form.location_id}
              >
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshKpisMut.isPending ? "animate-spin" : ""}`} />
                {t("maintenanceWeeklyReports.form.refreshKpis")}
              </Button>
            )}
          </div>
          {Object.keys(kpiSnapshot).length > 0 ? (
            <MaintenanceKpiSnapshotView team={form.team} snapshot={kpiSnapshot} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("maintenanceWeeklyReports.kpi.empty")}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("maintenanceWeeklyReports.form.narrativeSection")}</h3>
        {editable && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => aiFillMut.mutate()}
            disabled={aiFillMut.isPending || !form.location_id}
          >
            {aiFillMut.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            {t("maintenanceWeeklyReports.form.aiAutoFill")}
          </Button>
        )}
      </div>

      <div className="mt-2 grid gap-4">
        {(
          [
            ["top_achievements", t("maintenanceWeeklyReports.form.achievements")],
            ["top_challenges", t("maintenanceWeeklyReports.form.challenges")],
            ["critical_issues", t("maintenanceWeeklyReports.form.criticalIssues")],
            ["support_required", t("maintenanceWeeklyReports.form.supportRequired")],
            ["next_week_action_plan", t("maintenanceWeeklyReports.form.actionPlan")],
            ["operational_notes", t("maintenanceWeeklyReports.form.operationalNotes")],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-1.5">
            <Label>{label}</Label>
            <Textarea
              value={form[key]}
              disabled={!editable}
              rows={3}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {(editable || reportId) && (
        <div className="mt-4 rounded-lg border bg-card p-4">
          <MaintenanceWeeklyReportAttachments
            reportId={reportId}
            editable={editable}
            attachments={(existing?.attachments ?? []) as {
              id: string;
              file_name: string;
              mime_type?: string;
              content_base64?: string | null;
            }[]}
          />
        </div>
      )}

      {editable && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => saveMut.mutate(false)} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("maintenanceWeeklyReports.form.saveDraft")}
          </Button>
          <Button onClick={() => saveMut.mutate(true)} disabled={saveMut.isPending}>
            {t("maintenanceWeeklyReports.form.submit")}
          </Button>
        </div>
      )}

      {existing?.review_remarks && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-medium">{t("maintenanceWeeklyReports.review.remarksLabel")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{existing.review_remarks}</p>
        </div>
      )}
    </MaintenanceWeeklyReportsLayout>
  );
}
