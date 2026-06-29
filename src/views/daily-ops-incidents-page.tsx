"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { DailyOpsPageShell } from "@/components/daily-ops/DailyOpsLayout";
import { useDailyOpsIncidents } from "@/hooks/queries/useDailyOps";
import { aiDraftIncidentReport, createDailyOpsIncident } from "@/lib/daily-ops.functions";
import {
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_ICONS,
  INCIDENT_TYPE_LABELS,
  INCIDENT_TYPE_SUGGESTED_SEVERITY,
  INCIDENT_TYPES,
  incidentTypeLabel,
  type IncidentType,
} from "@/lib/daily-ops/constants";
import {
  formatIncidentWhatsAppMessage,
  shareIncidentOnWhatsApp,
  type IncidentSharePayload,
} from "@/lib/daily-ops/incident-share";
import { useSites } from "@/hooks/queries/useSites";
import { useAuth } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

function severityBadgeVariant(severity: string): "destructive" | "secondary" | "outline" {
  if (severity === "critical" || severity === "high") return "destructive";
  return "secondary";
}

function IncidentTypeBadge({ category }: { category: string }) {
  const Icon = INCIDENT_TYPE_ICONS[category as IncidentType];
  const label = incidentTypeLabel(category);
  if (!Icon) {
    return <Badge variant="outline">{label}</Badge>;
  }
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <Icon className="h-3 w-3 shrink-0 opacity-70" />
      {label}
    </Badge>
  );
}

function DailyOpsIncidentsPage() {
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canManage = usePermission("daily_ops.manage");
  const { data, isLoading } = useDailyOpsIncidents(locationId);
  const { data: sites } = useSites();
  const qc = useQueryClient();

  const reporterName = profile?.display_name ?? user?.email?.split("@")[0] ?? "Staff";

  const now = new Date();
  const [activeTab, setActiveTab] = useState("list");
  const [submittedReport, setSubmittedReport] = useState<IncidentSharePayload | null>(null);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [form, setForm] = useState({
    location_id: locationId ?? "",
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    category: "other" as IncidentType,
    severity: "medium",
    summary: "",
    detail: "",
    action_taken: "",
  });

  const occurredAtIso = () => new Date(`${form.date}T${form.time}:00`).toISOString();
  const selectedSite = (sites ?? []).find((s) => s.id === (form.location_id || locationId));

  const aiDraftMut = useMutation({
    mutationFn: () =>
      aiDraftIncidentReport({
        category: form.category,
        severity: form.severity,
        location_id: form.location_id || locationId!,
        occurred_at: occurredAtIso(),
        partial_notes: form.summary.trim() || form.detail.trim() || undefined,
      }),
    onSuccess: (result) => {
      setForm((f) => ({
        ...f,
        summary: result.fields.description,
        action_taken: result.fields.action_taken,
      }));
      setAiGenerated(result.ai_generated);
      toast.success(
        result.ai_generated
          ? t("dailyOps.incidents.aiDrafted")
          : t("dailyOps.incidents.aiDraftedFallback"),
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const occurred_at = occurredAtIso();
      return createDailyOpsIncident({
        location_id: form.location_id || locationId!,
        occurred_at,
        category: form.category,
        severity: form.severity,
        summary: form.summary,
        detail: form.detail || null,
        action_taken: form.action_taken || null,
      });
    },
    onSuccess: (result) => {
      setSubmittedReport({
        reference: result.reference,
        location_code: result.location_code,
        location_name: result.location_name,
        occurred_at: result.occurred_at,
        category: result.category,
        severity: result.severity,
        summary: result.summary,
        action_taken: result.action_taken,
        reported_by_name: result.reported_by_name || reporterName,
      });
      void qc.invalidateQueries({ queryKey: ["dailyOps", "incidents"] });
      void qc.invalidateQueries({ queryKey: ["dailyOps", "kpis"] });
      setForm((f) => ({ ...f, summary: "", detail: "", action_taken: "" }));
      setAiGenerated(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function handleTypeChange(category: IncidentType) {
    setForm((f) => ({
      ...f,
      category,
      severity: INCIDENT_TYPE_SUGGESTED_SEVERITY[category] ?? f.severity,
    }));
  }

  async function handleShareWhatsApp() {
    if (!submittedReport) return;
    const message = formatIncidentWhatsAppMessage(submittedReport);
    try {
      const result = await shareIncidentOnWhatsApp(message);
      if (result === "copied") {
        toast.success(t("dailyOps.incidents.shareCopied"));
      } else {
        toast.success(t("dailyOps.incidents.shareOpened"));
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleCopyReport() {
    if (!submittedReport) return;
    const message = formatIncidentWhatsAppMessage(submittedReport);
    try {
      await navigator.clipboard.writeText(message);
      toast.success(t("dailyOps.incidents.shareCopied"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <DailyOpsPageShell title={t("dailyOps.incidents.title")} subtitle={t("dailyOps.incidents.subtitle")}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="list">{t("dailyOps.incidents.list")}</TabsTrigger>
          {canManage && <TabsTrigger value="new">{t("dailyOps.incidents.new")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="list" className="mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("dailyOps.loading")}</p>
          ) : !data?.length ? (
            <p className="text-sm text-muted-foreground">{t("dailyOps.incidents.empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dailyOps.incidents.when")}</TableHead>
                    <TableHead>{t("dailyOps.incidents.type")}</TableHead>
                    <TableHead>{t("dailyOps.incidents.severity")}</TableHead>
                    <TableHead>{t("dailyOps.incidents.description")}</TableHead>
                    <TableHead>{t("dailyOps.incidents.actionTaken")}</TableHead>
                    <TableHead>{t("dailyOps.incidents.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow key={String(row.id)}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(String(row.occurred_at)).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <IncidentTypeBadge category={String(row.category)} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={severityBadgeVariant(String(row.severity))}>
                          {String(row.severity)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{String(row.summary)}</TableCell>
                      <TableCell className="max-w-xs truncate">{String(row.action_taken ?? "—")}</TableCell>
                      <TableCell>
                        {INCIDENT_STATUS_LABELS[String(row.status)] ?? String(row.status)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {canManage && (
          <TabsContent value="new" className="mt-4">
            <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border bg-gradient-to-r from-violet-500/10 via-primary/5 to-transparent px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">{t("dailyOps.incidents.new")}</h2>
                    <p className="text-xs text-muted-foreground">{t("dailyOps.incidents.formHint")}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="space-y-1.5">
                  <Label>{t("dailyOps.table.venue")}</Label>
                  <Select
                    value={form.location_id || locationId || ""}
                    onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(sites ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("dailyOps.incidents.date")}</Label>
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("dailyOps.incidents.time")}</Label>
                    <Input
                      type="time"
                      value={form.time}
                      onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("dailyOps.incidents.type")}</Label>
                  <Select value={form.category} onValueChange={(v) => handleTypeChange(v as IncidentType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INCIDENT_TYPES.map((type) => {
                        const Icon = INCIDENT_TYPE_ICONS[type];
                        return (
                          <SelectItem key={type} value={type}>
                            <span className="flex items-center gap-2">
                              <Icon className="h-3.5 w-3.5 opacity-60" />
                              {INCIDENT_TYPE_LABELS[type]}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("dailyOps.incidents.severity")}</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((s) => (
                        <SelectItem key={s} value={s}>
                          <span className="capitalize">{s}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.category && (
                    <p className="text-[11px] text-muted-foreground">
                      {t("dailyOps.incidents.severityHint", {
                        severity: INCIDENT_TYPE_SUGGESTED_SEVERITY[form.category],
                      })}
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{t("dailyOps.incidents.narrativeSection")}</p>
                      <p className="text-xs text-muted-foreground">{t("dailyOps.incidents.narrativeHint")}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-violet-500/40 bg-background"
                      onClick={() => aiDraftMut.mutate()}
                      disabled={aiDraftMut.isPending || !(form.location_id || locationId)}
                    >
                      {aiDraftMut.isPending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3.5 w-3.5 text-violet-500" />
                      )}
                      {t("dailyOps.incidents.aiAssist")}
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
                      {t("dailyOps.incidents.description")}
                      {aiGenerated && form.summary ? (
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {t("dailyOps.incidents.aiBadge")}
                        </Badge>
                      ) : null}
                    </Label>
                    <Textarea
                      rows={4}
                      placeholder={t("dailyOps.incidents.descriptionPlaceholder")}
                      value={form.summary}
                      onChange={(e) => {
                        setAiGenerated(false);
                        setForm((f) => ({ ...f, summary: e.target.value }));
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t("dailyOps.incidents.actionTaken")}</Label>
                    <Textarea
                      rows={4}
                      placeholder={t("dailyOps.incidents.actionPlaceholder")}
                      value={form.action_taken}
                      onChange={(e) => {
                        setAiGenerated(false);
                        setForm((f) => ({ ...f, action_taken: e.target.value }));
                      }}
                    />
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending || form.summary.length < 3 || !(form.location_id || locationId)}
                >
                  {mutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t("dailyOps.incidents.report")}
                </Button>
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!submittedReport} onOpenChange={(open) => !open && setSubmittedReport(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">{t("dailyOps.incidents.saved")}</DialogTitle>
            <DialogDescription className="text-center">
              {t("dailyOps.incidents.savedHint")}
            </DialogDescription>
          </DialogHeader>

          {submittedReport ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{submittedReport.reference}</span>
                <Badge variant={severityBadgeVariant(submittedReport.severity)} className="capitalize">
                  {submittedReport.severity}
                </Badge>
              </div>
              <IncidentTypeBadge category={submittedReport.category} />
              <dl className="grid gap-2 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("dailyOps.table.venue")}</dt>
                  <dd className="text-right font-medium">
                    {submittedReport.location_name
                      ? `${submittedReport.location_name} (${submittedReport.location_code})`
                      : submittedReport.location_code || selectedSite?.code}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("dailyOps.incidents.when")}</dt>
                  <dd className="text-right">
                    {new Date(submittedReport.occurred_at).toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("dailyOps.incidents.reportedBy")}</dt>
                  <dd className="text-right">{submittedReport.reported_by_name}</dd>
                </div>
              </dl>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("dailyOps.incidents.description")}
                </p>
                <p className="text-sm leading-relaxed">{submittedReport.summary}</p>
              </div>
              {submittedReport.action_taken ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    {t("dailyOps.incidents.actionTaken")}
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{submittedReport.action_taken}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className={cn("w-full bg-[#25D366] hover:bg-[#20bd5a] text-white")}
              onClick={() => void handleShareWhatsApp()}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              {t("dailyOps.incidents.shareWhatsApp")}
            </Button>
            <div className="flex w-full gap-2">
              <Button variant="outline" className="flex-1" onClick={() => void handleCopyReport()}>
                <ClipboardCopy className="mr-2 h-4 w-4" />
                {t("dailyOps.incidents.copyReport")}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setSubmittedReport(null);
                  setActiveTab("list");
                }}
              >
                {t("dailyOps.incidents.viewLog")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DailyOpsPageShell>
  );
}

export default DailyOpsIncidentsPage;
