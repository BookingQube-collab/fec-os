"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Field, StatusBadge } from "@/components/arcade/ui";
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
    onSuccess: () => { toast.success("Week updated"); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update the task"),
  });
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">My Week</h1>
      <section>
        <h2 className="font-semibold">Today</h2>
        <div className="mt-2 grid gap-2">
          {todayItems.length === 0 ? <p className="text-sm text-muted-foreground">Nothing assigned for today.</p> : null}
          {todayItems.map((item) => (
            <article key={`${item.kind}-${item.id}`} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2"><a className="font-medium" href={item.href}>{item.title}</a><StatusBadge status={item.priority.toUpperCase()} /></div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" type="button" onClick={() => act.mutate({ title: item.title, date: item.date, status: "STARTED" })}>Start</Button>
                <Button size="sm" type="button" variant="outline" onClick={() => act.mutate({ title: item.title, date: item.date, status: "PAUSED" })}>Pause</Button>
                <Button size="sm" type="button" variant="outline" onClick={() => act.mutate({ title: item.title, date: item.date, status: "DONE" })}>Complete</Button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2 className="font-semibold">This week</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-7">
          {(week.data?.bounds.days ?? []).map((day) => (
            <div key={day} className="rounded-lg border p-2">
              <p className="text-xs font-semibold">{day}</p>
              {(week.data?.items ?? []).filter((item) => item.date === day).map((item) => (
                <p key={item.id} className="mt-1 text-xs">{item.title}</p>
              ))}
              {(week.data?.tasks ?? []).filter((task) => task.task_date === day).map((task) => (
                <p key={task.id} className="mt-1 text-xs">{task.title} · {task.status}</p>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ArcadePm() {
  const search = useSearchParams();
  const machineId = search.get("machineId");
  const schedules = useQuery({ queryKey: [...queryKeys.arcade.all, "pm", machineId], queryFn: () => listPmSchedules({ machineId, page: 1, pageSize: 25 }) });
  const machines = useQuery({ queryKey: queryKeys.arcade.machines({ pm: true }), queryFn: () => listArcadeMachines({ page: 1, pageSize: 50 }) });
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
      if (!machine) throw new Error("Select a machine");
      return completePm({
        scheduleId: schedule?.id ?? null,
        machineId: machine.id,
        locationId: machine.location_id,
        notes,
        items,
      });
    },
    onSuccess: (result) => {
      toast.success(result.faultTickets.length ? `PM completed. Faults opened: ${result.faultTickets.join(", ")}` : "PM completed");
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "PM was not saved"),
  });
  const createSchedule = useMutation({
    mutationFn: () => {
      const machine = machines.data?.rows.find((row) => row.id === selected);
      if (!machine) throw new Error("Select a machine");
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
    onSuccess: () => toast.success("Weekly PM schedule saved"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Schedule was not saved"),
  });
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Preventive maintenance</h1>
      <Field label="Machine">
        <select className="h-10 rounded-md border bg-background px-2" value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">Select machine</option>
          {(machines.data?.rows ?? []).map((row) => <option key={row.id} value={row.id}>{row.asset_code} · {row.name}</option>)}
        </select>
      </Field>
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div key={item.label} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_160px]">
            <p className="text-sm font-medium">{item.label}</p>
            <select className="h-10 rounded-md border bg-background px-2" value={item.result} onChange={(event) => {
              const next = [...items];
              next[index] = { ...item, result: event.target.value as PmResult };
              setItems(next);
            }}>
              {PM_RESULTS.map((result) => <option key={result}>{result}</option>)}
            </select>
            {item.result === "FAIL" || item.result === "ATTENTION" ? (
              <Textarea className="md:col-span-2" placeholder="What needs attention" value={item.notes} onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, notes: event.target.value };
                setItems(next);
              }} />
            ) : null}
          </div>
        ))}
      </div>
      <Field label="Notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => complete.mutate()} disabled={complete.isPending}>Complete PM</Button>
        <Button type="button" variant="outline" onClick={() => createSchedule.mutate()}>Save weekly schedule</Button>
      </div>
      <p className="text-xs text-muted-foreground">A FAIL line opens a separate fault ticket. The PM record stays completed.</p>
      <ul className="grid gap-1 text-sm">
        {(schedules.data?.rows ?? []).map((row) => <li key={row.id}>Due {row.next_due_on} · {row.cadence}</li>)}
      </ul>
    </div>
  );
}

export function ArcadeObservation() {
  const list = useQuery({ queryKey: [...queryKeys.arcade.all, "observation"], queryFn: () => listArcadeObservation({ page: 1, pageSize: 25 }) });
  const machines = useQuery({ queryKey: queryKeys.arcade.machines({ observation: true }), queryFn: () => listArcadeMachines({ page: 1, pageSize: 50 }) });
  const qc = useQueryClient();
  const [closure, setClosure] = useState({ problem: "", diagnosis: "", actionTaken: "", partsUsed: "None", testingPerformed: "", finalResult: "", recommendations: "" });
  const check = useMutation({
    mutationFn: (input: { id: string; result: "PASS" | "ISSUE_FOUND" }) =>
      recordObservationCheck({ observationId: input.id, result: input.result }),
    onSuccess: () => { toast.success("Observation recorded"); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Check failed"),
  });
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold">Under observation</h1>
      {(list.data?.rows ?? []).map((row) => (
        <article key={row.id} className="rounded-lg border p-3">
          <div className="flex items-center justify-between"><span className="font-medium">{machines.data?.rows.find((machine) => machine.id === row.machine_id)?.name ?? "Machine"} observation</span><StatusBadge status={row.status} /></div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" type="button" onClick={() => check.mutate({ id: row.id, result: "PASS" })}>Pass</Button>
            <Button size="sm" type="button" variant="outline" onClick={() => check.mutate({ id: row.id, result: "ISSUE_FOUND" })}>Issue found</Button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Field label="Problem"><Textarea value={closure.problem} onChange={(event) => setClosure({ ...closure, problem: event.target.value })} /></Field>
            <Field label="Diagnosis"><Textarea value={closure.diagnosis} onChange={(event) => setClosure({ ...closure, diagnosis: event.target.value })} /></Field>
            <Field label="Action taken"><Textarea value={closure.actionTaken} onChange={(event) => setClosure({ ...closure, actionTaken: event.target.value })} /></Field>
            <Field label="Parts used"><Textarea value={closure.partsUsed} onChange={(event) => setClosure({ ...closure, partsUsed: event.target.value })} /></Field>
            <Field label="Testing"><Textarea value={closure.testingPerformed} onChange={(event) => setClosure({ ...closure, testingPerformed: event.target.value })} /></Field>
            <Field label="Final result"><Textarea value={closure.finalResult} onChange={(event) => setClosure({ ...closure, finalResult: event.target.value })} /></Field>
            <Field label="Recommendations"><Textarea value={closure.recommendations} onChange={(event) => setClosure({ ...closure, recommendations: event.target.value })} /></Field>
            <div className="flex gap-2">
              <Button size="sm" type="button" variant="secondary" onClick={() => finishObservation({ observationId: row.id, id: row.fault_id ?? row.id, status: "RESOLVED", decision: "RETURN_WORKING", ...closure }).then(() => toast.success("Returned to working")).catch((error) => toast.error(error instanceof Error ? error.message : "Could not return to working"))}>Return to working</Button>
              <Button size="sm" type="button" variant="outline" onClick={() => finishObservation({ observationId: row.id, id: row.fault_id ?? row.id, status: "UNDER_REPAIR", decision: "REOPEN", ...closure }).then(() => toast.success("Repair reopened")).catch((error) => toast.error(error instanceof Error ? error.message : "Could not reopen"))}>Reopen repair</Button>
            </div>
          </div>
        </article>
      ))}
      {(list.data?.rows.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No machines are under observation.</p> : null}
    </div>
  );
}
