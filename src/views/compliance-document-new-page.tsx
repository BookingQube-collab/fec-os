"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CompliancePageShell } from "@/components/compliance/compliance-page-shell";
import {
  COMPLIANCE_DOCUMENT_TYPE_LABELS,
  COMPLIANCE_DOCUMENT_TYPES,
  DOCUMENT_RENEWAL_STATUSES,
  calcOutstanding,
  derivePaymentStatus,
} from "@/lib/compliance/constants";
import { createComplianceDocument, uploadComplianceDocumentFile } from "@/lib/compliance-documents.functions";
import { useSites } from "@/hooks/queries/useSites";
import { useVendors } from "@/hooks/queries/useVendors";
import { useAmcContracts } from "@/hooks/queries/useAmcContracts";
import { useAppStore } from "@/stores/app-store";
import { fmtQar } from "@/lib/currency";
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

function ComplianceDocumentNewPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const locationId = useAppStore((s) => s.currentLocationId);
  const locsQ = useSites();
  const { data: vendors } = useVendors({});
  const [form, setForm] = useState({
    location_id: locationId ?? "",
    document_type: "qcdd" as (typeof COMPLIANCE_DOCUMENT_TYPES)[number],
    document_name: "",
    certificate_number: "",
    issuing_authority: "",
    issue_date: "",
    expiry_date: "",
    renewal_due_date: "",
    vendor_id: "",
    contract_id: "",
    quotation_amount: 0,
    paid_amount: 0,
    responsible_person: "",
    renewal_status: "active" as (typeof DOCUMENT_RENEWAL_STATUSES)[number],
    priority: "medium" as "low" | "medium" | "high" | "critical",
    notes: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const { data: amcContracts } = useAmcContracts(
    { locationId: form.location_id || null },
    { enabled: Boolean(form.location_id) },
  );

  const outstanding = useMemo(
    () => calcOutstanding(form.quotation_amount, form.paid_amount),
    [form.quotation_amount, form.paid_amount],
  );
  const paymentStatus = useMemo(
    () => derivePaymentStatus(form.quotation_amount, form.paid_amount),
    [form.quotation_amount, form.paid_amount],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const { id } = await createComplianceDocument({
        location_id: form.location_id,
        document_type: form.document_type,
        document_name: form.document_name || null,
        certificate_number: form.certificate_number || null,
        issuing_authority: form.issuing_authority || null,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        renewal_due_date: form.renewal_due_date || null,
        vendor_id: form.vendor_id || null,
        contract_id: form.contract_id || null,
        quotation_amount: form.quotation_amount,
        paid_amount: form.paid_amount,
        responsible_person: form.responsible_person || null,
        renewal_status: form.renewal_status,
        priority: form.priority,
        notes: form.notes || null,
        status: "pending",
      });
      if (file) {
        const buf = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        await uploadComplianceDocumentFile({
          id,
          filename: file.name,
          data_base64: base64,
          content_type: file.type || "application/pdf",
        });
      }
      return id;
    },
    onSuccess: (id) => {
      toast.success("Document registered");
      void qc.invalidateQueries({ queryKey: ["compliance"] });
      router.push(`/compliance/documents/${id}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.type === "number" ? Number(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [key]: val }));
  };

  return (
    <CompliancePageShell
      title="Register compliance document"
      subtitle="Certificate, quotation, vendor link and payment tracking"
      onExportPdf={() => {}}
      onExportExcel={() => {}}
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link href="/compliance/documents"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
      }
    >
      <div className="max-w-3xl space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Site</Label>
            <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v, contract_id: "" }))}>
              <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
              <SelectContent>
                {(locsQ.data ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Document type</Label>
            <Select value={form.document_type} onValueChange={(v) => setForm((f) => ({ ...f, document_type: v as typeof form.document_type }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMPLIANCE_DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{COMPLIANCE_DOCUMENT_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Document name</Label>
            <Input value={form.document_name} onChange={set("document_name")} placeholder="Optional display name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Certificate number</Label>
            <Input value={form.certificate_number} onChange={set("certificate_number")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Issuing authority</Label>
            <Input value={form.issuing_authority} onChange={set("issuing_authority")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Issue date</Label>
            <Input type="date" value={form.issue_date} onChange={set("issue_date")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Expiry date</Label>
            <Input type="date" value={form.expiry_date} onChange={set("expiry_date")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Renewal due date</Label>
            <Input type="date" value={form.renewal_due_date} onChange={set("renewal_due_date")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Responsible person</Label>
            <Input value={form.responsible_person} onChange={set("responsible_person")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Vendor</Label>
            <Select value={form.vendor_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, vendor_id: v === "none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="Link vendor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {(vendors?.items ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">AMC contract</Label>
            <Select value={form.contract_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, contract_id: v === "none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="Link AMC" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {(amcContracts?.items ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.vendor_name} — {c.category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quotation (QAR)</Label>
            <Input type="number" min={0} value={form.quotation_amount} onChange={set("quotation_amount")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Paid (QAR)</Label>
            <Input type="number" min={0} value={form.paid_amount} onChange={set("paid_amount")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
            <div>Outstanding: <strong>{fmtQar(outstanding)}</strong></div>
            <div className="text-xs text-muted-foreground">Payment status: {paymentStatus.replace(/_/g, " ")}</div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={set("notes")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Certificate file (PDF / image)</Label>
            <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.location_id}
          >
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Register document
          </Button>
        </div>
      </div>
    </CompliancePageShell>
  );
}

export default ComplianceDocumentNewPage;
