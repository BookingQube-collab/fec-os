"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field, Pager, StatusBadge } from "@/components/arcade/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import { useSites } from "@/hooks/queries/useSites";
import { SUPPLIER_CASE_STATUSES } from "@/lib/arcade/domain";
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
  useSparePart,
} from "@/lib/arcade-supply.functions";
import { queryKeys } from "@/lib/query-keys";

export function ArcadeSuppliers() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...queryKeys.arcade.all, "suppliers", q, page],
    queryFn: () => listArcadeSuppliers({ q, page, pageSize: 25 }),
  });
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold">Suppliers</h1>
      <p className="text-sm text-muted-foreground">These are the existing vendor records. Arcade details are stored on a profile, not a second supplier list.</p>
      <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Supplier name" className="max-w-sm" />
      {(list.data?.rows ?? []).map((row) => (
        <Link key={row.id} href={`/arcade/suppliers/${row.id}`} className="rounded-lg border p-3">
          <p className="font-medium">{row.name}</p>
          <p className="text-sm text-muted-foreground">{row.category} · {row.phone || row.email || "No contact yet"}</p>
        </Link>
      ))}
      <Pager page={page} total={list.data?.total ?? 0} pageSize={25} onPage={setPage} />
    </div>
  );
}

export function ArcadeSupplier({ vendorId }: { vendorId: string }) {
  const detail = useQuery({ queryKey: [...queryKeys.arcade.all, "supplier", vendorId], queryFn: () => getArcadeSupplier({ vendorId }) });
  const [notes, setNotes] = useState("");
  const save = useMutation({
    mutationFn: () => saveArcadeVendorProfile({ vendorId, notes: notes || detail.data?.profile?.notes, whatsapp: detail.data?.profile?.whatsapp, warrantyTerms: detail.data?.profile?.warranty_terms, typicalLeadDays: detail.data?.profile?.typical_lead_days }),
    onSuccess: () => toast.success("Supplier profile saved"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Profile was not saved"),
  });
  const row = detail.data;
  if (!row) return <p className="text-sm text-muted-foreground">Loading supplier…</p>;
  const perf = row.performance;
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold">{row.vendor.name}</h1>
      <p className="text-sm text-muted-foreground">{row.vendor.contact_person} · {row.vendor.phone} · {row.vendor.email}</p>
      {perf ? (
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <p className="rounded border p-2">Machines {perf.machines}</p>
          <p className="rounded border p-2">Working {perf.working}</p>
          <p className="rounded border p-2">Down {perf.down}</p>
          <p className="rounded border p-2">Open cases {perf.openCases}</p>
          <p className="rounded border p-2">Avg response {perf.averageResponseHours ?? "—"} h</p>
          <p className="rounded border p-2">Avg resolution {perf.averageResolutionHours ?? "—"} h</p>
          <p className="rounded border p-2">Pending parts {perf.pendingParts}</p>
          <p className="rounded border p-2">In warranty {perf.warrantyMachines}</p>
        </div>
      ) : null}
      <Field label="Technical notes"><Textarea value={notes || row.profile?.notes || ""} onChange={(event) => setNotes(event.target.value)} /></Field>
      <Button type="button" onClick={() => save.mutate()}>Save profile</Button>
      <h2 className="font-semibold">Cases</h2>
      {row.cases.map((item) => (
        <Link key={item.id} href={`/arcade/support/${item.id}`} className="rounded border p-2 text-sm">{item.case_number} · {item.status} · {item.problem}</Link>
      ))}
    </div>
  );
}

export function ArcadeSupport({ id }: { id?: string }) {
  if (id) return <CaseDetail id={id} />;
  return <CaseList />;
}

function CaseList() {
  const list = useQuery({ queryKey: [...queryKeys.arcade.all, "cases"], queryFn: () => listSupplierCases({ page: 1, pageSize: 25 }) });
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Supplier support</h1><Button asChild><Link href="/arcade/support/new">New case</Link></Button></div>
      {(list.data?.rows ?? []).map((row) => (
        <Link key={row.id} href={`/arcade/support/${row.id}`} className="rounded-lg border p-3">
          <div className="flex justify-between gap-2"><span className="font-medium">{row.case_number}</span><StatusBadge status={row.status} /></div>
          <p className="text-sm text-muted-foreground">{row.problem}</p>
        </Link>
      ))}
    </div>
  );
}

function CaseDetail({ id }: { id: string }) {
  const detail = useQuery({ queryKey: [...queryKeys.arcade.all, "case", id], queryFn: () => getSupplierCase({ id }) });
  const [response, setResponse] = useState("");
  const [updateBody, setUpdateBody] = useState("");
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => {
      const row = detail.data?.case;
      if (!row) throw new Error("Case not loaded");
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
    onSuccess: () => { toast.success("Diagnostic trail updated"); setUpdateBody(""); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Case was not updated"),
  });
  const row = detail.data?.case;
  if (!row) return <p className="text-sm">Loading case…</p>;
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold">{row.case_number}</h1>
      <StatusBadge status={row.status} />
      <p>{row.problem}</p>
      <p className="rounded border p-3 text-sm whitespace-pre-wrap"><strong>Troubleshooting already done. </strong>{row.troubleshooting_done || "—"}</p>
      <p className="text-sm">Parts tested: {row.parts_tested || "—"}</p>
      <p className="text-sm">Technician findings: {row.technician_findings || "—"}</p>
      <Field label="Supplier response"><Textarea value={response || row.supplier_response || ""} onChange={(event) => setResponse(event.target.value)} /></Field>
      <Field label="Add to the trail"><Textarea value={updateBody} onChange={(event) => setUpdateBody(event.target.value)} /></Field>
      <Button type="button" onClick={() => save.mutate()}>Save update</Button>
      <div className="grid gap-1 text-sm">
        {(detail.data?.updates ?? []).map((update) => <p key={update.id} className="rounded border p-2">{new Date(update.created_at).toLocaleString()} · {update.body}</p>)}
      </div>
    </div>
  );
}

export function ArcadeSupportForm() {
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
    onSuccess: (row) => { toast.success(row.case_number ?? "Case opened"); window.location.href = `/arcade/support/${row.id}`; },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Case was not opened"),
  });
  return (
    <form className="grid max-w-2xl gap-3" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <h1 className="text-xl font-semibold">Supplier support case</h1>
      <Field label="Supplier">
        <select className="h-10 rounded-md border bg-background px-2" value={vendorId} required onChange={(event) => setVendorId(event.target.value)}>
          <option value="">Select supplier</option>
          {(suppliers.data?.rows ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </Field>
      <Field label="Problem"><Textarea required minLength={8} value={problem} onChange={(event) => setProblem(event.target.value)} /></Field>
      <Field label="Troubleshooting already completed"><Textarea value={troubleshooting} onChange={(event) => setTroubleshooting(event.target.value)} placeholder="Sensor, radar box, and control board already replaced" /></Field>
      <Button type="submit">Create case</Button>
    </form>
  );
}

export function ArcadeParts() {
  const search = useSearchParams();
  const canPurchase = usePermission("arcade.purchase");
  const parts = useQuery({ queryKey: [...queryKeys.arcade.all, "parts"], queryFn: () => listSpareParts({ page: 1, pageSize: 50 }) });
  const requests = useQuery({ queryKey: [...queryKeys.arcade.all, "part-requests"], queryFn: () => listPartRequests({ page: 1, pageSize: 20 }) });
  const sites = useSites();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [qty, setQty] = useState(1);
  const qc = useQueryClient();
  const request = useMutation({
    mutationFn: (partId?: string) => requestSparePart({
      partId: partId ?? null,
      machineId: search.get("machineId"),
      faultId: search.get("faultId"),
      locationId: search.get("locationId") || sites.data?.[0]?.id || "",
      description: name || "Part request",
      qty,
    }),
    onSuccess: () => { toast.success("Part requested. Machine set to waiting for parts when a fault is linked."); void qc.invalidateQueries({ queryKey: queryKeys.arcade.all }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Request failed"),
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
    onSuccess: () => toast.success("Part linked to inventory"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Part was not created"),
  });
  const consume = useMutation({
    mutationFn: (partId: string) => useSparePart({
      partId,
      locationId: search.get("locationId") || sites.data?.[0]?.id || "",
      machineId: search.get("machineId") || "",
      faultId: search.get("faultId"),
      qty: 1,
    }),
    onSuccess: () => toast.success("Stock deducted and recorded on the repair"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Stock was not deducted"),
  });
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Spare parts</h1>
      <p className="text-sm text-muted-foreground">Stock lives in the existing inventory. Using a part on a repair deducts that stock.</p>
      <div className="grid gap-2 md:grid-cols-3">
        <Input placeholder="Part name" value={name} onChange={(event) => setName(event.target.value)} />
        <Input placeholder="Part code" value={code} onChange={(event) => setCode(event.target.value)} />
        <Input type="number" min={1} value={qty} onChange={(event) => setQty(Number(event.target.value))} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => request.mutate(undefined)}>Request part</Button>
        {canPurchase ? <Button type="button" variant="outline" onClick={() => create.mutate()}>Create stocked part</Button> : null}
      </div>
      <div className="grid gap-2">
        {(parts.data?.rows ?? []).map((row) => {
          const onHand = (parts.data?.stock ?? []).filter((stock) => stock.item_id === row.inventory_item_id).reduce((sum, stock) => sum + Number(stock.quantity_on_hand), 0);
          return (
            <article key={row.id} className="rounded-lg border p-3 text-sm">
              <div className="flex justify-between gap-2"><span className="font-medium">{row.part_code} · {row.name}</span><StatusBadge status={row.supply_status} /></div>
              <p className="text-muted-foreground">On hand {onHand} · min {row.min_stock}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" type="button" variant="outline" onClick={() => request.mutate(row.id)}>Request</Button>
                {search.get("machineId") ? <Button size="sm" type="button" onClick={() => consume.mutate(row.id)}>Use on repair</Button> : null}
              </div>
            </article>
          );
        })}
      </div>
      <h2 className="font-semibold">Requests</h2>
      {(requests.data?.rows ?? []).map((row) => <p key={row.id} className="text-sm">{row.description} · {row.status} · qty {row.qty}</p>)}
    </div>
  );
}

export function ArcadeManuals() {
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
    onSuccess: () => toast.success("Manual saved. Upload the file from the machine if you have one."),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Manual was not saved"),
  });
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold">Manuals & knowledge base</h1>
      <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search machine, model, supplier, fault, error code, West Cowboy crosshair" />
      <div className="flex gap-2"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New manual title" /><Button type="button" onClick={() => save.mutate()}>Add</Button></div>
      {(list.data?.rows ?? []).map((row) => (
        <article key={row.id} className="rounded border p-3 text-sm">
          <p className="font-medium">{row.title}</p>
          <p className="text-muted-foreground">{row.doc_type} · {row.model || row.manufacturer || row.error_code || "General"}</p>
          {row.external_url ? <a className="underline" href={row.external_url}>Open link</a> : null}
        </article>
      ))}
    </div>
  );
}

export function ArcadeDamage() {
  const machines = useQuery({ queryKey: queryKeys.arcade.machines({ damage: true }), queryFn: () => listArcadeMachines({ page: 1, pageSize: 50 }) });
  const [description, setDescription] = useState("");
  const [damageType, setDamageType] = useState("Physical");
  const [machineId, setMachineId] = useState("");
  const list = useQuery({ queryKey: [...queryKeys.arcade.all, "damage"], queryFn: () => listDamageReports({ page: 1, pageSize: 25 }) });
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
    onSuccess: (row) => toast.success(row.needs_mapping ? "Saved as Needs Mapping" : "Damage report saved"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Report was not saved"),
  });
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold">Damage reports</h1>
      <select className="h-10 max-w-md rounded-md border bg-background px-2" value={machineId} onChange={(event) => setMachineId(event.target.value)}>
        <option value="">Machine — leave blank only if it still needs mapping</option>
        {(machines.data?.rows ?? []).map((row) => <option key={row.id} value={row.id}>{row.asset_code} · {row.name}</option>)}
      </select>
      <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What happened" />
      <Input value={damageType} onChange={(event) => setDamageType(event.target.value)} />
      <Button type="button" onClick={() => save.mutate()}>Save report</Button>
      <p className="text-xs text-muted-foreground">A report without a machine is flagged Needs Mapping. It is not guessed onto a machine.</p>
      {(list.data?.rows ?? []).map((row) => (
        <p key={row.id} className="rounded border p-2 text-sm">{row.reported_on} · {row.damage_type} · {row.description}{row.needs_mapping ? " · Needs Mapping" : ""}</p>
      ))}
    </div>
  );
}

export function ArcadeInstallations() {
  const sites = useSites();
  const context = useQuery({ queryKey: queryKeys.arcade.context(), queryFn: () => getArcadeContext({}) });
  const machines = useQuery({ queryKey: queryKeys.arcade.machines({ install: true }), queryFn: () => listArcadeMachines({ page: 1, pageSize: 50 }) });
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
    onSuccess: () => toast.success("Installation opened"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Installation was not saved"),
  });
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold">Installations</h1>
      <select className="h-10 rounded-md border bg-background px-2" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
        <option value="">Site</option>
        {(sites.data ?? []).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
      </select>
      <select className="h-10 rounded-md border bg-background px-2" value={machineId} onChange={(event) => setMachineId(event.target.value)}>
        <option value="">Machine</option>
        {(machines.data?.rows ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select>
      <Button type="button" onClick={() => save.mutate()}>Record delivery</Button>
      {(list.data?.rows ?? []).map((row) => <p key={row.id} className="text-sm">{row.status} · delivered {row.delivery_on ?? "—"}</p>)}
    </div>
  );
}
