"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronRight, FileText, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createComplianceDocument,
  listComplianceDocuments,
  uploadComplianceDocumentFile,
} from "@/lib/compliance-documents.functions";
import { useSites } from "@/hooks/queries/useSites";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STATUSES = ["pending", "submitted", "expired", "under_renewal", "approved", "rejected"] as const;

function deadlineClass(deadline: string | null, status: string): string {
  if (!deadline || status === "submitted" || status === "approved") return "text-muted-foreground";
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "text-rose-400 font-medium";
  if (days <= 7) return "text-amber-400 font-medium";
  return "text-muted-foreground";
}

function deadlineLabel(deadline: string | null): string {
  if (!deadline) return "—";
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  const date = new Date(deadline).toLocaleDateString();
  if (days < 0) return `${date} (${Math.abs(days)}d overdue)`;
  if (days === 0) return `${date} (today)`;
  if (days <= 7) return `${date} (${days}d left)`;
  return date;
}

export function ComplianceStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    submitted: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    expired: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    under_renewal: "bg-violet-500/15 text-violet-300 border-violet-500/40",
    approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    rejected: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        styles[status] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ComplianceDocumentsPage() {
  const [tab, setTab] = useState<"list" | "new">("list");
  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Compliance Documents</h1>
            <p className="text-xs text-muted-foreground">
              Mall certificates, QCDD submissions, and regulatory document tracking.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setTab("new")}>
          <Plus className="mr-1 h-4 w-4" /> New document
        </Button>
      </header>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "list" | "new")}>
        <TabsList>
          <TabsTrigger value="list">All documents</TabsTrigger>
          <TabsTrigger value="new">Register new</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-4">
          <DocumentsList />
        </TabsContent>
        <TabsContent value="new" className="mt-4">
          <NewDocumentForm onSuccess={() => setTab("list")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DocumentsList() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["compliance-documents", locationId, statusFilter, typeFilter],
    queryFn: () =>
      listComplianceDocuments({
        locationId: locationId ?? null,
        status: statusFilter === "all" ? null : statusFilter,
        documentType: typeFilter || null,
      }),
  });

  const urgentCount = useMemo(() => {
    if (!data) return 0;
    const now = Date.now();
    return data.filter((d) => {
      if (!d.submission_deadline || d.status === "submitted" || d.status === "approved") return false;
      const days = Math.ceil((new Date(d.submission_deadline).getTime() - now) / 86_400_000);
      return days <= 7;
    }).length;
  }, [data]);

  if (isLoading) {
    return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading documents…</div>;
  }

  return (
    <div className="space-y-4">
      {urgentCount > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {urgentCount} document{urgentCount === 1 ? "" : "s"} with submission deadline within 7 days or overdue.
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-8 w-56 text-xs"
          placeholder="Filter by document type…"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        />
      </div>
      {!data?.length ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No compliance documents on file. Register a mall letter or certificate requirement to get started.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Document</th>
                <th className="px-3 py-2 text-left">Mall / Authority</th>
                <th className="px-3 py-2 text-left">Reference</th>
                <th className="px-3 py-2 text-left">Submit by</th>
                <th className="px-3 py-2 text-left">Expires</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="border-t border-border hover:bg-surface/40">
                  <td className="px-3 py-2 font-medium">{d.document_type}</td>
                  <td className="px-3 py-2 text-xs">{d.issuing_authority ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{d.reference_number ?? "—"}</td>
                  <td className={cn("px-3 py-2 text-xs", deadlineClass(d.submission_deadline, d.status))}>
                    {deadlineLabel(d.submission_deadline)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {d.expiry_date ? new Date(d.expiry_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <ComplianceStatusBadge status={d.status} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/compliance-documents/${d.id}`} className="inline-flex items-center text-xs text-primary hover:underline">
                      View <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewDocumentForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const locationId = useAppStore((s) => s.currentLocationId);
  const locsQ = useSites();
  const [form, setForm] = useState({
    location_id: locationId ?? "",
    document_type: "QCDD Certificate",
    issuing_authority: "City Center Doha",
    reference_number: "",
    notification_date: "",
    submission_deadline: "",
    issue_date: "",
    expiry_date: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    notes: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const { id } = await createComplianceDocument({
        location_id: form.location_id,
        document_type: form.document_type,
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
    onSuccess: () => {
      toast.success("Compliance document registered");
      void qc.invalidateQueries({ queryKey: ["compliance-documents"] });
      onSuccess();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface/30 p-5">
      <p className="text-xs text-muted-foreground">
        Register a mall notification or certificate requirement — e.g. QCDD Certificate from City Center Doha with a 7-day submission window.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Location</Label>
          <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {(locsQ.data ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.code} — {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Document type</Label>
          <Input value={form.document_type} onChange={set("document_type")} placeholder="QCDD Certificate" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Issuing authority / Mall</Label>
          <Input value={form.issuing_authority} onChange={set("issuing_authority")} placeholder="City Center Doha" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reference number</Label>
          <Input value={form.reference_number} onChange={set("reference_number")} placeholder="FC/CU/KB/DG/SY/QCDD/06-2026" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notification / letter date</Label>
          <Input type="date" value={form.notification_date} onChange={set("notification_date")} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Submission deadline</Label>
          <Input type="date" value={form.submission_deadline} onChange={set("submission_deadline")} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Certificate issue date</Label>
          <Input type="date" value={form.issue_date} onChange={set("issue_date")} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Certificate expiry date</Label>
          <Input type="date" value={form.expiry_date} onChange={set("expiry_date")} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact name</Label>
          <Input value={form.contact_name} onChange={set("contact_name")} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact email</Label>
          <Input type="email" value={form.contact_email} onChange={set("contact_email")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact phone</Label>
          <Input value={form.contact_phone} onChange={set("contact_phone")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
          <Textarea rows={3} value={form.notes} onChange={set("notes")} placeholder="Letter requirements, submission instructions…" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Attach document (PDF / image)</Label>
          <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !form.location_id || form.document_type.length < 2}
        >
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Register document
        </Button>
      </div>
    </div>
  );
}

export default ComplianceDocumentsPage;
