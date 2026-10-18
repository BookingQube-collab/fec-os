"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  ClipboardCheck,
  FileText,
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
import { ActionButton, ArcadeEmpty, ArcadeHero, ArcadeShortcut, arcadeCategoryName, arcadeStatusName, Field, HealthMeter, KpiTile, Pager, SiteHealthCard, StatusBadge, useVenueTitle } from "@/components/arcade/ui";
import { ArcadeWorkbookImport } from "@/components/arcade/workbook-import";
import { FecLoader } from "@/components/fec";
import GlideSelect from "@/components/react-bits/glide-select";
import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";
import { pillTrackItemClass } from "@/components/react-bits/pill-tab-scroll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { isArcadeVenueLocation, MACHINE_STATUSES } from "@/lib/arcade/domain";
import { getArcadeContext, getArcadeFileUrl, getArcadeMachine, getArcadeSiteBoard, listArcadeMachines, saveArcadeMachine, uploadArcadeFile } from "@/lib/arcade.functions";
import { listArcadeSuppliers, listSpareParts, setArcadeMachineParts } from "@/lib/arcade-supply.functions";
import { fmtCurrency } from "@/lib/currency";
import { venueTitle } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const GAME_PAGE_SIZE = 24;

function machineFollowUp(row: {
  id: string;
  status: string;
  location_id: string;
  technician_staff_id: string | null;
}) {
  const prefill = `machineId=${row.id}&locationId=${row.location_id}&technicianId=${row.technician_staff_id ?? ""}`;
  switch (row.status) {
    case "DOWN":
    case "OUT_OF_SERVICE":
      return { href: `/arcade/faults/new?${prefill}&startRepair=1`, labelKey: "arcadeScreens.startRepair" };
    case "WAITING_PART":
      return { href: `/arcade/parts?machineId=${row.id}&locationId=${row.location_id}`, labelKey: "arcadeScreens.requestPart" };
    case "WAITING_SUPPLIER":
      return { href: `/arcade/support/new?${prefill}`, labelKey: "arcadeScreens.contactSupplier" };
    default:
      return null;
  }
}

export function ArcadeSites() {
  const { t } = useTranslation();
  const sites = useSites();
  const board = useQuery({ queryKey: queryKeys.arcade.siteBoard(null), queryFn: () => getArcadeSiteBoard({}) });
  const health = new Map((board.data?.sites ?? []).map((site) => [site.location_id, site]));
  const photos = useArcadePhotoUrls(Object.values(board.data?.covers ?? {}));
  const cards = [...(sites.data ?? [])]
    .filter(isArcadeVenueLocation)
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
    <div className="arcade-stack">
      <ArcadeHero kicker={t("nav.arcade")} title={t("arcadeScreens.sitesTitle")} subtitle={t("arcadeScreens.sitesHint")} />
      {sites.isLoading || board.isLoading ? <FecLoader label={t("arcadeOps.loading")} /> : null}
      {board.isError ? <p className="text-sm text-destructive">{board.error instanceof Error ? board.error.message : t("arcadeOps.failed")}</p> : null}
      {!sites.isLoading && !board.isLoading && !board.isError && cards.length === 0 ? <ArcadeEmpty title={t("arcadeFlow.sitesEmpty")} /> : null}
      {!sites.isLoading && !board.isLoading && !board.isError && cards.length > 0 ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
  const router = useRouter();
  const label = useVenueTitle();
  const sites = useSites();
  const location = sites.data?.find((site) => site.id === locationId);
  const omitted = Boolean(location && !isArcadeVenueLocation(location));
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (omitted) router.replace("/arcade/sites");
  }, [omitted, router]);
  useEffect(() => {
    setStatus("");
  }, [locationId]);
  const board = useQuery({ queryKey: queryKeys.arcade.siteBoard(locationId), queryFn: () => getArcadeSiteBoard({ locationId }), enabled: !omitted });
  const site = board.data?.sites[0];
  if (omitted) return null;
  const counts = site
    ? [
        { status: "", label: t("arcadeScreens.machines"), value: site.active_machines },
        { status: "WORKING", label: t("arcadeOps.working"), value: site.working },
        { status: "DOWN", label: t("arcadeOps.down"), value: site.down },
        { status: "UNDER_REPAIR", label: t("arcadeOps.underRepair"), value: site.under_repair },
        { status: "UNDER_OBSERVATION", label: t("arcadeScreens.observation"), value: site.under_observation },
        { status: "WAITING_PART", label: t("arcadeOps.waitingParts"), value: site.waiting_part },
        { status: null, label: t("arcadeOps.pmDue"), value: site.pm_due + site.pm_overdue },
        { status: "WAITING_SUPPLIER", label: t("arcadeOps.waitingSupplier"), value: site.waiting_supplier },
      ]
    : [];
  return (
    <div className="arcade-stack min-w-0">
      <ArcadeHero
        kicker={location?.code}
        title={label(locationId)}
        subtitle={t("arcadeScreens.siteInventory")}
      />
      {board.isLoading ? <FecLoader label={t("arcadeOps.loading")} density="chip" /> : null}
      {site ? (
        <div className="grid gap-3">
          <HealthMeter value={site.availability} label={t("arcadeScreens.availability")} />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {counts.map((item) =>
              item.status === null ? (
                <KpiTile key="pm-due" label={item.label} value={item.value} />
              ) : (
                <button
                  key={item.status || "all"}
                  type="button"
                  aria-pressed={status === item.status}
                  onClick={() => setStatus(status === item.status && item.status !== "" ? "" : item.status)}
                  className={cn(
                    "rounded-lg border-0 bg-transparent p-0 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    status === item.status && "ring-2 ring-primary",
                  )}
                >
                  <KpiTile label={item.label} value={item.value} />
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}
      <ArcadeMachines locationId={locationId} status={status} onStatusChange={setStatus} />
    </div>
  );
}

export function ArcadeMachines({
  locationId,
  status: statusProp,
  onStatusChange,
}: {
  locationId?: string;
  status?: string;
  onStatusChange?: (status: string) => void;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [localStatus, setLocalStatus] = useState("");
  const status = statusProp ?? localStatus;
  const label = useVenueTitle();
  const canManage = usePermission("arcade.manage");
  const skipStatusReset = useRef(true);
  useEffect(() => {
    if (skipStatusReset.current) {
      skipStatusReset.current = false;
      return;
    }
    setPage(1);
  }, [status]);
  useEffect(() => {
    setQ("");
    setPage(1);
  }, [locationId]);
  const chooseStatus = (value: string) => {
    if (onStatusChange) onStatusChange(value);
    else setLocalStatus(value);
    setPage(1);
  };
  const list = useQuery({
    queryKey: queryKeys.arcade.machines({ page, q, status, locationId, pageSize: GAME_PAGE_SIZE }),
    queryFn: () => listArcadeMachines({ page, pageSize: GAME_PAGE_SIZE, q, status: status || null, locationId: locationId ?? null }),
  });
  const photos = useArcadePhotoUrls((list.data?.rows ?? []).map((row) => row.photo_path));
  const rows = list.data?.rows ?? [];
  const statusFilters = [
    { value: "", label: t("arcadeScreens.allStatuses") },
    ...MACHINE_STATUSES.map((item) => ({ value: item, label: arcadeStatusName(t, item) })),
  ];
  return (
    <div className="arcade-stack min-w-0">
      {!locationId ? <ArcadeHero kicker={t("nav.arcade")} title={t("arcadeScreens.machineList")} subtitle={t("arcadeScreens.searchMachines")} /> : null}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Input
          value={q}
          type="search"
          aria-label={t("arcadeScreens.searchMachines")}
          onChange={(event) => { setQ(event.target.value); setPage(1); }}
          placeholder={t("arcadeScreens.searchMachines")}
          className="min-w-0 w-full sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          {canManage ? <Button asChild className="arcade-cta"><Link href={`/arcade/machines/new${locationId ? `?locationId=${locationId}` : ""}`}>{t("arcadeScreens.addMachine")}</Link></Button> : null}
          <ArcadeWorkbookImport />
        </div>
      </div>
      <div role="group" aria-label={t("arcadeScreens.status")} className="flex max-w-full flex-wrap gap-1 rounded-xl bg-secondary p-1">
        {statusFilters.map((item) => (
          <button
            key={item.value || "all"}
            type="button"
            aria-pressed={status === item.value}
            className={cn(pillTrackItemClass(status === item.value), "h-9 cursor-pointer")}
            onClick={() => chooseStatus(status === item.value ? "" : item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {list.isLoading ? <FecLoader label={t("arcadeOps.loading")} density="chip" /> : null}
      {!list.isLoading && rows.length === 0 ? <ArcadeEmpty title={t("arcadeScreens.noMachineRows")} /> : null}
      {rows.length > 0 ? (
        <div className="arcade-panel arcade-panel--flush min-w-0">
          <div className="hidden items-center justify-between gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground sm:flex">
            <span>{t("arcadeScreens.machine")}</span>
            <span>{t("arcadeScreens.status")}</span>
          </div>
          <ul className="divide-y">
            {rows.map((row) => {
              const photoUrl = row.photo_path ? photos.data?.urls[row.photo_path] : null;
              const follow = machineFollowUp(row);
              const meta = [row.asset_code, row.zone, locationId ? null : label(row.location_id)].filter(Boolean).join(" · ");
              const paid = displayMoney(row.amount_paid, row.paid_currency);
              const invoiceParts = [row.supplier_name, paid, row.paid_on].filter((part) => part != null && String(part).trim() !== "");
              const invoice = invoiceParts.length ? `${t("arcadeImport.purchaseInvoice")}: ${invoiceParts.join(" · ")}` : null;
              const fixBits = [row.last_fix_status ? arcadeStatusName(t, row.last_fix_status) : null, row.last_fix_summary].filter((part) => part != null && String(part).trim() !== "");
              const fix = fixBits.length ? `${t("arcadeGames.listFix")}: ${fixBits.join(" · ")}` : null;
              return (
                <li key={row.id} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {photoUrl ? (
                      <GamePhoto
                        src={photoUrl}
                        alt={t("arcadeScreens.gamePhoto", { name: row.name })}
                        missingLabel={t("arcadeScreens.photoMissing")}
                        className="size-10 shrink-0 rounded-md"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <Link
                        href={`/arcade/machines/${row.id}`}
                        className="break-words font-medium leading-snug underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                      >
                        {row.name}
                      </Link>
                      <p className="truncate font-mono text-xs text-muted-foreground">{meta}</p>
                      {invoice ? <p className="truncate text-xs text-muted-foreground">{invoice}</p> : null}
                      {fix ? <p className="truncate text-xs text-muted-foreground">{fix}</p> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <StatusBadge status={row.status} />
                    {follow ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={follow.href} aria-label={`${t(follow.labelKey)} ${row.name}`}>{t(follow.labelKey)}</Link>
                      </Button>
                    ) : null}
                    <Button asChild size="sm">
                      <Link href={`/arcade/machines/${row.id}`} aria-label={`${t("arcadeGames.openGame")} ${row.name}`}>{t("arcadeGames.openGame")}</Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <Pager page={page} pageSize={GAME_PAGE_SIZE} total={list.data?.total ?? 0} onPage={setPage} />
    </div>
  );
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

function pmChipTone(value: string | null | undefined) {
  if (!value) return "info";
  const day = value.slice(0, 10);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (day < today) return "bad";
  if (day === today) return "wait";
  return "ok";
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
  const seedLocation = search.get("locationId") ?? "";
  const [form, setForm] = useState({ ...emptyMachineForm, locationId: seedLocation });
  const [hydrated, setHydrated] = useState(false);
  const [partIds, setPartIds] = useState<string[]>([]);
  const [partsHydrated, setPartsHydrated] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const pendingPhotoRef = useRef<HTMLInputElement>(null);
  const catalog = useQuery({
    queryKey: queryKeys.arcade.parts({ page: 1, pageSize: 100, catalog: true }),
    queryFn: () => listSpareParts({ page: 1, pageSize: 100 }),
  });
  useEffect(() => {
    if (machineId || !seedLocation || form.locationId) return;
    setForm((current) => ({ ...current, locationId: seedLocation }));
  }, [machineId, seedLocation, form.locationId]);
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
  useEffect(() => {
    if (!existing.data || partsHydrated) return;
    setPartIds((existing.data.spareParts ?? []).map((part) => part.id));
    setPartsHydrated(true);
  }, [existing.data, partsHydrated]);
  useEffect(() => {
    if (!pendingPhoto) {
      setPendingPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingPhoto);
    setPendingPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingPhoto]);
  const save = useMutation({
    mutationFn: async () => {
      if (!form.locationId) throw new Error(t("arcadeScreens.selectSite"));
      const row = await saveArcadeMachine({
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
      });
      if (pendingPhoto) {
        const dataBase64 = await readBase64(pendingPhoto);
        await uploadArcadeFile({
          entityType: "machine",
          entityId: row.id,
          locationId: form.locationId,
          kind: pendingPhoto.type.startsWith("video/") ? "video" : "photo",
          filename: pendingPhoto.name || "game.jpg",
          contentType: pendingPhoto.type || "image/jpeg",
          dataBase64,
        });
      }
      // On edit, wait until linked parts are loaded so we never wipe the list with [].
      if (!machineId || partsHydrated) {
        await setArcadeMachineParts({ machineId: row.id, partIds });
      }
      return row;
    },
    onSuccess: (row) => {
      toast.success(t("arcadeScreens.savedMachine", { code: row.asset_code }));
      void qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
      window.location.href = `/arcade/machines/${row.id}`;
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.saveMachineFailed")),
  });
  if (machineId && existing.isLoading) return <p className="text-sm text-muted-foreground">{t("arcadeScreens.loadingMachine")}</p>;
  const selectedParts = new Set(partIds);
  const catalogRows = catalog.data?.rows ?? [];
  const togglePart = (partId: string) => {
    setPartIds((current) => (current.includes(partId) ? current.filter((id) => id !== partId) : [...current, partId]));
  };
  return (
    <form className="arcade-stack max-w-3xl" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <ArcadeHero title={machineId ? t("arcadeGames.editGame") : t("arcadeScreens.machineMaster")} subtitle={t("arcadeScreens.machineMasterHint")} />
      <div className="arcade-panel grid gap-3">
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
            options={(sites.data ?? []).filter(isArcadeVenueLocation).map((site) => ({ value: site.id, label: site.name }))}
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
      </div>
      <section className="arcade-panel grid gap-3">
        <div>
          <h2 className="font-semibold">{t("arcadeGames.imagesTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("arcadeGames.imagesHint")}</p>
        </div>
        {machineId && existing.data?.machine ? (
          <PhotoUpload
            machineId={machineId}
            locationId={form.locationId || existing.data.machine.location_id}
            photoPath={existing.data.machine.photo_path}
            name={form.name || existing.data.machine.name}
            plain
          />
        ) : (
          <div className="grid min-w-0 gap-3">
            <GamePhoto
              src={pendingPreview}
              alt={t("arcadeScreens.gamePhoto", { name: form.name || t("arcadeFlow.addGame") })}
              missingLabel={t("arcadeScreens.photoMissing")}
              className="aspect-[4/3] w-full max-w-sm rounded-lg"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => pendingPhotoRef.current?.click()}>
                <Camera aria-hidden />
                {pendingPhoto ? t("arcadeGames.changePhoto") : t("arcadeScreens.addPhoto")}
              </Button>
              {pendingPhoto ? (
                <Button type="button" variant="ghost" onClick={() => setPendingPhoto(null)}>
                  {t("arcadeGames.clearPhoto")}
                </Button>
              ) : null}
            </div>
            <input
              ref={pendingPhotoRef}
              tabIndex={-1}
              className="sr-only"
              type="file"
              accept="image/*,video/*"
              capture="environment"
              aria-label={t("arcadeScreens.addPhoto")}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                setPendingPhoto(file);
              }}
            />
          </div>
        )}
        {machineId && (existing.data?.photos?.length ?? 0) > 0 ? (
          <GamePhotoRail
            coverPath={existing.data?.machine.photo_path ?? null}
            photos={existing.data?.photos ?? []}
            name={form.name || existing.data?.machine.name || ""}
          />
        ) : null}
      </section>
      <section className="arcade-panel grid gap-3">
        <div>
          <h2 className="font-semibold">{t("arcadeGames.sparePartsTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("arcadeGames.sparePartsHint")}</p>
        </div>
        {!form.locationId ? <p className="text-sm text-muted-foreground">{t("arcadeGames.sparePartsNeedSite")}</p> : null}
        {form.locationId && catalog.isLoading ? <FecLoader label={t("arcadeOps.loading")} density="chip" /> : null}
        {form.locationId && !catalog.isLoading && catalogRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("arcadeFlow.partsEmpty")}</p>
        ) : null}
        {form.locationId && catalogRows.length > 0 ? (
          <ul className="grid gap-2">
            {catalogRows.map((part) => {
              const checked = selectedParts.has(part.id);
              return (
                <li key={part.id}>
                  <label className={cn("arcade-row arcade-row--block flex cursor-pointer items-start gap-3 text-sm", checked && "ring-1 ring-primary")}>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => togglePart(part.id)}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{part.part_code} · {part.name}</span>
                      <span className="text-muted-foreground">
                        {[part.manufacturer, part.part_number, arcadeStatusName(t, part.supply_status)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : null}
        {partIds.length > 0 ? <p className="text-xs text-muted-foreground">{t("arcadeGames.sparePartsSelected", { count: partIds.length })}</p> : null}
      </section>
      <Button type="submit" className="arcade-cta" disabled={save.isPending || !form.locationId || Boolean(machineId && !partsHydrated)}>{t("arcadeGames.saveGame")}</Button>
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
  const specItems = [
    [t("arcadeScreens.category"), textOrNull(row.game_category)],
    [t("arcadeScreens.manufacturer"), textOrNull(row.manufacturer)],
    [t("arcadeScreens.model"), textOrNull(row.model)],
    [t("arcadeScreens.serial"), textOrNull(row.serial_number)],
    ...[
      [t("arcadeScreens.power"), textOrNull(row.power_requirement)],
      [t("arcadeScreens.network"), textOrNull(row.network_requirement)],
      [t("arcadeScreens.software"), textOrNull(row.software_version)],
      [t("arcadeScreens.controller"), textOrNull(row.controller_pcb)],
      [t("arcadeScreens.card"), textOrNull(row.card_rfid_interface)],
      [t("arcadeScreens.ip"), textOrNull(row.ip_address)],
      [t("arcadeScreens.unit"), textOrNull(row.unit_number)],
    ].filter((item): item is [string, string] => Boolean(item[1])),
  ];
  return (
    <div className="arcade-stack min-w-0">
      <header className="gp-bar">
        <div>
          <p>{t("arcadeScreens.asset")}</p>
          <h1>{row.name}</h1>
        </div>
        <div className="gp-bar__actions">
          {canManage ? <Link className="gp-bar__btn" href={`/arcade/machines/${row.id}/edit`}>{t("arcadeGames.editGame")}</Link> : null}
          <Link className="gp-bar__btn gp-bar__btn--solid" href={links.fault}>{t("arcadeScreens.reportFault")}</Link>
        </div>
      </header>
      <div className="gp-top">
        <section className="cc-card gp-identity">
          <div className="grid gap-3">
            <PhotoUpload machineId={row.id} locationId={row.location_id} photoPath={row.photo_path} name={row.name} compact />
            {(machine.data.photos?.length ?? 0) > 0 || row.photo_path ? (
              <GamePhotoRail coverPath={row.photo_path} photos={machine.data.photos ?? []} name={row.name} compact />
            ) : null}
            <MachineQr assetCode={row.asset_code} compact />
          </div>
          <div className="min-w-0">
            <h2>{row.name}</h2>
            <span className="mt-2 flex flex-wrap gap-1"><StatusBadge status={row.status} /></span>
            <dl className="gp-spec">
              <div><dt>{t("common.site")}</dt><dd>{label(row.location_id)}</dd></div>
              <div><dt>{t("arcadeScreens.serial")}</dt><dd>{row.serial_number || t("arcadeScreens.notRecorded")}</dd></div>
              <div><dt>{t("arcadeScreens.manufacturer")}</dt><dd>{row.manufacturer || t("arcadeScreens.notRecorded")}</dd></div>
              <div><dt>{t("arcadeScreens.model")}</dt><dd>{row.model || t("arcadeScreens.notRecorded")}</dd></div>
              <div><dt>{t("arcadeScreens.assetId")}</dt><dd>{row.asset_code}</dd></div>
            </dl>
            {canManage ? (
              <div className="mt-3">
                <GlideSelect
                  ariaLabel={t("arcadeScreens.machineStatus")}
                  value={row.status}
                  disabled={statusSave.isPending}
                  showTags={false}
                  size="lg"
                  onChange={(value) => statusSave.mutate(value as (typeof MACHINE_STATUSES)[number])}
                  options={MACHINE_STATUSES.map((item) => ({ value: item, label: arcadeStatusName(t, item) }))}
                />
              </div>
            ) : null}
          </div>
        </section>
        <section className="cc-card">
          <h2>{t("arcadeFlow.healthScore")}</h2>
          <div className="gp-gauge" role="img" aria-label={t("arcadeFlow.insufficient")}>
            <div className="gp-gauge__arc" />
            <p>{t("arcadeFlow.insufficient")}</p>
          </div>
          <p className="cc-note mt-1 text-center">{arcadeStatusName(t, row.status)}</p>
        </section>
        <section className="cc-card">
          <h2>{t("arcadeFlow.specifications")}</h2>
          <dl className="gp-spec">
            {specItems.map(([itemLabel, value]) => (
              <div key={itemLabel}>
                <dt>{itemLabel}</dt>
                <dd>{value || t("arcadeScreens.notRecorded")}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <GameProfile data={machine.data} techName={(staffId) => context.data?.technicians.find((tech) => tech.id === staffId)?.full_name ?? null} />
      <div className="arcade-tiles">
        <ArcadeShortcut href={links.fault} icon={AlertTriangle} title={t("arcadeScreens.reportFault")} />
        <ArcadeShortcut href={links.repair} icon={Wrench} title={t("arcadeScreens.startRepair")} />
        <ArcadeShortcut href={links.pm} icon={ClipboardCheck} title={t("arcadeScreens.completePm")} />
        <ArcadeShortcut href={links.part} icon={Package} title={t("arcadeScreens.requestPart")} />
        <ArcadeShortcut href={links.supplier} icon={Truck} title={t("arcadeScreens.contactSupplier")} />
        <ArcadeShortcut href={links.manual} icon={FileText} title={t("arcadeScreens.viewManual")} />
      </div>
      <MachineTabs
        data={machine.data}
        technicians={context.data?.technicians ?? []}
        techniciansReady={context.isFetched}
        links={links}
        canManage={canManage}
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
  return (
    <ArcadeEmpty
      title={t("arcadeScreens.noMatch", { code: assetCode })}
      action={<Button asChild className="arcade-cta"><Link href="/arcade/search">{t("arcadeFlow.findGame")}</Link></Button>}
    />
  );
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
const detailCard = "arcade-panel arcade-panel--tight text-sm";
const detailLink = "arcade-row arcade-row--block text-sm";

function MachineTabs({
  data,
  technicians,
  techniciansReady,
  links,
  canManage: canManagePartsLink,
}: {
  data: MachineDetail;
  technicians: Technician[];
  techniciansReady: boolean;
  links: MachineLinks;
  canManage: boolean;
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
          <>
            <section className={detailCard}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{t("arcadeGames.sparePartsTitle")}</h2>
                <ActionButton href={links.part} variant="outline">{t("arcadeScreens.requestPart")}</ActionButton>
              </div>
              {(data.spareParts?.length ?? 0) === 0 ? (
                <p className="mt-2 text-muted-foreground">{t("arcadeGames.sparePartsEmpty")}</p>
              ) : (
                <ul className="mt-2 grid gap-2">
                  {data.spareParts.map((part) => (
                    <li key={part.id} className="arcade-row arcade-row--block text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{part.part_code} · {part.name}</p>
                        <StatusBadge status={part.supply_status} />
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {[part.manufacturer, part.part_number, displayMoney(part.unit_cost, "QAR")].filter(Boolean).join(" · ") || t("arcadeScreens.notRecorded")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {canManagePartsLink ? (
                <p className="mt-3">
                  <Link className="underline underline-offset-2" href={`/arcade/machines/${data.machine.id}/edit`}>
                    {t("arcadeGames.editSpareParts")}
                  </Link>
                </p>
              ) : null}
            </section>
            <h2 className="font-semibold">{t("arcadeScreens.partsUsed")}</h2>
            {data.parts.length === 0 ? (
              <TabEmpty message={t("arcadeScreens.emptyParts")} href={links.part} label={t("arcadeScreens.requestPart")} variant="outline" />
            ) : (
              data.parts.map((item) => {
                const cost = displayMoney(item.unit_cost, "QAR");
                const linked = data.spareParts?.find((part) => part.id === item.part_id);
                return (
                  <article key={item.id} className={detailCard}>
                    <p className="font-medium">
                      {linked ? `${linked.part_code} · ${linked.name}` : formatDay(item.used_on) ?? t("arcadeScreens.notRecorded")}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {[formatDay(item.used_on), t("arcadeScreens.qty", { qty: item.qty }), cost ? t("arcadeScreens.unitCost", { cost }) : null].filter(Boolean).join(" · ")}
                    </p>
                    {item.fault_id ? <Link href={`/arcade/faults/${item.fault_id}`} className="mt-2 inline-flex min-h-11 items-center underline underline-offset-2">{t("arcadeOps.fault")}</Link> : null}
                  </article>
                );
              })
            )}
          </>
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
    <div className="arcade-empty">
      <p>{message}</p>
      {href && label ? <div className="arcade-empty__action max-w-sm"><ActionButton href={href} variant={variant}>{label}</ActionButton></div> : null}
    </div>
  );
}

function GameProfile({ data, techName }: { data: MachineDetail; techName: (id: string | null) => string | null }) {
  const { t } = useTranslation();
  const row = data.machine;
  const partsTotal = data.parts.reduce((sum, item) => {
    const cost = Number(item.unit_cost);
    const qty = Number(item.qty);
    if (!Number.isFinite(cost) || !Number.isFinite(qty)) return sum;
    return sum + cost * qty;
  }, 0);
  const hasPartsCost = data.parts.some((item) => Number.isFinite(Number(item.unit_cost)));
  const purchase = displayMoney(row.machine_cost, "QAR");
  const paid = displayMoney(row.amount_paid, row.paid_currency);
  const warranty = formatDay(row.warranty_expires_on);
  const today = new Date().toISOString().slice(0, 10);
  const warrantyText = !row.warranty_expires_on
    ? t("arcadeFlow.warrantyNone")
    : row.warranty_expires_on.slice(0, 10) < today
      ? t("arcadeFlow.warrantyPast", { date: warranty })
      : t("arcadeFlow.warrantyUntil", { date: warranty });
  const warrantyTone = !row.warranty_expires_on ? "wait" : row.warranty_expires_on.slice(0, 10) < today ? "bad" : "ok";
  const lifecycle = [
    { label: t("arcadeScreens.purchased"), value: formatDay(row.purchased_on), tone: "info" },
    { label: t("arcadeScreens.installed"), value: formatDay(row.installed_on), tone: "info" },
    { label: t("arcadeScreens.warrantyStart"), value: formatDay(row.warranty_start), tone: "ok" },
    { label: t("arcadeScreens.warrantyExpiry"), value: warranty, tone: warrantyTone },
    { label: t("arcadeScreens.lastPm"), value: formatDay(row.last_pm_on) ?? formatDay(data.pm[0]?.performed_on), tone: "ok" },
    { label: t("arcadeScreens.nextPm"), value: formatDay(row.next_pm_on), tone: "wait" },
    { label: t("arcadeScreens.lastFault"), value: formatStamp(row.last_fault_at), tone: "bad" },
    { label: t("arcadeScreens.lastRepair"), value: formatStamp(row.last_repair_at), tone: "ok" },
    ...data.timeline.slice(0, 6).map((item) => ({
      label: [item.previous_status ? arcadeStatusName(t, item.previous_status) : null, item.new_status ? arcadeStatusName(t, item.new_status) : null].filter(Boolean).join(" → ") || t("arcadeScreens.status"),
      value: formatStamp(item.created_at),
      tone: "info",
    })),
  ].filter((item): item is { label: string; value: string; tone: string } => Boolean(item.value));
  const openFaults = data.faults.filter((item) => item.status !== "RESOLVED" && item.status !== "CLOSED");
  const maintenance = data.pm.slice(0, 6).map((item) => ({
    key: item.id,
    label: item.issues_found?.trim() || t("arcadeFlow.pmLine"),
    when: [formatDay(item.performed_on), item.next_pm_on ? formatDay(item.next_pm_on) : null].filter(Boolean).join(" · "),
    tone: pmChipTone(item.next_pm_on ?? item.performed_on),
  })).filter((item) => item.when);
  if (maintenance.length === 0 && row.next_pm_on) {
    maintenance.push({
      key: "next",
      label: t("arcadeScreens.nextPm"),
      when: formatDay(row.next_pm_on) ?? "",
      tone: pmChipTone(row.next_pm_on),
    });
  }
  return (
    <div className="grid gap-3">
      <section className="cc-card">
        <h2>{t("arcadeFlow.lifecycle")}</h2>
        {lifecycle.length === 0 ? <p className="cc-note">{t("arcadeFlow.lifecycleEmpty")}</p> : (
          <ol className="gp-life">
            {lifecycle.map((item) => (
              <li key={`${item.label}-${item.value}`} data-tone={item.tone}>
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <span className="font-semibold">{item.value}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <div className="gp-top">
        <section className="cc-card">
          <h2>{t("arcadeFlow.costs")}</h2>
          <dl className="mt-2 grid gap-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("arcadeScreens.machineCost")}</dt><dd className="gp-money">{purchase ?? t("arcadeScreens.notRecorded")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("arcadeGames.amountPaid")}</dt><dd className="gp-money">{paid ?? t("arcadeScreens.notRecorded")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("arcadeFlow.partsRecorded")}</dt><dd className="gp-money">{hasPartsCost ? displayMoney(partsTotal, "QAR") : t("arcadeScreens.notRecorded")}</dd></div>
          </dl>
        </section>
        <section className="cc-card">
          <h2>{t("arcadeFlow.linkedWork")}</h2>
          {openFaults.length === 0 ? <p className="cc-note">{t("arcadeFlow.noLinkedWork")}</p> : (
            <ul className="cc-activity">
              {openFaults.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Link href={`/arcade/faults/${item.id}`}>
                    <span className="font-semibold">{item.ticket_number || t("arcadeOps.fault")}</span>
                    <span className="cc-note">{[arcadeCategoryName(t, item.category), techName(row.technician_staff_id)].filter(Boolean).join(" · ")}</span>
                    <StatusBadge status={item.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="cc-card">
          <h2>{t("arcadeFlow.warranty")}</h2>
          <p className={`gp-warranty${row.warranty_expires_on ? (row.warranty_expires_on.slice(0, 10) < today ? " is-past" : " is-live") : ""}`}>{warrantyText}</p>
          <p className="cc-note">{[row.manufacturer, row.model, row.serial_number].filter(Boolean).join(" · ") || t("arcadeScreens.notRecorded")}</p>
          {data.documents.length > 0 ? (
            <ul className="cc-activity">
              {data.documents.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <span className="font-semibold">{item.title}</span>
                  {item.external_url ? <a href={item.external_url}>{t("arcadeScreens.openLink")}</a> : null}
                </li>
              ))}
            </ul>
          ) : <p className="cc-note">{t("arcadeFlow.noDocuments")}</p>}
        </section>
      </div>
      {maintenance.length > 0 ? (
        <section aria-label={t("arcadeFlow.schedule")}>
          <h2 className="mb-2 text-base font-semibold">{t("arcadeFlow.schedule")}</h2>
          <div className="gp-chips">
            {maintenance.map((item) => (
              <Link key={item.key} href={`/arcade/repair?locationId=${row.location_id}&machineId=${row.id}`} className={`gp-chip gp-chip--${item.tone}`}>
                <strong>{item.label}</strong>
                <span>{item.when}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
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
          <div key={item.label} className="arcade-metric min-w-0">
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

function GamePhotoRail({
  coverPath,
  photos,
  name,
  compact = false,
}: {
  coverPath: string | null;
  photos: Array<{ id: string; storage_path: string; kind: string; mime_type: string | null; file_name: string | null }>;
  name: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const imagePaths = [
    coverPath,
    ...photos
      .filter((file) => file.storage_path && file.storage_path !== coverPath && (file.kind === "photo" || file.mime_type?.startsWith("image/")))
      .map((file) => file.storage_path),
  ].filter((path): path is string => Boolean(path));
  const gallery = useArcadePhotoUrls(imagePaths);
  if (imagePaths.length === 0) return null;
  return (
    <div className={cn("flex gap-2 overflow-x-auto", compact ? "max-w-full" : "max-w-3xl")} aria-label={t("arcadeGames.imagesTitle")}>
      {imagePaths.map((path) => (
        <GamePhoto
          key={path}
          src={gallery.data?.urls[path]}
          alt={t("arcadeScreens.gamePhoto", { name })}
          missingLabel={t("arcadeFlow.noPhoto")}
          className={compact ? "size-16 shrink-0 rounded-md" : "size-24 shrink-0 rounded-lg"}
        />
      ))}
    </div>
  );
}

function PhotoUpload({ machineId, locationId, photoPath, name, plain = false, compact = false }: { machineId: string; locationId: string; photoPath: string | null; name: string; plain?: boolean; compact?: boolean }) {
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
    <div className={compact ? "gp-photo" : plain ? "grid min-w-0 gap-3" : "grid min-w-0 gap-3 rounded-lg border bg-card p-3"}>
      <GamePhoto
        src={photo.data?.url}
        alt={t("arcadeScreens.gamePhoto", { name })}
        missingLabel={t("arcadeScreens.photoMissing")}
        className={compact ? "aspect-square w-full rounded-lg" : "aspect-[4/3] w-full rounded-lg"}
      />
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
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

function MachineQr({ assetCode, plain = false, compact = false }: { assetCode: string; plain?: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const url = typeof window === "undefined" ? `/arcade/m/${assetCode}` : `${window.location.origin}/arcade/m/${encodeURIComponent(assetCode)}`;
  const qr = useQuery({
    queryKey: ["arcade-qr", url],
    queryFn: async () => {
      const QR = await import("qrcode");
      return QR.default.toString(url, { type: "svg", margin: 1, width: 112 });
    },
  });
  if (compact) {
    return (
      <div className="gp-qr">
        <div className="gp-qr__mark" aria-hidden>
          {qr.data ? <div className="h-full w-full [&_svg]:block [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr.data }} /> : null}
        </div>
        <p>{assetCode}</p>
      </div>
    );
  }
  return (
    <div className={plain ? "flex min-w-0 items-center gap-3 self-start" : "flex min-w-0 items-center gap-3 self-start rounded-lg border bg-card p-3"}>
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
