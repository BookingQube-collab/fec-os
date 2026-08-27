"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { EventAiAssist } from "@/components/events/event-ai-assist";
import { EventDocumentsPanel } from "@/components/events/event-documents-panel";
import { EventWorkspaceNav } from "@/components/events/event-workspace-nav";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useEvent, useEventScope } from "@/hooks/queries/useEvents";
import { usePermission } from "@/hooks/use-permission";
import { suggestDeliverablesForType, workspaceScopeFromDraft } from "@/lib/events/ai-signals";
import { DELIVERABLE_STATUSES } from "@/lib/events/constants";
import { missingDepartmentBoqs, missingRequiredByType, missingRequiredDocs } from "@/lib/events/documents";
import type { EventScopeSection } from "@/lib/events/types";
import { aiDraftEventPlan, deleteDeliverable, saveScopeVersion, upsertDeliverable } from "@/lib/events.functions";
import { queryKeys } from "@/lib/query-keys";

const SECTION_KEYS = ["inclusions", "exclusions", "assumptions", "success"] as const;
const NONE = "__none__";

function defaultSections(): EventScopeSection[] {
  return SECTION_KEYS.map((key) => ({ key, title: key, body: "" }));
}

function mergeSections(incoming?: EventScopeSection[] | null): EventScopeSection[] {
  const byKey = new Map((incoming ?? []).map((row) => [row.key, row]));
  return SECTION_KEYS.map((key) => ({
    key,
    title: byKey.get(key)?.title ?? key,
    body: byKey.get(key)?.body ?? "",
  }));
}

function deliverableTone(status: string) {
  if (status === "done") return "success" as const;
  if (status === "in_progress") return "outline" as const;
  if (status === "cancelled") return "outline" as const;
  return "outline" as const;
}

export default function EventScopePage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const canEdit = usePermission("events.edit");
  const eventQ = useEvent(id);
  const scopeQ = useEventScope(id);
  const latest = scopeQ.data?.versions[0];
  const baseline = (scopeQ.data?.versions ?? []).find((row) => row.is_baseline) ?? (latest?.is_baseline ? latest : null);
  const [sections, setSections] = useState<EventScopeSection[]>(defaultSections());
  const [deliv, setDeliv] = useState({ title: "", due_date: "", owner_staff_id: NONE });
  const [brief, setBrief] = useState("");
  const [suggested, setSuggested] = useState<Array<{ title: string; due_date: string | null }>>([]);
  const latestSections = latest?.sections;

  useEffect(() => {
    setSections(mergeSections(latestSections));
  }, [latest?.id, latestSections]);

  const documents = eventQ.data?.documents ?? [];
  const team = eventQ.data?.team ?? [];
  const missingDocs = missingRequiredDocs(documents);
  const missingBoq =
    missingDepartmentBoqs(documents, eventQ.data?.workstreams).length ||
    missingRequiredByType(documents, "boq").length;
  const missingPermits = missingRequiredByType(documents, "permit").length;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.events.all });
  };

  const save = useMutation({
    mutationFn: (isBaseline: boolean) =>
      saveScopeVersion({
        eventId: id,
        title: latest?.title ?? "Scope",
        sections: sections.map((row) => ({ ...row, title: t(`events.scope.section.${row.key}`) })),
        isBaseline,
      }),
    onSuccess: (_, isBaseline) => {
      invalidate();
      toast.success(isBaseline ? t("events.toasts.baseline") : t("events.toasts.scopeSaved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const ev = eventQ.data?.event;
  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";

  const draftScope = useMutation({
    mutationFn: () =>
      aiDraftEventPlan({
        notes: brief || ev?.description || ev?.name || "",
        focus: "scope",
        eventId: id,
        locale,
        event_name: ev?.event_name || ev?.name,
        client_name: ev?.client_name,
        venue_name: ev?.venue_name,
        event_type: ev?.event_type_label_en || ev?.event_type_code,
        event_start: ev?.event_start,
        event_end: ev?.event_end,
      }),
    onSuccess: (result) => {
      setSections(workspaceScopeFromDraft(result.fields.scope_sections));
      if (result.fields.deliverables.length) {
        setSuggested(result.fields.deliverables);
      }
      toast.success(result.ai_generated ? t("events.builder.ai.applied") : t("events.builder.ai.fallback"));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addDeliv = useMutation({
    mutationFn: (input: { title: string; due_date?: string | null }) =>
      upsertDeliverable({
        eventId: id,
        title: input.title,
        due_date: input.due_date || null,
        owner_staff_id: deliv.owner_staff_id === NONE ? null : deliv.owner_staff_id,
        status: "pending",
      }),
    onSuccess: (_, input) => {
      setSuggested((rows) => rows.filter((row) => row.title !== input.title));
      if (input.title === deliv.title) {
        setDeliv({ title: "", due_date: "", owner_staff_id: NONE });
      }
      qc.invalidateQueries({ queryKey: queryKeys.events.scope(id) });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const patchDeliv = useMutation({
    mutationFn: (input: { id: string; title: string; status: (typeof DELIVERABLE_STATUSES)[number]; due_date: string | null; owner_staff_id: string | null }) =>
      upsertDeliverable({ ...input, eventId: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.events.scope(id) }),
    onError: (e) => toast.error((e as Error).message),
  });

  const removeDeliv = useMutation({
    mutationFn: (delivId: string) => deleteDeliverable({ id: delivId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.events.scope(id) }),
    onError: (e) => toast.error((e as Error).message),
  });

  const existingDeliv = new Set((scopeQ.data?.deliverables ?? []).map((row) => row.title.trim().toLowerCase()));
  const visibleSuggested = suggested.filter((row) => !existingDeliv.has(row.title.trim().toLowerCase()));

  const chips = useMemo(
    () => (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">{eventQ.data?.event.name}</span>
        {baseline ? (
          <Badge variant="success">{t("events.scope.chip.baseline", { n: baseline.version_no })}</Badge>
        ) : (
          <Badge variant="outline">{t("events.scope.chip.notBaseline")}</Badge>
        )}
        {missingBoq > 0 ? (
          <Badge variant="destructive">{t("events.scope.chip.boqMissing", { n: missingBoq })}</Badge>
        ) : (
          <Badge variant="success">{t("events.scope.chip.boqIn")}</Badge>
        )}
        {missingPermits > 0 ? (
          <Badge variant="warning">{t("events.scope.chip.permitsMissing", { n: missingPermits })}</Badge>
        ) : (
          <Badge variant="success">{t("events.scope.chip.permitsIn")}</Badge>
        )}
        {missingDocs.length > missingBoq + missingPermits ? (
          <Badge variant="warning">{t("events.docs.missingCount", { n: missingDocs.length })}</Badge>
        ) : null}
      </span>
    ),
    [baseline, eventQ.data?.event.name, missingBoq, missingDocs.length, missingPermits, t],
  );

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <PageHeader
        kicker={eventQ.data?.event.event_number ?? undefined}
        title={t("events.scope.title")}
        subtitle={
          <span className="block min-w-0 space-y-1.5">
            <span className="block text-sm text-muted-foreground">{t("events.scope.purpose")}</span>
            {chips}
          </span>
        }
        actions={<EventWorkspaceNav eventId={id} />}
      />

      <section className="min-w-0 space-y-4 rounded-2xl border border-border/40 bg-card p-4">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t("events.scope.current")}</h2>
            <p className="text-xs text-muted-foreground">{t("events.scope.statementHint")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {latest ? (
              <Badge variant={latest.is_baseline ? "success" : "outline"}>
                v{latest.version_no}
                {latest.is_baseline ? ` · ${t("events.scope.baseline")}` : ""}
              </Badge>
            ) : null}
            {canEdit ? (
              <>
                <Button size="sm" variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>
                  {t("events.scope.saveVersion")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => save.mutate(true)} disabled={save.isPending}>
                  {t("events.scope.saveBaseline")}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {canEdit ? (
          <EventAiAssist
            brief={brief}
            onBriefChange={setBrief}
            pending={draftScope.isPending}
            onGenerate={() => draftScope.mutate()}
            generateLabel={t("events.scope.ai.draft")}
            extraAction={{
              label: t("events.scope.ai.suggestDeliverables"),
              onClick: () => {
                const titles = suggestDeliverablesForType(ev?.event_type_label_en, ev?.event_type_code);
                setSuggested(titles.map((title) => ({ title, due_date: ev?.event_start ?? null })));
                toast.success(t("events.scope.ai.suggested"));
              },
            }}
            hint={t("events.scope.ai.hint")}
            compact
          />
        ) : null}

        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          {sections.map((section, idx) => (
            <article key={section.key} className="min-w-0 rounded-xl border border-border/40 bg-background/40 p-3">
              <h3 className="text-sm font-semibold">{t(`events.scope.section.${section.key}`)}</h3>
              <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
                {t(`events.scope.help.${section.key}`)}
              </p>
              <Textarea
                rows={5}
                className="min-h-[7.5rem] resize-y text-sm"
                value={section.body}
                disabled={!canEdit}
                placeholder={t(`events.scope.placeholder.${section.key}`)}
                onChange={(e) =>
                  setSections((rows) => rows.map((row, i) => (i === idx ? { ...row, body: e.target.value } : row)))
                }
              />
            </article>
          ))}
        </div>
        {(scopeQ.data?.versions.length ?? 0) > 1 ? (
          <p className="text-xs text-muted-foreground">{t("events.scope.versions", { n: scopeQ.data?.versions.length })}</p>
        ) : null}
      </section>

      <section className="min-w-0 space-y-3 rounded-2xl border border-border/40 bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">{t("events.scope.deliverables")}</h2>
          <p className="text-xs text-muted-foreground">{t("events.scope.deliverablesHint")}</p>
        </div>
        {canEdit && visibleSuggested.length ? (
          <ul className="space-y-2 rounded-xl border border-dashed border-border/60 bg-muted/20 p-3 text-sm">
            <li className="text-xs font-semibold text-muted-foreground">{t("events.scope.ai.suggested")}</li>
            {visibleSuggested.map((row) => (
              <li key={row.title} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  {row.title}
                  {row.due_date ? <span className="ms-2 text-xs text-muted-foreground">{row.due_date}</span> : null}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={addDeliv.isPending}
                  onClick={() => addDeliv.mutate({ title: row.title, due_date: row.due_date })}
                >
                  {t("events.scope.ai.addRow")}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {(scopeQ.data?.deliverables ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("events.scope.noDeliverables")}</p>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("events.scope.deliverableTitle")}</TableHead>
                  <TableHead>{t("events.scope.owner")}</TableHead>
                  <TableHead>{t("events.scope.due")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  {canEdit ? <TableHead className="w-20" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(scopeQ.data?.deliverables ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.title}</TableCell>
                    <TableCell className="min-w-[10rem]">
                      {canEdit && team.length ? (
                        <Select
                          value={row.owner_staff_id ?? NONE}
                          disabled={patchDeliv.isPending}
                          onValueChange={(value) =>
                            patchDeliv.mutate({
                              id: row.id,
                              title: row.title,
                              status: row.status,
                              due_date: row.due_date,
                              owner_staff_id: value === NONE ? null : value,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={t("events.docs.unassigned")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>{t("events.docs.unassigned")}</SelectItem>
                            {team.map((member) => (
                              <SelectItem key={member.staff_id} value={member.staff_id}>
                                {member.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground">{row.owner_name ?? t("events.docs.unassigned")}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{row.due_date ?? "—"}</TableCell>
                    <TableCell>
                      {canEdit ? (
                        <Select
                          value={row.status}
                          disabled={patchDeliv.isPending}
                          onValueChange={(value) =>
                            patchDeliv.mutate({
                              id: row.id,
                              title: row.title,
                              status: value as (typeof DELIVERABLE_STATUSES)[number],
                              due_date: row.due_date,
                              owner_staff_id: row.owner_staff_id,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-[8.5rem] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DELIVERABLE_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                {t(`events.deliverable.${status}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={deliverableTone(row.status)}>{t(`events.deliverable.${row.status}`)}</Badge>
                      )}
                    </TableCell>
                    {canEdit ? (
                      <TableCell className="text-end">
                        <Button size="sm" variant="ghost" onClick={() => removeDeliv.mutate(row.id)}>
                          {t("common.delete")}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {canEdit ? (
          <div className="flex min-w-0 flex-wrap gap-2">
            <Input
              className="min-w-[12rem] flex-1"
              placeholder={t("events.scope.deliverableTitle")}
              value={deliv.title}
              onChange={(e) => setDeliv((d) => ({ ...d, title: e.target.value }))}
            />
            <Select value={deliv.owner_staff_id} onValueChange={(value) => setDeliv((d) => ({ ...d, owner_staff_id: value }))}>
              <SelectTrigger className="w-[11rem]"><SelectValue placeholder={t("events.scope.owner")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("events.docs.unassigned")}</SelectItem>
                {team.map((member) => (
                  <SelectItem key={member.staff_id} value={member.staff_id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              className="w-40"
              value={deliv.due_date}
              onChange={(e) => setDeliv((d) => ({ ...d, due_date: e.target.value }))}
            />
            <Button
              size="sm"
              disabled={!deliv.title || addDeliv.isPending}
              onClick={() => addDeliv.mutate({ title: deliv.title, due_date: deliv.due_date || null })}
            >
              {t("events.scope.addDeliverable")}
            </Button>
          </div>
        ) : null}
      </section>

      <EventDocumentsPanel
        eventId={id}
        documents={documents}
        team={team}
        workstreams={eventQ.data?.workstreams}
        canEdit={canEdit}
        onChanged={invalidate}
      />
    </div>
  );
}
