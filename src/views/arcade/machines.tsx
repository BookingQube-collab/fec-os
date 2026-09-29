"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ActionButton, Field, KpiTile, MobileActions, Pager, StatusBadge } from "@/components/arcade/ui";
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
  const sites = useSites();
  return (id?: string | null) => sites.data?.find((site) => site.id === id)?.name ?? "Site";
}

export function ArcadeSites() {
  const sites = useSites();
  const dashboard = useQuery({ queryKey: queryKeys.arcade.dashboard("sites"), queryFn: () => getArcadeDashboard({}) });
  const health = new Map((dashboard.data?.sites ?? []).map((site) => [site.location_id, site]));
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold">Sites & Games</h1>
      <p className="text-sm text-muted-foreground">Sites come from the existing location master. Open a site to see its machines.</p>
      <div className="grid gap-2">
        {(sites.data ?? []).map((site) => {
          const row = health.get(site.id);
          return (
            <Link key={site.id} href={`/arcade/sites/${site.id}`} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{site.name}</span>
                <span className="tabular-nums">{row ? `${siteAvailability({ working: row.working, active: row.active_machines }) ?? "—"}%` : "No machines"}</span>
              </div>
              {row ? <p className="text-sm text-muted-foreground">{row.active_machines} machines · {row.working} working · {row.down} down</p> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function ArcadeSite({ locationId }: { locationId: string }) {
  const label = useSiteLabel();
  const dashboard = useQuery({ queryKey: queryKeys.arcade.dashboard(locationId), queryFn: () => getArcadeDashboard({ locationId }) });
  const site = dashboard.data?.sites[0];
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold">{label(locationId)}</h1>
        <p className="text-sm text-muted-foreground">Machine inventory for this site.</p>
      </div>
      {site ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <KpiTile label="Machines" value={site.active_machines} />
          <KpiTile label="Working" value={site.working} />
          <KpiTile label="Down" value={site.down} />
          <KpiTile label="Under repair" value={site.under_repair} />
          <KpiTile label="Observation" value={site.under_observation} />
          <KpiTile label="Waiting parts" value={site.waiting_part} />
          <KpiTile label="PM due" value={site.pm_due + site.pm_overdue} />
          <KpiTile label="Availability" value={`${site.availability ?? "—"}%`} />
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
    queryFn: () => listArcadeMachines({ page, pageSize: 25, q, status: status || null, locationId: locationId ?? null }),
  });
  return (
    <div className="grid gap-3">
      {!locationId ? <h1 className="text-xl font-semibold">Machines</h1> : null}
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Search name, asset ID, serial, supplier" className="max-w-xs" />
        <select className="h-10 rounded-md border bg-background px-2 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {MACHINE_STATUSES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
        </select>
        {canManage ? <Button asChild><Link href={`/arcade/machines/new${locationId ? `?locationId=${locationId}` : ""}`}>Add machine</Link></Button> : null}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">Asset</th>
              <th>Machine</th>
              <th>Site</th>
              <th>{t("arcadeGames.listSupplier")}</th>
              <th>{t("arcadeGames.listPaid")}</th>
              <th>{t("arcadeGames.listPaidOn")}</th>
              <th>{t("arcadeGames.listFix")}</th>
              <th>Status</th>
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
                <td className="max-w-48 truncate">{row.last_fix_status ? `${row.last_fix_status.replaceAll("_", " ")} · ${row.last_fix_summary ?? ""}` : "—"}</td>
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
            <p className="text-xs text-muted-foreground">{t("arcadeGames.listSupplier")}: {row.supplier_name || "—"} · {formatPaid(row.amount_paid, row.paid_currency)} · {row.paid_on || "—"}</p>
            {row.last_fix_summary ? <p className="text-xs">{t("arcadeGames.listFix")}: {row.last_fix_summary}</p> : null}
          </Link>
        ))}
      </div>
      <Pager page={page} pageSize={25} total={list.data?.total ?? 0} onPage={setPage} />
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
      toast.success(`Machine ${row.asset_code} saved`);
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
      window.location.href = `/arcade/machines/${row.id}`;
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save machine"),
  });
  if (machineId && existing.isLoading) return <p className="text-sm text-muted-foreground">Loading machine…</p>;
  return (
    <form className="grid max-w-3xl gap-3" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <h1 className="text-xl font-semibold">{machineId ? t("arcadeGames.editGame") : "Machine master"}</h1>
      <p className="text-sm text-muted-foreground">Each physical unit is its own asset. RC Car #1 and RC Car #2 are separate records.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Asset ID"><Input value={form.assetCode} onChange={(event) => setForm({ ...form, assetCode: event.target.value })} placeholder="UA-ARCAR-001" required /></Field>
        <Field label="Machine name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
        <Field label="Game category"><Input value={form.gameCategory} onChange={(event) => setForm({ ...form, gameCategory: event.target.value })} required /></Field>
        <Field label="Site">
          <select className="h-10 rounded-md border bg-background px-2" value={form.locationId} onChange={(event) => setForm({ ...form, locationId: event.target.value })} required>
            <option value="">Select site</option>
            {(sites.data ?? []).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </Field>
        <Field label="Zone / area"><Input value={form.zone} onChange={(event) => setForm({ ...form, zone: event.target.value })} /></Field>
        <Field label="Unit number"><Input value={form.unitNumber} onChange={(event) => setForm({ ...form, unitNumber: event.target.value })} /></Field>
        <Field label="Manufacturer"><Input value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} /></Field>
        <Field label={t("arcadeGames.supplierRecord")}>
          <select className="h-10 rounded-md border bg-background px-2" value={form.vendorId} onChange={(event) => {
            const vendor = (suppliers.data?.rows ?? []).find((item) => item.id === event.target.value);
            setForm({
              ...form,
              vendorId: event.target.value,
              supplierName: form.supplierName || vendor?.name || "",
            });
          }}>
            <option value="">None</option>
            {(suppliers.data?.rows ?? []).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
        </Field>
        <Field label={t("arcadeGames.supplier")}>
          <Input value={form.supplierName} onChange={(event) => setForm({ ...form, supplierName: event.target.value })} />
        </Field>
        <Field label="Model"><Input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></Field>
        <Field label="Serial number"><Input value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} /></Field>
        <Field label="Installed"><Input type="date" value={form.installedOn} onChange={(event) => setForm({ ...form, installedOn: event.target.value })} /></Field>
        <Field label="Purchased"><Input type="date" value={form.purchasedOn} onChange={(event) => setForm({ ...form, purchasedOn: event.target.value })} /></Field>
        <Field label="Warranty start"><Input type="date" value={form.warrantyStart} onChange={(event) => setForm({ ...form, warrantyStart: event.target.value })} /></Field>
        <Field label="Warranty expiry"><Input type="date" value={form.warrantyExpiresOn} onChange={(event) => setForm({ ...form, warrantyExpiresOn: event.target.value })} /></Field>
        <Field label="Machine cost"><Input type="number" min={0} value={form.machineCost} onChange={(event) => setForm({ ...form, machineCost: event.target.value })} /></Field>
        <Field label={t("arcadeGames.amountPaid")}><Input type="number" min={0} step="0.01" value={form.amountPaid} onChange={(event) => setForm({ ...form, amountPaid: event.target.value })} /></Field>
        <Field label={t("arcadeGames.currency")}><Input value={form.paidCurrency} maxLength={8} onChange={(event) => setForm({ ...form, paidCurrency: event.target.value.toUpperCase() })} /></Field>
        <Field label={t("arcadeGames.paidOn")}><Input type="date" value={form.paidOn} onChange={(event) => setForm({ ...form, paidOn: event.target.value })} /></Field>
        <Field label="Power"><Input value={form.powerRequirement} onChange={(event) => setForm({ ...form, powerRequirement: event.target.value })} /></Field>
        <Field label="Network"><Input value={form.networkRequirement} onChange={(event) => setForm({ ...form, networkRequirement: event.target.value })} /></Field>
        <Field label="IP"><Input value={form.ipAddress} onChange={(event) => setForm({ ...form, ipAddress: event.target.value })} /></Field>
        <Field label="Software version"><Input value={form.softwareVersion} onChange={(event) => setForm({ ...form, softwareVersion: event.target.value })} /></Field>
        <Field label="Controller / PCB"><Input value={form.controllerPcb} onChange={(event) => setForm({ ...form, controllerPcb: event.target.value })} /></Field>
        <Field label="Card / RFID"><Input value={form.cardRfidInterface} onChange={(event) => setForm({ ...form, cardRfidInterface: event.target.value })} /></Field>
        <Field label="Next PM"><Input type="date" value={form.nextPmOn} onChange={(event) => setForm({ ...form, nextPmOn: event.target.value })} /></Field>
        <Field label="Status">
          <select className="h-10 rounded-md border bg-background px-2" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            {MACHINE_STATUSES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
          </select>
        </Field>
        <Field label="Technician">
          <select className="h-10 rounded-md border bg-background px-2" value={form.technicianStaffId} onChange={(event) => setForm({ ...form, technicianStaffId: event.target.value })}>
            <option value="">Unassigned</option>
            {(context.data?.technicians ?? []).map((tech) => <option key={tech.id} value={tech.id}>{tech.full_name}{tech.job_title ? ` · ${tech.job_title}` : ""}</option>)}
          </select>
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">{t("arcadeGames.supplierHint")}</p>
      <Field label="Notes"><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
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
      if (!current) throw new Error("Machine not loaded");
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
      toast.success("Machine status saved");
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.machine(id) });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Status was not saved"),
  });
  const row = machine.data?.machine;
  if (machine.isLoading) return <p className="text-sm text-muted-foreground">Loading machine…</p>;
  if (!row) return <p className="text-sm text-destructive">Machine not found</p>;
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
            <select
              className="h-10 rounded-md border bg-background px-2"
              value={row.status}
              disabled={statusSave.isPending}
              onChange={(event) => statusSave.mutate(event.target.value as (typeof MACHINE_STATUSES)[number])}
            >
              {MACHINE_STATUSES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
            </select>
          ) : null}
        </div>
      </div>
      <MobileActions>
        <ActionButton href={`/arcade/faults/new?${prefill}`}>Report fault</ActionButton>
        <ActionButton href={`/arcade/faults/new?${prefill}&startRepair=1`}>Start repair</ActionButton>
        <ActionButton href={`/arcade/pm?machineId=${row.id}`}>Complete PM</ActionButton>
        <ActionButton href={`/arcade/parts?machineId=${row.id}&locationId=${row.location_id}`}>Request part</ActionButton>
        <ActionButton href={`/arcade/support/new?${prefill}`}>Contact supplier</ActionButton>
        <ActionButton href={`/arcade/manuals?machineId=${row.id}`}>View manual</ActionButton>
      </MobileActions>
      <PhotoUpload machineId={row.id} locationId={row.location_id} photoPath={row.photo_path} />
      <MachineQr assetCode={row.asset_code} />
      <dl className="grid gap-2 text-sm md:grid-cols-3">
        <Info label="Category" value={row.game_category} />
        <Info label="Manufacturer" value={row.manufacturer} />
        <Info label="Model" value={row.model} />
        <Info label="Serial" value={row.serial_number} />
        <Info label="Unit" value={row.unit_number} />
        <Info label="Warranty expiry" value={row.warranty_expires_on} />
        <Info label="Last PM" value={row.last_pm_on} />
        <Info label="Next PM" value={row.next_pm_on} />
        <Info label="Software" value={row.software_version} />
        <Info label="Controller / PCB" value={row.controller_pcb} />
        <Info label="Card / RFID" value={row.card_rfid_interface} />
        <Info label="IP" value={row.ip_address} />
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
              {[row.last_fix_status?.replaceAll("_", " "), fixWhen, fixer].filter(Boolean).join(" · ")}
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
  if (machine.isLoading) return <p className="text-sm">Opening {assetCode}…</p>;
  return <p className="text-sm text-destructive">No machine matches {assetCode}</p>;
}

function Info({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className="rounded-md border p-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd>{value || "—"}</dd></div>;
}

function MachineTabs({ data }: { data: Awaited<ReturnType<typeof getArcadeMachine>> | undefined }) {
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview", "Faults", "PM", "Parts", "Supplier cases", "Documents", "Damage", "Timeline"];
  if (!data) return null;
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((item) => (
          <button key={item} type="button" className={`rounded-md px-3 py-2 text-sm ${tab === item ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      <div className="mt-3 grid gap-2 text-sm">
        {tab === "Overview" ? <p>{data.machine.notes || "No notes yet."}</p> : null}
        {tab === "Faults" ? data.faults.map((row) => <Link key={row.id} href={`/arcade/faults/${row.id}`} className="rounded border p-2">{row.ticket_number} · {row.category} · {row.status}{row.is_repeat ? " · REPEAT" : ""}</Link>) : null}
        {tab === "PM" ? data.pm.map((row) => <p key={row.id} className="rounded border p-2">{row.performed_on} · next {row.next_pm_on ?? "—"} · {row.issues_found || "No issues"}</p>) : null}
        {tab === "Parts" ? data.parts.map((row) => <p key={row.id} className="rounded border p-2">{row.used_on} · qty {row.qty}</p>) : null}
        {tab === "Supplier cases" ? data.cases.map((row) => <Link key={row.id} href={`/arcade/support/${row.id}`} className="rounded border p-2">{row.case_number} · {row.status}</Link>) : null}
        {tab === "Documents" ? data.documents.map((row) => <p key={row.id} className="rounded border p-2">{row.title} · {row.doc_type}</p>) : null}
        {tab === "Damage" ? data.damage.map((row) => <p key={row.id} className="rounded border p-2">{row.reported_on} · {row.damage_type}{row.needs_mapping ? " · Needs mapping" : ""}</p>) : null}
        {tab === "Timeline" ? data.timeline.map((row) => <p key={row.id} className="rounded border p-2">{new Date(row.created_at).toLocaleString()} · {row.previous_status} → {row.new_status}</p>) : null}
      </div>
    </div>
  );
}

function PhotoUpload({ machineId, locationId, photoPath }: { machineId: string; locationId: string; photoPath: string | null }) {
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
      toast.success("Photo uploaded");
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.machine(machineId) });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Upload failed"),
  });
  return (
    <div className="flex flex-wrap items-center gap-3">
      {photo.data?.url ? <img src={photo.data.url} alt="" className="h-24 w-24 rounded-md object-cover" /> : null}
      <label className="text-sm font-medium">
        Add photo
        <input className="mt-1 block text-sm" type="file" accept="image/*,video/*" capture="environment" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file);
        }} />
      </label>
    </div>
  );
}

function MachineQr({ assetCode }: { assetCode: string }) {
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
      <p className="text-xs text-muted-foreground break-all">Scan to open this machine. {url}</p>
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
