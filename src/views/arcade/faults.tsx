"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Field, Pager, StatusBadge } from "@/components/arcade/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import { FAULT_CATEGORIES, FAULT_SEVERITIES, FAULT_STATUSES, OPERATIONAL_IMPACTS } from "@/lib/arcade/domain";
import { getArcadeContext, listArcadeMachines, uploadArcadeFile } from "@/lib/arcade.functions";
import { addArcadeFaultNote, getArcadeFault, listArcadeFaults, reportArcadeFault, setArcadeRepairState, updateArcadeFault } from "@/lib/arcade-work.functions";
import { queryKeys } from "@/lib/query-keys";

export function ArcadeFaults() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: queryKeys.arcade.faults({ page, q }),
    queryFn: () => listArcadeFaults({ page, pageSize: 25, q }),
  });
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Faults & Repairs</h1>
        <Button asChild><Link href="/arcade/faults/new">Report fault</Link></Button>
      </div>
      <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Ticket, description, category" className="max-w-sm" />
      <div className="grid gap-2">
        {(list.data?.rows ?? []).map((row) => (
          <Link key={row.id} href={`/arcade/faults/${row.id}`} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{row.ticket_number}</span>
              <span className="flex gap-1">{row.is_repeat ? <StatusBadge status="REPEAT" /> : null}<StatusBadge status={row.status} /></span>
            </div>
            <p className="text-sm text-muted-foreground">{row.category} · {row.severity} · {row.description}</p>
            {row.is_repeat ? <p className="text-xs">Repeat × {row.repeat_count} · last failure {row.last_failure_at ? new Date(row.last_failure_at).toLocaleDateString() : "—"} · {row.days_since_last_repair ?? "—"} days since last repair</p> : null}
          </Link>
        ))}
      </div>
      <Pager page={page} total={list.data?.total ?? 0} pageSize={25} onPage={setPage} />
    </div>
  );
}

export function ArcadeFaultForm() {
  const search = useSearchParams();
  const context = useQuery({ queryKey: queryKeys.arcade.context(), queryFn: () => getArcadeContext({}) });
  const machines = useQuery({
    queryKey: queryKeys.arcade.machines({ all: search.get("locationId") }),
    queryFn: () => listArcadeMachines({ page: 1, pageSize: 50, locationId: search.get("locationId") }),
  });
  const qc = useQueryClient();
  const [form, setForm] = useState({
    locationId: search.get("locationId") ?? "",
    machineId: search.get("machineId") ?? "",
    technicianStaffId: search.get("technicianId") || context.data?.staff?.id || "",
    category: "Other" as (typeof FAULT_CATEGORIES)[number],
    description: "",
    severity: "MEDIUM" as (typeof FAULT_SEVERITIES)[number],
    operationalImpact: "PARTIALLY_OPERATIONAL" as (typeof OPERATIONAL_IMPACTS)[number],
    machineStatus: "UNDER_REPAIR" as "UNDER_REPAIR" | "DOWN" | "WORKING",
  });
  useEffect(() => {
    if (!form.machineId || form.locationId) return;
    const machine = machines.data?.rows.find((row) => row.id === form.machineId);
    if (!machine) return;
    setForm((current) => ({
      ...current,
      locationId: machine.location_id,
      technicianStaffId: current.technicianStaffId || machine.technician_staff_id || "",
    }));
  }, [form.locationId, form.machineId, machines.data?.rows]);
  const save = useMutation({
    mutationFn: async (file?: File) => {
      const row = await reportArcadeFault({
        ...form,
        reportedByStaffId: context.data?.staff?.id ?? null,
        technicianStaffId: form.technicianStaffId || context.data?.staff?.id || null,
        reportedAt: new Date().toISOString(),
      });
      if (search.get("startRepair") === "1") {
        await setArcadeRepairState({ faultId: row.id, action: "START" });
      }
      if (file) {
        const dataBase64 = await readBase64(file);
        await uploadArcadeFile({
          entityType: "fault",
          entityId: row.id,
          locationId: form.locationId,
          kind: file.type.startsWith("video/") ? "video" : "photo",
          filename: file.name,
          contentType: file.type || "image/jpeg",
          dataBase64,
        });
      }
      return row;
    },
    onSuccess: (row) => {
      toast.success(row.is_repeat ? `${row.ticket_number} opened as a repeat fault` : `${row.ticket_number} reported`);
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
      window.location.href = `/arcade/faults/${row.id}`;
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not report fault"),
  });
  const [file, setFile] = useState<File | undefined>();
  return (
    <form className="grid max-w-3xl gap-3" onSubmit={(event) => { event.preventDefault(); save.mutate(file); }}>
      <h1 className="text-xl font-semibold">Report fault</h1>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Machine">
          <select className="h-10 rounded-md border bg-background px-2" value={form.machineId} onChange={(event) => {
            const machine = machines.data?.rows.find((row) => row.id === event.target.value);
            setForm({ ...form, machineId: event.target.value, locationId: machine?.location_id ?? form.locationId, technicianStaffId: machine?.technician_staff_id ?? form.technicianStaffId });
          }} required>
            <option value="">Select machine</option>
            {(machines.data?.rows ?? []).map((row) => <option key={row.id} value={row.id}>{row.asset_code} · {row.name}</option>)}
          </select>
        </Field>
        <Field label="Technician">
          <select className="h-10 rounded-md border bg-background px-2" value={form.technicianStaffId} onChange={(event) => setForm({ ...form, technicianStaffId: event.target.value })}>
            <option value="">Current technician</option>
            {(context.data?.technicians ?? []).map((tech) => <option key={tech.id} value={tech.id}>{tech.full_name}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select className="h-10 rounded-md border bg-background px-2" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as typeof form.category })}>
            {FAULT_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Severity">
          <select className="h-10 rounded-md border bg-background px-2" value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value as typeof form.severity })}>
            {FAULT_SEVERITIES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Operational impact">
          <select className="h-10 rounded-md border bg-background px-2" value={form.operationalImpact} onChange={(event) => setForm({ ...form, operationalImpact: event.target.value as typeof form.operationalImpact })}>
            {OPERATIONAL_IMPACTS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Machine status">
          <select className="h-10 rounded-md border bg-background px-2" value={form.machineStatus} onChange={(event) => setForm({ ...form, machineStatus: event.target.value as typeof form.machineStatus })}>
            <option value="DOWN">DOWN</option>
            <option value="UNDER_REPAIR">UNDER REPAIR</option>
            <option value="WORKING">WORKING</option>
          </select>
        </Field>
      </div>
      <Field label="Description"><Textarea required minLength={8} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
      <Field label="Photo, video, or attachment"><input type="file" accept="image/*,video/*,application/pdf" capture="environment" onChange={(event) => setFile(event.target.files?.[0])} /></Field>
      <Button type="submit" disabled={save.isPending}>Submit fault</Button>
    </form>
  );
}

export function ArcadeFaultDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const fault = useQuery({ queryKey: queryKeys.arcade.fault(id), queryFn: () => getArcadeFault({ id }) });
  const canClose = usePermission("arcade.close");
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [closure, setClosure] = useState({
    problem: "",
    diagnosis: "",
    actionTaken: "",
    partsUsed: "",
    testingPerformed: "",
    finalResult: "",
    recommendations: "",
  });
  const row = fault.data?.fault;
  const act = useMutation({
    mutationFn: (action: "START" | "PAUSE" | "COMPLETE") => setArcadeRepairState({ faultId: id, action, note }),
    onSuccess: () => { toast.success("Repair updated"); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Update failed"),
  });
  const move = useMutation({
    mutationFn: (status: (typeof FAULT_STATUSES)[number]) => updateArcadeFault({ id, status, note, ...closure }),
    onSuccess: () => { toast.success("Status updated"); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Status was not changed"),
  });
  if (!row) return <p className="text-sm text-muted-foreground">Loading ticket…</p>;
  const filled = {
    problem: closure.problem || row.problem || "",
    diagnosis: closure.diagnosis || row.diagnosis || "",
    actionTaken: closure.actionTaken || row.action_taken || "",
    partsUsed: closure.partsUsed || row.parts_used || "",
    testingPerformed: closure.testingPerformed || row.testing_performed || "",
    finalResult: closure.finalResult || row.final_result || "",
    recommendations: closure.recommendations || row.recommendations || "",
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{row.ticket_number}</h1>
          <p className="text-sm text-muted-foreground">{row.category} · {row.severity}</p>
        </div>
        <div className="flex gap-1">{row.is_repeat ? <StatusBadge status="REPEAT" /> : null}<StatusBadge status={row.status} /></div>
      </div>
      {row.is_repeat ? <p className="text-sm">Repeat count {row.repeat_count}. Last failure {row.last_failure_at ? new Date(row.last_failure_at).toLocaleString() : "—"}. {row.days_since_last_repair ?? "—"} days since last repair.</p> : null}
      <p>{row.description}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => act.mutate("START")}>Start</Button>
        <Button type="button" variant="outline" onClick={() => act.mutate("PAUSE")}>Pause</Button>
        <Button type="button" variant="outline" onClick={() => act.mutate("COMPLETE")}>Complete repair session</Button>
        <Button asChild variant="outline"><Link href={`/arcade/machines/${row.machine_id}`}>{t("arcadeGames.openGame")}</Link></Button>
        <Button asChild variant="outline"><Link href={`/arcade/parts?machineId=${row.machine_id}&locationId=${row.location_id}&faultId=${row.id}`}>Request part</Link></Button>
        <Button asChild variant="outline"><Link href={`/arcade/support/new?machineId=${row.machine_id}&locationId=${row.location_id}&faultId=${row.id}&technicianId=${row.technician_staff_id ?? ""}`}>Supplier case</Link></Button>
      </div>
      <Field label="Note"><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <Button type="button" variant="secondary" onClick={() => addArcadeFaultNote({ id, body: note }).then(() => { toast.success("Note added"); setNote(""); void qc.invalidateQueries({ queryKey: queryKeys.arcade.fault(id) }); }).catch((error) => toast.error(error instanceof Error ? error.message : "Note failed"))}>Add note</Button>
      <div className="flex flex-wrap gap-2">
        {FAULT_STATUSES.filter((status) => status !== "CLOSED" || canClose).map((status) => (
          <Button key={status} type="button" variant="outline" size="sm" onClick={() => move.mutate(status)}>{status.replaceAll("_", " ")}</Button>
        ))}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {(["problem", "diagnosis", "actionTaken", "partsUsed", "testingPerformed", "finalResult", "recommendations"] as const).map((key) => (
          <Field key={key} label={key.replace(/([A-Z])/g, " $1")}>
            <Textarea value={filled[key]} onChange={(event) => setClosure({ ...closure, [key]: event.target.value })} />
          </Field>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Resolved and Closed need every field filled with the actual work. The word Resolved alone is rejected.</p>
      <section className="grid gap-2">
        <h2 className="font-semibold">History</h2>
        {fault.data?.updates.map((update) => (
          <p key={update.id} className="rounded border p-2 text-sm">{new Date(update.created_at).toLocaleString()} · {update.kind} · {update.previous_status ? `${update.previous_status} → ${update.new_status}` : update.body}</p>
        ))}
        {fault.data?.repairs.map((repair) => (
          <p key={repair.id} className="rounded border p-2 text-sm">Repair {repair.status} from {new Date(repair.started_at).toLocaleString()}</p>
        ))}
      </section>
    </div>
  );
}

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
