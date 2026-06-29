"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Calendar, ChevronRight, FileUp, Loader2, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { CompliancePageShell, KpiStrip } from "@/components/compliance/compliance-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useLocationComplianceItems, useLocationComplianceKpis } from "@/hooks/queries/useLocationCompliance";
import { useReportExport } from "@/hooks/use-report-export";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { useFloorSupervisorView } from "@/hooks/use-floor-supervisor-view";
import { formatDisplayDate } from "@/lib/compliance/compliance-derive";
import {
  attachmentSummary,
  LOCATION_COMPLIANCE_CATEGORIES,
  riskTone,
  statusTone,
} from "@/lib/compliance/location-compliance-derive";
import {
  applyComplianceTemplate,
  getLocationComplianceItem,
  listComplianceRequirementTemplates,
  syncLocationComplianceNotifications,
  uploadLocationComplianceAttachment,
  upsertLocationComplianceItem,
} from "@/lib/location-compliance.functions";
import { useAppStore } from "@/stores/app-store";

type TrackerRow = Record<string, unknown>;

const STATUSES = ["Expired", "Due Soon", "Valid", "Missing", "Pending Renewal", "Pending Payment", "Service Overdue", "No Date"];

function LocationComplianceTrackerPage() {
  const qc = useQueryClient();
  const currentLocationId = useAppStore((s) => s.currentLocationId);
  const { data: sites } = useSites();
  const canManage = usePermission("compliance.tracker.manage");
  const canEdit = usePermission("compliance.tracker.edit") || canManage;
  const canUpload = usePermission("compliance.tracker.upload") || canEdit;
  const floorView = useFloorSupervisorView();

  const [locationFilter, setLocationFilter] = useState<string>(currentLocationId ?? "all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [vendor, setVendor] = useState("");
  const [expiryBucket, setExpiryBucket] = useState("all");
  const [missingDocs, setMissingDocs] = useState(false);
  const [outstandingPayment, setOutstandingPayment] = useState(false);
  const [highRisk, setHighRisk] = useState(false);
  const [requiredOnly, setRequiredOnly] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | number | boolean>>({});

  const filters = useMemo(
    () => ({
      locationId: locationFilter !== "all" ? locationFilter : null,
      category: category !== "all" ? category : null,
      status: status !== "all" ? status : null,
      vendor: vendor.trim() || null,
      expiryBucket: expiryBucket !== "all" ? expiryBucket : null,
      missingDocs,
      outstandingPayment,
      highRisk,
      requiredOnly,
    }),
    [locationFilter, category, status, vendor, expiryBucket, missingDocs, outstandingPayment, highRisk, requiredOnly],
  );

  const { data: rows, isLoading } = useLocationComplianceItems(filters);
  const { data: kpis } = useLocationComplianceKpis(filters);

  const { data: detail } = useQuery({
    queryKey: ["location-compliance-detail", detailId],
    queryFn: () => getLocationComplianceItem({ id: detailId! }),
    enabled: !!detailId,
  });

  const { data: templates } = useQuery({
    queryKey: ["compliance-requirement-templates", locationFilter],
    queryFn: () =>
      listComplianceRequirementTemplates({
        locationCode: sites?.find((s) => s.id === locationFilter)?.code ?? null,
      }),
    enabled: templateOpen && locationFilter !== "all",
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["compliance"] });
    void qc.invalidateQueries({ queryKey: ["location-compliance-detail"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: Parameters<typeof upsertLocationComplianceItem>[0]) => upsertLocationComplianceItem(payload),
    onSuccess: () => {
      toast.success("Tracker item saved");
      setEditOpen(false);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const templateMutation = useMutation({
    mutationFn: () => {
      const site = sites?.find((s) => s.id === locationFilter);
      if (!site) throw new Error("Select a location first");
      return applyComplianceTemplate({ locationId: site.id, locationCode: site.code });
    },
    onSuccess: (r) => {
      toast.success(`Applied template — ${r.inserted} items added`);
      setTemplateOpen(false);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const notifyMutation = useMutation({
    mutationFn: () => syncLocationComplianceNotifications(filters),
    onSuccess: (r) => {
      toast.success(`Notifications synced (${r.created} new)`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const uploadMutation = useMutation({
    mutationFn: (payload: Parameters<typeof uploadLocationComplianceAttachment>[0]) =>
      uploadLocationComplianceAttachment(payload),
    onSuccess: () => {
      toast.success("File uploaded");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const exportRows = (rows ?? []).map((r: TrackerRow) => ({
    location: r.location_code,
    area: r.area_sub_area ?? "—",
    category: r.category,
    requirement: r.requirement_name,
    type: r.document_contract_type ?? "—",
    required: r.is_required ? "Y" : "N",
    vendor: r.vendor_name ?? "—",
    authority: r.issuing_authority ?? "—",
    cert_no: r.cert_contract_number ?? "—",
    expiry: r.expiry_date ?? "—",
    renewal: r.renewal_due_date ?? "—",
    status: r.computed_status,
    days: r.days_remaining ?? "—",
    risk: r.risk_level,
    owner: r.owner ?? "—",
    outstanding: r.outstanding_amount,
    payment: r.payment_status,
    attachments: attachmentSummary(r as Parameters<typeof attachmentSummary>[0]),
  }));

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "LocationComplianceTracker",
    title: "Location Compliance & AMC Master Tracker",
    venueLabel: locationFilter !== "all" ? sites?.find((s) => s.id === locationFilter)?.code ?? "Site" : "All",
    filters: { location: locationFilter, category, status } as Record<string, string | null | undefined>,
    kpis: kpis
      ? [
          { label: "Total", value: kpis.total },
          { label: "Expired", value: kpis.expired },
          { label: "Score", value: `${kpis.compliance_score}%` },
        ]
      : [],
    columns: [
      { key: "location", header: "Location" },
      { key: "category", header: "Category" },
      { key: "requirement", header: "Requirement" },
      { key: "vendor", header: "Vendor" },
      { key: "expiry", header: "Expiry", format: "date" },
      { key: "status", header: "Status" },
      { key: "days", header: "Days" },
      { key: "risk", header: "Risk" },
      { key: "outstanding", header: "Outstanding", format: "qar" },
    ],
    rows: exportRows,
  });

  const openNew = () => {
    const loc = locationFilter !== "all" ? locationFilter : sites?.[0]?.id;
    if (!loc) {
      toast.error("Select a location first");
      return;
    }
    setForm({
      location_id: loc,
      category: "Other",
      requirement_name: "",
      is_required: true,
      risk_level: "Medium",
      quotation_amount: 0,
      paid_amount: 0,
      payment_status: "unpaid",
      attachment_status: "none",
    });
    setEditOpen(true);
  };

  const openEdit = (row: TrackerRow) => {
    setForm({
      id: String(row.id),
      location_id: String(row.location_id),
      area_sub_area: String(row.area_sub_area ?? ""),
      category: String(row.category),
      requirement_name: String(row.requirement_name),
      document_contract_type: String(row.document_contract_type ?? ""),
      is_required: Boolean(row.is_required),
      vendor_name: String(row.vendor_name ?? ""),
      issuing_authority: String(row.issuing_authority ?? ""),
      cert_contract_number: String(row.cert_contract_number ?? ""),
      expiry_date: String(row.expiry_date ?? ""),
      renewal_due_date: String(row.renewal_due_date ?? ""),
      next_service_date: String(row.next_service_date ?? ""),
      manual_status: String(row.manual_status ?? ""),
      risk_level: String(row.risk_level ?? "Medium"),
      owner: String(row.owner ?? ""),
      department: String(row.department ?? ""),
      quotation_amount: Number(row.quotation_amount ?? 0),
      paid_amount: Number(row.paid_amount ?? 0),
      payment_status: String(row.payment_status ?? "unpaid"),
      remarks: String(row.remarks ?? ""),
    });
    setEditOpen(true);
  };

  const handleFileUpload = async (attachmentType: string) => {
    if (!detailId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      uploadMutation.mutate({
        itemId: detailId,
        attachmentType: attachmentType as "certificate",
        fileName: file.name,
        fileMime: file.type || "application/octet-stream",
        fileBase64: base64,
      });
    };
    input.click();
  };

  return (
    <CompliancePageShell
      title="Location Compliance & AMC Master Tracker"
      subtitle="Per-location licenses, certificates, AMCs, contracts & renewals — linked to compliance documents & AMC scheduler"
      onExportPdf={exportPdf}
      onExportExcel={exportExcel}
      filters={
        <>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[200px] bg-zinc-800 text-zinc-50"><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {(sites ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px] bg-zinc-800 text-zinc-50"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {LOCATION_COMPLIANCE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px] bg-zinc-800 text-zinc-50"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} className="w-[140px] bg-zinc-800 text-zinc-50" />
          <Select value={expiryBucket} onValueChange={setExpiryBucket}>
            <SelectTrigger className="w-[130px] bg-zinc-800 text-zinc-50"><SelectValue placeholder="Expiry" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any expiry</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="7d">≤7 days</SelectItem>
              <SelectItem value="15d">≤15 days</SelectItem>
              <SelectItem value="30d">≤30 days</SelectItem>
              <SelectItem value="60d">≤60 days</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={missingDocs} onCheckedChange={(v) => setMissingDocs(!!v)} /> Missing docs
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={outstandingPayment} onCheckedChange={(v) => setOutstandingPayment(!!v)} /> Outstanding
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={highRisk} onCheckedChange={(v) => setHighRisk(!!v)} /> High risk
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={requiredOnly} onCheckedChange={(v) => setRequiredOnly(!!v)} /> Required only
          </label>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setTemplateOpen(true)}>
              <Settings2 className="mr-1 h-4 w-4" /> Templates
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Add item</Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => notifyMutation.mutate()} disabled={notifyMutation.isPending}>
            Sync alerts
          </Button>
        </>
      }
    >
      <KpiStrip
        items={[
          { label: "Total items", value: kpis?.total ?? "—" },
          { label: "Expired", value: kpis?.expired ?? "—", tone: "rag-red" },
          { label: "≤7d", value: kpis?.due_7 ?? "—", tone: "rag-red" },
          { label: "≤15d", value: kpis?.due_15 ?? "—", tone: "rag-amber" },
          { label: "≤30d", value: kpis?.due_30 ?? "—", tone: "rag-amber" },
          { label: "≤60d", value: kpis?.due_60 ?? "—" },
          { label: "Missing docs", value: kpis?.missing_docs ?? "—" },
          { label: "Outstanding", value: kpis?.outstanding_payments ?? "—" },
          { label: "High-risk sites", value: kpis?.high_risk_locations ?? "—" },
          { label: "Compliance score", value: kpis ? `${kpis.compliance_score}%` : "—" },
        ]}
      />

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tracker…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Outstanding</TableHead>
                <TableHead>Files</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((row: TrackerRow) => (
                <TableRow key={String(row.id)} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetailId(String(row.id))}>
                  <TableCell className="font-medium">{String(row.location_code)}</TableCell>
                  <TableCell className="text-xs">{String(row.area_sub_area ?? "—")}</TableCell>
                  <TableCell className="text-xs">{String(row.category)}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs">{String(row.requirement_name)}</TableCell>
                  <TableCell className="text-xs">{String(row.vendor_name ?? "—")}</TableCell>
                  <TableCell className="text-xs">{formatDisplayDate(row.expiry_date as string | null)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusTone(String(row.computed_status))}>
                      {String(row.computed_status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{row.days_remaining != null ? String(row.days_remaining) : "—"}</TableCell>
                  <TableCell className={`text-xs ${riskTone(row.risk_level as string)}`}>{String(row.risk_level)}</TableCell>
                  <TableCell className="text-xs">
                    {Number(row.outstanding_amount) > 0 ? `QAR ${Number(row.outstanding_amount).toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{attachmentSummary(row as Parameters<typeof attachmentSummary>[0])}</TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
              {!rows?.length && (
                <TableRow>
                  <TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                    No tracker items — apply a location template or add items manually.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit tracker item" : "Add tracker item"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Category</Label>
              <Select value={String(form.category)} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_COMPLIANCE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Requirement name</Label>
              <Input value={String(form.requirement_name ?? "")} onChange={(e) => setForm((f) => ({ ...f, requirement_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Vendor</Label>
                <Input value={String(form.vendor_name ?? "")} onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))} />
              </div>
              <div>
                <Label>Risk</Label>
                <Select value={String(form.risk_level ?? "Medium")} onValueChange={(v) => setForm((f) => ({ ...f, risk_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Critical", "High", "Medium", "Low"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Expiry</Label>
                <Input type="date" value={String(form.expiry_date ?? "")} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} />
              </div>
              <div>
                <Label>Renewal due</Label>
                <Input type="date" value={String(form.renewal_due_date ?? "")} onChange={(e) => setForm((f) => ({ ...f, renewal_due_date: e.target.value }))} />
              </div>
            </div>
            {!floorView && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Quotation (QAR)</Label>
                  <Input type="number" value={Number(form.quotation_amount ?? 0)} onChange={(e) => setForm((f) => ({ ...f, quotation_amount: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>Paid (QAR)</Label>
                  <Input type="number" value={Number(form.paid_amount ?? 0)} onChange={(e) => setForm((f) => ({ ...f, paid_amount: Number(e.target.value) }))} />
                </div>
              </div>
            )}
            <div>
              <Label>Remarks</Label>
              <Textarea value={String(form.remarks ?? "")} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              disabled={!canEdit || saveMutation.isPending}
              onClick={() =>
                saveMutation.mutate({
                  ...(form.id ? { id: String(form.id) } : {}),
                  location_id: String(form.location_id),
                  category: String(form.category),
                  requirement_name: String(form.requirement_name),
                  area_sub_area: String(form.area_sub_area || "") || null,
                  document_contract_type: String(form.document_contract_type || "") || null,
                  is_required: Boolean(form.is_required),
                  vendor_name: String(form.vendor_name || "") || null,
                  issuing_authority: String(form.issuing_authority || "") || null,
                  cert_contract_number: String(form.cert_contract_number || "") || null,
                  expiry_date: String(form.expiry_date || "") || null,
                  renewal_due_date: String(form.renewal_due_date || "") || null,
                  next_service_date: String(form.next_service_date || "") || null,
                  manual_status: String(form.manual_status || "") || null,
                  risk_level: String(form.risk_level || "Medium"),
                  owner: String(form.owner || "") || null,
                  department: String(form.department || "") || null,
                  quotation_amount: Number(form.quotation_amount ?? 0),
                  paid_amount: Number(form.paid_amount ?? 0),
                  payment_status: String(form.payment_status || "unpaid"),
                  attachment_status: String(form.attachment_status || "none"),
                  remarks: String(form.remarks || "") || null,
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply location template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Seeds tracker rows from predefined requirements for the selected location type. Existing items are kept.
          </p>
          {templates?.length ? (
            <ul className="max-h-48 overflow-y-auto text-xs text-muted-foreground">
              {templates.map((t) => (
                <li key={t.id}>• {t.category} — {t.requirement_name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Select a single location to preview template items.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>Cancel</Button>
            <Button onClick={() => templateMutation.mutate()} disabled={locationFilter === "all" || templateMutation.isPending}>
              Apply template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{detail?.item ? String(detail.item.requirement_name) : "Item detail"}</SheetTitle>
          </SheetHeader>
          {detail?.item && (
            <div className="mt-4 space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Location</span><br />{String(detail.item.location_code)}</div>
                <div><span className="text-muted-foreground">Status</span><br />{String(detail.item.computed_status)}</div>
                <div><span className="text-muted-foreground">Expiry</span><br />{formatDisplayDate(detail.item.expiry_date as string)}</div>
                {!floorView && (
                  <div><span className="text-muted-foreground">Outstanding</span><br />QAR {Number(detail.item.outstanding_amount).toLocaleString()}</div>
                )}
              </div>

              {detail.linkedAmc && (
                <section className="rounded-lg border p-3">
                  <h4 className="mb-2 font-medium">Linked AMC contract</h4>
                  <p className="text-xs text-muted-foreground">
                    {String((detail.linkedAmc as { contract_ref?: string }).contract_ref ?? "—")} — {String((detail.linkedAmc as { vendor_name?: string }).vendor_name ?? "—")}<br />
                    Ends {formatDisplayDate((detail.linkedAmc as { contract_end_date?: string }).contract_end_date ?? null)} · Next service {formatDisplayDate((detail.linkedAmc as { next_service_date?: string }).next_service_date ?? null)}
                  </p>
                </section>
              )}

              {detail.linkedDoc && (
                <section className="rounded-lg border p-3">
                  <h4 className="mb-2 font-medium">Linked compliance document</h4>
                  <p className="text-xs text-muted-foreground">
                    {detail.linkedDoc.document_type} · {detail.linkedDoc.status} · Exp {formatDisplayDate(detail.linkedDoc.expiry_date)}
                  </p>
                </section>
              )}

              <section className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-medium">Document uploads</h4>
                  {canUpload && (
                    <Button size="sm" variant="outline" onClick={() => handleFileUpload("certificate")}>
                      <FileUp className="mr-1 h-3 w-3" /> Certificate
                    </Button>
                  )}
                </div>
                <ul className="space-y-1 text-xs">
                  {(detail.attachments ?? []).map((a) => (
                    <li key={a.id}>{a.attachment_type}: {a.file_name}</li>
                  ))}
                  {!detail.attachments?.length && <li className="text-muted-foreground">No files uploaded</li>}
                </ul>
              </section>

              {!!detail.schedules?.length && (
                <section className="rounded-lg border p-3">
                  <h4 className="mb-2 flex items-center gap-2 font-medium"><Calendar className="h-4 w-4" /> Service schedule</h4>
                  <ul className="space-y-1 text-xs">
                    {detail.schedules.map((s) => {
                      const row = s as { id: string; visit_label?: string; service_number?: number; planned_date?: string; status?: string };
                      return (
                      <li key={row.id}>
                        {row.visit_label ?? `Visit ${row.service_number}`} — {formatDisplayDate(row.planned_date ?? null)} · {row.status}
                      </li>
                    );})}
                  </ul>
                </section>
              )}

              <section className="rounded-lg border p-3">
                <h4 className="mb-2 font-medium">Expiry timeline</h4>
                <p className="text-xs text-muted-foreground">
                  Issue {formatDisplayDate(detail.item.issue_date as string)} → Expiry {formatDisplayDate(detail.item.expiry_date as string)} → Renewal {formatDisplayDate(detail.item.renewal_due_date as string)}
                </p>
              </section>

              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => { openEdit(detail.item as TrackerRow); setDetailId(null); }}>
                  Edit item
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </CompliancePageShell>
  );
}

export default LocationComplianceTrackerPage;
