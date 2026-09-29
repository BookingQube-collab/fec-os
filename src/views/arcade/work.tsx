"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { arcadeStatusName, Field, StatusBadge } from "@/components/arcade/ui";
import GlideSelect from "@/components/react-bits/glide-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_PM_CHECKLIST, PM_RESULTS, type PmResult } from "@/lib/arcade/domain";
import { getArcadeContext, listArcadeMachines } from "@/lib/arcade.functions";
import {
  completePm,
  finishObservation,
  getMyWeek,
  listArcadeObservation,
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
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">{t("arcadeScreens.weekTitle")}</h1>
      <section>
        <h2 className="font-semibold">{t("arcadeScreens.today")}</h2>
        <div className="mt-2 grid gap-2">
          {todayItems.length === 0 ? <p className="text-sm text-muted-foreground">{t("arcadeScreens.nothingToday")}</p> : null}
          {todayItems.map((item) => (
            <article key={`${item.kind}-${item.id}`} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2"><a className="font-medium" href={item.href}>{item.title}</a><StatusBadge status={item.priority.toUpperCase()} /></div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" type="button" onClick={() => act.mutate({ title: item.title, date: item.date, status: "STARTED" })}>{t("arcadeScreens.start")}</Button>
                <Button size="sm" type="button" variant="outline" onClick={() => act.mutate({ title: item.title, date: item.date, status: "PAUSED" })}>{t("arcadeScreens.pause")}</Button>
                <Button size="sm" type="button" variant="outline" onClick={() => act.mutate({ title: item.title, date: item.date, status: "DONE" })}>{t("arcadeScreens.complete")}</Button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2 className="font-semibold">{t("arcadeScreens.thisWeek")}</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-7">
          {(week.data?.bounds.days ?? []).map((day) => (
            <div key={day} className="rounded-lg border p-2">
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

export function ArcadePm() {
  const { t } = useTranslation();
  const search = useSearchParams();
  const machineId = search.get("machineId");
  const schedules = useQuery({ queryKey: [...queryKeys.arcade.all, "pm", machineId], queryFn: () => listPmSchedules({ machineId, page: 1, pageSize: 25 }) });
  const machines = useQuery({ queryKey: queryKeys.arcade.machines({ pm: true }), queryFn: () => listArcadeMachines({ page: 1, pageSize: 200 }) });
  const [items, setItems] = useState<{ label: string; result: PmResult; notes: string }[]>(
    DEFAULT_PM_CHECKLIST.map((label) => ({ label, result: "PASS", notes: "" })),
  );
  const [selected, setSelected] = useState(machineId ?? "");
  const [notes, setNotes] = useState("");
  const qc = useQueryClient();
  const schedule = useMemo(() => (schedules.data?.rows ?? []).find((row) => row.machine_id === selected), [schedules.data, selected]);
  const complete = useMutation({
    mutationFn: () => {
      const machine = machines.data?.rows.find((row) => row.id === selected);
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
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.pmFailed")),
  });
  const createSchedule = useMutation({
    mutationFn: () => {
      const machine = machines.data?.rows.find((row) => row.id === selected);
      if (!machine) throw new Error(t("arcadeScreens.selectMachineError"));
      const next = new Date();
      next.setDate(next.getDate() + 7);
      return savePmSchedule({
        machineId: machine.id,
        locationId: machine.location_id,
        cadence: "WEEKLY",
        checklist: items.map((item) => item.label),
        nextDueOn: next.toISOString().slice(0, 10),
      });
    },
    onSuccess: () => toast.success(t("arcadeScreens.scheduleSaved")),
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.scheduleFailed")),
  });
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">{t("arcadeScreens.pmTitle")}</h1>
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
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div key={item.label} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_160px]">
            <p className="text-sm font-medium">{t(`arcadeScreens.pm.${index}`)}</p>
            <GlideSelect
              ariaLabel={t(`arcadeScreens.pm.${index}`)}
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
      <Field label={t("arcadeScreens.notes")}><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => complete.mutate()} disabled={complete.isPending}>{t("arcadeScreens.completePm")}</Button>
        <Button type="button" variant="outline" onClick={() => createSchedule.mutate()}>{t("arcadeScreens.saveWeekly")}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("arcadeScreens.pmFailHint")}</p>
      <ul className="grid gap-1 text-sm">
        {(schedules.data?.rows ?? []).map((row) => <li key={row.id}>{t("arcadeScreens.pmDueLine", { date: row.next_due_on, cadence: arcadeStatusName(t, row.cadence) })}</li>)}
      </ul>
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
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold">{t("arcadeScreens.observeTitle")}</h1>
      {(list.data?.rows ?? []).map((row) => (
        <article key={row.id} className="rounded-lg border p-3">
          <div className="flex items-center justify-between"><span className="font-medium">{t("arcadeScreens.observationOf", { name: machines.data?.rows.find((machine) => machine.id === row.machine_id)?.name ?? t("arcadeScreens.machine") })}</span><StatusBadge status={row.status} /></div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" type="button" onClick={() => check.mutate({ id: row.id, result: "PASS" })}>{t("arcadeScreens.pass")}</Button>
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
      {(list.data?.rows.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">{t("arcadeScreens.noneObserving")}</p> : null}
    </div>
  );
}
