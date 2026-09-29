"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { arcadeCategoryName, arcadeStatusName, Field, Pager, StatusBadge } from "@/components/arcade/ui";
import { EmptyState, InteractiveCard, LoadingState } from "@/components/ds";
import GlideSelect from "@/components/react-bits/glide-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import { FAULT_CATEGORIES, FAULT_SEVERITIES, FAULT_STATUSES, OPERATIONAL_IMPACTS } from "@/lib/arcade/domain";
import { getArcadeContext, listArcadeMachines, uploadArcadeFile } from "@/lib/arcade.functions";
import { addArcadeFaultNote, getArcadeFault, listArcadeFaults, reportArcadeFault, setArcadeRepairState, updateArcadeFault } from "@/lib/arcade-work.functions";
import { queryKeys } from "@/lib/query-keys";

export function ArcadeFaults() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: queryKeys.arcade.faults({ page, q }),
    queryFn: () => listArcadeFaults({ page, pageSize: 50, q }),
  });
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t("arcadeScreens.faultsTitle")}</h1>
        <Button asChild><Link href="/arcade/faults/new">{t("arcadeScreens.reportFault")}</Link></Button>
      </div>
      <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder={t("arcadeScreens.faultSearch")} className="max-w-sm" />
      <div key={`${q}:${page}`} className="ds-enter">
      {list.isLoading ? <LoadingState label={t("arcadeOps.loading")} count={4} /> : null}
      {!list.isLoading && (list.data?.rows.length ?? 0) === 0 ? (
        <EmptyState title={t("arcadeOps.none")} />
      ) : null}
      {!list.isLoading && (list.data?.rows.length ?? 0) > 0 ? (
      <div className="grid gap-2">
        {(list.data?.rows ?? []).map((row, index) => (
          <div key={row.id} className={index < 12 ? "ds-enter" : undefined} style={index < 12 ? { animationDelay: `${index * 20}ms` } : undefined}>
          <InteractiveCard>
          <Link href={`/arcade/faults/${row.id}`} className="block rounded-[var(--radius)] border bg-card p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{row.machine_name ? `${row.machine_name} · ` : ""}{row.ticket_number}</span>
              <span className="flex flex-wrap gap-1">{row.is_repeat ? <StatusBadge status="REPEAT" /> : null}<StatusBadge status={row.status} />{row.severity ? <StatusBadge status={row.severity} /> : null}</span>
            </div>
            <p className="text-sm text-muted-foreground">{[row.machine_name, arcadeCategoryName(t, row.category), row.description].filter(Boolean).join(" · ")}</p>
            {row.is_repeat ? <p className="text-xs">{t("arcadeScreens.repeatLine", { count: row.repeat_count, when: row.last_failure_at ? new Date(row.last_failure_at).toLocaleDateString() : "—", days: row.days_since_last_repair ?? "—" })}</p> : null}
          </Link>
          </InteractiveCard>
          </div>
        ))}
      </div>
      ) : null}
      </div>
      <Pager page={page} total={list.data?.total ?? 0} pageSize={50} onPage={setPage} />
    </div>
  );
}

export function ArcadeFaultForm() {
  const { t } = useTranslation();
  const search = useSearchParams();
  const context = useQuery({ queryKey: queryKeys.arcade.context(), queryFn: () => getArcadeContext({}) });
  const machines = useQuery({
    queryKey: queryKeys.arcade.machines({ all: search.get("locationId") }),
    queryFn: () => listArcadeMachines({ page: 1, pageSize: 200, locationId: search.get("locationId") }),
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
      toast.success(row.is_repeat ? t("arcadeScreens.repeatOpened", { ticket: row.ticket_number }) : t("arcadeScreens.faultReported", { ticket: row.ticket_number }));
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
      window.location.href = `/arcade/faults/${row.id}`;
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.faultFailed")),
  });
  const [file, setFile] = useState<File | undefined>();
  return (
    <form className="grid max-w-3xl gap-3" onSubmit={(event) => { event.preventDefault(); save.mutate(file); }}>
      <h1 className="text-xl font-semibold">{t("arcadeScreens.reportFault")}</h1>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t("arcadeScreens.machine")}>
          <GlideSelect
            ariaLabel={t("arcadeScreens.machine")}
            value={form.machineId}
            placeholder={t("arcadeScreens.selectMachine")}
            showTags={false}
            menuWidth={360}
            onChange={(value) => {
              const machine = machines.data?.rows.find((row) => row.id === value);
              setForm({ ...form, machineId: value, locationId: machine?.location_id ?? form.locationId, technicianStaffId: machine?.technician_staff_id ?? form.technicianStaffId });
            }}
            options={(machines.data?.rows ?? []).map((row) => ({ value: row.id, label: `${row.asset_code} · ${row.name}` }))}
          />
        </Field>
        <Field label={t("arcadeScreens.technician")}>
          <GlideSelect
            ariaLabel={t("arcadeScreens.technician")}
            value={form.technicianStaffId}
            placeholder={t("arcadeScreens.currentTechnician")}
            showTags={false}
            menuWidth={320}
            onChange={(value) => setForm({ ...form, technicianStaffId: value })}
            options={[{ value: "", label: t("arcadeScreens.currentTechnician") }, ...(context.data?.technicians ?? []).map((tech) => ({ value: tech.id, label: tech.full_name }))]}
          />
        </Field>
        <Field label={t("arcadeScreens.category")}>
          <GlideSelect
            ariaLabel={t("arcadeScreens.category")}
            value={form.category}
            showTags={false}
            onChange={(value) => setForm({ ...form, category: value as typeof form.category })}
            options={FAULT_CATEGORIES.map((item) => ({ value: item, label: arcadeCategoryName(t, item) }))}
          />
        </Field>
        <Field label={t("arcadeScreens.severity")}>
          <GlideSelect
            ariaLabel={t("arcadeScreens.severity")}
            value={form.severity}
            showTags={false}
            onChange={(value) => setForm({ ...form, severity: value as typeof form.severity })}
            options={FAULT_SEVERITIES.map((item) => ({ value: item, label: arcadeStatusName(t, item) }))}
          />
        </Field>
        <Field label={t("arcadeScreens.impact")}>
          <GlideSelect
            ariaLabel={t("arcadeScreens.impact")}
            value={form.operationalImpact}
            showTags={false}
            menuWidth={280}
            onChange={(value) => setForm({ ...form, operationalImpact: value as typeof form.operationalImpact })}
            options={OPERATIONAL_IMPACTS.map((item) => ({ value: item, label: arcadeStatusName(t, item) }))}
          />
        </Field>
        <Field label={t("arcadeScreens.machineStatus")}>
          <GlideSelect
            ariaLabel={t("arcadeScreens.machineStatus")}
            value={form.machineStatus}
            showTags={false}
            onChange={(value) => setForm({ ...form, machineStatus: value as typeof form.machineStatus })}
            options={[
              { value: "DOWN", label: arcadeStatusName(t, "DOWN") },
              { value: "UNDER_REPAIR", label: arcadeStatusName(t, "UNDER_REPAIR") },
              { value: "WORKING", label: arcadeStatusName(t, "WORKING") },
            ]}
          />
        </Field>
      </div>
      <Field label={t("arcadeScreens.description")}><Textarea required minLength={8} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
      <Field label={t("arcadeScreens.attachment")}><input type="file" accept="image/*,video/*,application/pdf" capture="environment" onChange={(event) => setFile(event.target.files?.[0])} /></Field>
      <Button type="submit" disabled={save.isPending}>{t("arcadeScreens.submitFault")}</Button>
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
    onSuccess: () => { toast.success(t("arcadeScreens.repairUpdated")); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.updateFailed")),
  });
  const move = useMutation({
    mutationFn: (status: (typeof FAULT_STATUSES)[number]) => updateArcadeFault({ id, status, note, ...closure }),
    onSuccess: () => { toast.success(t("arcadeScreens.statusUpdated")); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.statusUnchanged")),
  });
  if (!row) return <p className="text-sm text-muted-foreground">{t("arcadeScreens.loadingTicket")}</p>;
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
          <p className="text-sm text-muted-foreground">{arcadeCategoryName(t, row.category)} · {arcadeStatusName(t, row.severity)}</p>
        </div>
        <div className="flex gap-1">{row.is_repeat ? <StatusBadge status="REPEAT" /> : null}<StatusBadge status={row.status} /></div>
      </div>
      {row.is_repeat ? <p className="text-sm">{t("arcadeScreens.repeatDetail", { count: row.repeat_count, when: row.last_failure_at ? new Date(row.last_failure_at).toLocaleString() : "—", days: row.days_since_last_repair ?? "—" })}</p> : null}
      <p>{row.description}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => act.mutate("START")}>{t("arcadeScreens.start")}</Button>
        <Button type="button" variant="outline" onClick={() => act.mutate("PAUSE")}>{t("arcadeScreens.pause")}</Button>
        <Button type="button" variant="outline" onClick={() => act.mutate("COMPLETE")}>{t("arcadeScreens.completeSession")}</Button>
        <Button asChild variant="outline"><Link href={`/arcade/machines/${row.machine_id}`}>{t("arcadeGames.openGame")}</Link></Button>
        <Button asChild variant="outline"><Link href={`/arcade/parts?machineId=${row.machine_id}&locationId=${row.location_id}&faultId=${row.id}`}>{t("arcadeScreens.requestPart")}</Link></Button>
        <Button asChild variant="outline"><Link href={`/arcade/support/new?machineId=${row.machine_id}&locationId=${row.location_id}&faultId=${row.id}&technicianId=${row.technician_staff_id ?? ""}`}>{t("arcadeScreens.supplierCase")}</Link></Button>
      </div>
      <Field label={t("arcadeScreens.note")}><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <Button type="button" variant="secondary" onClick={() => addArcadeFaultNote({ id, body: note }).then(() => { toast.success(t("arcadeScreens.noteAdded")); setNote(""); void qc.invalidateQueries({ queryKey: queryKeys.arcade.fault(id) }); }).catch((error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.noteFailed")))}>{t("arcadeScreens.addNote")}</Button>
      <div className="flex flex-wrap gap-2">
        {FAULT_STATUSES.filter((status) => status !== "CLOSED" || canClose).map((status) => (
          <Button key={status} type="button" variant="outline" size="sm" onClick={() => move.mutate(status)}>{arcadeStatusName(t, status)}</Button>
        ))}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {(["problem", "diagnosis", "actionTaken", "partsUsed", "testingPerformed", "finalResult", "recommendations"] as const).map((key) => (
          <Field key={key} label={t(`arcadeScreens.${key}`)}>
            <Textarea value={filled[key]} onChange={(event) => setClosure({ ...closure, [key]: event.target.value })} />
          </Field>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("arcadeScreens.closureHint")}</p>
      <section className="grid gap-2">
        <h2 className="font-semibold">{t("arcadeScreens.history")}</h2>
        {fault.data?.updates.map((update) => (
          <p key={update.id} className="rounded border p-2 text-sm">{new Date(update.created_at).toLocaleString()} · {update.kind} · {update.previous_status ? `${update.previous_status} → ${update.new_status}` : update.body}</p>
        ))}
        {fault.data?.repairs.map((repair) => (
          <p key={repair.id} className="rounded border p-2 text-sm">{t("arcadeScreens.repairFrom", { status: arcadeStatusName(t, repair.status), when: new Date(repair.started_at).toLocaleString() })}</p>
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
