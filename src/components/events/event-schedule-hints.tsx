"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { collectEventPlanSignals, overdueClustersByWorkstream } from "@/lib/events/ai-signals";
import { CLOSED_TASK_STATUSES } from "@/lib/events/constants";
import { aiDraftEventPlan } from "@/lib/events.functions";
import type { EventOverview, EventTaskRow } from "@/lib/events/types";

export function EventScheduleHints({
  eventId,
  overview,
  tasks,
  canEdit,
}: {
  eventId: string;
  overview?: EventOverview | null;
  tasks: EventTaskRow[];
  canEdit?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [actions, setActions] = useState<string[]>([]);
  const today = new Date().toISOString().slice(0, 10);

  const unassigned = useMemo(
    () =>
      tasks.filter(
        (task) =>
          !CLOSED_TASK_STATUSES.has(task.status) && !task.owner_staff_id && !task.assignee_staff_id,
      ),
    [tasks],
  );
  const clusters = useMemo(() => overdueClustersByWorkstream(tasks, today).slice(0, 4), [tasks, today]);
  const signals = useMemo(() => collectEventPlanSignals({ overview, tasks, today }), [overview, tasks, today]);

  const suggest = useMutation({
    mutationFn: () =>
      aiDraftEventPlan({
        notes: overview?.event.name ?? "",
        focus: "next",
        eventId,
        event_type: overview?.event.event_type_label_en || overview?.event.event_type_code,
        locale: i18n.language?.startsWith("ar") ? "ar" : "en",
        signals,
      }),
    onSuccess: (result) => {
      setActions(result.fields.next_actions);
      toast.success(result.ai_generated ? t("events.builder.ai.applied") : t("events.builder.ai.fallback"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const hasGaps =
    unassigned.length > 0 ||
    clusters.length > 0 ||
    signals.pending_prs.length > 0 ||
    signals.missing_docs.length > 0;
  if (!hasGaps && !actions.length) return null;

  return (
    <section className="space-y-2 rounded-2xl border border-dashed border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            {t("events.plan.ai.title")}
          </p>
          <p className="text-xs text-muted-foreground">{t("events.plan.ai.hint")}</p>
        </div>
        {canEdit ? (
          <Button type="button" variant="outline" size="sm" disabled={suggest.isPending} onClick={() => suggest.mutate()}>
            {suggest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-600" />}
            {t("events.builder.ai.suggestNext")}
          </Button>
        ) : null}
      </div>
      {unassigned.length ? (
        <p className="text-sm">
          {t("events.plan.missingOwnerN", { n: unassigned.length })}
          {": "}
          {unassigned
            .slice(0, 3)
            .map((task) => task.title)
            .join(" · ")}
        </p>
      ) : null}
      {clusters.length ? (
        <p className="text-sm text-muted-foreground">
          {t("events.plan.ai.clusters")}:{" "}
          {clusters.map((row) => `${row.key} (${row.count})`).join(" · ")}
        </p>
      ) : null}
      {signals.pending_prs.length ? (
        <p className="text-sm text-muted-foreground">
          {t("events.plan.procPendingN", { n: signals.pending_prs.length })}
          {": "}
          {signals.pending_prs
            .slice(0, 3)
            .map((pr) => pr.pr_number || pr.title || pr.status)
            .join(" · ")}
        </p>
      ) : null}
      {actions.length ? (
        <ol className="list-decimal space-y-1 ps-5 text-sm">
          {actions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
