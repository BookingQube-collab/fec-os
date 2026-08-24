"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CalendarDays, CheckCircle2, Clock3, Sparkles, Wallet } from "lucide-react";

import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { EventAiAssist } from "@/components/events/event-ai-assist";
import { EventProcurementPanel } from "@/components/events/event-procurement-panel";
import { EventStageTracker } from "@/components/events/event-stage-tracker";
import { EventWorkstreamsPanel } from "@/components/events/event-workstreams-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtQar } from "@/lib/currency";
import { CLOSED_TASK_STATUSES, OPEN_ISSUE_STATUSES, PENDING_PR_STATUSES } from "@/lib/events/constants";
import { missingDepartmentBoqs, missingRequiredByType } from "@/lib/events/documents";
import { collectEventPlanSignals } from "@/lib/events/ai-signals";
import { aiDraftEventPlan, applyEventPlanDraft } from "@/lib/events.functions";
import { stageGateTone } from "@/lib/events/lifecycle";
import { eventOpsUrls, OPEN_MAINT_STATUSES } from "@/lib/events/ops-link";
import type { EventLinkedPrRow, EventOverview, EventStage, EventTaskRow } from "@/lib/events/types";
import { matchTaskToPr, taskLooksLikeProcurement } from "@/lib/procurement/event-link";
import { queryKeys } from "@/lib/query-keys";
import { KPI_ICON_CLASS, KPI_TINT_CLASS, type KpiTint } from "@/lib/ui/command-surface";
import { cn } from "@/lib/utils";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function Kpi({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "ok" | "warn";
  icon: typeof CheckCircle2;
}) {
  const tint: KpiTint = tone === "danger" ? "red" : tone === "warn" ? "amber" : tone === "ok" ? "green" : "sky";
  return (
    <div className={cn("min-w-0 rounded-2xl border px-5 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]", KPI_TINT_CLASS[tint])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn("mt-1.5 text-2xl font-bold tabular-nums tracking-tight", tone === "danger" && "text-rag-red")}>
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", KPI_ICON_CLASS[tint])}>
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
      </div>
    </div>
  );
}

type ModuleChip = "task" | "pr" | "maintenance" | "hr" | "logistics" | "gate" | "docs";

type PriorityItem = {
  id: string;
  title: string;
  owner?: string | null;
  due?: string | null;
  href: string;
  module: ModuleChip;
  status: string;
  tone?: "danger" | "warn";
};

function taskHref(task: EventTaskRow, eventId: string, prs: EventLinkedPrRow[]) {
  if (taskLooksLikeProcurement(task.title)) {
    const matched = matchTaskToPr(task.title, prs);
    if (matched) return `/procurement/requisitions/${matched.id}`;
    return `/procurement/requisitions?eventId=${eventId}`;
  }
  return `/events/${eventId}/plan`;
}

export function EventPlanHome({
  overview,
  tasks,
  onAdvance,
  advancing,
  canEdit,
  canCreatePr,
  canCreateMaint,
}: {
  overview: EventOverview;
  tasks: EventTaskRow[];
  onAdvance?: () => void;
  advancing?: boolean;
  canEdit?: boolean;
  canCreatePr?: boolean;
  canCreateMaint?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const ev = overview.event;
  const qc = useQueryClient();
  const current = overview.stages.find((s) => s.id === ev.stage_id);
  const [stage, setStage] = useState<EventStage | null>(current ?? null);
  const [brief, setBrief] = useState("");
  const [nextActions, setNextActions] = useState<string[]>([]);
  const [planDraft, setPlanDraft] = useState<Awaited<ReturnType<typeof aiDraftEventPlan>>["fields"] | null>(null);
  const [applyFlags, setApplyFlags] = useState({ scope: false, tasks: true, risks: true, dates: false });
  const today = todayYmd();
  const urls = eventOpsUrls(ev.id, ev.location_id);
  const prs = overview.linkedPrs ?? [];
  const maint = overview.linkedMaintenance ?? [];
  const pendingPrs = prs.filter((pr) => PENDING_PR_STATUSES.has(pr.status));
  const approvedPrs = prs.filter((pr) => !PENDING_PR_STATUSES.has(pr.status));
  const openMaint = maint.filter((row) => OPEN_MAINT_STATUSES.has(row.status));
  const missing = overview.gates.filter((g) => g.blocking && !g.satisfied);
  const openSnags = (overview.issues ?? []).filter((issue) => issue.is_snag && OPEN_ISSUE_STATUSES.has(issue.status));
  const missingAssets = (overview.assets ?? []).filter((row) => row.status === "missing");

  const signals = useMemo(
    () => collectEventPlanSignals({ overview, tasks, today }),
    [overview, tasks, today],
  );

  const draftNotes = brief || `${ev.name} — current stage ${current?.label_en ?? ""}`;

  const suggest = useMutation({
    mutationFn: (focus: "all" | "next") =>
      aiDraftEventPlan({
        notes: draftNotes,
        focus,
        eventId: ev.id,
        event_type: ev.event_type_label_en || ev.event_type_code,
        locale: ar ? "ar" : "en",
        signals,
      }),
    onSuccess: (result, focus) => {
      setNextActions(result.fields.next_actions);
      if (focus === "all") setPlanDraft(result.fields);
      toast.success(result.ai_generated ? t("events.builder.ai.applied") : t("events.builder.ai.fallback"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const applyDraft = useMutation({
    mutationFn: () => {
      if (!planDraft) throw new Error("No draft");
      return applyEventPlanDraft({
        eventId: ev.id,
        apply: applyFlags,
        draft: planDraft,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.events.detail(ev.id) });
      qc.invalidateQueries({ queryKey: queryKeys.events.all });
      setPlanDraft(null);
      toast.success(t("events.builder.ai.applyDone"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const allOpen = useMemo(
    () => tasks.filter((task) => !CLOSED_TASK_STATUSES.has(task.status)),
    [tasks],
  );

  const priority = useMemo(() => {
    const items: PriorityItem[] = [];
    const seen = new Set<string>();
    const push = (item: PriorityItem) => {
      if (seen.has(item.id) || items.length >= 7) return;
      seen.add(item.id);
      items.push(item);
    };

    for (const pr of pendingPrs.filter((row) => row.canAct || row.overdue).slice(0, 2)) {
      push({
        id: `pr-${pr.id}`,
        title: `${pr.pr_number ?? t("procurement.list.draftNumber")}${pr.title ? ` · ${pr.title}` : ""}`,
        owner: pr.requester_name,
        due: pr.required_by,
        href: `/procurement/requisitions/${pr.id}`,
        module: "pr",
        status: pr.status,
        tone: pr.overdue ? "danger" : "warn",
      });
    }

    for (const row of openMaint.slice(0, 2)) {
      push({
        id: `maint-${row.id}`,
        title: `${row.request_number}${row.category ? ` · ${row.category}` : ""}`,
        owner: row.area,
        due: row.reported_at?.slice(0, 10),
        href: urls.maintenance,
        module: "maintenance",
        status: row.status,
        tone: "warn",
      });
    }

    const missingBoq = missingDepartmentBoqs(overview.documents, overview.workstreams);
    const boqFallback = missingRequiredByType(overview.documents, "boq");
    const boqItems = missingBoq.length
      ? missingBoq.map((group) => ({
          id: `doc-boq-${group.code}`,
          dept: ar ? group.title_ar : group.title_en,
        }))
      : boqFallback.map((doc) => ({
          id: `doc-boq-${doc.id}`,
          dept: doc.workstream_title || doc.title,
        }));
    for (const row of boqItems.slice(0, 3)) {
      push({
        id: row.id,
        title: t("events.home.priority.missingBoqDept", { dept: row.dept }),
        owner: ev.pm_name,
        href: `/events/${ev.id}/scope#documents`,
        module: "docs",
        status: t("events.docStatus.missing"),
        tone: "danger",
      });
    }
    const missingPermits = missingRequiredByType(overview.documents, "permit");
    if (missingPermits.length) {
      push({
        id: "doc-permit",
        title: t("events.home.priority.missingPermit"),
        owner: ev.pm_name,
        href: `/events/${ev.id}/scope#documents`,
        module: "docs",
        status: t("events.docStatus.missing"),
        tone: "warn",
      });
    }

    if ((overview.team ?? []).length === 0) {
      push({
        id: "hr-gap",
        title: t("events.home.priority.staffingGap"),
        owner: ev.pm_name,
        href: urls.people,
        module: "hr",
        status: t("events.home.priority.unassigned"),
        tone: "warn",
      });
    }

    for (const row of missingAssets.slice(0, 1)) {
      push({
        id: `asset-${row.id}`,
        title: row.item_name,
        due: row.due_date,
        href: urls.inventory,
        module: "logistics",
        status: row.status,
        tone: "danger",
      });
    }

    const overdueTasks = allOpen
      .filter((task) => task.due_date && task.due_date < today)
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
    const skipProcTasks = pendingPrs.length > 0;
    for (const task of overdueTasks) {
      if (skipProcTasks && taskLooksLikeProcurement(task.title)) continue;
      push({
        id: `task-${task.id}`,
        title: task.title,
        owner: task.owner_name,
        due: task.due_date,
        href: taskHref(task, ev.id, prs),
        module: "task",
        status: task.status,
        tone: "danger",
      });
    }

    const dueSoon = allOpen
      .filter((task) => !task.due_date || task.due_date >= today)
      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    for (const task of dueSoon) {
      if (skipProcTasks && taskLooksLikeProcurement(task.title)) continue;
      push({
        id: `task-${task.id}`,
        title: task.title,
        owner: task.owner_name,
        due: task.due_date,
        href: taskHref(task, ev.id, prs),
        module: "task",
        status: task.status,
        tone: task.status === "blocked" ? "danger" : undefined,
      });
    }

    return items;
  }, [allOpen, ar, ev.id, ev.pm_name, openMaint, overview.documents, overview.team, overview.workstreams, pendingPrs, prs, t, today, urls.inventory, urls.maintenance, urls.people, missingAssets]);

  const procurementBlocked = pendingPrs.length > 0;
  const staffingBlocked = (overview.team ?? []).length === 0 && missing.some((g) => /manpower|staff/i.test(g.code));
  const maintBlocked = openMaint.length > 0 && missing.some((g) => /maint|snag|safety/i.test(g.code));
  const logisticsBlocked = (missingAssets.length > 0 || openSnags.length > 0) && missing.some((g) => /logistics|kit|asset/i.test(g.code));
  const showProcInGates = procurementBlocked;
  const showMaintInGates = maintBlocked;
  const showStaffInGates = staffingBlocked;
  const showLogInGates = logisticsBlocked;
  const missingBoqDepts = missingDepartmentBoqs(overview.documents, overview.workstreams);
  const missingBoq = missingBoqDepts.length || missingRequiredByType(overview.documents, "boq").length;
  const missingPermits = missingRequiredByType(overview.documents, "permit").length;
  const showDocsInGates = missingBoq > 0 || missingPermits > 0;

  const revised = overview.finance.revised;
  const actual = overview.finance.actual ?? 0;
  const usedPct = revised && revised > 0 ? Math.round((actual / revised) * 100) : null;
  const days = ev.days_until_event;

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={CheckCircle2}
          label={t("events.home.complete")}
          value={`${Math.round(ev.overall_progress ?? 0)}%`}
          tone={overview.ops.tasksOverdue > 0 ? undefined : "ok"}
          hint={t("events.overview.tasksLine", {
            done: overview.ops.tasksCompleted,
            total: overview.ops.tasksTotal,
            overdue: overview.ops.tasksOverdue,
          })}
        />
        <Kpi
          icon={Clock3}
          label={t("events.home.overdue")}
          value={String(overview.ops.tasksOverdue)}
          tone={overview.ops.tasksOverdue > 0 ? "danger" : "ok"}
          hint={t("events.home.overdueHint")}
        />
        <Kpi
          icon={Wallet}
          label={t("events.home.budgetUsed")}
          value={usedPct == null ? "—" : `${usedPct}%`}
          tone={usedPct != null && usedPct >= 90 ? "warn" : undefined}
          hint={revised == null ? t("events.home.noBudget") : `${fmtQar(actual)} / ${fmtQar(revised)}`}
        />
        <Kpi
          icon={CalendarDays}
          label={t("events.home.daysToEvent")}
          value={days == null ? "—" : days >= 0 ? String(days) : t("events.home.live")}
          tone={days != null && days >= 0 && days <= 7 ? "warn" : undefined}
          hint={
            days == null
              ? undefined
              : days >= 0
                ? t("events.home.openingOn", { date: ev.event_start ?? "—" })
                : t("events.fields.daysAgo", { n: Math.abs(days) })
          }
        />
      </div>

      <EventStageTracker
        stages={overview.stages}
        currentId={ev.stage_id}
        selectedId={stage?.id ?? ev.stage_id}
        onSelect={setStage}
        gateTone={(s) =>
          stageGateTone(s.code, {
            budgetApproved: overview.budgetStatus === "approved" || overview.budgetStatus === "locked",
            hasBudget: Boolean(overview.finance.hasBudget || overview.finance.revised),
            pendingPrs: overview.ops.pendingPrs,
            linkedPrs: prs.length || overview.linkedPrCount,
          })
        }
      />

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="min-w-0 space-y-3 rounded-2xl border border-border/40 bg-card p-4">
          <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{t("events.home.priority.title")}</h2>
              <p className="text-xs text-muted-foreground">{t("events.home.priority.hint")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={suggest.isPending}
                  onClick={() => suggest.mutate("next")}
                >
                  {suggest.isPending ? t("common.saving") : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                      {t("events.builder.ai.suggestNext")}
                    </>
                  )}
                </Button>
              ) : null}
              <Button size="sm" asChild>
                <Link href={`/events/${ev.id}/plan`}>{t("events.builder.plan.addTask")}</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/events/${ev.id}/plan`}>{t("events.builder.plan.openSchedule")}</Link>
              </Button>
            </div>
          </div>
          {priority.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("events.home.priority.empty")}</p>
          ) : (
            <ul className="min-w-0 space-y-2 overflow-hidden text-sm">
              {priority.map((item) => (
                <li key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Link href={item.href} className="block truncate font-medium underline-offset-2 hover:underline">
                      {item.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.owner ?? t("events.builder.plan.unassigned")}
                      {item.due ? ` · ${item.due}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{t(`events.home.module.${item.module}`)}</Badge>
                    <Badge variant={item.tone === "danger" ? "destructive" : item.tone === "warn" ? "warning" : "outline"}>
                      {item.tone === "danger" && item.module === "task" ? t("events.home.overdue") : item.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {nextActions.length ? (
            <ol className="list-decimal space-y-1 ps-5 text-sm">
              {nextActions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          ) : null}
        </section>

        <section className="min-w-0 space-y-3 rounded-2xl border border-border/40 bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">{t("events.home.gates.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("events.home.gates.hint")}</p>
          </div>
          {missing.length === 0 && !showProcInGates && !showDocsInGates ? (
            <p className="text-sm text-muted-foreground">{t("events.overview.noGates")}</p>
          ) : missing.length > 0 ? (
            <ul className="min-w-0 space-y-2 overflow-hidden text-sm">
              {missing.slice(0, 4).map((gate) => (
                <li key={gate.requirementId} className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{ar ? gate.labelAr : gate.labelEn}</span>
                  <Badge variant="warning" className="shrink-0">{t("events.overview.missing")}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
          {showDocsInGates ? (
            <ul className="min-w-0 space-y-2 overflow-hidden text-sm">
              {missingBoqDepts.length
                ? missingBoqDepts.slice(0, 4).map((group) => (
                    <li key={group.code} className="flex min-w-0 items-center justify-between gap-2">
                      <Link href={`/events/${ev.id}/scope#documents`} className="min-w-0 truncate underline-offset-2 hover:underline">
                        {t("events.home.priority.missingBoqDept", { dept: ar ? group.title_ar : group.title_en })}
                      </Link>
                      <Badge variant="destructive" className="shrink-0">{t("events.overview.missing")}</Badge>
                    </li>
                  ))
                : missingBoq > 0 ? (
                    <li className="flex min-w-0 items-center justify-between gap-2">
                      <Link href={`/events/${ev.id}/scope#documents`} className="min-w-0 truncate underline-offset-2 hover:underline">
                        {t("events.home.priority.missingBoq")}
                      </Link>
                      <Badge variant="destructive" className="shrink-0">{t("events.overview.missing")}</Badge>
                    </li>
                  ) : null}
              {missingPermits > 0 ? (
                <li className="flex min-w-0 items-center justify-between gap-2">
                  <Link href={`/events/${ev.id}/scope#documents`} className="min-w-0 truncate underline-offset-2 hover:underline">
                    {t("events.home.priority.missingPermit")}
                  </Link>
                  <Badge variant="warning" className="shrink-0">{t("events.overview.missing")}</Badge>
                </li>
              ) : null}
            </ul>
          ) : null}
          {showProcInGates ? (
            <div className="space-y-2 border-t border-border/40 pt-3">
              <p className="text-xs text-muted-foreground">
                {t("events.proc.blockedCounts", { pending: pendingPrs.length, approved: approvedPrs.length })}
              </p>
              <EventProcurementPanel eventId={ev.id} prs={prs} canCreate={canCreatePr} variant="compact" />
            </div>
          ) : null}
          {showStaffInGates ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3 text-sm">
              <span>{t("events.home.priority.staffingGap")}</span>
              <Button size="sm" variant="outline" asChild>
                <Link href={urls.people}>{t("events.home.stream.openPeople")}</Link>
              </Button>
            </div>
          ) : null}
          {showMaintInGates ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3 text-sm">
              <span>{t("events.home.gates.openJobs", { n: openMaint.length })}</span>
              <Button size="sm" variant="outline" asChild>
                <Link href={urls.maintenance}>{t("events.home.stream.openMaint")}</Link>
              </Button>
            </div>
          ) : null}
          {showLogInGates ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3 text-sm">
              <span>{t("events.home.gates.logisticsBlock", { n: missingAssets.length + openSnags.length })}</span>
              <Button size="sm" variant="outline" asChild>
                <Link href={urls.inventory}>{t("events.home.stream.openInventory")}</Link>
              </Button>
            </div>
          ) : null}
          {overview.nextStage && canEdit && ev.status === "active" ? (
            <Button size="sm" disabled={advancing || missing.length > 0} onClick={onAdvance}>
              {advancing
                ? t("common.saving")
                : t("events.home.moveNext", { stage: ar ? overview.nextStage.label_ar : overview.nextStage.label_en })}
            </Button>
          ) : null}
        </section>
      </div>

      <section className="min-w-0 rounded-2xl border border-border/40 bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">{t("events.home.risks")}</h2>
        {overview.risks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("events.overview.noRisks")}</p>
        ) : (
          <ul className="grid min-w-0 gap-2 text-sm sm:grid-cols-2">
            {overview.risks.slice(0, 6).map((risk) => (
              <li key={risk.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-border/40 px-3 py-2">
                <span className="min-w-0 truncate">{risk.title}</span>
                <Badge variant={risk.severity === "critical" || risk.severity === "high" ? "destructive" : "outline"}>
                  {t(`events.risk.${risk.severity}`)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EventWorkstreamsPanel
        overview={overview}
        canCreatePr={canCreatePr}
        canCreateMaint={canCreateMaint}
        hideProcurementList={showProcInGates}
      />

      {canEdit ? (
        <CollapsibleSection
          title={t("events.home.planAssist")}
          kicker={t("events.home.planAssistHint")}
          defaultOpen={false}
        >
          <div className="space-y-3">
            <EventAiAssist
              brief={brief}
              onBriefChange={setBrief}
              pending={suggest.isPending}
              onGenerate={() => suggest.mutate("all")}
              generateLabel={t("events.builder.ai.generate")}
              extraAction={{
                label: t("events.builder.ai.suggestNext"),
                onClick: () => suggest.mutate("next"),
                pending: suggest.isPending,
              }}
              hint={t("events.home.planAssistHint")}
            />
            {planDraft ? (
              <div className="space-y-2 rounded-xl border border-border/40 bg-background/50 p-3 text-sm">
                <p className="font-medium">{t("events.builder.ai.preview", {
                  tasks: planDraft.tasks.length,
                  risks: planDraft.risks.length,
                  deliverables: planDraft.deliverables.length,
                })}</p>
                <p className="text-xs text-muted-foreground">{t("events.builder.ai.applyConfirm")}</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  {(["scope", "tasks", "risks", "dates"] as const).map((key) => (
                    <label key={key} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={applyFlags[key]}
                        onChange={(e) => setApplyFlags((f) => ({ ...f, [key]: e.target.checked }))}
                      />
                      {t(`events.builder.ai.apply.${key}`)}
                    </label>
                  ))}
                </div>
                <Button
                  size="sm"
                  disabled={applyDraft.isPending || !Object.values(applyFlags).some(Boolean)}
                  onClick={() => applyDraft.mutate()}
                >
                  {applyDraft.isPending ? t("common.saving") : t("events.builder.ai.applyDraft")}
                </Button>
              </div>
            ) : null}
            {nextActions.length ? (
              <ol className="list-decimal space-y-1 ps-5 text-sm">
                {nextActions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            ) : null}
          </div>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
