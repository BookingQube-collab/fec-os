"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ActionButton, arcadeCategoryName, arcadeStatusName, Field, KpiTile, MobileActions, Pager, StatusBadge } from "@/components/arcade/ui";
import { ArcadeWorkbookImport } from "@/components/arcade/workbook-import";
import GlideSelect from "@/components/react-bits/glide-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { MACHINE_STATUSES, siteAvailability } from "@/lib/arcade/domain";
import { getArcadeContext, getArcadeDashboard, getArcadeFileUrl, getArcadeMachine, listArcadeMachines, saveArcadeMachine, uploadArcadeFile } from "@/lib/arcade.functions";
import { listArcadeSuppliers } from "@/lib/arcade-supply.functions";
import { fmtCurrency } from "@/lib/currency";
import { queryKeys } from "@/lib/query-keys";

function useSiteLabel() {
  const { t } = useTranslation();
  const sites = useSites();
  return (id?: string | null) => sites.data?.find((site) => site.id === id)?.name ?? t("common.site");
}

export function ArcadeSites() {
  const { t } = useTranslation();
  const sites = useSites();
  const dashboard = useQuery({ queryKey: queryKeys.arcade.dashboard("sites"), queryFn: () => getArcadeDashboard({}) });
  const health = new Map((dashboard.data?.sites ?? []).map((site) => [site.location_id, site]));
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold">{t("arcadeScreens.sitesTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("arcadeScreens.sitesHint")}</p>
      <div className="grid gap-2">
        {(sites.data ?? []).map((site) => {
          const row = health.get(site.id);
          return (
            <Link key={site.id} href={`/arcade/sites/${site.id}`} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{site.name}</span>
                <span className="tabular-nums">{row ? `${siteAvailability({ working: row.working, active: row.active_machines }) ?? "—"}%` : t("arcadeScreens.noMachines")}</span>
              </div>
              {row ? <p className="text-sm text-muted-foreground">{t("arcadeScreens.siteLineShort", { machines: row.active_machines, working: row.working, down: row.down })}</p> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function ArcadeSite({ locationId }: { locationId: string }) {
  const { t } = useTranslation();
  const label = useSiteLabel();
  const dashboard = useQuery({ queryKey: queryKeys.arcade.dashboard(locationId), queryFn: () => getArcadeDashboard({ locationId }) });
  const site = dashboard.data?.sites[0];
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold">{label(locationId)}</h1>
        <p className="text-sm text-muted-foreground">{t("arcadeScreens.siteInventory")}</p>
      </div>
      {site ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <KpiTile label={t("arcadeScreens.machines")} value={site.active_machines} />
          <KpiTile label={t("arcadeOps.working")} value={site.working} />
          <KpiTile label={t("arcadeOps.down")} value={site.down} />
          <KpiTile label={t("arcadeOps.underRepair")} value={site.under_repair} />
          <KpiTile label={t("arcadeScreens.observation")} value={site.under_observation} />
          <KpiTile label={t("arcadeOps.waitingParts")} value={site.waiting_part} />
          <KpiTile label={t("arcadeOps.pmDue")} value={site.pm_due + site.pm_overdue} />
          <KpiTile label={t("arcadeScreens.availability")} value={`${site.availability ?? "—"}%`} />
        </div>
      ) : null}
      <ArcadeMachines locationId={locationId} />
    </div>
  );
}

export function ArcadeMachines({ locationId }: { locationId?: string }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const label = useSiteLabel();
  const canManage = usePermission("arcade.manage");
  const list = useQuery({
    queryKey: queryKeys.arcade.machines({ page, q, status, locationId }),
    queryFn: () => listArcadeMachines({ page, pageSize: 100, q, status: status || null, locationId: locationId ?? null }),
  });
  return (
    <div className="grid gap-3">
      {!locationId ? <h1 className="text-xl font-semibold">{t("arcadeScreens.machineList")}</h1> : null}
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder={t("arcadeScreens.searchMachines")} className="max-w-xs" />
        <GlideSelect
          ariaLabel={t("arcadeScreens.status")}
          value={status}
          placeholder={t("arcadeScreens.allStatuses")}
          showTags={false}
          onChange={(value) => { setStatus(value); setPage(1); }}
          options={[{ value: "", label: t("arcadeScreens.allStatuses") }, ...MACHINE_STATUSES.map((item) => ({ value: item, label: arcadeStatusName(t, item) }))]}
        />
        {canManage ? <Button asChild><Link href={`/arcade/machines/new${locationId ? `?locationId=${locationId}` : ""}`}>{t("arcadeScreens.addMachine")}</Link></Button> : null}
        <ArcadeWorkbookImport />
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">{t("arcadeScreens.asset")}</th>
              <th>{t("arcadeScreens.machine")}</th>
              <th>{t("common.site")}</th>
              <th>{t("arcadeImport.purchaseInvoice")}</th>
              <th>{t("arcadeGames.listPaid")}</th>
              <th>{t("arcadeGames.listPaidOn")}</th>
              <th>{t("arcadeGames.listFix")}</th>
              <th>{t("arcadeScreens.status")}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.rows ?? []).map((row) => (
              <tr key={row.id} className="border-t">
                <td className="py-2 font-mono text-xs">{row.asset_code}</td>
                <td><Link className="font-medium underline-offset-2 hover:underline" href={`/arcade/machines/${row.id}`}>{row.name}</Link></td>
                <td>{label(row.location_id)}</td>
                <td>{row.supplier_name || "—"}</td>
                <td className="tabular-nums">{formatPaid(row.amount_paid, row.paid_currency)}</td>
                <td>{row.paid_on || "—"}</td>
                <td className="max-w-48 truncate">{row.last_fix_status ? `${arcadeStatusName(t, row.last_fix_status)} · ${row.last_fix_summary ?? ""}` : "—"}</td>
                <td><StatusBadge status={row.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 md:hidden">
        {(list.data?.rows ?? []).map((row) => (
          <Link key={row.id} href={`/arcade/machines/${row.id}`} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2"><span className="font-medium">{row.name}</span><StatusBadge status={row.status} /></div>
            <p className="text-xs text-muted-foreground">{row.asset_code} · {label(row.location_id)}</p>
            <p className="text-xs text-muted-foreground">{t("arcadeImport.purchaseInvoice")}: {row.supplier_name || "—"} · {formatPaid(row.amount_paid, row.paid_currency)} · {row.paid_on || "—"}</p>
            {row.last_fix_summary ? <p className="text-xs">{t("arcadeGames.listFix")}: {row.last_fix_summary}</p> : null}
          </Link>
        ))}
      </div>
      <Pager page={page} pageSize={100} total={list.data?.total ?? 0} onPage={setPage} />
    </div>
  );
}

function formatPaid(amount: number | string | null | undefined, currency: string | null | undefined) {
  if (amount == null || amount === "") return "—";
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  return fmtCurrency(value, currency || "QAR");
}

function dayValue(value: string | null | undefined) {
  return value ? String(value).slice(0, 10) : "";
}

const emptyMachineForm = {
  assetCode: "",
  name: "",
  gameCategory: "Arcade",
  locationId: "",
  zone: "",
  unitNumber: "",
  manufacturer: "",
  vendorId: "",
  supplierName: "",
  model: "",
  serialNumber: "",
  installedOn: "",
  purchasedOn: "",
  warrantyStart: "",
  warrantyExpiresOn: "",
  machineCost: "",
  amountPaid: "",
  paidCurrency: "QAR",
  paidOn: "",
  status: "WORKING",
  technicianStaffId: "",
  powerRequirement: "",
  networkRequirement: "",
  ipAddress: "",
  softwareVersion: "",
  controllerPcb: "",
  cardRfidInterface: "",
  nextPmOn: "",
  notes: "",
};

export function ArcadeMachineForm({ machineId }: { machineId?: string }) {
  const { t } = useTranslation();
  const sites = useSites();
  const context = useQuery({ queryKey: queryKeys.arcade.context(), queryFn: () => getArcadeContext({}) });
  const suppliers = useQuery({ queryKey: [...queryKeys.arcade.all, "supplier-options", "machine-form"], queryFn: () => listArcadeSuppliers({ page: 1, pageSize: 50 }) });
  const existing = useQuery({
    queryKey: queryKeys.arcade.machine(machineId),
    queryFn: () => getArcadeMachine({ id: machineId }),
    enabled: Boolean(machineId),
  });
  const qc = useQueryClient();
  const search = useSearchParams();
  const [form, setForm] = useState({ ...emptyMachineForm, locationId: search.get("locationId") ?? "" });
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const row = existing.data?.machine;
    if (!row || hydrated) return;
    setForm({
      assetCode: row.asset_code,
      name: row.name,
      gameCategory: row.game_category,
      locationId: row.location_id,
      zone: row.zone ?? "",
      unitNumber: row.unit_number ?? "",
      manufacturer: row.manufacturer ?? "",
      vendorId: row.vendor_id ?? "",
      supplierName: row.supplier_name ?? "",
      model: row.model ?? "",
      serialNumber: row.serial_number ?? "",
      installedOn: dayValue(row.installed_on),
      purchasedOn: dayValue(row.purchased_on),
      warrantyStart: dayValue(row.warranty_start),
      warrantyExpiresOn: dayValue(row.warranty_expires_on),
      machineCost: row.machine_cost == null ? "" : String(row.machine_cost),
      amountPaid: row.amount_paid == null ? "" : String(row.amount_paid),
      paidCurrency: row.paid_currency ?? "QAR",
      paidOn: dayValue(row.paid_on),
      status: row.status,
      technicianStaffId: row.technician_staff_id ?? "",
      powerRequirement: row.power_requirement ?? "",
      networkRequirement: row.network_requirement ?? "",
      ipAddress: row.ip_address ?? "",
      softwareVersion: row.software_version ?? "",
      controllerPcb: row.controller_pcb ?? "",
      cardRfidInterface: row.card_rfid_interface ?? "",
      nextPmOn: dayValue(row.next_pm_on),
      notes: row.notes ?? "",
    });
    setHydrated(true);
  }, [existing.data, hydrated]);
  const save = useMutation({
    mutationFn: () => saveArcadeMachine({
      id: machineId,
      assetCode: form.assetCode,
      name: form.name,
      gameCategory: form.gameCategory,
      locationId: form.locationId,
      zone: form.zone || null,
      unitNumber: form.unitNumber || null,
      manufacturer: form.manufacturer || null,
      vendorId: form.vendorId || null,
      supplierName: form.supplierName || null,
      model: form.model || null,
      serialNumber: form.serialNumber || null,
      installedOn: form.installedOn || null,
      purchasedOn: form.purchasedOn || null,
      warrantyStart: form.warrantyStart || null,
      warrantyExpiresOn: form.warrantyExpiresOn || null,
      machineCost: form.machineCost ? Number(form.machineCost) : null,
      amountPaid: form.amountPaid === "" ? null : Number(form.amountPaid),
      paidCurrency: form.paidCurrency || null,
      paidOn: form.paidOn || null,
      status: form.status as "WORKING",
      technicianStaffId: form.technicianStaffId || null,
      powerRequirement: form.powerRequirement || null,
      networkRequirement: form.networkRequirement || null,
      ipAddress: form.ipAddress || null,
      softwareVersion: form.softwareVersion || null,
      controllerPcb: form.controllerPcb || null,
      cardRfidInterface: form.cardRfidInterface || null,
      nextPmOn: form.nextPmOn || null,
      notes: form.notes || null,
    }),
    onSuccess: (row) => {
      toast.success(t("arcadeScreens.savedMachine", { code: row.asset_code }));
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
      window.location.href = `/arcade/machines/${row.id}`;
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.saveMachineFailed")),
  });
  if (machineId && existing.isLoading) return <p className="text-sm text-muted-foreground">{t("arcadeScreens.loadingMachine")}</p>;
  return (
    <form className="grid max-w-3xl gap-3" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <h1 className="text-xl font-semibold">{machineId ? t("arcadeGames.editGame") : t("arcadeScreens.machineMaster")}</h1>
      <p className="text-sm text-muted-foreground">{t("arcadeScreens.machineMasterHint")}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t("arcadeScreens.assetId")}><Input value={form.assetCode} onChange={(event) => setForm({ ...form, assetCode: event.target.value })} placeholder="UA-ARCAR-001" required /></Field>
        <Field label={t("arcadeScreens.machineName")}><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
        <Field label={t("arcadeScreens.gameCategory")}><Input value={form.gameCategory} onChange={(event) => setForm({ ...form, gameCategory: event.target.value })} required /></Field>
        <Field label={t("common.site")}>
          <GlideSelect
            ariaLabel={t("common.site")}
            value={form.locationId}
            placeholder={t("arcadeScreens.selectSite")}
            showTags={false}
            menuWidth={320}
            onChange={(value) => setForm({ ...form, locationId: value })}
            options={(sites.data ?? []).map((site) => ({ value: site.id, label: site.name }))}
          />
        </Field>
        <Field label={t("arcadeScreens.zone")}><Input value={form.zone} onChange={(event) => setForm({ ...form, zone: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.unitNumber")}><Input value={form.unitNumber} onChange={(event) => setForm({ ...form, unitNumber: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.manufacturer")}><Input value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} /></Field>
        <Field label={t("arcadeGames.supplierRecord")}>
          <GlideSelect
            ariaLabel={t("arcadeGames.supplierRecord")}
            value={form.vendorId}
            placeholder={t("arcadeOps.none")}
            showTags={false}
            menuWidth={320}
            onChange={(value) => {
              const vendor = (suppliers.data?.rows ?? []).find((item) => item.id === value);
              setForm({
                ...form,
                vendorId: value,
                supplierName: form.supplierName || vendor?.name || "",
              });
            }}
            options={[{ value: "", label: t("arcadeOps.none") }, ...(suppliers.data?.rows ?? []).map((vendor) => ({ value: vendor.id, label: vendor.name }))]}
          />
        </Field>
        <Field label={t("arcadeGames.supplier")}>
          <Input value={form.supplierName} onChange={(event) => setForm({ ...form, supplierName: event.target.value })} />
        </Field>
        <Field label={t("arcadeScreens.model")}><Input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.serial")}><Input value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.installed")}><Input type="date" value={form.installedOn} onChange={(event) => setForm({ ...form, installedOn: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.purchased")}><Input type="date" value={form.purchasedOn} onChange={(event) => setForm({ ...form, purchasedOn: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.warrantyStart")}><Input type="date" value={form.warrantyStart} onChange={(event) => setForm({ ...form, warrantyStart: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.warrantyExpiry")}><Input type="date" value={form.warrantyExpiresOn} onChange={(event) => setForm({ ...form, warrantyExpiresOn: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.machineCost")}><Input type="number" min={0} value={form.machineCost} onChange={(event) => setForm({ ...form, machineCost: event.target.value })} /></Field>
        <Field label={t("arcadeGames.amountPaid")}><Input type="number" min={0} step="0.01" value={form.amountPaid} onChange={(event) => setForm({ ...form, amountPaid: event.target.value })} /></Field>
        <Field label={t("arcadeGames.currency")}><Input value={form.paidCurrency} maxLength={8} onChange={(event) => setForm({ ...form, paidCurrency: event.target.value.toUpperCase() })} /></Field>
        <Field label={t("arcadeGames.paidOn")}><Input type="date" value={form.paidOn} onChange={(event) => setForm({ ...form, paidOn: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.power")}><Input value={form.powerRequirement} onChange={(event) => setForm({ ...form, powerRequirement: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.network")}><Input value={form.networkRequirement} onChange={(event) => setForm({ ...form, networkRequirement: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.ip")}><Input value={form.ipAddress} onChange={(event) => setForm({ ...form, ipAddress: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.software")}><Input value={form.softwareVersion} onChange={(event) => setForm({ ...form, softwareVersion: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.controller")}><Input value={form.controllerPcb} onChange={(event) => setForm({ ...form, controllerPcb: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.card")}><Input value={form.cardRfidInterface} onChange={(event) => setForm({ ...form, cardRfidInterface: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.nextPm")}><Input type="date" value={form.nextPmOn} onChange={(event) => setForm({ ...form, nextPmOn: event.target.value })} /></Field>
        <Field label={t("arcadeScreens.status")}>
          <GlideSelect
            ariaLabel={t("arcadeScreens.status")}
            value={form.status}
            showTags={false}
            onChange={(value) => setForm({ ...form, status: value })}
            options={MACHINE_STATUSES.map((item) => ({ value: item, label: arcadeStatusName(t, item) }))}
          />
        </Field>
        <Field label={t("arcadeScreens.technician")}>
          <GlideSelect
            ariaLabel={t("arcadeScreens.technician")}
            value={form.technicianStaffId}
            placeholder={t("arcadeScreens.unassigned")}
            showTags={false}
            menuWidth={320}
            onChange={(value) => setForm({ ...form, technicianStaffId: value })}
            options={[{ value: "", label: t("arcadeScreens.unassigned") }, ...(context.data?.technicians ?? []).map((tech) => ({ value: tech.id, label: `${tech.full_name}${tech.job_title ? ` · ${tech.job_title}` : ""}` }))]}
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">{t("arcadeGames.supplierHint")}</p>
      <Field label={t("arcadeScreens.notes")}><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
      <Button type="submit" disabled={save.isPending}>{t("arcadeGames.saveGame")}</Button>
    </form>
  );
}

export function ArcadeMachineDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const machine = useQuery({ queryKey: queryKeys.arcade.machine(id), queryFn: () => getArcadeMachine({ id }) });
  const context = useQuery({ queryKey: queryKeys.arcade.context(), queryFn: () => getArcadeContext({}) });
  const label = useSiteLabel();
  const canManage = usePermission("arcade.manage");
  const qc = useQueryClient();
  const statusSave = useMutation({
    mutationFn: (status: (typeof MACHINE_STATUSES)[number]) => {
      const current = machine.data?.machine;
      if (!current) throw new Error(t("arcadeScreens.notFound"));
      return saveArcadeMachine({
        id: current.id,
        assetCode: current.asset_code,
        name: current.name,
        gameCategory: current.game_category,
        locationId: current.location_id,
        status,
        notes: current.notes,
      });
    },
    onSuccess: () => {
      toast.success(t("arcadeScreens.statusSaved"));
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.machine(id) });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.statusSaveFailed")),
  });
  const row = machine.data?.machine;
  if (machine.isLoading) return <p className="text-sm text-muted-foreground">{t("arcadeScreens.loadingMachine")}</p>;
  if (!row) return <p className="text-sm text-destructive">{t("arcadeScreens.notFound")}</p>;
  const prefill = `machineId=${row.id}&locationId=${row.location_id}&technicianId=${row.technician_staff_id ?? ""}`;
  const fixer = (context.data?.technicians ?? []).find((tech) => tech.id === row.last_fix_technician_staff_id)?.full_name;
  const fixWhen = row.last_fix_at ? new Date(row.last_fix_at).toLocaleString() : null;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{row.asset_code}</p>
          <h1 className="text-2xl font-semibold">{row.name}</h1>
          <p className="text-sm text-muted-foreground">{label(row.location_id)}{row.zone ? ` · ${row.zone}` : ""}</p>
        </div>
        <div className="grid gap-2">
          <StatusBadge status={row.status} />
          {canManage ? (
            <Button asChild variant="outline"><Link href={`/arcade/machines/${row.id}/edit`}>{t("arcadeGames.editGame")}</Link></Button>
          ) : null}
          {canManage ? (
            <GlideSelect
              ariaLabel={t("arcadeScreens.machineStatus")}
              value={row.status}
              disabled={statusSave.isPending}
              showTags={false}
              onChange={(value) => statusSave.mutate(value as (typeof MACHINE_STATUSES)[number])}
              options={MACHINE_STATUSES.map((item) => ({ value: item, label: arcadeStatusName(t, item) }))}
            />
          ) : null}
        </div>
      </div>
      <MobileActions>
        <ActionButton href={`/arcade/faults/new?${prefill}`}>{t("arcadeScreens.reportFault")}</ActionButton>
        <ActionButton href={`/arcade/faults/new?${prefill}&startRepair=1`}>{t("arcadeScreens.startRepair")}</ActionButton>
        <ActionButton href={`/arcade/pm?machineId=${row.id}`}>{t("arcadeScreens.completePm")}</ActionButton>
        <ActionButton href={`/arcade/parts?machineId=${row.id}&locationId=${row.location_id}`}>{t("arcadeScreens.requestPart")}</ActionButton>
        <ActionButton href={`/arcade/support/new?${prefill}`}>{t("arcadeScreens.contactSupplier")}</ActionButton>
        <ActionButton href={`/arcade/manuals?machineId=${row.id}`}>{t("arcadeScreens.viewManual")}</ActionButton>
      </MobileActions>
      <PhotoUpload machineId={row.id} locationId={row.location_id} photoPath={row.photo_path} />
      <MachineQr assetCode={row.asset_code} />
      <dl className="grid gap-2 text-sm md:grid-cols-3">
        <Info label={t("arcadeScreens.category")} value={row.game_category} />
        <Info label={t("arcadeScreens.manufacturer")} value={row.manufacturer} />
        <Info label={t("arcadeScreens.model")} value={row.model} />
        <Info label={t("arcadeScreens.serial")} value={row.serial_number} />
        <Info label={t("arcadeScreens.unit")} value={row.unit_number} />
        <Info label={t("arcadeScreens.warrantyExpiry")} value={row.warranty_expires_on} />
        <Info label={t("arcadeScreens.lastPm")} value={row.last_pm_on} />
        <Info label={t("arcadeScreens.nextPm")} value={row.next_pm_on} />
        <Info label={t("arcadeScreens.software")} value={row.software_version} />
        <Info label={t("arcadeScreens.controller")} value={row.controller_pcb} />
        <Info label={t("arcadeScreens.card")} value={row.card_rfid_interface} />
        <Info label={t("arcadeScreens.ip")} value={row.ip_address} />
        <Info label={t("arcadeGames.supplier")} value={row.supplier_name} />
        <Info label={t("arcadeGames.amountPaid")} value={formatPaid(row.amount_paid, row.paid_currency)} />
        <Info label={t("arcadeGames.paidOn")} value={row.paid_on} />
      </dl>
      <section className="rounded-lg border p-3">
        <h2 className="font-semibold">{t("arcadeGames.latestFix")}</h2>
        {row.last_fix_summary ? (
          <div className="mt-2 grid gap-1 text-sm">
            <p>{row.last_fix_summary}</p>
            <p className="text-muted-foreground">
              {[row.last_fix_status ? arcadeStatusName(t, row.last_fix_status) : null, fixWhen, fixer].filter(Boolean).join(" · ")}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t("arcadeGames.fixNone")}</p>
        )}
      </section>
      <MachineTabs data={machine.data} />
    </div>
  );
}

export function ArcadeQrMachine({ assetCode }: { assetCode: string }) {
  const machine = useQuery({
    queryKey: queryKeys.arcade.machine(assetCode),
    queryFn: () => getArcadeMachine({ assetCode }),
  });
  const id = machine.data?.machine.id;
  if (id) return <ArcadeMachineDetail id={id} />;
  if (machine.isLoading) return <QrOpening assetCode={assetCode} />;
  return <QrMissing assetCode={assetCode} />;
}

function QrOpening({ assetCode }: { assetCode: string }) {
  const { t } = useTranslation();
  return <p className="text-sm">{t("arcadeScreens.opening", { code: assetCode })}</p>;
}

function QrMissing({ assetCode }: { assetCode: string }) {
  const { t } = useTranslation();
  return <p className="text-sm text-destructive">{t("arcadeScreens.noMatch", { code: assetCode })}</p>;
}

function Info({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className="rounded-md border p-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd>{value || "—"}</dd></div>;
}

function MachineTabs({ data }: { data: Awaited<ReturnType<typeof getArcadeMachine>> | undefined }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview", "Faults", "PM", "Parts", "SupplierCases", "Documents", "Damage", "Timeline"] as const;
  if (!data) return null;
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((item) => (
          <button key={item} type="button" className={`rounded-md px-3 py-2 text-sm ${tab === item ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => setTab(item)}>{t(`arcadeScreens.tab.${item}`)}</button>
        ))}
      </div>
      <div className="mt-3 grid gap-2 text-sm">
        {tab === "Overview" ? <p>{data.machine.notes || t("arcadeScreens.noNotes")}</p> : null}
        {tab === "Faults" ? data.faults.map((row) => <Link key={row.id} href={`/arcade/faults/${row.id}`} className="rounded border p-2">{row.ticket_number} · {arcadeCategoryName(t, row.category)} · {arcadeStatusName(t, row.status)}{row.is_repeat ? ` · ${t("arcadeStatus.REPEAT")}` : ""}</Link>) : null}
        {tab === "PM" ? data.pm.map((row) => <p key={row.id} className="rounded border p-2">{row.performed_on} · {t("arcadeScreens.pmNext", { date: row.next_pm_on ?? "—" })} · {row.issues_found || t("arcadeScreens.noIssues")}</p>) : null}
        {tab === "Parts" ? data.parts.map((row) => <p key={row.id} className="rounded border p-2">{row.used_on} · {t("arcadeScreens.qty", { qty: row.qty })}</p>) : null}
        {tab === "SupplierCases" ? data.cases.map((row) => <Link key={row.id} href={`/arcade/support/${row.id}`} className="rounded border p-2">{row.case_number} · {arcadeStatusName(t, row.status)}</Link>) : null}
        {tab === "Documents" ? data.documents.map((row) => <p key={row.id} className="rounded border p-2">{row.title} · {row.doc_type}</p>) : null}
        {tab === "Damage" ? data.damage.map((row) => <p key={row.id} className="rounded border p-2">{row.reported_on} · {row.damage_type}{row.needs_mapping ? ` · ${t("arcadeScreens.needsMapping")}` : ""}</p>) : null}
        {tab === "Timeline" ? data.timeline.map((row) => <p key={row.id} className="rounded border p-2">{new Date(row.created_at).toLocaleString()} · {row.previous_status ? arcadeStatusName(t, row.previous_status) : ""} → {row.new_status ? arcadeStatusName(t, row.new_status) : ""}</p>) : null}
      </div>
    </div>
  );
}

function PhotoUpload({ machineId, locationId, photoPath }: { machineId: string; locationId: string; photoPath: string | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const photo = useQuery({
    queryKey: ["arcade-photo", photoPath],
    queryFn: () => (photoPath ? getArcadeFileUrl({ path: photoPath }) : Promise.resolve({ url: "" })),
    enabled: Boolean(photoPath),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const dataBase64 = await readBase64(file);
      return uploadArcadeFile({
        entityType: "machine",
        entityId: machineId,
        locationId,
        kind: file.type.startsWith("video/") ? "video" : "photo",
        filename: file.name,
        contentType: file.type || "image/jpeg",
        dataBase64,
      });
    },
    onSuccess: () => {
      toast.success(t("arcadeScreens.photoUploaded"));
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.machine(machineId) });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.uploadFailed")),
  });
  return (
    <div className="flex flex-wrap items-center gap-3">
      {photo.data?.url ? <img src={photo.data.url} alt="" className="h-24 w-24 rounded-md object-cover" /> : null}
      <label className="text-sm font-medium">
        {t("arcadeScreens.addPhoto")}
        <input className="mt-1 block text-sm" type="file" accept="image/*,video/*" capture="environment" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file);
        }} />
      </label>
    </div>
  );
}

function MachineQr({ assetCode }: { assetCode: string }) {
  const { t } = useTranslation();
  const url = typeof window === "undefined" ? `/arcade/m/${assetCode}` : `${window.location.origin}/arcade/m/${encodeURIComponent(assetCode)}`;
  const qr = useQuery({
    queryKey: ["arcade-qr", url],
    queryFn: async () => {
      const QR = await import("qrcode");
      return QR.default.toString(url, { type: "svg", margin: 1, width: 180 });
    },
  });
  return (
    <div className="flex items-center gap-3">
      {qr.data ? <div className="h-28 w-28" dangerouslySetInnerHTML={{ __html: qr.data }} /> : <div className="h-28 w-28 rounded border" />}
      <p className="text-xs text-muted-foreground break-all">{t("arcadeScreens.scanHint")} {url}</p>
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
