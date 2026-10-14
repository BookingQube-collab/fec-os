"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ArcadeEmpty, ArcadeHero, Field, StatusBadge } from "@/components/arcade/ui";
import GlideSelect from "@/components/react-bits/glide-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getArcadeContext } from "@/lib/arcade.functions";
import { listTaskBoard, moveTaskBoard, saveTaskBoard, signOffTaskBoard, type TaskCard } from "@/lib/arcade-tasks.functions";
import {
  calendarDays,
  kanbanColumns,
  sourceHref,
  sourceKey,
  TASK_KINDS,
  TASK_PRIORITIES,
  TASK_SPANS,
  TASK_STATUSES,
  tasksForViewer,
  workloadSummary,
  type TaskKind,
  type TaskPriority,
  type TaskSpan,
  type TaskStatus,
} from "@/lib/arcade/task-board";
import { queryKeys } from "@/lib/query-keys";

type BoardView = "mine" | "team" | "calendar" | "kanban" | "workload";

const VIEWS: BoardView[] = ["mine", "team", "calendar", "kanban", "workload"];

function shiftDay(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function ArcadeTasks() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [view, setView] = useState<BoardView>("kanban");
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const context = useQuery({ queryKey: queryKeys.arcade.context(), queryFn: () => getArcadeContext({}) });
  const board = useQuery({
    queryKey: [...queryKeys.arcade.all, "task-board", anchor ?? "current"],
    queryFn: () => listTaskBoard(anchor ? { anchor } : {}),
  });
  const refresh = () => {
    toast.success(t("arcadeScreens.boardSaved"));
    void qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
  };
  const fail = (error: unknown) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.boardSaveFailed"));
  const save = useMutation({ mutationFn: saveTaskBoard, onSuccess: refresh, onError: fail });
  const move = useMutation({ mutationFn: moveTaskBoard, onSuccess: refresh, onError: fail });
  const sign = useMutation({ mutationFn: signOffTaskBoard, onSuccess: () => { toast.success(t("arcadeScreens.boardSigned")); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); }, onError: fail });

  const staffId = board.data?.staffId ?? context.data?.staff?.id ?? null;
  const canAssign = board.data?.canAssign ?? context.data?.canAssign ?? false;
  const canVerify = board.data?.canVerify ?? false;
  const listScope = view === "team" ? "team" : view === "mine" ? "mine" : scope;
  const tasks = useMemo(
    () => tasksForViewer(board.data?.tasks ?? [], staffId, listScope),
    [board.data?.tasks, staffId, listScope],
  );
  const sources = useMemo(() => {
    const rows = board.data?.sources ?? [];
    if (listScope === "team") return rows;
    return rows.filter((row) => !row.technicianStaffId || row.technicianStaffId === staffId);
  }, [board.data?.sources, listScope, staffId]);
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const person of context.data?.technicians ?? []) map.set(person.id, person.full_name);
    return map;
  }, [context.data?.technicians]);
  const columns = kanbanColumns(tasks);
  const days = board.data?.bounds.days ?? [];
  const calendar = calendarDays(tasks, days);
  const workload = workloadSummary(tasks);
  const linked = new Set((board.data?.tasks ?? []).filter((row) => row.sourceType && row.sourceId).map((row) => sourceKey(row.sourceType!, row.sourceId!, row.dueOn)));

  const nameFor = (id: string | null) => (id ? names.get(id) ?? t("arcadeScreens.boardUnassigned") : t("arcadeScreens.boardUnassigned"));

  return (
    <div className="arcade-stack">
      <ArcadeHero
        kicker={t("nav.arcade")}
        title={t("arcadeScreens.boardTitle")}
        subtitle={t("arcadeScreens.boardHint")}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setAnchor(shiftDay(board.data?.bounds.start ?? new Date().toISOString().slice(0, 10), -7))}>{t("common.prev")}</Button>
            <Button type="button" variant="outline" onClick={() => setAnchor(undefined)}>{t("arcadeScreens.thisWeek")}</Button>
            <Button type="button" variant="outline" onClick={() => setAnchor(shiftDay(board.data?.bounds.end ?? new Date().toISOString().slice(0, 10), 1))}>{t("common.next")}</Button>
          </div>
        )}
      />
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((item) => (
          <Button key={item} type="button" variant={view === item ? "default" : "outline"} onClick={() => setView(item)}>
            {t(`arcadeScreens.boardViews.${item}`)}
          </Button>
        ))}
      </div>
      {view !== "mine" && view !== "team" ? (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={scope === "mine" ? "default" : "outline"} onClick={() => setScope("mine")}>{t("arcadeScreens.boardViews.mine")}</Button>
          <Button type="button" size="sm" variant={scope === "team" ? "default" : "outline"} onClick={() => setScope("team")}>{t("arcadeScreens.boardViews.team")}</Button>
        </div>
      ) : null}
      {board.isError ? <p className="text-sm text-destructive">{board.error instanceof Error ? board.error.message : t("arcadeScreens.boardSaveFailed")}</p> : null}

      {view === "kanban" ? (
        <div className="grid gap-3 md:grid-cols-4">
          {TASK_STATUSES.map((status) => (
            <section key={status} className="arcade-panel">
              <h2 className="arcade-panel__title">{t(`arcadeScreens.boardColumns.${status}`)}</h2>
              <div className="arcade-list mt-3">
                {columns[status].length === 0 ? <p className="text-sm text-muted-foreground">{t("arcadeScreens.boardEmpty")}</p> : null}
                {columns[status].map((row) => (
                  <TaskCardView
                    key={row.id}
                    row={row as TaskCard}
                    tasks={board.data?.tasks ?? []}
                    canVerify={canVerify}
                    staffId={staffId}
                    nameFor={nameFor}
                    busy={move.isPending || sign.isPending}
                    onMove={(status, evidence, actualMinutes) => move.mutate({ id: row.id, status, evidence, actualMinutes })}
                    onSign={(decision, note) => sign.mutate({ id: row.id, decision, note })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {view === "calendar" ? (
        <section className="arcade-panel">
          <h2 className="arcade-panel__title">{board.data ? `${board.data.bounds.start} – ${board.data.bounds.end}` : t("arcadeScreens.thisWeek")}</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-7">
            {days.map((day) => (
              <div key={day} className="arcade-metric">
                <p className="text-xs font-semibold">{day}</p>
                {(calendar[day] ?? []).map((row) => (
                  <p key={`${day}-${row.id}`} className="mt-1 text-xs">{row.title}</p>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {view === "workload" ? (
        <section className="arcade-panel">
          <h2 className="arcade-panel__title">{t("arcadeScreens.boardViews.workload")}</h2>
          <div className="arcade-list mt-3">
            {workload.length === 0 ? <ArcadeEmpty title={t("arcadeScreens.boardEmpty")} /> : null}
            {workload.map((row) => (
              <article key={row.staffId ?? "none"} className="arcade-row arcade-row--block">
                <p className="font-medium">{nameFor(row.staffId)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("arcadeScreens.boardOpenCount")} {row.open}
                  {" · "}
                  {t("arcadeScreens.boardDoneCount")} {row.done}
                  {" · "}
                  {t("arcadeScreens.boardPendingCount")} {row.pendingSignoff}
                  {" · "}
                  {t("arcadeScreens.boardEstimateTotal")} {t("arcadeScreens.boardMinutes", { count: row.estimatedMinutes })}
                  {" · "}
                  {t("arcadeScreens.boardActualTotal")} {t("arcadeScreens.boardMinutes", { count: row.actualMinutes })}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {view === "mine" || view === "team" ? (
        <>
          <TaskDraft
            tasks={board.data?.tasks ?? []}
            technicians={context.data?.technicians ?? []}
            staffId={staffId}
            canAssign={canAssign && view === "team"}
            pending={save.isPending}
            onSave={(input) => save.mutate(input)}
          />
          <section className="arcade-panel">
            <h2 className="arcade-panel__title">{t("arcadeScreens.boardSources")}</h2>
            <div className="arcade-list mt-3">
              {sources.length === 0 ? <ArcadeEmpty title={t("arcadeScreens.boardSourcesEmpty")} /> : null}
              {sources.map((source) => {
                const key = sourceKey(source.sourceType, source.sourceId, source.dueOn);
                if (linked.has(key)) return null;
                return (
                  <article key={key} className="arcade-row arcade-row--block">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{source.title}</p>
                        <p className="text-sm text-muted-foreground">{source.machineLabel ?? source.dueOn} · {t(`arcadeScreens.boardKinds.${source.kind}`)}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="arcade-cta"
                        disabled={save.isPending}
                        onClick={() => save.mutate({
                          title: source.title,
                          kind: source.kind,
                          span: "DAY",
                          dueOn: source.dueOn,
                          priority: source.priority,
                          technicianStaffId: source.technicianStaffId ?? staffId,
                          locationId: source.locationId,
                          machineId: source.machineId,
                          sourceType: source.sourceType,
                          sourceId: source.sourceId,
                        })}
                      >
                        {t("arcadeScreens.boardPin")}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
          <section className="arcade-panel">
            <h2 className="arcade-panel__title">{t(`arcadeScreens.boardViews.${view}`)}</h2>
            <div className="arcade-list mt-3">
              {tasks.length === 0 ? <ArcadeEmpty title={t("arcadeScreens.boardEmpty")} /> : null}
              {tasks.map((row) => (
                <TaskCardView
                  key={row.id}
                  row={row as TaskCard}
                  tasks={board.data?.tasks ?? []}
                  canVerify={canVerify}
                  staffId={staffId}
                  nameFor={nameFor}
                  busy={move.isPending || sign.isPending}
                  onMove={(status, evidence, actualMinutes) => move.mutate({ id: row.id, status, evidence, actualMinutes })}
                  onSign={(decision, note) => sign.mutate({ id: row.id, decision, note })}
                />
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function TaskDraft({
  tasks,
  technicians,
  staffId,
  canAssign,
  pending,
  onSave,
}: {
  tasks: TaskCard[];
  technicians: { id: string; full_name: string }[];
  staffId: string | null;
  canAssign: boolean;
  pending: boolean;
  onSave: (input: Parameters<typeof saveTaskBoard>[0]) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TaskKind>("ASSIGNMENT");
  const [span, setSpan] = useState<TaskSpan>("DAY");
  const [dueOn, setDueOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [estimated, setEstimated] = useState("");
  const [dependsOnId, setDependsOnId] = useState("none");
  const [technicianStaffId, setTechnicianStaffId] = useState(staffId ?? "");
  return (
    <section className="arcade-panel">
      <h2 className="arcade-panel__title">{t("arcadeScreens.boardAdd")}</h2>
      <form
        className="mt-3 grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const minutes = estimated.trim() === "" ? null : Number(estimated);
          onSave({
            title,
            kind,
            span,
            dueOn,
            priority,
            estimatedMinutes: Number.isFinite(minutes) ? minutes : null,
            technicianStaffId: canAssign ? technicianStaffId || staffId : staffId,
            dependsOnId: dependsOnId === "none" ? null : dependsOnId,
          });
          setTitle("");
        }}
      >
        <Field label={t("arcadeScreens.description")}><Input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2} maxLength={200} /></Field>
        <Field label={t("arcadeScreens.boardKind")}>
          <GlideSelect ariaLabel={t("arcadeScreens.boardKind")} value={kind} showTags={false} onChange={(value) => setKind(value as TaskKind)} options={TASK_KINDS.map((item) => ({ value: item, label: t(`arcadeScreens.boardKinds.${item}`) }))} />
        </Field>
        <Field label={t("arcadeScreens.boardSpan")}>
          <GlideSelect ariaLabel={t("arcadeScreens.boardSpan")} value={span} showTags={false} onChange={(value) => setSpan(value as TaskSpan)} options={TASK_SPANS.map((item) => ({ value: item, label: t(`arcadeScreens.boardSpans.${item}`) }))} />
        </Field>
        <Field label={t("arcadeScreens.boardDue")}><Input type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} required /></Field>
        <Field label={t("arcadeScreens.boardPriority")}>
          <GlideSelect ariaLabel={t("arcadeScreens.boardPriority")} value={priority} showTags={false} onChange={(value) => setPriority(value as TaskPriority)} options={TASK_PRIORITIES.map((item) => ({ value: item, label: t(`arcadeScreens.boardPriorities.${item}`) }))} />
        </Field>
        <Field label={t("arcadeScreens.boardEstimate")}><Input type="number" min={0} max={10080} value={estimated} onChange={(event) => setEstimated(event.target.value)} /></Field>
        <Field label={t("arcadeScreens.boardDepends")}>
          <GlideSelect
            ariaLabel={t("arcadeScreens.boardDepends")}
            value={dependsOnId}
            showTags={false}
            onChange={setDependsOnId}
            options={[{ value: "none", label: t("arcadeScreens.boardNoDepend") }, ...tasks.map((row) => ({ value: row.id, label: row.title }))]}
          />
        </Field>
        {canAssign ? (
          <Field label={t("arcadeScreens.boardTechnician")}>
            <GlideSelect
              ariaLabel={t("arcadeScreens.boardTechnician")}
              value={technicianStaffId}
              showTags={false}
              onChange={setTechnicianStaffId}
              options={technicians.map((person) => ({ value: person.id, label: person.full_name }))}
            />
          </Field>
        ) : null}
        <div className="md:col-span-2">
          <Button type="submit" className="arcade-cta" disabled={pending || title.trim().length < 2}>{t("arcadeScreens.boardSave")}</Button>
        </div>
      </form>
    </section>
  );
}

function TaskCardView({
  row,
  tasks,
  canVerify,
  staffId,
  nameFor,
  busy,
  onMove,
  onSign,
}: {
  row: TaskCard;
  tasks: TaskCard[];
  canVerify: boolean;
  staffId: string | null;
  nameFor: (id: string | null) => string;
  busy: boolean;
  onMove: (status: TaskStatus, evidence?: string, actualMinutes?: number | null) => void;
  onSign: (decision: "APPROVED" | "RETURNED", note?: string) => void;
}) {
  const { t } = useTranslation();
  const [evidence, setEvidence] = useState(row.evidence ?? "");
  const [actual, setActual] = useState(row.actualMinutes?.toString() ?? "");
  const [note, setNote] = useState("");
  const predecessor = tasks.find((item) => item.id === row.dependsOnId);
  const blocked = Boolean(predecessor && predecessor.status !== "DONE" && row.status !== "DONE");
  const href = sourceHref(row.sourceType, row.sourceId, row.machineId);
  const own = Boolean(staffId && row.technicianStaffId === staffId);
  const minutes = actual.trim() === "" ? null : Number(actual);
  return (
    <article className="arcade-row arcade-row--block">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{row.title}</p>
        <StatusBadge status={row.priority.toUpperCase()} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(`arcadeScreens.boardKinds.${row.kind}`)}
        {" · "}
        {t(`arcadeScreens.boardSpans.${row.span}`)}
        {" · "}
        {row.dueOn}
        {" · "}
        {nameFor(row.technicianStaffId)}
      </p>
      {row.machineLabel ? <p className="text-sm text-muted-foreground">{row.machineLabel}</p> : null}
      {predecessor ? <p className="text-sm text-muted-foreground">{t("arcadeScreens.boardDepends")}: {predecessor.title}</p> : null}
      {blocked ? <p className="text-sm">{t("arcadeScreens.boardBlocked")}</p> : null}
      {row.verification === "PENDING" ? <p className="text-sm">{t("arcadeScreens.boardPending")}</p> : null}
      {row.verification === "APPROVED" ? <p className="text-sm">{t("arcadeScreens.boardApproved")}</p> : null}
      {row.verification === "RETURNED" ? <p className="text-sm">{t("arcadeScreens.boardReturned")}{row.verificationNote ? ` · ${row.verificationNote}` : ""}</p> : null}
      {href ? <Link className="text-sm font-medium" href={href}>{t("arcadeScreens.boardOpenSource")}</Link> : null}
      {row.status !== "DONE" && row.verification !== "APPROVED" ? (
        <div className="mt-2 grid gap-2">
          <Textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder={t("arcadeScreens.boardEvidence")} rows={2} />
          <Input type="number" min={0} max={10080} value={actual} onChange={(event) => setActual(event.target.value)} placeholder={t("arcadeScreens.boardActual")} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="arcade-cta" disabled={busy || blocked} onClick={() => onMove("STARTED")}>{t("arcadeScreens.boardStart")}</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy || blocked} onClick={() => onMove("PAUSED")}>{t("arcadeScreens.boardPause")}</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy || blocked} onClick={() => onMove("DONE", evidence, Number.isFinite(minutes) ? minutes : null)}>{t("arcadeScreens.boardComplete")}</Button>
          </div>
        </div>
      ) : null}
      {canVerify && !own && row.verification === "PENDING" ? (
        <div className="mt-2 grid gap-2">
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("arcadeScreens.note")} rows={2} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="arcade-cta" disabled={busy} onClick={() => onSign("APPROVED", note)}>{t("arcadeScreens.boardApprove")}</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onSign("RETURNED", note)}>{t("arcadeScreens.boardReturn")}</Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
