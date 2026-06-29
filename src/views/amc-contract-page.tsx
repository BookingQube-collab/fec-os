"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  createAmcContract,
  getAmcContract,
  listAmcSites,
  markAmcServiceDone,
  recordAmcPayment,
  updateAmcContract,
  uploadAmcAttachment,
  verifyAmcService,
} from "@/lib/amc.functions";
import {
  AMC_CATEGORIES,
  AMC_CATEGORY_LABELS,
  AMC_CONTRACT_STATUSES,
  AMC_FREQUENCIES,
} from "@/lib/amc/constants";
import { useComplianceDocuments } from "@/hooks/queries/useComplianceDocuments";
import { COMPLIANCE_DOCUMENT_TYPE_LABELS, expiryTierColor } from "@/lib/compliance/constants";
import { CapabilityGate } from "@/components/auth/capability-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function AmcContractFormPage({ contractId }: { contractId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = !!contractId;

  const { data: existing } = useQuery({
    queryKey: ["amc", "contract", contractId],
    queryFn: () => getAmcContract({ id: contractId! }),
    enabled: isEdit,
  });
  const { data: sites } = useQuery({ queryKey: ["amc", "sites"], queryFn: () => listAmcSites() });

  const [form, setForm] = useState({
    locationId: "",
    category: "fire_fighting_amc" as (typeof AMC_CATEGORIES)[number],
    vendorName: "",
    vendorContactPerson: "",
    vendorPhone: "",
    vendorEmail: "",
    contractStartDate: new Date().toISOString().slice(0, 10),
    contractEndDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    serviceFrequency: "quarterly" as (typeof AMC_FREQUENCIES)[number],
    contractValue: 0,
    paidAmount: 0,
    status: "active" as (typeof AMC_CONTRACT_STATUSES)[number],
    scopeOfWork: "",
    remarks: "",
    regenerateSchedule: true,
  });

  useEffect(() => {
    if (!existing) return;
    setForm({
      locationId: existing.location_id,
      category: existing.category as (typeof AMC_CATEGORIES)[number],
      vendorName: existing.vendor_name,
      vendorContactPerson: existing.vendor_contact_person ?? "",
      vendorPhone: existing.vendor_phone ?? "",
      vendorEmail: existing.vendor_email ?? "",
      contractStartDate: existing.contract_start_date,
      contractEndDate: existing.contract_end_date,
      serviceFrequency: existing.service_frequency as (typeof AMC_FREQUENCIES)[number],
      contractValue: existing.contract_value,
      paidAmount: existing.paid_amount,
      status: existing.status as (typeof AMC_CONTRACT_STATUSES)[number],
      scopeOfWork: existing.scope_of_work ?? "",
      remarks: existing.remarks ?? "",
      regenerateSchedule: false,
    });
  }, [existing]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await updateAmcContract({ id: contractId!, ...form });
        return { id: contractId! };
      }
      return createAmcContract(form);
    },
    onSuccess: (r) => {
      toast.success(isEdit ? "Contract updated" : "Contract created");
      void qc.invalidateQueries({ queryKey: ["amc"] });
      router.push(`/compliance/amc-contracts/${r.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/compliance/amc-contracts"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-semibold">{isEdit ? "Edit AMC contract" : "New AMC contract"}</h1>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div>
          <Label>Site</Label>
          <Select value={form.locationId} onValueChange={(v) => setForm((f) => ({ ...f, locationId: v }))}>
            <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
            <SelectContent>
              {(sites ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.code} — {s.name} ({s.region})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as typeof f.category }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {AMC_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{AMC_CATEGORY_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Vendor name</Label>
          <Input value={form.vendorName} onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Contact person</Label>
            <Input value={form.vendorContactPerson} onChange={(e) => setForm((f) => ({ ...f, vendorContactPerson: e.target.value }))} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.vendorPhone} onChange={(e) => setForm((f) => ({ ...f, vendorPhone: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.vendorEmail} onChange={(e) => setForm((f) => ({ ...f, vendorEmail: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start date</Label>
            <Input type="date" value={form.contractStartDate} onChange={(e) => setForm((f) => ({ ...f, contractStartDate: e.target.value }))} />
          </div>
          <div>
            <Label>End date</Label>
            <Input type="date" value={form.contractEndDate} onChange={(e) => setForm((f) => ({ ...f, contractEndDate: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Frequency</Label>
            <Select value={form.serviceFrequency} onValueChange={(v) => setForm((f) => ({ ...f, serviceFrequency: v as typeof f.serviceFrequency }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AMC_FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>{f.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AMC_CONTRACT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Contract value (QAR)</Label>
            <Input type="number" value={form.contractValue} onChange={(e) => setForm((f) => ({ ...f, contractValue: Number(e.target.value) }))} />
          </div>
          <div>
            <Label>Paid amount (QAR)</Label>
            <Input type="number" value={form.paidAmount} onChange={(e) => setForm((f) => ({ ...f, paidAmount: Number(e.target.value) }))} />
          </div>
        </div>
        <div>
          <Label>Scope of work</Label>
          <Textarea value={form.scopeOfWork} onChange={(e) => setForm((f) => ({ ...f, scopeOfWork: e.target.value }))} />
        </div>
        <div>
          <Label>Remarks</Label>
          <Textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
        </div>
        <Button onClick={() => saveMut.mutate()} disabled={!form.locationId || !form.vendorName || saveMut.isPending}>
          {isEdit ? "Save changes" : "Create contract"}
        </Button>
      </div>
    </div>
  );
}

export function AmcContractDetailPage({ id }: { id: string }) {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [paymentAmount, setPaymentAmount] = useState(0);

  const { data: contract, isLoading } = useQuery({
    queryKey: ["amc", "contract", id],
    queryFn: () => getAmcContract({ id }),
  });

  const { data: linkedDocs } = useComplianceDocuments({ contractId: id }, { enabled: Boolean(id) });

  const markDone = useMutation({
    mutationFn: (scheduleId: string) => markAmcServiceDone({ scheduleId }),
    onSuccess: () => {
      toast.success("Service marked done");
      void qc.invalidateQueries({ queryKey: ["amc", "contract", id] });
    },
  });

  const payMut = useMutation({
    mutationFn: () => recordAmcPayment({ contractId: id, amount: paymentAmount }),
    onSuccess: () => {
      toast.success("Payment recorded");
      void qc.invalidateQueries({ queryKey: ["amc", "contract", id] });
    },
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const b64 = await fileToBase64(file);
      return uploadAmcAttachment({
        contractId: id,
        filename: file.name,
        dataBase64: b64,
        contentType: file.type || "application/pdf",
        attachmentType: file.type.startsWith("image/") ? "photo_before" : "service_report",
      });
    },
    onSuccess: () => {
      toast.success("Uploaded");
      void qc.invalidateQueries({ queryKey: ["amc", "contract", id] });
    },
  });

  const verifyMut = useMutation({
    mutationFn: (scheduleId: string) => verifyAmcService({ scheduleId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["amc", "contract", id] }),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!contract) return <p className="text-muted-foreground">Contract not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/compliance/amc-dashboard"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{AMC_CATEGORY_LABELS[contract.category as keyof typeof AMC_CATEGORY_LABELS] ?? contract.category}</h1>
          <p className="text-sm text-muted-foreground">{contract.vendor_name} · {contract.location?.code}</p>
        </div>
        <Badge variant="outline">{contract.status}</Badge>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/compliance/amc-contracts/${id}/edit`}>Edit</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
          <div className="text-muted-foreground">Contract period</div>
          <div>{contract.contract_start_date} → {contract.contract_end_date}</div>
          <div className="mt-1 text-xs">{contract.days_left} days left</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
          <div className="text-muted-foreground">Financials</div>
          <div>Value: QAR {contract.contract_value.toLocaleString()}</div>
          <div>Paid: QAR {contract.paid_amount.toLocaleString()}</div>
          <div className="text-amber-400">Outstanding: QAR {contract.outstanding_amount.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
          <div className="text-muted-foreground">Vendor contact</div>
          <div>{contract.vendor_contact_person ?? "—"}</div>
          <div>{contract.vendor_phone ?? "—"}</div>
          <div>{contract.vendor_email ?? "—"}</div>
        </div>
      </div>

      <CapabilityGate capability="amc.manage">
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
          <div>
            <Label>Record payment (QAR)</Label>
            <Input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value))} className="w-40" />
          </div>
          <Button size="sm" onClick={() => payMut.mutate()} disabled={paymentAmount <= 0}>Mark payment</Button>
          <Label className="cursor-pointer">
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
              <Upload className="h-4 w-4" />Upload attachment
            </span>
            <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadMut.mutate(f);
            }} />
          </Label>
        </div>
      </CapabilityGate>

      {(linkedDocs?.items?.length ?? 0) > 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 font-medium text-sm">Linked compliance certificates</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {linkedDocs!.items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    {d.document_name ?? COMPLIANCE_DOCUMENT_TYPE_LABELS[d.document_type as keyof typeof COMPLIANCE_DOCUMENT_TYPE_LABELS] ?? d.document_type}
                  </TableCell>
                  <TableCell>{d.expiry_date ? new Date(d.expiry_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={expiryTierColor(d.expiry_tier ?? "No Date")}>{d.expiry_tier}</Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/compliance/documents/${d.id}`} className="text-xs text-primary hover:underline">View</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 font-medium text-sm">Service schedule</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Planned</TableHead>
              <TableHead>Actual</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contract.schedules.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.service_number}</TableCell>
                <TableCell>{s.planned_date}</TableCell>
                <TableCell>{s.actual_service_date ?? "—"}</TableCell>
                <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
                <TableCell>{s.verification_status}</TableCell>
                <TableCell className="space-x-1">
                  {s.status !== "done" && (
                    <Button size="sm" variant="outline" onClick={() => markDone.mutate(s.id)}>
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                  <CapabilityGate capability="amc.verify">
                    <Button size="sm" variant="ghost" onClick={() => verifyMut.mutate(s.id)}>Verify</Button>
                  </CapabilityGate>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {contract.attachments.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-2">Attachments</h2>
          <ul className="text-xs space-y-1">
            {contract.attachments.map((a) => (
              <li key={a.id}>{a.attachment_type}: {a.file_name}</li>
            ))}
          </ul>
        </div>
      )}

      {searchParams.get("upload") === "1" && (
        <p className="text-xs text-muted-foreground">Use the upload button above to attach reports or invoices.</p>
      )}
    </div>
  );
}
