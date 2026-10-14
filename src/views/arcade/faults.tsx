"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, FileText, History, ImageIcon, ListChecks, Package } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { GamePhoto, useArcadePhotoUrls } from "@/components/arcade/game-photo";
import { ArcadeEmpty, ArcadeHero, arcadeCategoryName, arcadeStatusName, Field, Pager, StatusBadge } from "@/components/arcade/ui";
import GlideSelect from "@/components/react-bits/glide-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { FAULT_CATEGORIES, FAULT_SEVERITIES, FAULT_STATUSES, OPERATIONAL_IMPACTS } from "@/lib/arcade/domain";
import { getArcadeContext, getArcadeMachine, listArcadeAttachments, listArcadeMachines, saveArcadeMachine, uploadArcadeFile } from "@/lib/arcade.functions";
import { listSpareParts } from "@/lib/arcade-supply.functions";
import { venueTitle } from "@/lib/locations/normalize";
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
  const rows = list.data?.rows ?? [];
  return (
    <div className="arcade-stack">
      <ArcadeHero
        kicker={t("nav.arcade")}
        title={t("arcadeScreens.faultsTitle")}
        subtitle={t("arcadeScreens.faultSearch")}
        actions={<Button asChild className="arcade-cta"><Link href="/arcade/faults/new">{t("arcadeScreens.reportFault")}</Link></Button>}
      />
      <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder={t("arcadeScreens.faultSearch")} className="max-w-sm bg-card" />
      {list.isSuccess && rows.length === 0 ? (
        <ArcadeEmpty
          title={t("arcadeFlow.faultsEmpty")}
          action={<Button asChild className="arcade-cta"><Link href="/arcade/faults/new">{t("arcadeScreens.reportFault")}</Link></Button>}
        />
      ) : null}
      <div className="arcade-list">
        {rows.map((row) => (
          <Link key={row.id} href={`/arcade/faults/${row.id}`} className="arcade-row arcade-row--block">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="arcade-row__title">{row.machine_name ? `${row.machine_name} · ` : ""}{row.ticket_number}</span>
              <span className="flex gap-1">{row.is_repeat ? <StatusBadge status="REPEAT" /> : null}<StatusBadge status={row.status} /></span>
            </div>
            <p className="arcade-row__meta">{arcadeCategoryName(t, row.category)} · {arcadeStatusName(t, row.severity)} · {row.description}</p>
            {row.is_repeat ? <p className="text-xs">{t("arcadeScreens.repeatLine", { count: row.repeat_count, when: row.last_failure_at ? new Date(row.last_failure_at).toLocaleDateString() : "—", days: row.days_since_last_repair ?? "—" })}</p> : null}
          </Link>
        ))}
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
    <form className="arcade-stack max-w-3xl" onSubmit={(event) => { event.preventDefault(); save.mutate(file); }}>
      <ArcadeHero kicker={t("nav.arcade")} title={t("arcadeScreens.reportFault")} />
      <div className="arcade-panel grid gap-3">
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
      <Button type="submit" className="arcade-cta" disabled={save.isPending}>{t("arcadeScreens.submitFault")}</Button>
      </div>
    </form>
  );
}

const WORK_STEPS = [
  { key: "reported", label: "arcadeFlow.stepReported", statuses: ["REPORTED"] },
  { key: "assigned", label: "arcadeFlow.stepAssigned", statuses: [] as string[] },
  { key: "diagnosing", label: "arcadeFlow.stepDiagnosing", statuses: ["DIAGNOSING"] },
  { key: "repair", label: "arcadeFlow.stepRepair", statuses: ["UNDER_REPAIR", "WAITING_PART", "WAITING_SUPPLIER", "UNDER_OBSERVATION"] },
  { key: "testing", label: "arcadeFlow.stepTesting", statuses: ["TESTING"] },
  { key: "resolved", label: "arcadeFlow.stepResolved", statuses: ["RESOLVED"] },
  { key: "closed", label: "arcadeFlow.stepClosed", statuses: ["CLOSED"] },
] as const;

function workStepIndex(status: string, assigned: boolean) {
  if (status === "REPORTED") return assigned ? 1 : 0;
  const index = WORK_STEPS.findIndex((step) => (step.statuses as readonly string[]).includes(status));
  return index === -1 ? 0 : index;
}

function dayOrNull(value: string | null | undefined) {
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function personInitials(name: string) {
  const letters = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "•";
}

const SECTION_ICONS = {
  details: ListChecks,
  checklist: ClipboardCheck,
  parts: Package,
  photos: ImageIcon,
  history: History,
  documents: FileText,
} as const;

export function ArcadeFaultDetail({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const sites = useSites();
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
  const machineId = row?.machine_id ?? null;
  const machine = useQuery({
    queryKey: queryKeys.arcade.machine(machineId ?? "pending"),
    queryFn: () => getArcadeMachine({ id: machineId ?? "" }),
    enabled: Boolean(machineId),
  });
  const people = useQuery({ queryKey: queryKeys.arcade.context(), queryFn: () => getArcadeContext({}) });
  const attachments = useQuery({
    queryKey: [...queryKeys.arcade.all, "fault-files", id],
    queryFn: () => listArcadeAttachments({ entityType: "fault", entityId: id }),
  });
  const spare = useQuery({
    queryKey: [...queryKeys.arcade.all, "spare-lookup"],
    queryFn: () => listSpareParts({ page: 1, pageSize: 200 }),
    enabled: (fault.data?.usages.length ?? 0) > 0,
  });
  const photoPath = machine.data?.machine.photo_path ?? null;
  const gallery = useArcadePhotoUrls([photoPath, ...(attachments.data ?? []).map((file) => file.storage_path)]);
  const [section, setSection] = useState<"details" | "checklist" | "parts" | "photos" | "history" | "documents">("details");
  const addPhoto = useMutation({
    mutationFn: async (file: File) => {
      const locationId = fault.data?.fault.location_id;
      if (!locationId) throw new Error(t("arcadeScreens.notFound"));
      const dataBase64 = await readBase64(file);
      return uploadArcadeFile({
        entityType: "fault",
        entityId: id,
        locationId,
        kind: file.type.startsWith("video/") ? "video" : "photo",
        filename: file.name || "photo.jpg",
        contentType: file.type || "image/jpeg",
        dataBase64,
      });
    },
    onSuccess: () => {
      toast.success(t("arcadeScreens.photoUploaded"));
      void qc.invalidateQueries({ queryKey: [...queryKeys.arcade.all, "fault-files", id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.uploadFailed")),
  });
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
  const canOperate = usePermission("arcade.operate");
  const markOut = useMutation({
    mutationFn: () => {
      const current = machine.data?.machine;
      if (!current) throw new Error(t("arcadeScreens.notFound"));
      return saveArcadeMachine({
        id: current.id,
        assetCode: current.asset_code,
        name: current.name,
        gameCategory: current.game_category,
        locationId: current.location_id,
        areaId: current.area_id,
        zone: current.zone,
        unitNumber: current.unit_number,
        manufacturer: current.manufacturer,
        vendorId: current.vendor_id,
        model: current.model,
        serialNumber: current.serial_number,
        installedOn: dayOrNull(current.installed_on),
        purchasedOn: dayOrNull(current.purchased_on),
        warrantyStart: dayOrNull(current.warranty_start),
        warrantyExpiresOn: dayOrNull(current.warranty_expires_on),
        machineCost: current.machine_cost,
        supplierName: current.supplier_name,
        amountPaid: current.amount_paid,
        paidCurrency: current.paid_currency,
        paidOn: dayOrNull(current.paid_on),
        status: "OUT_OF_SERVICE",
        technicianStaffId: current.technician_staff_id,
        powerRequirement: current.power_requirement,
        networkRequirement: current.network_requirement,
        ipAddress: current.ip_address,
        softwareVersion: current.software_version,
        controllerPcb: current.controller_pcb,
        cardRfidInterface: current.card_rfid_interface,
        notes: current.notes,
        nextPmOn: dayOrNull(current.next_pm_on),
      });
    },
    onSuccess: () => { toast.success(t("arcadeScreens.statusSaved")); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.statusSaveFailed")),
  });
  if (!row) {
    const message = fault.isError ? (fault.error instanceof Error ? fault.error.message : t("arcadeOps.failed")) : t("arcadeScreens.loadingTicket");
    return <p className="text-sm text-muted-foreground">{message}</p>;
  }
  const filled = {
    problem: closure.problem || row.problem || "",
    diagnosis: closure.diagnosis || row.diagnosis || "",
    actionTaken: closure.actionTaken || row.action_taken || "",
    partsUsed: closure.partsUsed || row.parts_used || "",
    testingPerformed: closure.testingPerformed || row.testing_performed || "",
    finalResult: closure.finalResult || row.final_result || "",
    recommendations: closure.recommendations || row.recommendations || "",
  };
  const game = machine.data?.machine;
  const person = (staffId: string | null) => (staffId ? people.data?.technicians.find((tech) => tech.id === staffId) ?? null : null);
  const assignee = person(row.technician_staff_id);
  const reporter = person(row.reported_by_staff_id);
  const place = venueTitle(sites.data?.find((site) => site.id === row.location_id), t("common.site"));
  const stepIndex = workStepIndex(row.status, Boolean(row.technician_staff_id));
  const updates = fault.data?.updates ?? [];
  const repairs = fault.data?.repairs ?? [];
  const usages = fault.data?.usages ?? [];
  const catalog = new Map((spare.data?.rows ?? []).map((part) => [part.id, part]));
  const shortWhen = (iso: string | null | undefined) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" }).format(date);
  };
  const repairStatuses = ["UNDER_REPAIR", "WAITING_PART", "WAITING_SUPPLIER", "UNDER_OBSERVATION"];
  const stepWhen = (key: string) => {
    if (key === "reported") return shortWhen(row.reported_at);
    if (key === "diagnosing") return shortWhen(updates.find((item) => item.new_status === "DIAGNOSING")?.created_at);
    if (key === "repair") {
      return shortWhen(repairs[0]?.started_at ?? updates.find((item) => item.new_status && repairStatuses.includes(item.new_status))?.created_at);
    }
    if (key === "testing") return shortWhen(updates.find((item) => item.new_status === "TESTING")?.created_at);
    if (key === "resolved") return shortWhen(row.resolved_at);
    if (key === "closed") return shortWhen(row.closed_at);
    return null;
  };
  const picture = (path: string | null | undefined) => (path ? gallery.data?.urls?.[path] ?? null : null);
  const heroSrc = picture(photoPath);
  const shots = [
    photoPath ? { id: `cover-${photoPath}`, path: photoPath, name: game?.name ?? row.ticket_number ?? "" } : null,
    ...(attachments.data ?? [])
      .filter((file) => file.storage_path && file.storage_path !== photoPath && (file.kind === "photo" || file.mime_type?.startsWith("image/")))
      .map((file) => ({ id: file.id, path: file.storage_path, name: file.file_name || row.ticket_number || "" })),
  ].filter((shot): shot is { id: string; path: string; name: string } => Boolean(shot));
  const partRows = usages.map((item) => {
    const part = catalog.get(item.part_id);
    return {
      id: item.id,
      title: part?.name || item.notes?.trim() || t("arcadeScreens.notRecorded"),
      meta: [part?.part_number || part?.part_code, item.used_on, t("arcadeScreens.qty", { qty: item.qty })].filter(Boolean).join(" · "),
      cost: item.unit_cost != null ? String(item.unit_cost) : null,
    };
  });
  const problemText = (row.problem || row.description || "").trim();
  const storedDiagnosis = row.diagnosis?.trim() ?? "";
  const sections = [
    { id: "details", label: t("arcadeFlow.details") },
    { id: "checklist", label: t("arcadeFlow.checklist") },
    { id: "parts", label: t("arcadeScreens.tab.Parts") },
    { id: "photos", label: t("arcadeFlow.photos") },
    { id: "history", label: t("arcadeScreens.history") },
    { id: "documents", label: t("arcadeScreens.tab.Documents") },
  ] as const;
  const currentStatus = (FAULT_STATUSES as readonly string[]).includes(row.status) ? row.status as (typeof FAULT_STATUSES)[number] : "REPORTED";
  const photoAlt = t("arcadeScreens.gamePhoto", { name: game?.name ?? row.ticket_number ?? "" });
  const photoRail = (
    <div className="ws-shots">
      {shots.length === 0 ? <p className="cc-note">{t("arcadeFlow.noPhoto")}</p> : shots.map((shot) => (
        <GamePhoto key={shot.id} src={picture(shot.path)} alt={photoAlt} missingLabel={t("arcadeFlow.noPhoto")} className="ws-shot" />
      ))}
      {canOperate ? (
        <label className="ws-add">
          {addPhoto.isPending ? t("arcadeScreens.photoUploading") : t("arcadeScreens.addPhoto")}
          <input
            type="file"
            accept="image/*"
            disabled={addPhoto.isPending}
            aria-label={t("arcadeScreens.addPhoto")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) addPhoto.mutate(file);
            }}
          />
        </label>
      ) : null}
    </div>
  );
  const partsList = usages.length === 0 ? <p className="cc-note mt-2">{t("arcadeFlow.noPartsOnFault")}</p> : (
    <ul className="mt-1">
      {partRows.map((item) => (
        <li key={item.id} className="ws-part">
          <span className="ws-part__icon" aria-hidden="true"><Package /></span>
          <span className="min-w-0">
            <strong>{item.title}</strong>
            <span className="cc-note">{item.meta}</span>
          </span>
          {item.cost ? <span className="text-sm font-semibold">{item.cost}</span> : null}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="ws">
      <header className="cc-head">
        <div>
          <Link className="ws-back" href="/arcade/faults">{t("arcadeFlow.backToWork")}</Link>
          <h1>{t("arcadeFlow.workspaceTitle")}</h1>
          <p>{row.ticket_number ?? t("arcadeOps.fault")}</p>
        </div>
      </header>
      <section className="ws-hero">
        <div className="ws-hero__photo">
          <GamePhoto src={heroSrc} alt={photoAlt} missingLabel={t("arcadeFlow.noPhoto")} className="h-full min-h-36 w-full" />
        </div>
        <div>
          <span className="flex flex-wrap gap-1">
            <StatusBadge status={row.severity} />
            {row.is_repeat ? <StatusBadge status="REPEAT" /> : null}
            <StatusBadge status={row.status} />
          </span>
          <p className="ws-ticket">{row.ticket_number ?? t("arcadeOps.fault")}</p>
          <h2>{row.description}</h2>
          <dl className="ws-facts">
            {game ? (
              <div>
                <dt>{t("arcadeScreens.machineName")}</dt>
                <dd><Link href={`/arcade/machines/${row.machine_id}`}>{game.name}</Link></dd>
              </div>
            ) : null}
            <div><dt>{t("arcadeScreens.category")}</dt><dd>{arcadeCategoryName(t, row.category)}</dd></div>
            {game?.asset_code ? <div><dt>{t("arcadeScreens.assetId")}</dt><dd>{game.asset_code}</dd></div> : null}
            {game?.model ? <div><dt>{t("arcadeScreens.model")}</dt><dd>{game.model}</dd></div> : null}
            {game?.serial_number ? <div><dt>{t("arcadeScreens.serial")}</dt><dd>{game.serial_number}</dd></div> : null}
            <div><dt>{t("common.site")}</dt><dd>{place}</dd></div>
          </dl>
        </div>
        <aside className="ws-side">
          <div>
            <p className="cc-note">{t("arcadeScreens.technician")}</p>
            <div className="ws-person">
              <span className="ws-avatar" aria-hidden="true">{assignee ? personInitials(assignee.full_name) : "•"}</span>
              <span>
                <strong>{assignee?.full_name ?? t("arcadeScreens.unassigned")}</strong>
                {assignee?.job_title ? <span className="cc-note">{assignee.job_title}</span> : null}
              </span>
            </div>
          </div>
          {reporter ? (
            <div>
              <p className="cc-note">{t("arcadeFlow.reportedBy")}</p>
              <div className="ws-person">
                <span className="ws-avatar" aria-hidden="true">{personInitials(reporter.full_name)}</span>
                <span>
                  <strong>{reporter.full_name}</strong>
                  {reporter.job_title ? <span className="cc-note">{reporter.job_title}</span> : null}
                </span>
              </div>
            </div>
          ) : null}
          <p><span className="cc-note">{t("arcadeFlow.createdOn")}</span><strong>{new Date(row.reported_at).toLocaleString()}</strong></p>
          {row.resolved_at ? <p><span className="cc-note">{t("arcadeFlow.stepResolved")}</span><strong>{new Date(row.resolved_at).toLocaleString()}</strong></p> : null}
          {row.closed_at ? <p><span className="cc-note">{t("arcadeFlow.stepClosed")}</span><strong>{new Date(row.closed_at).toLocaleString()}</strong></p> : null}
        </aside>
      </section>
      {row.is_repeat ? <p className="cc-note">{t("arcadeScreens.repeatDetail", { count: row.repeat_count, when: row.last_failure_at ? new Date(row.last_failure_at).toLocaleString() : "—", days: row.days_since_last_repair ?? "—" })}</p> : null}
      <div className="cc-step" aria-label={t("arcadeScreens.status")}>
        {WORK_STEPS.map((step, index) => {
          const when = stepWhen(step.key);
          return (
            <span key={step.key} className={`cc-step__item${index === stepIndex ? " is-current" : index < stepIndex ? " is-seen" : ""}`}>
              <span className="cc-step__n">{index + 1}</span>
              {t(step.label)}
              {when ? <span className="cc-step__when">{when}</span> : null}
            </span>
          );
        })}
      </div>
      <div className="ws-tabs" role="tablist" aria-label={t("arcadeFlow.details")}>
        {sections.map((item) => {
          const Icon = SECTION_ICONS[item.id];
          return (
            <button key={item.id} type="button" role="tab" aria-selected={section === item.id} className={`ws-tab${section === item.id ? " is-current" : ""}`} onClick={() => setSection(item.id)}>
              <Icon aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </div>
      {section === "details" ? (
        <div className="grid gap-3">
          <div className="ws-grid">
            <section className="ws-problem">
              <h2>{t("arcadeFlow.problemBox")}</h2>
              <p className="mt-2 text-sm">{problemText || t("arcadeFlow.insufficient")}</p>
              <h2 className="mt-3">{t("arcadeScreens.diagnosis")}</h2>
              <p className="mt-1 text-sm">{storedDiagnosis || t("arcadeFlow.insufficient")}</p>
            </section>
            <section className="ws-panel">
              <h2>{t("arcadeFlow.machineInfo")}</h2>
              <dl className="ws-kv">
                {[
                  [t("arcadeScreens.assetId"), game?.asset_code],
                  [t("arcadeScreens.machineName"), game?.name],
                  [t("arcadeScreens.manufacturer"), game?.manufacturer],
                  [t("arcadeScreens.model"), game?.model],
                  [t("arcadeScreens.serial"), game?.serial_number],
                  [t("common.site"), place],
                  [t("arcadeScreens.purchased"), game?.purchased_on?.slice(0, 10)],
                  [t("arcadeScreens.warrantyExpiry"), game?.warranty_expires_on?.slice(0, 10)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || t("arcadeScreens.notRecorded")}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
          <div className="ws-grid">
            <section className="ws-panel">
              <h2>{t("arcadeFlow.checklist")}</h2>
              <p className="cc-note mt-2">{t("arcadeFlow.noFaultChecklist")}</p>
              <Button asChild className="arcade-cta mt-3"><Link href="/arcade/checklist">{t("arcadeSimple.checklistTitle")}</Link></Button>
            </section>
            <section className="ws-panel">
              <div className="ws-panel__head">
                <h2>{t("arcadeScreens.partsUsed")}</h2>
                <Button asChild variant="outline" size="sm"><Link href={`/arcade/parts?machineId=${row.machine_id}&locationId=${row.location_id}&faultId=${row.id}`}>{t("arcadeScreens.requestPart")}</Link></Button>
              </div>
              {partsList}
            </section>
          </div>
          <section className="ws-panel">
            <h2>{t("arcadeFlow.photoEvidence")}</h2>
            {photoRail}
          </section>
          <Field label={t("arcadeScreens.note")}><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></Field>
          <Button type="button" variant="secondary" className="arcade-touch w-full sm:w-fit" onClick={() => addArcadeFaultNote({ id, body: note }).then(() => { toast.success(t("arcadeScreens.noteAdded")); setNote(""); void qc.invalidateQueries({ queryKey: queryKeys.arcade.fault(id) }); }).catch((error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.noteFailed")))}>{t("arcadeScreens.addNote")}</Button>
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
        </div>
      ) : null}
      {section === "checklist" ? (
        <ArcadeEmpty
          title={t("arcadeFlow.noFaultChecklist")}
          action={<Button asChild className="arcade-cta"><Link href="/arcade/checklist">{t("arcadeSimple.checklistTitle")}</Link></Button>}
        />
      ) : null}
      {section === "parts" ? (
        <section className="ws-panel">
          <div className="ws-panel__head">
            <h2>{t("arcadeScreens.partsUsed")}</h2>
            <Button asChild variant="outline" size="sm"><Link href={`/arcade/parts?machineId=${row.machine_id}&locationId=${row.location_id}&faultId=${row.id}`}>{t("arcadeScreens.requestPart")}</Link></Button>
          </div>
          {usages.length === 0 ? <p className="cc-note mt-2">{t("arcadeFlow.noPartsOnFault")}</p> : partsList}
        </section>
      ) : null}
      {section === "photos" ? (
        <section className="ws-panel">
          <h2>{t("arcadeFlow.photoEvidence")}</h2>
          {photoRail}
        </section>
      ) : null}
      {section === "history" ? (
        <section className="arcade-panel grid gap-2">
          {(fault.data?.updates.length ?? 0) === 0 && (fault.data?.repairs.length ?? 0) === 0 ? <ArcadeEmpty title={t("arcadeScreens.emptyTimeline")} /> : null}
          {fault.data?.updates.map((update) => (
            <p key={update.id} className="arcade-row text-sm">{new Date(update.created_at).toLocaleString()} · {update.kind} · {update.previous_status ? `${arcadeStatusName(t, update.previous_status)} → ${update.new_status ? arcadeStatusName(t, update.new_status) : ""}` : update.body}</p>
          ))}
          {fault.data?.repairs.map((repair) => (
            <p key={repair.id} className="arcade-row text-sm">{t("arcadeScreens.repairFrom", { status: arcadeStatusName(t, repair.status), when: new Date(repair.started_at).toLocaleString() })}</p>
          ))}
        </section>
      ) : null}
      {section === "documents" ? (
        <section className="arcade-panel grid gap-2">
          {(machine.data?.documents.length ?? 0) === 0 ? (
            <ArcadeEmpty title={t("arcadeFlow.noDocuments")} action={<Button asChild variant="outline"><Link href={`/arcade/manuals?machineId=${row.machine_id}`}>{t("arcadeScreens.viewManual")}</Link></Button>} />
          ) : machine.data?.documents.map((item) => (
            <article key={item.id} className="arcade-row arcade-row--block text-sm">
              <p className="font-medium">{item.title}</p>
              <p className="text-muted-foreground">{[item.doc_type, item.file_name].filter(Boolean).join(" · ")}</p>
              {item.external_url ? <a className="underline underline-offset-2" href={item.external_url}>{t("arcadeScreens.openLink")}</a> : null}
            </article>
          ))}
        </section>
      ) : null}
      <footer className="ws-foot">
        <Button type="button" variant="outline" onClick={() => act.mutate("START")}>{t("arcadeScreens.start")}</Button>
        <Button type="button" variant="outline" onClick={() => act.mutate("PAUSE")}>{t("arcadeScreens.pause")}</Button>
        <Button type="button" variant="outline" className="ws-danger" disabled={!canOperate || !game || markOut.isPending} onClick={() => markOut.mutate()}>{t("arcadeFlow.markOut")}</Button>
        <div className="ws-foot__end">
          <Button type="button" variant="outline" disabled={move.isPending} onClick={() => move.mutate(currentStatus)}>{t("arcadeFlow.saveUpdate")}</Button>
          <Button type="button" className="ws-complete" disabled={act.isPending} onClick={() => act.mutate("COMPLETE")}>{t("arcadeScreens.completeSession")}</Button>
        </div>
      </footer>
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
