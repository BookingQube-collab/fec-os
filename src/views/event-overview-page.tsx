"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { EventBuilder } from "@/components/events/event-builder";
import { EventHealthBadge } from "@/components/events/event-health-badge";
import { EventPlanHome } from "@/components/events/event-plan-home";
import { EventSourceBanner } from "@/components/events/event-source-banner";
import {
  EventApprovalsPanel,
  EventAssetsPanel,
  EventDepartmentStatus,
  EventDocumentsPanel,
  EventIssuesPanel,
  EventPayablesPanel,
} from "@/components/events/event-ops-panels";
import { EventWorkspaceNav } from "@/components/events/event-workspace-nav";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useEvent, useEventBudget, useEventPlan, useEventScope } from "@/hooks/queries/useEvents";
import { usePermission } from "@/hooks/use-permission";
import { fmtQar } from "@/lib/currency";
import type { EventRag } from "@/lib/events/constants";
import { LIFECYCLE_PHASES } from "@/lib/events/lifecycle";
import { EVENT_SETUP_STEPS, setupProgressFromOverview, type EventSetupStepId } from "@/lib/events/setup";
import { changeEventStage, overrideEventHealth, saveEventLessons, setEventGoLive, setEventLifecycleStatus, toggleReadinessItem } from "@/lib/events.functions";
import { queryKeys } from "@/lib/query-keys";

function money(value: number | null | undefined) {
  return value == null ? "—" : fmtQar(value);
}

export default function EventOverviewPage() {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const qc = useQueryClient();
  const eventQ = useEvent(id);
  const scopeQ = useEventScope(id);
  const planQ = useEventPlan(id);
  const budgetQ = useEventBudget(id);
  const inBuilder = search.get("setup") === "1";
  const stepParam = (search.get("step") as EventSetupStepId | null) ?? undefined;
  const canEdit = usePermission("events.edit");
  const canCreatePr = usePermission("procurement.create");
  const canCreateMaint = usePermission("maintenance.request_submit");
  const canApprove = usePermission("events.approve");
  const canManage = usePermission("events.manage") || canApprove;
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideRag, setOverrideRag] = useState<EventRag>("amber");
  const [justification, setJustification] = useState("");
  const d = eventQ.data;

  useEffect(() => {
    setLessons(d?.event.lessons_learned ?? "");
  }, [d?.event.id, d?.event.lessons_learned]);

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.events.all });

  const advance = useMutation({
    mutationFn: (stageId: string) => changeEventStage({ eventId: id, stageId }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.toasts.stageChanged"));
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => setBusyStage(null),
  });

  const toggleReady = useMutation({
    mutationFn: (input: { id: string; is_complete: boolean }) => toggleReadinessItem(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.events.detail(id) }),
    onError: (e) => toast.error((e as Error).message),
  });

  const override = useMutation({
    mutationFn: () => overrideEventHealth({ eventId: id, rag: overrideRag, justification }),
    onSuccess: () => {
      invalidate();
      setOverrideOpen(false);
      setJustification("");
      toast.success(t("events.toasts.healthOverridden"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const clearOverride = useMutation({
    mutationFn: () => overrideEventHealth({ eventId: id, rag: null }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.toasts.healthCleared"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const lifecycle = useMutation({
    mutationFn: (status: "on_hold" | "cancelled" | "active") => setEventLifecycleStatus({ eventId: id, status }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.toasts.statusChanged"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [lessons, setLessons] = useState("");
  const saveLessons = useMutation({
    mutationFn: () => saveEventLessons({ eventId: id, lessons_learned: lessons || null }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.toasts.updated"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const goLive = useMutation({
    mutationFn: (approved: boolean) => setEventGoLive({ eventId: id, approved }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.toasts.goLiveSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const setup = useMemo(
    () =>
      setupProgressFromOverview(eventQ.data, {
        scopeSections: scopeQ.data?.versions[0]?.sections,
        tasks: planQ.data?.tasks,
        budgetLines: budgetQ.data?.lines,
        forceWizard: inBuilder,
      }),
    [eventQ.data, scopeQ.data?.versions, planQ.data?.tasks, budgetQ.data?.lines, inBuilder],
  );

  if (eventQ.isLoading || !d) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (inBuilder) {
    return <EventBuilder eventId={id} initialStep={stepParam && EVENT_SETUP_STEPS.some((s) => s.id === stepParam) ? stepParam : setup.currentStep} />;
  }

  const ev = d.event;
  const next = d.nextStage;
  const missing = d.gates.filter((g) => g.blocking && !g.satisfied);
  const displayName = ev.event_name || ev.name;

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <PageHeader
        kicker={ev.event_number ?? t("events.kicker")}
        title={displayName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{`${ev.client_name ?? "—"} · ${ev.venue_name ?? ev.location_name ?? "—"} · ${ev.event_start ?? "—"}`}</span>
            <EventHealthBadge rag={ev.health_rag} />
          </span>
        }
        actions={<EventWorkspaceNav eventId={id} />}
      />

      {setup.incomplete ? (
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div>
            <p className="text-sm font-semibold">
              {t("events.builder.youAreOn", { n: setup.currentNumber, total: setup.total })}
            </p>
            <p className="text-xs text-muted-foreground">{t("events.builder.continueHelp")}</p>
          </div>
          <Button asChild>
            <Link href={`/events/${id}?setup=1&step=${setup.currentStep}`}>{t("events.builder.continue")}</Link>
          </Button>
        </div>
      ) : null}

      <EventPlanHome
        overview={d}
        tasks={planQ.data?.tasks ?? d.overdueActions}
        canEdit={canEdit}
        canCreatePr={canCreatePr}
        canCreateMaint={canCreateMaint}
        advancing={advance.isPending}
        onAdvance={() => {
          if (!next) return;
          setBusyStage(next.id);
          advance.mutate(next.id);
        }}
      />

      <CollapsibleSection
        title={t("events.home.moreDetails")}
        kicker={t("events.home.moreDetailsHint")}
        defaultOpen={false}
      >
      <Tabs defaultValue="work" className="space-y-3">
        <TabsList>
          <TabsTrigger value="work">{t("events.home.tabWork")}</TabsTrigger>
          <TabsTrigger value="money">{t("events.home.tabMoney")}</TabsTrigger>
          <TabsTrigger value="ready">{t("events.home.tabReady")}</TabsTrigger>
          <TabsTrigger value="more">{t("events.home.tabMore")}</TabsTrigger>
        </TabsList>

        <TabsContent value="work" className="space-y-4">
          <EventDepartmentStatus workstreams={d.workstreams} ar={Boolean(ar)} />
          <div className="grid gap-4 lg:grid-cols-2">
            <EventIssuesPanel eventId={id} issues={d.issues} overdueActions={d.overdueActions} canEdit={canEdit} onChanged={invalidate} />
            <EventDocumentsPanel eventId={id} documents={d.documents} team={d.team} workstreams={d.workstreams} canEdit={canEdit} onChanged={invalidate} variant="compact" />
          </div>
        </TabsContent>

        <TabsContent value="money" className="space-y-4">
          <section className="space-y-3 rounded-2xl border border-border/40 bg-card p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-sm font-semibold">{t("events.overview.finance")}</h2>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/events/${id}/budget`}>{t("events.workspace.budget")}</Link>
              </Button>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <dt className="text-muted-foreground">{t("events.budget.revised")}</dt>
              <dd className="text-end tabular-nums">{money(d.finance.revised)}</dd>
              <dt className="text-muted-foreground">{t("events.budget.actual")}</dt>
              <dd className="text-end tabular-nums">{money(d.finance.actual)}</dd>
              <dt className="text-muted-foreground">{t("events.budget.committed")}</dt>
              <dd className="text-end tabular-nums">{money(d.finance.committed)}</dd>
              <dt className="text-muted-foreground">{t("events.budget.remaining")}</dt>
              <dd className="text-end tabular-nums">{money(d.finance.remaining)}</dd>
            </dl>
          </section>
          <EventPayablesPanel eventId={id} payables={d.payables} canEdit={canEdit} onChanged={invalidate} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/procurement/requisitions?eventId=${id}`}>
                {t("events.overview.procurement", { n: d.linkedPrs?.length ?? d.linkedPrCount })}
              </Link>
            </Button>
            {canCreatePr ? (
              <Button size="sm" asChild>
                <Link href={`/procurement/requisitions/new?eventId=${id}`}>{t("events.proc.newPr")}</Link>
              </Button>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="ready" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <section className="space-y-3 rounded-2xl border border-border/40 bg-card p-4 xl:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{t("events.overview.gates")}</h2>
                {canEdit && next && ev.status === "active" ? (
                  <Button
                    size="sm"
                    disabled={advance.isPending || missing.length > 0}
                    onClick={() => {
                      setBusyStage(next.id);
                      advance.mutate(next.id);
                    }}
                  >
                    {busyStage === next.id ? t("common.saving") : t("events.overview.advance", { stage: ar ? next.label_ar : next.label_en })}
                  </Button>
                ) : null}
              </div>
              {missing.length > 0 ? (
                <ul className="list-disc ps-4 text-sm">
                  {missing.map((gate) => (
                    <li key={gate.requirementId}>{ar ? gate.labelAr : gate.labelEn}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("events.overview.noGates")}</p>
              )}
            </section>
            <EventApprovalsPanel
              gates={d.gates}
              goLive={{ approved: ev.go_live_approved, at: ev.go_live_approved_at }}
              canApprove={canApprove}
              pending={goLive.isPending}
              onGoLive={(approved) => goLive.mutate(approved)}
              ar={Boolean(ar)}
            />
          </div>
          <section className="rounded-2xl border border-border/40 bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("events.overview.readiness")}</h2>
            <div className="max-h-[22rem] space-y-3 overflow-y-auto pr-1">
              {LIFECYCLE_PHASES.map((phase) => {
                const items = d.readinessItems.filter((item) => item.phase_code === phase.code);
                if (!items.length) return null;
                return (
                  <div key={phase.code}>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(`events.phase.${phase.code}`)}
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      {items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={item.is_complete}
                              disabled={!canEdit || toggleReady.isPending}
                              onChange={(e) => toggleReady.mutate({ id: item.id, is_complete: e.target.checked })}
                            />
                            <span>{t(`events.readinessItem.${item.code}`, { defaultValue: item.title })}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="more" className="space-y-4">
          <EventSourceBanner />
          <div className="flex flex-wrap gap-2">
            {canManage && ev.status === "active" ? (
              <>
                <Button size="sm" variant="outline" disabled={lifecycle.isPending} onClick={() => lifecycle.mutate("on_hold")}>
                  {t("events.overview.hold")}
                </Button>
                <Button size="sm" variant="outline" disabled={lifecycle.isPending} onClick={() => lifecycle.mutate("cancelled")}>
                  {t("events.overview.cancel")}
                </Button>
              </>
            ) : null}
            {canManage && (ev.status === "on_hold" || ev.status === "cancelled") ? (
              <Button size="sm" disabled={lifecycle.isPending} onClick={() => lifecycle.mutate("active")}>
                {t("events.overview.resume")}
              </Button>
            ) : null}
            {canApprove ? (
              <Button size="sm" variant="outline" onClick={() => setOverrideOpen(true)}>
                {t("events.overview.overrideHealth")}
              </Button>
            ) : null}
            {canApprove && ev.health_overridden ? (
              <Button size="sm" variant="ghost" disabled={clearOverride.isPending} onClick={() => clearOverride.mutate()}>
                {t("events.overview.clearOverride")}
              </Button>
            ) : null}
            <CapabilityGate capability="events.edit">
              <Button size="sm" variant="outline" asChild>
                <Link href={`/events/${id}/plan`}>{t("events.overview.openPlan")}</Link>
              </Button>
            </CapabilityGate>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <EventAssetsPanel eventId={id} assets={d.assets} canEdit={canEdit} onChanged={invalidate} />
            <section className="rounded-2xl border border-border/40 bg-card p-4">
              <p className="mb-2 text-sm font-semibold">{t("events.overview.lessons")}</p>
              <Textarea value={lessons} onChange={(e) => setLessons(e.target.value)} disabled={!canEdit} rows={3} />
              {canEdit ? (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => saveLessons.mutate()} disabled={saveLessons.isPending}>
                  {t("common.save")}
                </Button>
              ) : null}
            </section>
          </div>
          <section className="rounded-2xl border border-border/40 bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("events.overview.audit")}</h2>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {d.audit.map((row) => (
                <li key={row.id}>
                  {row.created_at.slice(0, 16).replace("T", " ")} · {t(`events.audit.${row.action}`, { defaultValue: row.action })} · {row.entity_type}
                </li>
              ))}
            </ul>
          </section>
        </TabsContent>
      </Tabs>
      </CollapsibleSection>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("events.overview.overrideHealth")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("events.overview.overrideHelp")}</p>
          <div className="flex flex-wrap gap-2">
            {(["green", "amber", "red", "critical"] as const).map((rag) => (
              <Button key={rag} size="sm" variant={overrideRag === rag ? "default" : "outline"} onClick={() => setOverrideRag(rag)}>
                {t(`events.rag.${rag}`)}
              </Button>
            ))}
          </div>
          <Textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder={t("events.overview.overridePlaceholder")}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={override.isPending || justification.trim().length < 8} onClick={() => override.mutate()}>
              {override.isPending ? t("common.saving") : t("events.overview.saveOverride")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
