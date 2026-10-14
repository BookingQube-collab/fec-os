"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ArcadeEmpty, ArcadeHero, arcadeStatusName, Field, Pager, StatusBadge } from "@/components/arcade/ui";
import { ArcadeWorkbookImport } from "@/components/arcade/workbook-import";
import GlideSelect from "@/components/react-bits/glide-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import { useSites } from "@/hooks/queries/useSites";
import { isArcadeVenueLocation, SUPPLIER_CASE_STATUSES } from "@/lib/arcade/domain";
import { splitStock, stockValuation } from "@/lib/arcade/stock-ledger";
import { getArcadeContext, listArcadeMachines } from "@/lib/arcade.functions";
import {
  getArcadeSupplier,
  getSupplierCase,
  listArcadeDocuments,
  listArcadeSuppliers,
  listDamageReports,
  listInstallations,
  listPartRequests,
  listSpareParts,
  listSupplierCases,
  requestSparePart,
  saveArcadeDocument,
  saveArcadeVendorProfile,
  saveDamageReport,
  saveInstallation,
  saveSparePart,
  saveSupplierCase,
  transferSparePart,
  useSparePart,
} from "@/lib/arcade-supply.functions";
import { queryKeys } from "@/lib/query-keys";

export function ArcadeSuppliers() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...queryKeys.arcade.all, "suppliers", q, page],
    queryFn: () => listArcadeSuppliers({ q, page, pageSize: 25 }),
  });
  return (
    <div className="arcade-stack">
      <ArcadeHero kicker={t("nav.arcade")} title={t("arcadeScreens.suppliersTitle")} subtitle={t("arcadeScreens.suppliersHint")} />
      <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("arcadeScreens.supplierName")} className="max-w-sm bg-card" />
      <div className="arcade-list">
      {(list.data?.rows ?? []).map((row) => (
        <Link key={row.id} href={`/arcade/suppliers/${row.id}`} className="arcade-row arcade-row--block">
          <p className="arcade-row__title">{row.name}</p>
          <p className="arcade-row__meta">
            {t("arcadeSimple.contact")}: {row.phone || row.email || row.profile?.technical_phone || t("arcadeSimple.noContact")}
            {row.email && row.phone ? ` · ${row.email}` : ""}
          </p>
        </Link>
      ))}
      </div>
      {list.isError ? <p className="text-sm text-destructive">{list.error instanceof Error ? list.error.message : t("arcadeOps.failed")}</p> : null}
      {list.isSuccess && (list.data?.rows.length ?? 0) === 0 ? <ArcadeEmpty title={t("arcadeFlow.suppliersEmpty")} /> : null}
      <Pager page={page} total={list.data?.total ?? 0} pageSize={25} onPage={setPage} />
    </div>
  );
}

export function ArcadeSupplier({ vendorId }: { vendorId: string }) {
  const { t } = useTranslation();
  const detail = useQuery({ queryKey: [...queryKeys.arcade.all, "supplier", vendorId], queryFn: () => getArcadeSupplier({ vendorId }) });
  const [notes, setNotes] = useState("");
  const save = useMutation({
    mutationFn: () => saveArcadeVendorProfile({ vendorId, notes: notes || detail.data?.profile?.notes, whatsapp: detail.data?.profile?.whatsapp, warrantyTerms: detail.data?.profile?.warranty_terms, typicalLeadDays: detail.data?.profile?.typical_lead_days }),
    onSuccess: () => toast.success(t("arcadeScreens.profileSaved")),
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.profileFailed")),
  });
  const row = detail.data;
  if (!row) return <p className="text-sm text-muted-foreground">{t("arcadeScreens.loadingSupplier")}</p>;
  const perf = row.performance;
  return (
    <div className="arcade-stack">
      <ArcadeHero
        kicker={t("nav.arcade")}
        title={row.vendor.name}
        subtitle={[row.vendor.contact_person, row.vendor.phone, row.vendor.email, row.profile?.technical_phone].filter(Boolean).join(" · ") || t("arcadeSimple.noContact")}
      />
      <h2 className="text-xl font-semibold">{t("arcadeSimple.orders")}</h2>
      {(row.orders ?? []).length === 0 && (row.parts ?? []).length === 0 ? <p className="text-muted-foreground">{t("arcadeSimple.noOrders")}</p> : null}
      <ul className="grid gap-2">
        {(row.orders ?? []).map((item) => (
          <li key={item.id} className="arcade-row text-base">{item.description} · {item.qty} · {arcadeStatusName(t, item.status)}</li>
        ))}
        {(row.parts ?? []).map((item) => (
          <li key={item.id} className="arcade-row text-base">{item.name} · {item.part_code} · {arcadeStatusName(t, item.supply_status)}</li>
        ))}
      </ul>
      {perf ? (
        <div className="arcade-stats">
          <p className="arcade-metric"><span className="arcade-metric__label">{t("arcadeScreens.perfMachines", { n: perf.machines })}</span></p>
          <p className="arcade-metric"><span className="arcade-metric__label">{t("arcadeScreens.perfWorking", { n: perf.working })}</span></p>
          <p className="arcade-metric"><span className="arcade-metric__label">{t("arcadeScreens.perfDown", { n: perf.down })}</span></p>
          <p className="arcade-metric"><span className="arcade-metric__label">{t("arcadeScreens.perfCases", { n: perf.openCases })}</span></p>
          <p className="arcade-metric"><span className="arcade-metric__label">{t("arcadeScreens.perfResponse", { n: perf.averageResponseHours ?? "—" })}</span></p>
          <p className="arcade-metric"><span className="arcade-metric__label">{t("arcadeScreens.perfResolution", { n: perf.averageResolutionHours ?? "—" })}</span></p>
          <p className="arcade-metric"><span className="arcade-metric__label">{t("arcadeScreens.perfParts", { n: perf.pendingParts })}</span></p>
          <p className="arcade-metric"><span className="arcade-metric__label">{t("arcadeScreens.perfWarranty", { n: perf.warrantyMachines })}</span></p>
        </div>
      ) : null}
      <Field label={t("arcadeScreens.technicalNotes")}><Textarea value={notes || row.profile?.notes || ""} onChange={(event) => setNotes(event.target.value)} /></Field>
      <Button type="button" className="arcade-cta" onClick={() => save.mutate()}>{t("arcadeScreens.saveProfile")}</Button>
      <h2 className="arcade-panel__title">{t("arcadeScreens.cases")}</h2>
      {row.cases.length === 0 ? <ArcadeEmpty title={t("arcadeFlow.casesEmpty")} /> : null}
      {row.cases.map((item) => (
        <Link key={item.id} href={`/arcade/support/${item.id}`} className="arcade-row text-sm">{item.case_number} · {arcadeStatusName(t, item.status)} · {item.problem}</Link>
      ))}
    </div>
  );
}

export function ArcadeSupport({ id }: { id?: string }) {
  if (id) return <CaseDetail id={id} />;
  return <CaseList />;
}

function CaseList() {
  const { t } = useTranslation();
  const list = useQuery({ queryKey: [...queryKeys.arcade.all, "cases"], queryFn: () => listSupplierCases({ page: 1, pageSize: 25 }) });
  const rows = list.data?.rows ?? [];
  return (
    <div className="arcade-stack">
      <ArcadeHero
        kicker={t("nav.arcade")}
        title={t("arcadeScreens.supportTitle")}
        actions={<Button asChild className="arcade-cta"><Link href="/arcade/support/new">{t("arcadeScreens.newCase")}</Link></Button>}
      />
      {list.isSuccess && rows.length === 0 ? (
        <ArcadeEmpty title={t("arcadeFlow.casesEmpty")} action={<Button asChild className="arcade-cta"><Link href="/arcade/support/new">{t("arcadeScreens.newCase")}</Link></Button>} />
      ) : null}
      <div className="arcade-list">
      {rows.map((row) => (
        <Link key={row.id} href={`/arcade/support/${row.id}`} className="arcade-row arcade-row--block">
          <div className="flex justify-between gap-2"><span className="arcade-row__title">{row.case_number}</span><StatusBadge status={row.status} /></div>
          <p className="arcade-row__meta">{row.problem}</p>
        </Link>
      ))}
      </div>
    </div>
  );
}

function CaseDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const detail = useQuery({ queryKey: [...queryKeys.arcade.all, "case", id], queryFn: () => getSupplierCase({ id }) });
  const [response, setResponse] = useState("");
  const [updateBody, setUpdateBody] = useState("");
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => {
      const row = detail.data?.case;
      if (!row) throw new Error(t("arcadeScreens.caseNotLoaded"));
      return saveSupplierCase({
        id,
        vendorId: row.vendor_id,
        problem: row.problem,
        troubleshootingDone: row.troubleshooting_done,
        partsTested: row.parts_tested,
        technicianFindings: row.technician_findings,
        supplierResponse: response || row.supplier_response,
        status: row.status as (typeof SUPPLIER_CASE_STATUSES)[number],
        updateBody,
      });
    },
    onSuccess: () => { toast.success(t("arcadeScreens.trailUpdated")); setUpdateBody(""); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.caseNotUpdated")),
  });
  const row = detail.data?.case;
  if (!row) return <p className="text-sm">{t("arcadeScreens.loadingCase")}</p>;
  return (
    <div className="arcade-stack">
      <ArcadeHero kicker={t("nav.arcade")} title={row.case_number} actions={<StatusBadge status={row.status} />} />
      <p>{row.problem}</p>
      <p className="rounded border p-3 text-sm whitespace-pre-wrap"><strong>{t("arcadeScreens.troubleshootingDone")} </strong>{row.troubleshooting_done || "—"}</p>
      <p className="text-sm">{t("arcadeScreens.partsTested", { value: row.parts_tested || "—" })}</p>
      <p className="text-sm">{t("arcadeScreens.findings", { value: row.technician_findings || "—" })}</p>
      <Field label={t("arcadeScreens.supplierResponse")}><Textarea value={response || row.supplier_response || ""} onChange={(event) => setResponse(event.target.value)} /></Field>
      <Field label={t("arcadeScreens.addTrail")}><Textarea value={updateBody} onChange={(event) => setUpdateBody(event.target.value)} /></Field>
      <Button type="button" className="arcade-cta" onClick={() => save.mutate()}>{t("arcadeScreens.saveUpdate")}</Button>
      <div className="grid gap-1 text-sm">
        {(detail.data?.updates ?? []).map((update) => <p key={update.id} className="rounded border p-2">{new Date(update.created_at).toLocaleString()} · {update.body}</p>)}
      </div>
    </div>
  );
}

export function ArcadeSupportForm() {
  const { t } = useTranslation();
  const search = useSearchParams();
  const suppliers = useQuery({ queryKey: [...queryKeys.arcade.all, "supplier-options"], queryFn: () => listArcadeSuppliers({ page: 1, pageSize: 50 }) });
  const [vendorId, setVendorId] = useState("");
  const [problem, setProblem] = useState("");
  const [troubleshooting, setTroubleshooting] = useState("");
  const save = useMutation({
    mutationFn: () => saveSupplierCase({
      vendorId,
      machineId: search.get("machineId"),
      locationId: search.get("locationId"),
      faultId: search.get("faultId"),
      technicianStaffId: search.get("technicianId"),
      problem,
      troubleshootingDone: troubleshooting,
      status: "CONTACTED",
    }),
    onSuccess: (row) => { toast.success(row.case_number ?? t("arcadeScreens.caseOpened")); window.location.href = `/arcade/support/${row.id}`; },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.caseFailed")),
  });
  return (
    <form className="arcade-stack max-w-2xl" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <ArcadeHero kicker={t("nav.arcade")} title={t("arcadeScreens.caseTitle")} />
      <div className="arcade-panel grid gap-3">
      <Field label={t("arcadeScreens.supplier")}>
        <GlideSelect
          ariaLabel={t("arcadeScreens.supplier")}
          value={vendorId}
          placeholder={t("arcadeScreens.selectSupplier")}
          showTags={false}
          menuWidth={320}
          onChange={setVendorId}
          options={(suppliers.data?.rows ?? []).map((row) => ({ value: row.id, label: row.name }))}
        />
      </Field>
      <Field label={t("arcadeScreens.problem")}><Textarea required minLength={8} value={problem} onChange={(event) => setProblem(event.target.value)} /></Field>
      <Field label={t("arcadeScreens.troubleshooting")}><Textarea value={troubleshooting} onChange={(event) => setTroubleshooting(event.target.value)} placeholder={t("arcadeScreens.troubleshootingHint")} /></Field>
      <Button type="submit" className="arcade-cta">{t("arcadeScreens.createCase")}</Button>
      </div>
    </form>
  );
}

export function ArcadeParts() {
  const { t } = useTranslation();
  const search = useSearchParams();
  const canPurchase = usePermission("arcade.purchase");
  const parts = useQuery({ queryKey: [...queryKeys.arcade.all, "parts"], queryFn: () => listSpareParts({ page: 1, pageSize: 50 }) });
  const requests = useQuery({ queryKey: [...queryKeys.arcade.all, "part-requests"], queryFn: () => listPartRequests({ page: 1, pageSize: 100 }) });
  const sites = useSites();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [qty, setQty] = useState(1);
  const [transferPartId, setTransferPartId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [transferQty, setTransferQty] = useState(1);
  const qc = useQueryClient();
  const request = useMutation({
    mutationFn: (partId?: string) => requestSparePart({
      partId: partId ?? null,
      machineId: search.get("machineId"),
      faultId: search.get("faultId"),
      locationId: search.get("locationId") || sites.data?.[0]?.id || "",
      description: name || t("arcadeScreens.partRequestDefault"),
      qty,
    }),
    onSuccess: () => { toast.success(t("arcadeScreens.partRequested")); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.requestFailed")),
  });
  const create = useMutation({
    mutationFn: () => saveSparePart({
      partCode: code,
      name,
      warehouseLocationId: sites.data?.[0]?.id || "",
      minStock: 1,
      reorderLevel: 2,
      machineIds: search.get("machineId") ? [search.get("machineId")!] : [],
      openingQty: 0,
    }),
    onSuccess: () => toast.success(t("arcadeScreens.partLinked")),
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.partNotCreated")),
  });
  const consume = useMutation({
    mutationFn: (partId: string) => useSparePart({
      partId,
      locationId: search.get("locationId") || sites.data?.[0]?.id || "",
      machineId: search.get("machineId") || "",
      faultId: search.get("faultId"),
      qty: 1,
    }),
    onSuccess: () => toast.success(t("arcadeScreens.stockUsed")),
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.stockFailed")),
  });
  const transfer = useMutation({
    mutationFn: () => transferSparePart({
      partId: transferPartId,
      fromLocationId,
      toLocationId,
      qty: transferQty,
    }),
    onSuccess: () => { toast.success(t("arcadeScreens.transferred")); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.transferFailed")),
  });
  const valuation = useMemo(() => {
    const rows = parts.data?.rows ?? [];
    const stock = parts.data?.stock ?? [];
    return stockValuation(rows.map((row) => ({
      onHand: stock.filter((bin) => bin.item_id === row.inventory_item_id).reduce((sum, bin) => sum + Number(bin.quantity_on_hand), 0),
      unitCost: row.unit_cost,
    })));
  }, [parts.data]);
  const siteChoices = sites.data ?? [];
  return (
    <div className="arcade-stack">
      <ArcadeHero kicker={t("nav.arcade")} title={t("arcadeScreens.partsTitle")} subtitle={t("arcadeScreens.partsHint")} />
      <div className="arcade-panel grid gap-3">
      <div className="grid gap-2 md:grid-cols-3">
        <Input placeholder={t("arcadeScreens.partName")} value={name} onChange={(event) => setName(event.target.value)} />
        <Input placeholder={t("arcadeScreens.partCode")} value={code} onChange={(event) => setCode(event.target.value)} />
        <Input type="number" min={1} value={qty} onChange={(event) => setQty(Number(event.target.value))} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="arcade-cta" onClick={() => request.mutate(undefined)}>{t("arcadeScreens.requestPartBtn")}</Button>
        {canPurchase ? <Button type="button" variant="outline" onClick={() => create.mutate()}>{t("arcadeScreens.createStocked")}</Button> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {t("arcadeScreens.stockValue", { value: valuation.value })}
        {valuation.unpricedQty > 0 ? ` · ${t("arcadeScreens.stockValueIncomplete", { qty: valuation.unpricedQty })}` : ""}
      </p>
      {canPurchase ? (
        <div className="grid gap-2 md:grid-cols-4">
          <select className="flex h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={transferPartId} aria-label={t("arcadeScreens.partsTitle")} onChange={(event) => setTransferPartId(event.target.value)}>
            <option value="">{t("arcadeScreens.partsTitle")}</option>
            {(parts.data?.rows ?? []).map((row) => <option key={row.id} value={row.id}>{row.part_code}</option>)}
          </select>
          <select className="flex h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={fromLocationId} aria-label={t("arcadeScreens.transferFrom")} onChange={(event) => setFromLocationId(event.target.value)}>
            <option value="">{t("arcadeScreens.transferFrom")}</option>
            {siteChoices.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
          <select className="flex h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={toLocationId} aria-label={t("arcadeScreens.transferTo")} onChange={(event) => setToLocationId(event.target.value)}>
            <option value="">{t("arcadeScreens.transferTo")}</option>
            {siteChoices.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
          <div className="flex gap-2">
            <Input type="number" min={0.01} step="0.01" value={transferQty} aria-label={t("arcadeScreens.transferQty")} onChange={(event) => setTransferQty(Number(event.target.value))} />
            <Button type="button" variant="outline" disabled={!transferPartId || !fromLocationId || !toLocationId || transfer.isPending} onClick={() => transfer.mutate()}>{t("arcadeScreens.transferStock")}</Button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-2">
        {(parts.data?.rows ?? []).map((row) => {
          const bins = (parts.data?.stock ?? []).filter((stock) => stock.item_id === row.inventory_item_id).map((stock) => ({ locationId: stock.location_id, onHand: Number(stock.quantity_on_hand) }));
          const placed = splitStock(bins, row.warehouse_location_id);
          return (
            <article key={row.id} className="arcade-row arcade-row--block text-sm">
              <div className="flex justify-between gap-2"><span className="font-medium">{row.part_code} · {row.name}</span><StatusBadge status={row.supply_status} /></div>
              <p className="text-muted-foreground">{t("arcadeScreens.onHand", { onHand: placed.total, min: row.min_stock })} · {t("arcadeScreens.warehouseOnHand", { qty: placed.warehouse })} · {t("arcadeScreens.siteOnHand", { qty: placed.sites })}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" type="button" variant="outline" onClick={() => request.mutate(row.id)}>{t("arcadeScreens.request")}</Button>
                {search.get("machineId") ? <Button size="sm" type="button" onClick={() => consume.mutate(row.id)}>{t("arcadeScreens.useOnRepair")}</Button> : null}
              </div>
            </article>
          );
        })}
      </div>
      {(parts.data?.rows.length ?? 0) === 0 && parts.isSuccess ? <ArcadeEmpty title={t("arcadeFlow.partsEmpty")} /> : null}
      </div>
      <h2 className="arcade-panel__title">{t("arcadeScreens.requests")}</h2>
      {(requests.data?.rows ?? []).map((row) => (
        <p key={row.id} className="arcade-row text-sm">
          {row.machine_name ? `${row.machine_name} · ` : ""}
          {t("arcadeScreens.requestLine", { description: row.description.replace(/^import:\S+\s*/, ""), status: arcadeStatusName(t, row.status), qty: row.qty })}
        </p>
      ))}
    </div>
  );
}

export function ArcadeManuals() {
  const { t } = useTranslation();
  const search = useSearchParams();
  const [q, setQ] = useState(search.get("q") ?? "");
  const [title, setTitle] = useState("");
  const list = useQuery({
    queryKey: [...queryKeys.arcade.all, "docs", q, search.get("machineId")],
    queryFn: () => listArcadeDocuments({ q, machineId: search.get("machineId"), page: 1, pageSize: 25 }),
  });
  const save = useMutation({
    mutationFn: () => saveArcadeDocument({
      title,
      docType: "service_manual",
      machineId: search.get("machineId"),
      notes: q,
    }),
    onSuccess: () => toast.success(t("arcadeScreens.manualSaved")),
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.manualFailed")),
  });
  return (
    <div className="arcade-stack">
      <ArcadeHero kicker={t("nav.arcade")} title={t("arcadeScreens.manualsTitle")} subtitle={t("arcadeScreens.manualSearch")} />
      <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("arcadeScreens.manualSearch")} />
      <div className="flex gap-2"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("arcadeScreens.newManual")} className="bg-card" /><Button type="button" className="arcade-cta" onClick={() => save.mutate()}>{t("arcadeScreens.add")}</Button></div>
      {list.isSuccess && (list.data?.rows.length ?? 0) === 0 ? <ArcadeEmpty title={t("arcadeFlow.manualsEmpty")} /> : null}
      {(list.data?.rows ?? []).map((row) => (
        <article key={row.id} className="arcade-row arcade-row--block text-sm">
          <p className="font-medium">{row.title}</p>
          <p className="text-muted-foreground">{row.doc_type} · {row.model || row.manufacturer || row.error_code || t("arcadeScreens.general")}</p>
          {row.external_url ? <a className="underline" href={row.external_url}>{t("arcadeScreens.openLink")}</a> : null}
        </article>
      ))}
    </div>
  );
}

export function ArcadeDamage() {
  const { t } = useTranslation();
  const machines = useQuery({ queryKey: queryKeys.arcade.machines({ damage: true }), queryFn: () => listArcadeMachines({ page: 1, pageSize: 200 }) });
  const [description, setDescription] = useState("");
  const [damageType, setDamageType] = useState("Physical");
  const [machineId, setMachineId] = useState("");
  const list = useQuery({ queryKey: [...queryKeys.arcade.all, "damage"], queryFn: () => listDamageReports({ page: 1, pageSize: 50 }) });
  const save = useMutation({
    mutationFn: () => {
      const machine = machines.data?.rows.find((row) => row.id === machineId);
      return saveDamageReport({
        description,
        damageType,
        machineId: machine?.id ?? null,
        locationId: machine?.location_id ?? null,
      });
    },
    onSuccess: (row) => toast.success(row.needs_mapping ? t("arcadeScreens.savedMapping") : t("arcadeScreens.damageSaved")),
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.damageFailed")),
  });
  return (
    <div className="arcade-stack">
      <ArcadeHero kicker={t("nav.arcade")} title={t("arcadeScreens.damageTitle")} subtitle={t("arcadeScreens.damageHint")} actions={<ArcadeWorkbookImport />} />
      <GlideSelect
        ariaLabel={t("arcadeScreens.machine")}
        value={machineId}
        placeholder={t("arcadeScreens.damageMachine")}
        showTags={false}
        menuWidth={420}
        onChange={setMachineId}
        options={[{ value: "", label: t("arcadeScreens.damageMachine") }, ...(machines.data?.rows ?? []).map((row) => ({ value: row.id, label: `${row.asset_code} · ${row.name}` }))]}
      />
      <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("arcadeScreens.whatHappened")} />
      <Field label={t("arcadeScreens.damageType")}><Input value={damageType} onChange={(event) => setDamageType(event.target.value)} /></Field>
      <Button type="button" className="arcade-cta" onClick={() => save.mutate()}>{t("arcadeScreens.saveReport")}</Button>
      {list.isSuccess && (list.data?.rows.length ?? 0) === 0 ? <ArcadeEmpty title={t("arcadeFlow.damageEmpty")} /> : null}
      {(list.data?.rows ?? []).map((row) => (
        <p key={row.id} className="arcade-row arcade-row--block text-sm">
          <span className="font-medium">{row.machine_name || t("arcadeScreens.needsMappingFlag")}</span>
          {row.asset_code ? ` · ${row.asset_code}` : ""} · {row.reported_on} · {row.damage_type}
          <span className="block text-muted-foreground">{row.description}</span>
          {row.needs_mapping ? <span className="block">{t("arcadeScreens.needsMappingFlag")}</span> : null}
        </p>
      ))}
    </div>
  );
}

export function ArcadeInstallations() {
  const { t } = useTranslation();
  const sites = useSites();
  const context = useQuery({ queryKey: queryKeys.arcade.context(), queryFn: () => getArcadeContext({}) });
  const machines = useQuery({ queryKey: queryKeys.arcade.machines({ install: true }), queryFn: () => listArcadeMachines({ page: 1, pageSize: 200 }) });
  const list = useQuery({ queryKey: [...queryKeys.arcade.all, "install"], queryFn: () => listInstallations({ page: 1, pageSize: 25 }) });
  const [locationId, setLocationId] = useState("");
  const [machineId, setMachineId] = useState("");
  const save = useMutation({
    mutationFn: () => saveInstallation({
      locationId,
      machineId: machineId || null,
      technicianStaffId: context.data?.staff?.id ?? null,
      status: "DELIVERED",
      checks: { assembly: false, electrical: false, network: false, card: false, game: false, safety: false, training: false, manual: false, spares: false, warranty: false },
    }),
    onSuccess: () => toast.success(t("arcadeScreens.installOpened")),
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.installFailed")),
  });
  return (
    <div className="arcade-stack">
      <ArcadeHero kicker={t("nav.arcade")} title={t("arcadeScreens.installTitle")} />
      <GlideSelect
        ariaLabel={t("common.site")}
        value={locationId}
        placeholder={t("common.site")}
        showTags={false}
        menuWidth={320}
        onChange={setLocationId}
        options={(sites.data ?? []).filter(isArcadeVenueLocation).map((site) => ({ value: site.id, label: site.name }))}
      />
      <GlideSelect
        ariaLabel={t("arcadeScreens.machine")}
        value={machineId}
        placeholder={t("arcadeScreens.machine")}
        showTags={false}
        menuWidth={320}
        onChange={setMachineId}
        options={(machines.data?.rows ?? []).map((row) => ({ value: row.id, label: row.name }))}
      />
      <Button type="button" className="arcade-cta" onClick={() => save.mutate()}>{t("arcadeScreens.recordDelivery")}</Button>
      {list.isSuccess && (list.data?.rows.length ?? 0) === 0 ? <ArcadeEmpty title={t("arcadeFlow.installEmpty")} /> : null}
      {(list.data?.rows ?? []).map((row) => <p key={row.id} className="arcade-row text-sm">{t("arcadeScreens.deliveredLine", { status: arcadeStatusName(t, row.status), date: row.delivery_on ?? "—" })}</p>)}
    </div>
  );
}
