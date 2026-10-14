"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ArcadeEmpty, ArcadeHero, arcadeStatusName, Field, StatusBadge } from "@/components/arcade/ui";
import GlideSelect from "@/components/react-bits/glide-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import { DEFAULT_PM_CHECKLIST, PM_CADENCES, PM_RESULTS, nextPmDate, type PmCadence, type PmResult } from "@/lib/arcade/domain";
import { localIsoDay, pmDueTone, scheduleForMachine, storedChecklistLabels } from "@/lib/arcade/pm-plan";
import { getArcadeContext, listArcadeMachines } from "@/lib/arcade.functions";
import {
  completePm,
  finishObservation,
  getMyWeek,
  listArcadeObservation,
  listPmHistory,
  listPmSchedules,
  recordObservationCheck,
  savePmSchedule,
  saveWeekTask,
} from "@/lib/arcade-work.functions";
import { queryKeys } from "@/lib/query-keys";

export function ArcadeWeek() {
  const { t } = useTranslation();
  const context = useQuery({ queryKey: queryKeys.arcade.context(), queryFn: () => getArcadeContext({}) });
  const week = useQuery({
    queryKey: [...queryKeys.arcade.all, "week", context.data?.staff?.id ?? null],
    queryFn: () => getMyWeek({}),
  });
  const qc = useQueryClient();
  const today = week.data?.today;
  const todayItems = (week.data?.items ?? []).filter((item) => item.date <= (today ?? "9999"));
  const act = useMutation({
    mutationFn: (input: { id?: string; status: "STARTED" | "PAUSED" | "DONE"; title: string; date: string }) =>
      saveWeekTask({
        id: input.id,
        staffId: week.data?.staffId ?? context.data?.staff?.id ?? "",
        taskDate: input.date,
        kind: "task",
        title: input.title,
        status: input.status,
      }),
    onSuccess: () => { toast.success(t("arcadeScreens.weekUpdated")); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.taskFailed")),
  });
  return (
    <div className="arcade-stack">
      <ArcadeHero
        kicker={t("nav.arcade")}
        title={t("arcadeScreens.weekTitle")}
        actions={<Button asChild variant="outline"><Link href="/arcade/tasks">{t("arcadeScreens.boardLink")}</Link></Button>}
      />
      <section className="arcade-panel">
        <h2 className="arcade-panel__title">{t("arcadeScreens.today")}</h2>
        <div className="arcade-list mt-3">
          {todayItems.length === 0 ? (
            <ArcadeEmpty
              title={t("arcadeFlow.weekEmpty")}
              action={(
                <>
                  <Button asChild className="arcade-cta"><Link href="/arcade/repair">{t("arcadeSimple.start")}</Link></Button>
                  <Button asChild variant="outline"><Link href="/arcade/checklist">{t("arcadeSimple.checklistTitle")}</Link></Button>
                </>
              )}
            />
          ) : null}
          {todayItems.map((item) => (
            <article key={`${item.kind}-${item.id}`} className="arcade-row arcade-row--block">
              <div className="flex items-center justify-between gap-2"><a className="font-medium" href={item.href}>{item.title}</a><StatusBadge status={item.priority.toUpperCase()} /></div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" type="button" className="arcade-cta" onClick={() => act.mutate({ title: item.title, date: item.date, status: "STARTED" })}>{t("arcadeScreens.start")}</Button>
                <Button size="sm" type="button" variant="outline" onClick={() => act.mutate({ title: item.title, date: item.date, status: "PAUSED" })}>{t("arcadeScreens.pause")}</Button>
                <Button size="sm" type="button" variant="outline" onClick={() => act.mutate({ title: item.title, date: item.date, status: "DONE" })}>{t("arcadeScreens.complete")}</Button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="arcade-panel">
        <h2 className="arcade-panel__title">{t("arcadeScreens.thisWeek")}</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-7">
          {(week.data?.bounds.days ?? []).map((day) => (
            <div key={day} className="arcade-metric">
              <p className="text-xs font-semibold">{day}</p>
              {(week.data?.items ?? []).filter((item) => item.date === day).map((item) => (
                <p key={item.id} className="mt-1 text-xs">{item.title}</p>
              ))}
              {(week.data?.tasks ?? []).filter((task) => task.task_date === day).map((task) => (
                <p key={task.id} className="mt-1 text-xs">{task.title} · {arcadeStatusName(t, task.status)}</p>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function blankChecklist(labels: readonly string[]) {
  return labels.map((label) => ({ label, result: "PASS" as PmResult, notes: "" }));
}

function checklistCopy(t: (key: string) => string, label: string, index: number) {
  return DEFAULT_PM_CHECKLIST[index] === label ? t(`arcadeScreens.pm.${index}`) : label;
}

export function ArcadePm() {
  const { t } = useTranslation();
  const search = useSearchParams();
  const canOperate = usePermission("arcade.operate");
  const canPlan = usePermission("arcade.manage") || usePermission("arcade.assign");
  const machineId = search.get("machineId") ?? "";
  const [selected, setSelected] = useState(machineId);
  const [appliedKey, setAppliedKey] = useState("");
  const [items, setItems] = useState(blankChecklist(DEFAULT_PM_CHECKLIST));
  const [cadence, setCadence] = useState<PmCadence>("WEEKLY");
  const [customDays, setCustomDays] = useState(30);
  const [nextDue, setNextDue] = useState("");
  const [notes, setNotes] = useState("");
  const schedules = useQuery({
    queryKey: [...queryKeys.arcade.all, "pm", selected],
    queryFn: () => listPmSchedules({ machineId: selected, page: 1, pageSize: 25 }),
    enabled: Boolean(selected),
  });
  const history = useQuery({
    queryKey: [...queryKeys.arcade.all, "pm-history", selected],
    queryFn: () => listPmHistory({ machineId: selected }),
    enabled: Boolean(selected),
  });
  const machines = useQuery({ queryKey: queryKeys.arcade.machines({ pm: true }), queryFn: () => listArcadeMachines({ page: 1, pageSize: 200 }) });
  const schedule = useMemo(
    () => scheduleForMachine(schedules.data?.rows ?? [], selected),
    [schedules.data, selected],
  );
  const loadedKey = schedules.isSuccess ? `${selected}:${schedule?.id ?? "none"}` : "";
  useEffect(() => {
    if (!loadedKey || loadedKey === appliedKey) return;
    const labels = storedChecklistLabels(schedule?.checklist);
    const storedCadence = (PM_CADENCES as readonly string[]).includes(schedule?.cadence ?? "")
      ? (schedule?.cadence as PmCadence)
      : "WEEKLY";
    const interval = schedule?.custom_interval_days ?? 30;
    setAppliedKey(loadedKey);
    setItems(blankChecklist(labels));
    setCadence(storedCadence);
    setCustomDays(interval);
    setNextDue(schedule?.next_due_on?.slice(0, 10) ?? nextPmDate(storedCadence, localIsoDay(new Date()), interval));
    setNotes("");
  }, [appliedKey, loadedKey, schedule]);
  const qc = useQueryClient();
  const today = localIsoDay(new Date());
  const dueTone = pmDueTone(schedule?.next_due_on, today);
  const machine = machines.data?.rows.find((row) => row.id === selected);
  const complete = useMutation({
    mutationFn: () => {
      if (!machine) throw new Error(t("arcadeScreens.selectMachineError"));
      return completePm({
        scheduleId: schedule?.id ?? null,
        machineId: machine.id,
        locationId: machine.location_id,
        notes,
        items,
      });
    },
    onSuccess: (result) => {
      toast.success(result.faultTickets.length ? t("arcadeScreens.pmDoneFaults", { tickets: result.faultTickets.join(", ") }) : t("arcadeScreens.pmDone"));
      setItems(blankChecklist(items.map((item) => item.label)));
      setNotes("");
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.pmFailed")),
  });
  const saveSchedule = useMutation({
    mutationFn: () => {
      if (!machine) throw new Error(t("arcadeScreens.selectMachineError"));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) throw new Error(t("arcadeScreens.pmNextDue"));
      return savePmSchedule({
        id: schedule?.id,
        machineId: machine.id,
        locationId: machine.location_id,
        cadence,
        customIntervalDays: cadence === "CUSTOM" ? customDays : null,
        checklist: items.map((item) => item.label),
        nextDueOn: nextDue,
      });
    },
    onSuccess: () => {
      toast.success(t("arcadeScreens.pmScheduleSaved"));
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.scheduleFailed")),
  });
  return (
    <div className="arcade-stack">
      <header className="cc-head">
        <div>
          <Link className="ws-back" href="/arcade">{t("nav.arcadeDashboard")}</Link>
          <h1>{t("arcadeScreens.pmTitle")}</h1>
          <p>{t("arcadeScreens.pmFailHint")}</p>
        </div>
      </header>
      <section className="arcade-panel grid gap-3">
        <Field label={t("arcadeScreens.machine")}>
          <GlideSelect
            ariaLabel={t("arcadeScreens.machine")}
            value={selected}
            placeholder={t("arcadeScreens.selectMachine")}
            showTags={false}
            menuWidth={360}
            onChange={setSelected}
            options={(machines.data?.rows ?? []).map((row) => ({ value: row.id, label: `${row.asset_code} · ${row.name}` }))}
          />
        </Field>
        {selected && schedule ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`cc-due cc-due--${dueTone === "none" ? "later" : dueTone}`}>
              {dueTone === "over" ? `${t("arcadeScreens.pmOverdue")} · ` : ""}
              {t("arcadeScreens.pmDueLine", { date: schedule.next_due_on ?? "—", cadence: arcadeStatusName(t, String(schedule.cadence ?? "")) })}
            </span>
          </p>
        ) : null}
        {selected && schedules.isSuccess && !schedule ? <p className="cc-note">{t("arcadeScreens.pmNoSchedule")}</p> : null}
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t("arcadeScreens.pmCadence")}>
            <select className="arcade-select" value={cadence} onChange={(event) => setCadence(event.target.value as PmCadence)} disabled={!canPlan}>
              {PM_CADENCES.map((value) => (
                <option key={value} value={value}>{arcadeStatusName(t, value)}</option>
              ))}
            </select>
          </Field>
          {cadence === "CUSTOM" ? (
            <Field label={t("arcadeScreens.pmCustomDays")}>
              <Input type="number" min={1} max={365} value={customDays} disabled={!canPlan} onChange={(event) => setCustomDays(Number(event.target.value) || 1)} />
            </Field>
          ) : null}
          <Field label={t("arcadeScreens.pmNextDue")}>
            <Input type="date" value={nextDue} disabled={!canPlan} onChange={(event) => setNextDue(event.target.value)} />
          </Field>
        </div>
      </section>
      {!selected ? <ArcadeEmpty title={t("arcadeScreens.selectMachine")} /> : null}
      {!canOperate ? <p className="arcade-note">{t("arcadeSimple.lookOnly")}</p> : null}
      {selected ? (
        <div className="grid gap-2">
          {items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="arcade-panel arcade-panel--tight grid gap-2 md:grid-cols-[1fr_180px]">
              <p className="text-sm font-medium">{checklistCopy(t, item.label, index)}</p>
              <GlideSelect
                ariaLabel={checklistCopy(t, item.label, index)}
                value={item.result}
                showTags={false}
                onChange={(value) => {
                  const next = [...items];
                  next[index] = { ...item, result: value as PmResult };
                  setItems(next);
                }}
                options={PM_RESULTS.map((result) => ({ value: result, label: arcadeStatusName(t, result) }))}
              />
              {item.result === "FAIL" || item.result === "ATTENTION" ? (
                <Textarea className="md:col-span-2" placeholder={t("arcadeScreens.pmAttention")} value={item.notes} onChange={(event) => {
                  const next = [...items];
                  next[index] = { ...item, notes: event.target.value };
                  setItems(next);
                }} />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {selected ? <Field label={t("arcadeScreens.notes")}><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field> : null}
      {selected ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="arcade-cta"
            disabled={!canOperate || complete.isPending}
            onClick={() => {
              const missing = items.some((item) => (item.result === "FAIL" || item.result === "ATTENTION") && !item.notes.trim());
              if (missing) {
                toast.error(t("arcadeScreens.pmNoteNeeded"));
                return;
              }
              complete.mutate();
            }}
          >
            {t("arcadeScreens.completePm")}
          </Button>
          {canPlan ? (
            <Button type="button" variant="outline" disabled={saveSchedule.isPending} onClick={() => saveSchedule.mutate()}>
              {t("arcadeScreens.pmSaveSchedule")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {selected ? (
        <section className="arcade-panel">
          <h2 className="arcade-panel__title">{t("arcadeScreens.pmHistory")}</h2>
          {(history.data?.rows.length ?? 0) === 0 && history.isSuccess ? <p className="cc-note mt-2">{t("arcadeScreens.pmHistoryEmpty")}</p> : null}
          <ul className="arcade-list mt-2 text-sm">
            {(history.data?.rows ?? []).map((row) => (
              <li key={row.id} className="arcade-row">
                {t("arcadeScreens.pmHistoryLine", {
                  date: row.performed_on,
                  next: row.next_pm_on ?? "—",
                })}
                {row.issues_found ? ` · ${row.issues_found}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function ArcadeObservation() {
  const { t } = useTranslation();
  const list = useQuery({ queryKey: [...queryKeys.arcade.all, "observation"], queryFn: () => listArcadeObservation({ page: 1, pageSize: 25 }) });
  const machines = useQuery({ queryKey: queryKeys.arcade.machines({ observation: true }), queryFn: () => listArcadeMachines({ page: 1, pageSize: 200 }) });
  const qc = useQueryClient();
  const [closure, setClosure] = useState({ problem: "", diagnosis: "", actionTaken: "", partsUsed: "None", testingPerformed: "", finalResult: "", recommendations: "" });
  const check = useMutation({
    mutationFn: (input: { id: string; result: "PASS" | "ISSUE_FOUND" }) =>
      recordObservationCheck({ observationId: input.id, result: input.result }),
    onSuccess: () => { toast.success(t("arcadeScreens.observationRecorded")); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.checkFailed")),
  });
  return (
    <div className="arcade-stack">
      <ArcadeHero kicker={t("nav.arcade")} title={t("arcadeScreens.observeTitle")} />
      {(list.data?.rows ?? []).map((row) => (
        <article key={row.id} className="arcade-panel">
          <div className="flex items-center justify-between"><span className="font-medium">{t("arcadeScreens.observationOf", { name: machines.data?.rows.find((machine) => machine.id === row.machine_id)?.name ?? t("arcadeScreens.machine") })}</span><StatusBadge status={row.status} /></div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" type="button" className="arcade-cta" onClick={() => check.mutate({ id: row.id, result: "PASS" })}>{t("arcadeScreens.pass")}</Button>
            <Button size="sm" type="button" variant="outline" onClick={() => check.mutate({ id: row.id, result: "ISSUE_FOUND" })}>{t("arcadeScreens.issueFound")}</Button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Field label={t("arcadeScreens.problem")}><Textarea value={closure.problem} onChange={(event) => setClosure({ ...closure, problem: event.target.value })} /></Field>
            <Field label={t("arcadeScreens.diagnosis")}><Textarea value={closure.diagnosis} onChange={(event) => setClosure({ ...closure, diagnosis: event.target.value })} /></Field>
            <Field label={t("arcadeScreens.actionTaken")}><Textarea value={closure.actionTaken} onChange={(event) => setClosure({ ...closure, actionTaken: event.target.value })} /></Field>
            <Field label={t("arcadeScreens.partsUsed")}><Textarea value={closure.partsUsed} onChange={(event) => setClosure({ ...closure, partsUsed: event.target.value })} /></Field>
            <Field label={t("arcadeScreens.testing")}><Textarea value={closure.testingPerformed} onChange={(event) => setClosure({ ...closure, testingPerformed: event.target.value })} /></Field>
            <Field label={t("arcadeScreens.finalResult")}><Textarea value={closure.finalResult} onChange={(event) => setClosure({ ...closure, finalResult: event.target.value })} /></Field>
            <Field label={t("arcadeScreens.recommendations")}><Textarea value={closure.recommendations} onChange={(event) => setClosure({ ...closure, recommendations: event.target.value })} /></Field>
            <div className="flex gap-2">
              <Button size="sm" type="button" variant="secondary" onClick={() => finishObservation({ observationId: row.id, id: row.fault_id ?? row.id, status: "RESOLVED", decision: "RETURN_WORKING", ...closure }).then(() => toast.success(t("arcadeScreens.returnedWorking"))).catch((error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.returnFailed")))}>{t("arcadeScreens.returnWorking")}</Button>
              <Button size="sm" type="button" variant="outline" onClick={() => finishObservation({ observationId: row.id, id: row.fault_id ?? row.id, status: "UNDER_REPAIR", decision: "REOPEN", ...closure }).then(() => toast.success(t("arcadeScreens.repairReopened"))).catch((error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.reopenFailed")))}>{t("arcadeScreens.reopenRepair")}</Button>
            </div>
          </div>
        </article>
      ))}
      {(list.data?.rows.length ?? 0) === 0 ? <ArcadeEmpty title={t("arcadeFlow.observeEmpty")} /> : null}
    </div>
  );
}
