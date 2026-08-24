"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { EventAiAssist } from "@/components/events/event-ai-assist";
import { EventSetupStepper } from "@/components/events/event-setup-stepper";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEvent, useEventBudget, useEventOptions, useEventPlan, useEventScope } from "@/hooks/queries/useEvents";
import { usePermission } from "@/hooks/use-permission";
import { fmtQar } from "@/lib/currency";
import {
  aiDraftEventPlan,
  applyEventPlanDraft,
  createEvent,
  launchEventSetup,
  updateEvent,
  upsertEventTask,
} from "@/lib/events.functions";
import { EVENT_PRIORITIES, type EventPriority } from "@/lib/events/constants";
import { EVENT_SETUP_STEPS, mergeScopeSections, type EventSetupStepId } from "@/lib/events/setup";
import { STANDARD_WORKSTREAMS } from "@/lib/events/workstreams";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";

type DraftFields = Awaited<ReturnType<typeof aiDraftEventPlan>>["fields"];
type DraftTask = DraftFields["tasks"][number] & { id?: string; owner_staff_id?: string | null };
type ApplyFlags = {
  scope?: boolean;
  tasks?: boolean;
  schedule?: boolean;
  budget?: boolean;
  risks?: boolean;
  dates?: boolean;
};

const EMPTY_FORM = {
  name: "",
  event_name: "",
  client_name: "",
  venue_name: "",
  location_id: "",
  event_type_id: "",
  classification_id: "",
  pm_staff_id: "",
  priority: "normal" as EventPriority,
  event_start: "",
  event_end: "",
  setup_start: "",
  dismantle_end: "",
  contracted_value: "",
  description: "",
};

function stepIndex(id: EventSetupStepId) {
  return EVENT_SETUP_STEPS.findIndex((s) => s.id === id);
}

export function EventBuilder({
  eventId,
  initialStep = "basics",
}: {
  eventId?: string | null;
  initialStep?: EventSetupStepId;
}) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const router = useRouter();
  const qc = useQueryClient();
  const storeLocation = useAppStore((s) => s.currentLocationId);
  const canFinance = usePermission("events.finance");
  const options = useEventOptions();
  const eventQ = useEvent(eventId);
  const scopeQ = useEventScope(eventId);
  const planQ = useEventPlan(eventId);
  const budgetQ = useEventBudget(eventId);

  const [step, setStep] = useState<EventSetupStepId>(initialStep);
  const [form, setForm] = useState(EMPTY_FORM);
  const [brief, setBrief] = useState("");
  const [sections, setSections] = useState(mergeScopeSections());
  const [included, setIncluded] = useState<string[]>(STANDARD_WORKSTREAMS.map((w) => w.code));
  const [tasks, setTasks] = useState<DraftTask[]>([]);
  const [budgetLines, setBudgetLines] = useState<DraftFields["budget_lines"]>([]);
  const [draft, setDraft] = useState<DraftFields | null>(null);

  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  const ev = eventQ.data?.event;
  const locationId = form.location_id || storeLocation || "";

  useEffect(() => {
    if (!ev) return;
    setForm((f) => ({
      ...f,
      name: ev.name ?? "",
      event_name: ev.event_name ?? ev.name ?? "",
      client_name: ev.client_name ?? "",
      venue_name: ev.venue_name ?? "",
      location_id: ev.location_id ?? "",
      event_type_id: ev.event_type_id ?? "",
      classification_id: ev.classification_id ?? "",
      pm_staff_id: ev.pm_staff_id ?? "",
      priority: ev.priority,
      event_start: ev.event_start ?? "",
      event_end: ev.event_end ?? "",
      setup_start: ev.setup_start ?? "",
      dismantle_end: ev.dismantle_end ?? "",
      contracted_value: ev.contracted_value != null ? String(ev.contracted_value) : "",
      description: ev.description ?? "",
    }));
    setBrief((b) => b || ev.notes || ev.description || "");
  }, [ev?.id]);

  useEffect(() => {
    const latest = scopeQ.data?.versions[0];
    if (latest?.sections?.length) setSections(mergeScopeSections(latest.sections));
  }, [scopeQ.data?.versions[0]?.id]);

  useEffect(() => {
    const rows = planQ.data?.tasks ?? [];
    if (!rows.length) return;
    setTasks(
      rows.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description ?? "",
        workstream_code: (task.workstream_code ?? "operations") as DraftTask["workstream_code"],
        lifecycle_phase: (task.lifecycle_phase ?? "initiation") as DraftTask["lifecycle_phase"],
        start_date: task.start_date ?? "",
        due_date: task.due_date ?? "",
        priority: task.priority === "urgent" || task.priority === "critical" || task.priority === "high" || task.priority === "low" ? task.priority : "normal",
        is_critical: task.is_critical,
        owner_staff_id: task.owner_staff_id,
      })),
    );
  }, [planQ.data?.tasks]);

  useEffect(() => {
    const lines = budgetQ.data?.lines ?? [];
    if (!lines.length) return;
    setBudgetLines(
      lines.map((l) => ({
        category_code: l.category_code,
        title: l.title,
        original_amount: l.original_amount,
        notes: l.notes ?? "",
      })),
    );
  }, [budgetQ.data?.header?.id]);

  const completed = useMemo(
    () => ({
      basics: Boolean(form.name && locationId && form.event_start),
      scope: sections.some((s) => s.body.trim().length >= 8),
      workstreams: tasks.length >= 3,
      schedule: tasks.some((t) => t.start_date || t.due_date),
      budget: budgetLines.some((l) => l.original_amount > 0),
      team: tasks.some((t) => t.owner_staff_id),
      review: ev?.status === "active" && sections.some((s) => s.body.trim()),
    }),
    [form, locationId, sections, tasks, budgetLines, ev?.status],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.events.all });
  };

  const currentDraft = (): DraftFields =>
    draft ?? {
      scope_sections: sections,
      deliverables: [],
      included_workstreams: included as DraftFields["included_workstreams"],
      tasks: tasks.map(({ id: _id, owner_staff_id: _o, ...row }) => row),
      budget_lines: budgetLines,
      risks: [],
      next_actions: [],
      event_dates: {
        planning_start: null,
        setup_start: form.setup_start || null,
        setup_end: null,
        event_start: form.event_start || null,
        event_end: form.event_end || null,
        dismantle_start: null,
        dismantle_end: form.dismantle_end || null,
      },
    };

  const applyDraftToState = (fields: DraftFields, focus: "all" | "scope" | "wbs" | "schedule" | "budget" | "tasks" | "next") => {
    setDraft(fields);
    if (focus === "all" || focus === "scope") setSections(mergeScopeSections(fields.scope_sections, sections));
    if (focus === "all" || focus === "wbs" || focus === "tasks" || focus === "schedule") {
      setIncluded(fields.included_workstreams);
      setTasks((prev) => {
        const byTitle = new Map(prev.map((t) => [`${t.workstream_code}::${t.title}`, t]));
        return fields.tasks.map((task) => {
          const existing = byTitle.get(`${task.workstream_code}::${task.title}`);
          return { ...task, id: existing?.id, owner_staff_id: existing?.owner_staff_id ?? null };
        });
      });
    }
    if (focus === "all" || focus === "budget") setBudgetLines(fields.budget_lines);
    if ((focus === "all" || focus === "schedule") && fields.event_dates.event_start) {
      setForm((f) => ({
        ...f,
        event_start: fields.event_dates.event_start ?? f.event_start,
        event_end: fields.event_dates.event_end ?? f.event_end,
        setup_start: fields.event_dates.setup_start ?? f.setup_start,
        dismantle_end: fields.event_dates.dismantle_end ?? f.dismantle_end,
      }));
    }
  };

  const generate = useMutation({
    mutationFn: (focus: "all" | "scope" | "wbs" | "schedule" | "budget" | "tasks" | "next") =>
      aiDraftEventPlan({
        notes: brief || form.description,
        focus,
        eventId: eventId || undefined,
        event_name: form.event_name || form.name,
        client_name: form.client_name,
        venue_name: form.venue_name,
        event_start: form.event_start,
        event_end: form.event_end,
        setup_start: form.setup_start,
        dismantle_end: form.dismantle_end,
        contracted_value: form.contracted_value ? Number(form.contracted_value) : null,
        location_id: locationId || null,
      }),
    onSuccess: (result, focus) => {
      applyDraftToState(result.fields, focus);
      toast.success(result.ai_generated ? t("events.builder.ai.applied") : t("events.builder.ai.fallback"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const persistBasics = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        event_name: form.event_name || form.name,
        client_name: form.client_name || null,
        venue_name: form.venue_name || null,
        location_id: locationId,
        event_type_id: form.event_type_id || null,
        classification_id: form.classification_id || null,
        pm_staff_id: form.pm_staff_id || null,
        priority: form.priority,
        event_start: form.event_start || null,
        event_end: form.event_end || null,
        setup_start: form.setup_start || null,
        dismantle_end: form.dismantle_end || null,
        contracted_value: form.contracted_value ? Number(form.contracted_value) : null,
        description: form.description || brief || null,
        notes: brief || null,
      };
      if (eventId) {
        await updateEvent({ id: eventId, ...payload });
        return { id: eventId };
      }
      return createEvent(payload);
    },
    onSuccess: (row) => {
      invalidate();
      if (!eventId) {
        toast.success(t("events.toasts.created", { number: "event_number" in row ? row.event_number : "" }));
        router.push(`/events/${row.id}?setup=1&step=scope`);
        return;
      }
      toast.success(t("events.toasts.updated"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const persistSlice = useMutation({
    mutationFn: (apply: ApplyFlags) =>
      applyEventPlanDraft({
        eventId: eventId!,
        apply,
        draft: {
          ...currentDraft(),
          scope_sections: sections,
          included_workstreams: included as DraftFields["included_workstreams"],
          tasks: tasks.map(({ id: _id, owner_staff_id: _o, ...row }) => row),
          budget_lines: budgetLines,
        },
      }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.toasts.updated"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveOwners = useMutation({
    mutationFn: async () => {
      if (!eventId) return;
      for (const task of tasks) {
        if (!task.id || !task.owner_staff_id) continue;
        await upsertEventTask({
          id: task.id,
          eventId,
          title: task.title,
          owner_staff_id: task.owner_staff_id,
        });
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("events.toasts.updated"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const launch = useMutation({
    mutationFn: () => launchEventSetup({ eventId: eventId! }),
    onSuccess: () => {
      invalidate();
      toast.success(t("events.builder.launched"));
      router.push(`/events/${eventId}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const goTo = (id: EventSetupStepId) => {
    if (!eventId && id !== "basics") {
      toast.error(t("events.builder.saveBasicsFirst"));
      return;
    }
    setStep(id);
    if (eventId) router.replace(`/events/${eventId}?setup=1&step=${id}`, { scroll: false });
  };

  const busy = persistBasics.isPending || persistSlice.isPending || saveOwners.isPending || launch.isPending || generate.isPending;

  const continueStep = async () => {
    const idx = stepIndex(step);
    if (step === "basics") {
      await persistBasics.mutateAsync();
      if (eventId) goTo("scope");
      return;
    }
    if (!eventId) return;
    if (step === "scope") await persistSlice.mutateAsync({ scope: true });
    if (step === "workstreams") await persistSlice.mutateAsync({ tasks: true });
    if (step === "schedule") await persistSlice.mutateAsync({ schedule: true, dates: true, tasks: tasks.some((t) => !t.id) });
    if (step === "budget") await persistSlice.mutateAsync({ budget: true });
    if (step === "team") await saveOwners.mutateAsync();
    if (step === "review") {
      await persistSlice.mutateAsync({ risks: true });
      await launch.mutateAsync();
      return;
    }
    const next = EVENT_SETUP_STEPS[idx + 1];
    if (next) goTo(next.id);
  };

  const set = (key: keyof typeof EMPTY_FORM, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const staff = options.data?.staff ?? [];
  const visibleTasks = tasks.filter((t) => included.includes(t.workstream_code));
  const budgetTotal = budgetLines.reduce((s, l) => s + Number(l.original_amount || 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        kicker={ev?.event_number ?? t("events.kicker")}
        title={eventId ? t("events.builder.continueTitle") : t("events.builder.title")}
        subtitle={t("events.builder.subtitle")}
      />

      <EventSetupStepper current={step} completed={completed} onSelect={goTo} />

      {step === "basics" ? (
        <div className="grid gap-3 rounded-2xl border border-border/40 bg-card p-5 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            {t("events.fields.projectName")}
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            {t("events.fields.type")}
            <Select value={form.event_type_id || undefined} onValueChange={(v) => set("event_type_id", v)}>
              <SelectTrigger><SelectValue placeholder={t("events.fields.type")} /></SelectTrigger>
              <SelectContent>
                {(options.data?.types ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>{ar ? row.label_ar : row.label_en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            {t("events.fields.client")}
            <Input value={form.client_name} onChange={(e) => set("client_name", e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            {t("events.fields.location")}
            <Select value={locationId || undefined} onValueChange={(v) => set("location_id", v)}>
              <SelectTrigger><SelectValue placeholder={t("events.fields.location")} /></SelectTrigger>
              <SelectContent>
                {(options.data?.locations ?? []).map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            {t("events.fields.venue")}
            <Input value={form.venue_name} onChange={(e) => set("venue_name", e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            {t("events.fields.pm")}
            <Select value={form.pm_staff_id || undefined} onValueChange={(v) => set("pm_staff_id", v)}>
              <SelectTrigger><SelectValue placeholder={t("events.fields.pm")} /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            {t("events.fields.event_start")}
            <Input type="date" value={form.event_start} onChange={(e) => set("event_start", e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            {t("events.fields.event_end")}
            <Input type="date" value={form.event_end} onChange={(e) => set("event_end", e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            {t("events.fields.setup_start")}
            <Input type="date" value={form.setup_start} onChange={(e) => set("setup_start", e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            {t("events.fields.dismantle_end")}
            <Input type="date" value={form.dismantle_end} onChange={(e) => set("dismantle_end", e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            {t("events.fields.priority")}
            <Select value={form.priority} onValueChange={(v) => set("priority", v as typeof form.priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>{t(`events.priority.${p}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            {t("events.fields.description")}
            <Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </label>
        </div>
      ) : null}

      {step === "scope" ? (
        <div className="space-y-4">
          <EventAiAssist
            brief={brief}
            onBriefChange={setBrief}
            pending={generate.isPending}
            onGenerate={() => generate.mutate("scope")}
            hint={t("events.builder.ai.scopeHint")}
          />
          <div className="space-y-3 rounded-2xl border border-border/40 bg-card p-5">
            {sections.map((section, idx) => (
              <label key={section.key} className="block space-y-1 text-sm">
                {t(`events.builder.scope.${section.key}`, { defaultValue: section.title })}
                <Textarea
                  rows={3}
                  value={section.body}
                  onChange={(e) =>
                    setSections((rows) => rows.map((row, i) => (i === idx ? { ...row, body: e.target.value } : row)))
                  }
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {step === "workstreams" ? (
        <div className="space-y-4">
          <EventAiAssist
            brief={brief}
            onBriefChange={setBrief}
            pending={generate.isPending}
            onGenerate={() => generate.mutate("wbs")}
            hint={t("events.builder.ai.wbsHint")}
          />
          <div className="space-y-3">
            {STANDARD_WORKSTREAMS.map((ws) => {
              const on = included.includes(ws.code);
              const wsTasks = tasks.filter((task) => task.workstream_code === ws.code);
              return (
                <section key={ws.code} className="rounded-2xl border border-border/40 bg-card p-4">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setIncluded((ids) => (e.target.checked ? [...ids, ws.code] : ids.filter((id) => id !== ws.code)))
                      }
                    />
                    {ar ? ws.title_ar : ws.title_en}
                    <Badge variant="outline">{wsTasks.length}</Badge>
                  </label>
                  {on ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {wsTasks.map((task, idx) => (
                        <li key={`${ws.code}-${idx}`} className="flex items-center gap-2">
                          <Input
                            value={task.title}
                            onChange={(e) =>
                              setTasks((rows) =>
                                rows.map((row) =>
                                  row === task ? { ...row, title: e.target.value } : row,
                                ),
                              )
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setTasks((rows) => rows.filter((row) => row !== task))}
                          >
                            {t("common.delete")}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      ) : null}

      {step === "schedule" ? (
        <div className="space-y-4">
          <EventAiAssist
            brief={brief}
            onBriefChange={setBrief}
            pending={generate.isPending}
            onGenerate={() => generate.mutate("schedule")}
            hint={t("events.builder.ai.scheduleHint")}
          />
          <div className="overflow-x-auto rounded-2xl border border-border/40 bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-start text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t("events.builder.task")}</th>
                  <th className="px-3 py-2 font-medium">{t("events.builder.start")}</th>
                  <th className="px-3 py-2 font-medium">{t("events.builder.due")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleTasks.map((task, idx) => (
                  <tr key={task.id ?? `${task.workstream_code}-${idx}`} className="border-b border-border/30">
                    <td className="px-3 py-2">{task.title}</td>
                    <td className="px-3 py-2">
                      <Input
                        type="date"
                        value={task.start_date}
                        onChange={(e) =>
                          setTasks((rows) => rows.map((row) => (row === task ? { ...row, start_date: e.target.value } : row)))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="date"
                        value={task.due_date}
                        onChange={(e) =>
                          setTasks((rows) => rows.map((row) => (row === task ? { ...row, due_date: e.target.value } : row)))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {step === "budget" ? (
        <div className="space-y-4">
          <EventAiAssist
            brief={brief}
            onBriefChange={setBrief}
            pending={generate.isPending}
            onGenerate={() => generate.mutate("budget")}
            hint={t("events.builder.ai.budgetHint")}
          />
          {!canFinance ? <p className="text-sm text-muted-foreground">{t("events.builder.budgetNeedFinance")}</p> : null}
          <div className="space-y-2 rounded-2xl border border-border/40 bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("events.builder.estimates")}</p>
            {budgetLines.map((line, idx) => (
              <div key={`${line.category_code}-${idx}`} className="grid items-end gap-2 sm:grid-cols-[1fr_8rem]">
                <label className="space-y-1 text-sm">
                  {line.title}
                  <Input
                    value={line.title}
                    onChange={(e) =>
                      setBudgetLines((rows) => rows.map((row, i) => (i === idx ? { ...row, title: e.target.value } : row)))
                    }
                  />
                </label>
                <label className="space-y-1 text-sm">
                  {t("events.builder.amount")}
                  <Input
                    type="number"
                    min={0}
                    value={line.original_amount}
                    onChange={(e) =>
                      setBudgetLines((rows) =>
                        rows.map((row, i) => (i === idx ? { ...row, original_amount: Number(e.target.value) || 0 } : row)),
                      )
                    }
                  />
                </label>
              </div>
            ))}
            <p className="pt-2 text-sm font-semibold">{t("events.builder.estimateTotal", { amount: fmtQar(budgetTotal) })}</p>
          </div>
        </div>
      ) : null}

      {step === "team" ? (
        <div className="space-y-4">
          <EventAiAssist
            brief={brief}
            onBriefChange={setBrief}
            pending={generate.isPending}
            onGenerate={() => generate.mutate("tasks")}
            hint={t("events.builder.ai.teamHint")}
          />
          <div className="space-y-2 rounded-2xl border border-border/40 bg-card p-4">
            {visibleTasks.map((task, idx) => (
              <div key={task.id ?? `${task.title}-${idx}`} className="grid items-end gap-2 sm:grid-cols-[1fr_16rem]">
                <p className="text-sm font-medium">{task.title}</p>
                <Select
                  value={task.owner_staff_id || undefined}
                  onValueChange={(v) =>
                    setTasks((rows) => rows.map((row) => (row === task ? { ...row, owner_staff_id: v } : row)))
                  }
                >
                  <SelectTrigger><SelectValue placeholder={t("events.fields.pm")} /></SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="space-y-4">
          <EventAiAssist
            brief={brief}
            onBriefChange={setBrief}
            pending={generate.isPending}
            onGenerate={() => generate.mutate("next")}
            generateLabel={t("events.builder.ai.suggestNext")}
            hint={t("events.builder.ai.reviewHint")}
          />
          <ul className="space-y-2 rounded-2xl border border-border/40 bg-card p-5 text-sm">
            {EVENT_SETUP_STEPS.filter((s) => s.id !== "review").map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span>{t(`events.builder.steps.${s.id}`)}</span>
                <Badge variant={completed[s.id] ? "success" : "warning"}>
                  {completed[s.id] ? t("events.overview.met") : t("events.overview.missing")}
                </Badge>
              </li>
            ))}
          </ul>
          {draft?.next_actions?.length ? (
            <div className="rounded-2xl border border-border/40 bg-card p-5">
              <p className="mb-2 text-sm font-semibold">{t("events.builder.nextActions")}</p>
              <ol className="list-decimal space-y-1 ps-5 text-sm">
                {draft.next_actions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={step === "basics" || busy}
          onClick={() => {
            const prev = EVENT_SETUP_STEPS[stepIndex(step) - 1];
            if (prev) goTo(prev.id);
          }}
        >
          {t("events.wizard.back")}
        </Button>
        <div className="flex flex-wrap items-end gap-2">
          {eventId ? (
            <Button type="button" variant="ghost" onClick={() => router.push(`/events/${eventId}`)}>
              {t("events.builder.skipWorkspace")}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={busy || !form.name || !locationId || (step === "basics" && !form.event_start)}
            onClick={() => void continueStep()}
          >
            {busy
              ? t("common.saving")
              : step === "review"
                ? t("events.builder.launch")
                : step === "basics" && !eventId
                  ? t("events.builder.saveAndContinue")
                  : t("events.wizard.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
