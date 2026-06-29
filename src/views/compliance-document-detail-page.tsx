"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  deleteComplianceDocument,
  getComplianceDocument,
  getComplianceDocumentFileUrl,
  getDocumentAttachmentUrl,
  updateComplianceDocument,
  updateComplianceDocumentStatus,
  uploadComplianceDocumentFile,
  uploadDocumentAttachment,
} from "@/lib/compliance-documents.functions";
import {
  COMPLIANCE_DOCUMENT_TYPE_LABELS,
  DOCUMENT_ATTACHMENT_LABELS,
  DOCUMENT_ATTACHMENT_TYPES,
  paymentStatusBadge,
} from "@/lib/compliance/constants";
import { fmtQar } from "@/lib/currency";
import { useSites } from "@/hooks/queries/useSites";
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
import { ComplianceStatusBadge } from "@/views/compliance-documents-page";

const STATUSES = ["pending", "submitted", "expired", "under_renewal", "approved", "rejected"] as const;

function ComplianceDocumentDetailPage() {
  const { id } = useParams() as { id: string };
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [attachType, setAttachType] = useState<(typeof DOCUMENT_ATTACHMENT_TYPES)[number]>("certificate");

  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance-document", id],
    queryFn: () => getComplianceDocument({ id }),
  });
  const locsQ = useSites();
  const fileUrlQ = useQuery({
    queryKey: ["compliance-document-file", id],
    queryFn: () => getComplianceDocumentFileUrl({ id }),
    enabled: Boolean(data?.document.file_path),
  });

  const statusMut = useMutation({
    mutationFn: (status: (typeof STATUSES)[number]) => updateComplianceDocumentStatus({ id, status }),
    onSuccess: () => {
      toast.success("Status updated");
      void qc.invalidateQueries({ queryKey: ["compliance-document", id] });
      void qc.invalidateQueries({ queryKey: ["compliance-documents"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteComplianceDocument({ id }),
    onSuccess: () => {
      toast.success("Document deleted");
      window.location.href = "/compliance/documents";
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      await uploadComplianceDocumentFile({
        id,
        filename: file.name,
        data_base64: base64,
        content_type: file.type || "application/pdf",
      });
    },
    onSuccess: () => {
      toast.success("File uploaded");
      void qc.invalidateQueries({ queryKey: ["compliance-document", id] });
      void qc.invalidateQueries({ queryKey: ["compliance-document-file", id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const attachMut = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      await uploadDocumentAttachment({
        documentId: id,
        attachmentType: attachType,
        filename: file.name,
        data_base64: base64,
        content_type: file.type || "application/pdf",
      });
    },
    onSuccess: () => {
      toast.success("Attachment uploaded");
      void qc.invalidateQueries({ queryKey: ["compliance-document", id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-sm text-rose-300">{(error as Error).message}</div>;
  if (!data) return null;

  const doc = data.document;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/compliance/documents">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {doc.document_name ?? COMPLIANCE_DOCUMENT_TYPE_LABELS[doc.document_type as keyof typeof COMPLIANCE_DOCUMENT_TYPE_LABELS] ?? doc.document_type}
          </h1>
          <p className="text-xs text-muted-foreground">
            {data.location ? `${data.location.code} — ${data.location.name}` : doc.location_id}
            {doc.issuing_authority ? ` · ${doc.issuing_authority}` : ""}
          </p>
        </div>
        <ComplianceStatusBadge status={doc.status} />
      </header>

      {doc.submission_deadline && doc.status === "pending" ? (
        <DeadlineBanner deadline={doc.submission_deadline} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={doc.status === s ? "default" : "outline"}
            className="h-7 text-[10px] uppercase"
            onClick={() => statusMut.mutate(s)}
            disabled={statusMut.isPending || doc.status === s}
          >
            {s.replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      {editing ? (
        <EditForm
          doc={doc}
          locations={locsQ.data ?? []}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void qc.invalidateQueries({ queryKey: ["compliance-document", id] });
            void qc.invalidateQueries({ queryKey: ["compliance-documents"] });
          }}
        />
      ) : (
        <div className="space-y-4 rounded-lg border border-border bg-surface/30 p-5">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit details
            </Button>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Field label="Certificate number" value={doc.certificate_number ?? doc.reference_number} mono />
            <Field label="Renewal status" value={doc.renewal_status} />
            <Field label="Reference number" value={doc.reference_number} mono />
            <Field label="Notification date" value={formatDate(doc.notification_date)} />
            <Field label="Submission deadline" value={formatDate(doc.submission_deadline)} />
            <Field label="Issue date" value={formatDate(doc.issue_date)} />
            <Field label="Expiry date" value={formatDate(doc.expiry_date)} />
            <Field label="Renewal due" value={formatDate(doc.renewal_due_date)} />
            <Field label="Responsible person" value={doc.responsible_person} />
            <Field label="Vendor" value={data.vendor?.name ?? null} />
            <Field label="AMC contract" value={data.contract ? `${data.contract.vendor_name} (${data.contract.category})` : null} />
            <Field label="Contact" value={[doc.contact_name, doc.contact_email, doc.contact_phone].filter(Boolean).join(" · ") || null} />
            <div className="sm:col-span-2">
              <Field label="Notes" value={doc.notes} />
            </div>
          </dl>
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface/30 p-5">
        <h2 className="text-sm font-medium">Payments</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <Field label="Quotation" value={fmtQar(Number(doc.quotation_amount ?? 0))} />
          <Field label="Paid" value={fmtQar(Number(doc.paid_amount ?? 0))} />
          <Field label="Outstanding" value={fmtQar(Number(doc.outstanding_amount ?? 0))} />
        </dl>
        <div className="mt-2">
          <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] uppercase ${paymentStatusBadge(doc.payment_status)}`}>
            {doc.payment_status?.replace(/_/g, " ")}
          </span>
        </div>
        {data.contract ? (
          <Link href={`/compliance/amc-contracts/${data.contract.id}`} className="mt-3 inline-block text-xs text-primary hover:underline">
            View linked AMC contract →
          </Link>
        ) : null}
      </div>

      {data.notifications?.length ? (
        <div className="rounded-lg border border-border bg-surface/30 p-5">
          <h2 className="text-sm font-medium">Expiry notifications</h2>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {data.notifications.map((n) => (
              <li key={n.id}>{n.notification_type.replace(/_/g, " ")} · {n.notification_date} · {n.status}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-surface/30 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Attachments</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={attachType} onValueChange={(v) => setAttachType(v as typeof attachType)}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOCUMENT_ATTACHMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{DOCUMENT_ATTACHMENT_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) attachMut.mutate(f);
              }}
            />
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={attachMut.isPending}>
              <Upload className="mr-1 h-3.5 w-3.5" />
              {attachMut.isPending ? "Uploading…" : "Add attachment"}
            </Button>
          </div>
        </div>
        {data.attachments?.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {data.attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span>{DOCUMENT_ATTACHMENT_LABELS[a.attachment_type as keyof typeof DOCUMENT_ATTACHMENT_LABELS] ?? a.attachment_type} — {a.file_name}</span>
                <AttachmentDownloadButton attachmentId={a.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">No attachments yet. Upload certificate, quotation, invoice or payment proof.</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface/30 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Primary certificate file</h2>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadMut.mutate(f);
              }}
            />
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploadMut.isPending}>
              <Upload className="mr-1 h-3.5 w-3.5" />
              {uploadMut.isPending ? "Uploading…" : doc.file_name ? "Replace file" : "Upload file"}
            </Button>
            {fileUrlQ.data?.url ? (
              <Button size="sm" variant="outline" asChild>
                <a href={fileUrlQ.data.url} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-1 h-3.5 w-3.5" /> {doc.file_name ?? "Download"}
                </a>
              </Button>
            ) : null}
          </div>
        </div>
        {!doc.file_name ? (
          <p className="mt-2 text-xs text-muted-foreground">No file attached yet. Upload the mall letter or certificate (PDF/image).</p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{doc.file_name} · {doc.file_mime}</p>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="destructive" size="sm" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
        </Button>
      </div>
    </div>
  );
}

function AttachmentDownloadButton({ attachmentId }: { attachmentId: string }) {
  const dl = useMutation({
    mutationFn: () => getDocumentAttachmentUrl({ attachmentId }),
    onSuccess: (r) => {
      if (r.url) window.open(r.url, "_blank");
    },
  });
  return (
    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => dl.mutate()} disabled={dl.isPending}>
      <Download className="mr-1 h-3 w-3" /> Open
    </Button>
  );
}

function DeadlineBanner({ deadline }: { deadline: string }) {
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  const overdue = days < 0;
  return (
    <div
      className={
        overdue
          ? "rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          : "rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
      }
    >
      {overdue
        ? `Submission deadline passed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago (${formatDate(deadline)}).`
        : days === 0
          ? `Submission deadline is today (${formatDate(deadline)}).`
          : `Submission due in ${days} day${days === 1 ? "" : "s"} (${formatDate(deadline)}).`}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : ""}>{value || "—"}</dd>
    </div>
  );
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

type Doc = Awaited<ReturnType<typeof getComplianceDocument>>["document"];

function EditForm({
  doc,
  locations,
  onCancel,
  onSaved,
}: {
  doc: Doc;
  locations: Array<{ id: string; code: string; name: string }>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    location_id: doc.location_id,
    document_type: doc.document_type,
    issuing_authority: doc.issuing_authority ?? "",
    reference_number: doc.reference_number ?? "",
    notification_date: doc.notification_date ?? "",
    submission_deadline: doc.submission_deadline ?? "",
    issue_date: doc.issue_date ?? "",
    expiry_date: doc.expiry_date ?? "",
    contact_name: doc.contact_name ?? "",
    contact_email: doc.contact_email ?? "",
    contact_phone: doc.contact_phone ?? "",
    notes: doc.notes ?? "",
    quotation_amount: Number(doc.quotation_amount ?? 0),
    paid_amount: Number(doc.paid_amount ?? 0),
    status: doc.status as (typeof STATUSES)[number],
  });

  const mutation = useMutation({
    mutationFn: () =>
      updateComplianceDocument({
        id: doc.id,
        ...form,
        issuing_authority: form.issuing_authority || null,
        reference_number: form.reference_number || null,
        notification_date: form.notification_date || null,
        submission_deadline: form.submission_deadline || null,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        contact_name: form.contact_name || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        notes: form.notes || null,
        quotation_amount: form.quotation_amount,
        paid_amount: form.paid_amount,
        renewal_status: "active",
        priority: "medium",
      }),
    onSuccess: () => {
      toast.success("Document updated");
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface/30 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Location</Label>
          <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Document type</Label>
          <Input value={form.document_type} onChange={set("document_type")} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Issuing authority</Label>
          <Input value={form.issuing_authority} onChange={set("issuing_authority")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reference number</Label>
          <Input value={form.reference_number} onChange={set("reference_number")} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notification date</Label>
          <Input type="date" value={form.notification_date} onChange={set("notification_date")} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Submission deadline</Label>
          <Input type="date" value={form.submission_deadline} onChange={set("submission_deadline")} />
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
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quotation (QAR)</Label>
          <Input type="number" min={0} value={form.quotation_amount} onChange={(e) => setForm((f) => ({ ...f, quotation_amount: Number(e.target.value) }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Paid (QAR)</Label>
          <Input type="number" min={0} value={form.paid_amount} onChange={(e) => setForm((f) => ({ ...f, paid_amount: Number(e.target.value) }))} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
          <Textarea rows={3} value={form.notes} onChange={set("notes")} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save changes
        </Button>
      </div>
    </div>
  );
}

export default ComplianceDocumentDetailPage;
