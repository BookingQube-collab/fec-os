"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  FileText,
  Gamepad2,
  History,
  LayoutDashboard,
  Package,
  ShieldAlert,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { GamePhoto, useArcadePhotoUrls } from "@/components/arcade/game-photo";
import { ActionButton, arcadeCategoryName, arcadeStatusName, Field, HealthMeter, KpiTile, Pager, SiteHealthCard, StatusBadge, useVenueTitle } from "@/components/arcade/ui";
import { ArcadeWorkbookImport } from "@/components/arcade/workbook-import";
import { FecLoader, FecPageHeader } from "@/components/fec";
import GlideSelect from "@/components/react-bits/glide-select";
import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { MACHINE_STATUSES } from "@/lib/arcade/domain";
import { getArcadeContext, getArcadeFileUrl, getArcadeMachine, getArcadeSiteBoard, listArcadeMachines, saveArcadeMachine, uploadArcadeFile } from "@/lib/arcade.functions";
import { listArcadeSuppliers } from "@/lib/arcade-supply.functions";
import { fmtCurrency } from "@/lib/currency";
import { venueTitle } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const GAME_PAGE_SIZE = 24;

export function ArcadeSites() {
  const { t } = useTranslation();
  const sites = useSites();
  const board = useQuery({ queryKey: queryKeys.arcade.siteBoard(null), queryFn: () => getArcadeSiteBoard({}) });
  const health = new Map((board.data?.sites ?? []).map((site) => [site.location_id, site]));
  const photos = useArcadePhotoUrls(Object.values(board.data?.covers ?? {}));
  const cards = [...(sites.data ?? [])]
    .map((site) => {
      const row = health.get(site.id);
      return { site, row, title: venueTitle(site, site.name) };
    })
    .sort((a, b) => {
      const aMachines = a.row?.active_machines ?? 0;
      const bMachines = b.row?.active_machines ?? 0;
      if ((aMachines > 0) !== (bMachines > 0)) return aMachines > 0 ? -1 : 1;
      const availability = (a.row?.availability ?? 101) - (b.row?.availability ?? 101);
      if (availability !== 0) return availability;
      return a.title.localeCompare(b.title);
    });
  return (
    <div className="grid gap-4">
      <FecPageHeader icon={Gamepad2} kicker={t("nav.arcade")} title={t("arcadeScreens.sitesTitle")} subtitle={t("arcadeScreens.sitesHint")} />
      {sites.isLoading || board.isLoading ? <FecLoader label={t("arcadeOps.loading")} /> : null}
      {board.isError ? <p className="text-sm text-destructive">{board.error instanceof Error ? board.error.message : t("arcadeOps.failed")}</p> : null}
      {!sites.isLoading && !board.isLoading && !board.isError ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ site, row, title }) => {
          const cover = board.data?.covers[site.id];
          return (
            <SiteHealthCard
              key={site.id}
              href={`/arcade/sites/${site.id}`}
              title={title}
              code={site.code}
              availability={row?.availability ?? null}
              meterLabel={t("arcadeScreens.availability")}
              detail={row ? t("arcadeScreens.siteLineShort", { machines: row.active_machines, working: row.working, down: row.down }) : t("arcadeScreens.noMachines")}
              media={
                <GamePhoto
                  src={cover ? photos.data?.urls[cover] : null}
                  alt={t("arcadeScreens.gamePhoto", { name: title })}
                  missingLabel={t("arcadeScreens.photoMissing")}
                  className="aspect-[16/10] w-full"
                />
              }
            />
          );
        })}
      </div> : null}
    </div>
  );
}

export function ArcadeSite({ locationId }: { locationId: string }) {
  const { t } = useTranslation();
  const label = useVenueTitle();
  const sites = useSites();
  const location = sites.data?.find((site) => site.id === locationId);
  const board = useQuery({ queryKey: queryKeys.arcade.siteBoard(locationId), queryFn: () => getArcadeSiteBoard({ locationId }) });
  const site = board.data?.sites[0];
  return (
    <div className="grid gap-4">
      <FecPageHeader
        icon={Gamepad2}
        kicker={location?.code}
        title={label(locationId)}
        subtitle={t("arcadeScreens.siteInventory")}
      />
      {board.isLoading ? <FecLoader label={t("arcadeOps.loading")} density="chip" /> : null}
      {site ? (
        <div className="grid gap-3">
          <HealthMeter value={site.availability} label={t("arcadeScreens.availability")} />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <KpiTile label={t("arcadeScreens.machines")} value={site.active_machines} />
            <KpiTile label={t("arcadeOps.working")} value={site.working} />
            <KpiTile label={t("arcadeOps.down")} value={site.down} />
            <KpiTile label={t("arcadeOps.underRepair")} value={site.under_repair} />
            <KpiTile label={t("arcadeScreens.observation")} value={site.under_observation} />
            <KpiTile label={t("arcadeOps.waitingParts")} value={site.waiting_part} />
            <KpiTile label={t("arcadeOps.pmDue")} value={site.pm_due + site.pm_overdue} />
            <KpiTile label={t("arcadeOps.waitingSupplier")} value={site.waiting_supplier} />
          </div>
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
  const label = useVenueTitle();
  const canManage = usePermission("arcade.manage");
  const list = useQuery({
    queryKey: queryKeys.arcade.machines({ page, q, status, locationId, pageSize: GAME_PAGE_SIZE }),
    queryFn: () => listArcadeMachines({ page, pageSize: GAME_PAGE_SIZE, q, status: status || null, locationId: locationId ?? null }),
  });
  const photos = useArcadePhotoUrls((list.data?.rows ?? []).map((row) => row.photo_path));
  const rows = list.data?.rows ?? [];
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
      {list.isLoading ? <FecLoader label={t("arcadeOps.loading")} density="chip" /> : null}
      {!list.isLoading && rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("arcadeScreens.noMachineRows")}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <Link key={row.id} href={`/arcade/machines/${row.id}`} className="overflow-hidden rounded-2xl border bg-card shadow-[0_4px_20px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5">
            <GamePhoto
              src={row.photo_path ? photos.data?.urls[row.photo_path] : null}
              alt={t("arcadeScreens.gamePhoto", { name: row.name })}
              missingLabel={t("arcadeScreens.photoMissing")}
              className="aspect-[16/10] w-full"
            />
            <div className="grid gap-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{row.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{row.asset_code}</p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              {!locationId ? <p className="text-xs text-muted-foreground">{label(row.location_id)}</p> : null}
              <p className="text-xs text-muted-foreground">
                {t("arcadeImport.purchaseInvoice")}: {row.supplier_name || "—"} · {formatPaid(row.amount_paid, row.paid_currency)} · {row.paid_on || "—"}
              </p>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {t("arcadeGames.listFix")}: {row.last_fix_status ? `${arcadeStatusName(t, row.last_fix_status)} · ${row.last_fix_summary ?? ""}` : "—"}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <Pager page={page} pageSize={GAME_PAGE_SIZE} total={list.data?.total ?? 0} onPage={setPage} />
    </div>
  );
}

function formatPaid(amount: number | string | null | undefined, currency: string | null | undefined) {
  return displayMoney(amount, currency) ?? "—";
}

function displayMoney(amount: number | string | null | undefined, currency: string | null | undefined) {
  if (amount == null || amount === "") return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  return fmtCurrency(value, currency || "QAR");
}

function textOrNull(value: string | number | null | undefined) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function formatDay(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatStamp(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
  const label = useVenueTitle();
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
  if (!row || !machine.data) return <p className="text-sm text-destructive">{t("arcadeScreens.notFound")}</p>;
  const prefill = `machineId=${row.id}&locationId=${row.location_id}&technicianId=${row.technician_staff_id ?? ""}`;
  const links = {
    fault: `/arcade/faults/new?${prefill}`,
    repair: `/arcade/faults/new?${prefill}&startRepair=1`,
    pm: `/arcade/pm?machineId=${row.id}`,
    part: `/arcade/parts?machineId=${row.id}&locationId=${row.location_id}`,
    supplier: `/arcade/support/new?${prefill}`,
    manual: `/arcade/manuals?machineId=${row.id}`,
  };
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">{row.asset_code}</p>
          <h1 className="break-words text-2xl font-semibold">{row.name}</h1>
          <p className="text-sm text-muted-foreground">{label(row.location_id)}{row.zone ? ` · ${row.zone}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
              size="lg"
              onChange={(value) => statusSave.mutate(value as (typeof MACHINE_STATUSES)[number])}
              options={MACHINE_STATUSES.map((item) => ({ value: item, label: arcadeStatusName(t, item) }))}
            />
          ) : null}
        </div>
      </div>
      <div className="grid gap-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionButton href={links.fault}>{t("arcadeScreens.reportFault")}</ActionButton>
          <ActionButton href={links.repair}>{t("arcadeScreens.startRepair")}</ActionButton>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionButton variant="outline" href={links.pm}>{t("arcadeScreens.completePm")}</ActionButton>
          <ActionButton variant="outline" href={links.part}>{t("arcadeScreens.requestPart")}</ActionButton>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionButton variant="secondary" href={links.supplier}>{t("arcadeScreens.contactSupplier")}</ActionButton>
          <ActionButton variant="secondary" href={links.manual}>{t("arcadeScreens.viewManual")}</ActionButton>
        </div>
      </div>
      <MachineTabs
        data={machine.data}
        technicians={context.data?.technicians ?? []}
        techniciansReady={context.isFetched}
        links={links}
      />
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

type MachineDetail = NonNullable<Awaited<ReturnType<typeof getArcadeMachine>>>;
type MachineLinks = {
  fault: string;
  repair: string;
  pm: string;
  part: string;
  supplier: string;
  manual: string;
};
type Technician = { id: string; full_name: string };
type DetailTab = "Overview" | "Faults" | "PM" | "Parts" | "SupplierCases" | "Documents" | "Damage" | "Timeline";

const detailTabs: DetailTab[] = ["Overview", "Faults", "PM", "Parts", "SupplierCases", "Documents", "Damage", "Timeline"];
const DETAIL_TAB_ICONS: Record<DetailTab, LucideIcon> = {
  Overview: LayoutDashboard,
  Faults: AlertTriangle,
  PM: Wrench,
  Parts: Package,
  SupplierCases: Truck,
  Documents: FileText,
  Damage: ShieldAlert,
  Timeline: History,
};
const detailCard = "rounded-lg border bg-card p-3 text-sm";
const detailLink = "block rounded-lg border bg-card p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function MachineTabs({
  data,
  technicians,
  techniciansReady,
  links,
}: {
  data: MachineDetail;
  technicians: Technician[];
  techniciansReady: boolean;
  links: MachineLinks;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DetailTab>("Overview");
  const row = data.machine;
  const techName = (id: string | null) => {
    if (!id) return null;
    return technicians.find((tech) => tech.id === id)?.full_name ?? null;
  };
  const specs = machineSpecs(t, data, technicians, techniciansReady);
  const fixer = techName(row.last_fix_technician_staff_id);
  const fixWhen = formatStamp(row.last_fix_at);
  return (
    <div className="min-w-0">
      <PillTabScroller label={t("nav.arcade")}>
        {detailTabs.map((item) => {
          const Icon = DETAIL_TAB_ICONS[item];
          return (
            <button key={item} type="button" aria-pressed={tab === item} className={pillTabItemClass(tab === item)} onClick={() => setTab(item)}>
              <Icon aria-hidden />
              {t(`arcadeScreens.tab.${item}`)}
            </button>
          );
        })}
      </PillTabScroller>
      <div className="mt-3 grid min-w-0 gap-3">
        {tab === "Overview" ? (
          <>
            <div className="grid min-w-0 items-start gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
              <PhotoUpload machineId={row.id} locationId={row.location_id} photoPath={row.photo_path} name={row.name} />
              <MachineQr assetCode={row.asset_code} />
            </div>
            <SpecGrid items={specs} />
            <section className={detailCard}>
              <h2 className="font-semibold">{t("arcadeGames.latestFix")}</h2>
              {row.last_fix_summary ? (
                <div className="mt-2 grid gap-1">
                  <p className="whitespace-pre-wrap">{row.last_fix_summary}</p>
                  <p className="text-muted-foreground">
                    {[row.last_fix_status ? arcadeStatusName(t, row.last_fix_status) : null, fixWhen, fixer].filter(Boolean).join(" · ")}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-muted-foreground">{t("arcadeGames.fixNone")}</p>
              )}
            </section>
            <section className={detailCard}>
              <h2 className="font-semibold">{t("arcadeScreens.notes")}</h2>
              <p className={cn("mt-2 whitespace-pre-wrap", row.notes ? "text-foreground" : "text-muted-foreground")}>{row.notes || t("arcadeScreens.noNotes")}</p>
            </section>
            {data.installations.length > 0 ? (
              <section className="grid gap-2">
                <h2 className="font-semibold">{t("arcadeScreens.installTitle")}</h2>
                {data.installations.map((item) => (
                  <article key={item.id} className={detailCard}>
                    <p className="font-medium">{arcadeStatusName(t, item.status)}</p>
                    <p className="mt-1 text-muted-foreground">
                      {t("arcadeScreens.installed")}: {formatDay(item.installed_on) ?? t("arcadeScreens.notRecorded")}
                    </p>
                    {item.delivery_on ? <p className="text-muted-foreground">{t("arcadeScreens.delivered")}: {formatDay(item.delivery_on)}</p> : null}
                  </article>
                ))}
              </section>
            ) : null}
          </>
        ) : null}
        {tab === "Faults" ? (
          data.faults.length === 0 ? <TabEmpty message={t("arcadeScreens.emptyFaults")} href={links.fault} label={t("arcadeScreens.reportFault")} /> : data.faults.map((item) => (
            <Link key={item.id} href={`/arcade/faults/${item.id}`} className={detailLink}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{item.ticket_number || t("arcadeScreens.notRecorded")}</p>
                <StatusBadge status={item.status} />
              </div>
              <p className="mt-1 text-muted-foreground">
                {[
                  item.is_repeat ? t("arcadeOps.repeatMeta", { category: arcadeCategoryName(t, item.category), count: item.repeat_count }) : arcadeCategoryName(t, item.category),
                  arcadeStatusName(t, item.severity),
                  formatStamp(item.reported_at),
                ].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-2 whitespace-pre-wrap">{item.description}</p>
            </Link>
          ))
        ) : null}
        {tab === "PM" ? (
          data.pm.length === 0 ? <TabEmpty message={t("arcadeScreens.emptyPm")} href={links.pm} label={t("arcadeScreens.completePm")} variant="outline" /> : data.pm.map((item) => {
            const technician = techName(item.technician_staff_id);
            return (
              <article key={item.id} className={detailCard}>
                <p className="font-medium">{formatDay(item.performed_on) ?? t("arcadeScreens.notRecorded")}</p>
                <p className="mt-1 text-muted-foreground">
                  {t("arcadeScreens.pmNext", { date: formatDay(item.next_pm_on) ?? t("arcadeScreens.notRecorded") })}
                  {" · "}
                  {item.confirmed ? t("arcadeScreens.pmConfirmed") : t("arcadeScreens.pmNotConfirmed")}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{item.issues_found || t("arcadeScreens.noIssues")}</p>
                {technician ? <p className="mt-1 text-muted-foreground">{t("arcadeScreens.technician")}: {technician}</p> : null}
              </article>
            );
          })
        ) : null}
        {tab === "Parts" ? (
          data.parts.length === 0 ? <TabEmpty message={t("arcadeScreens.emptyParts")} href={links.part} label={t("arcadeScreens.requestPart")} variant="outline" /> : data.parts.map((item) => {
            const cost = displayMoney(item.unit_cost, "QAR");
            return (
              <article key={item.id} className={detailCard}>
                <p className="font-medium">{formatDay(item.used_on) ?? t("arcadeScreens.notRecorded")}</p>
                <p className="mt-1 text-muted-foreground">
                  {t("arcadeScreens.qty", { qty: item.qty })}
                  {cost ? ` · ${t("arcadeScreens.unitCost", { cost })}` : ""}
                </p>
                {item.fault_id ? <Link href={`/arcade/faults/${item.fault_id}`} className="mt-2 inline-flex min-h-11 items-center underline underline-offset-2">{t("arcadeOps.fault")}</Link> : null}
              </article>
            );
          })
        ) : null}
        {tab === "SupplierCases" ? (
          data.cases.length === 0 ? <TabEmpty message={t("arcadeScreens.emptyCases")} href={links.supplier} label={t("arcadeScreens.contactSupplier")} variant="secondary" /> : data.cases.map((item) => (
            <Link key={item.id} href={`/arcade/support/${item.id}`} className={detailLink}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{item.case_number || t("arcadeScreens.notRecorded")}</p>
                <StatusBadge status={item.status} />
              </div>
              {item.created_at ? <p className="mt-1 text-muted-foreground">{formatStamp(item.created_at)}</p> : null}
              <p className="mt-2 whitespace-pre-wrap">{item.problem}</p>
            </Link>
          ))
        ) : null}
        {tab === "Documents" ? (
          data.documents.length === 0 ? <TabEmpty message={t("arcadeScreens.emptyDocuments")} href={links.manual} label={t("arcadeScreens.viewManual")} variant="secondary" /> : data.documents.map((item) => (
            <article key={item.id} className={detailCard}>
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-muted-foreground">
                {[item.doc_type.replaceAll("_", " "), item.manufacturer, item.model, item.error_code, item.file_name].filter(Boolean).join(" · ") || t("arcadeScreens.general")}
              </p>
              {item.external_url ? <a className="mt-2 inline-flex min-h-11 items-center underline underline-offset-2" href={item.external_url}>{t("arcadeScreens.openLink")}</a> : null}
            </article>
          ))
        ) : null}
        {tab === "Damage" ? (
          data.damage.length === 0 ? <TabEmpty message={t("arcadeScreens.emptyDamage")} /> : data.damage.map((item) => {
            const cost = displayMoney(item.estimated_cost, "QAR");
            return (
              <article key={item.id} className={detailCard}>
                <p className="font-medium">{[formatDay(item.reported_on), item.damage_type].filter(Boolean).join(" · ")}</p>
                <p className="mt-2 whitespace-pre-wrap">{item.description}</p>
                {cost ? <p className="mt-1 text-muted-foreground">{cost}</p> : null}
                {item.needs_mapping ? <p className="mt-1">{t("arcadeScreens.needsMapping")}</p> : null}
              </article>
            );
          })
        ) : null}
        {tab === "Timeline" ? (
          data.timeline.length === 0 ? <TabEmpty message={t("arcadeScreens.emptyTimeline")} /> : data.timeline.map((item) => {
            const from = item.previous_status ? arcadeStatusName(t, item.previous_status) : null;
            const to = item.new_status ? arcadeStatusName(t, item.new_status) : null;
            const change = [from, to].filter(Boolean).join(" → ");
            return (
              <article key={item.id} className={detailCard}>
                <p className="font-medium">{formatStamp(item.created_at) ?? t("arcadeScreens.notRecorded")}</p>
                <p className="mt-1">{change || t("arcadeScreens.notRecorded")}</p>
                {item.notes ? <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.notes}</p> : null}
                {item.entity_type && item.entity_type !== "machine" ? <p className="mt-1 text-xs text-muted-foreground">{item.entity_type}</p> : null}
              </article>
            );
          })
        ) : null}
      </div>
    </div>
  );
}

function TabEmpty({
  message,
  href,
  label,
  variant = "default",
}: {
  message: string;
  href?: string;
  label?: string;
  variant?: "default" | "outline" | "secondary";
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{message}</p>
      {href && label ? <div className="mt-3 max-w-sm"><ActionButton href={href} variant={variant}>{label}</ActionButton></div> : null}
    </div>
  );
}

function SpecGrid({ items }: { items: { label: string; value: string | null }[] }) {
  const { t } = useTranslation();
  const missing = t("arcadeScreens.notRecorded");
  return (
    <dl className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const filled = Boolean(item.value);
        return (
          <div key={item.label} className="min-w-0 rounded-lg border bg-card px-3 py-3">
            <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
            <dd className={cn("mt-1 break-words text-sm", filled ? "font-medium text-foreground" : "text-muted-foreground")}>{filled ? item.value : missing}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function machineSpecs(
  t: (key: string, options?: Record<string, unknown>) => string,
  data: MachineDetail,
  technicians: Technician[],
  techniciansReady: boolean,
) {
  const row = data.machine;
  const lastPm = formatDay(row.last_pm_on) ?? formatDay(data.pm[0]?.performed_on);
  const nextFromPm = data.pm.find((item) => item.next_pm_on)?.next_pm_on;
  const nextPm = formatDay(row.next_pm_on) ?? formatDay(nextFromPm);
  const assignedName = row.technician_staff_id
    ? technicians.find((tech) => tech.id === row.technician_staff_id)?.full_name ?? null
    : null;
  const technicianRow = !row.technician_staff_id
    ? { label: t("arcadeScreens.technician"), value: t("arcadeScreens.unassigned") }
    : assignedName
      ? { label: t("arcadeScreens.technician"), value: assignedName }
      : techniciansReady
        ? { label: t("arcadeScreens.technician"), value: null }
        : null;
  const core = [
    { label: t("arcadeScreens.category"), value: textOrNull(row.game_category) },
    { label: t("arcadeScreens.manufacturer"), value: textOrNull(row.manufacturer) },
    { label: t("arcadeScreens.model"), value: textOrNull(row.model) },
    { label: t("arcadeScreens.serial"), value: textOrNull(row.serial_number) },
    { label: t("arcadeScreens.unit"), value: textOrNull(row.unit_number) },
    { label: t("arcadeScreens.warrantyExpiry"), value: formatDay(row.warranty_expires_on) },
    { label: t("arcadeScreens.lastPm"), value: lastPm },
    { label: t("arcadeScreens.nextPm"), value: nextPm },
    { label: t("arcadeScreens.software"), value: textOrNull(row.software_version) },
    { label: t("arcadeScreens.controller"), value: textOrNull(row.controller_pcb) },
    { label: t("arcadeScreens.card"), value: textOrNull(row.card_rfid_interface) },
    { label: t("arcadeScreens.ip"), value: textOrNull(row.ip_address) },
    { label: t("arcadeGames.supplier"), value: textOrNull(row.supplier_name) },
    { label: t("arcadeGames.amountPaid"), value: displayMoney(row.amount_paid, row.paid_currency) },
    { label: t("arcadeGames.paidOn"), value: formatDay(row.paid_on) },
  ];
  if (technicianRow) core.push(technicianRow);
  const extra = [
    { label: t("arcadeScreens.installed"), value: formatDay(row.installed_on) },
    { label: t("arcadeScreens.purchased"), value: formatDay(row.purchased_on) },
    { label: t("arcadeScreens.warrantyStart"), value: formatDay(row.warranty_start) },
    { label: t("arcadeScreens.machineCost"), value: displayMoney(row.machine_cost, "QAR") },
    { label: t("arcadeScreens.power"), value: textOrNull(row.power_requirement) },
    { label: t("arcadeScreens.network"), value: textOrNull(row.network_requirement) },
    { label: t("arcadeScreens.lastFault"), value: formatStamp(row.last_fault_at) },
    { label: t("arcadeScreens.lastRepair"), value: formatStamp(row.last_repair_at) },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
  return [...core, ...extra];
}

function PhotoUpload({ machineId, locationId, photoPath, name }: { machineId: string; locationId: string; photoPath: string | null; name: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
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
    <div className="grid min-w-0 gap-3 rounded-lg border bg-card p-3">
      <GamePhoto
        src={photo.data?.url}
        alt={t("arcadeScreens.gamePhoto", { name })}
        missingLabel={t("arcadeScreens.photoMissing")}
        className="aspect-[4/3] w-full rounded-lg"
      />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={upload.isPending}
        aria-busy={upload.isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Camera aria-hidden />
        {upload.isPending ? t("arcadeScreens.photoUploading") : t("arcadeScreens.addPhoto")}
      </Button>
      <input
        ref={inputRef}
        tabIndex={-1}
        className="sr-only"
        type="file"
        accept="image/*,video/*"
        capture="environment"
        aria-label={t("arcadeScreens.addPhoto")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) upload.mutate(file);
        }}
      />
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
      return QR.default.toString(url, { type: "svg", margin: 1, width: 112 });
    },
  });
  return (
    <div className="flex min-w-0 items-center gap-3 self-start rounded-lg border bg-card p-3">
      {qr.data ? (
        <div className="size-28 shrink-0 overflow-hidden rounded-md bg-white [&_svg]:block [&_svg]:size-full" aria-hidden dangerouslySetInnerHTML={{ __html: qr.data }} />
      ) : (
        <div className="size-28 shrink-0 rounded-md border bg-muted" aria-hidden />
      )}
      <p className="min-w-0 break-all text-xs leading-5 text-muted-foreground">
        <span className="mb-1 block text-sm font-medium text-foreground">{t("arcadeScreens.scanHint")}</span>
        {url}
      </p>
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
