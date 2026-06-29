"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, FileText, Plus } from "lucide-react";

import { CompliancePageShell } from "@/components/compliance/compliance-page-shell";
import {
  COMPLIANCE_DOCUMENT_TYPE_LABELS,
  COMPLIANCE_DOCUMENT_TYPES,
  expiryTierColor,
  paymentStatusBadge,
} from "@/lib/compliance/constants";
import { useComplianceDocuments } from "@/hooks/queries/useComplianceDocuments";
import { useReportExport } from "@/hooks/use-report-export";
import { useAppStore } from "@/stores/app-store";
import { fmtQar } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ComplianceStatusBadge } from "@/views/compliance-documents-page";

function ComplianceDocumentsRegisterPage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filters = useMemo(
    () => ({
      locationId: locationId ?? null,
      status: statusFilter === "all" ? null : statusFilter,
      documentType: typeFilter === "all" ? null : typeFilter,
      search: search || null,
    }),
    [locationId, statusFilter, typeFilter, search],
  );

  const { data, isLoading } = useComplianceDocuments(filters);
  const items = data?.items ?? [];

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "ComplianceDocuments",
    title: "Legal & Compliance Documents Register",
    venueLabel: locationId ? "Branch" : "Portfolio",
    filters: { status: statusFilter, type: typeFilter },
    kpis: [
      { label: "Total", value: String(data?.total ?? 0) },
      { label: "Outstanding", value: fmtQar(items.reduce((a, i) => a + i.outstanding_amount, 0)) },
    ],
    columns: [
      { key: "location_code", header: "Site" },
      { key: "document_type", header: "Type" },
      { key: "document_name", header: "Name" },
      { key: "certificate_number", header: "Certificate #" },
      { key: "expiry_date", header: "Expiry" },
      { key: "expiry_tier", header: "Tier" },
      { key: "payment_status", header: "Payment" },
      { key: "outstanding_amount", header: "Outstanding", format: "qar" },
      { key: "renewal_status", header: "Renewal" },
    ],
    rows: items as unknown as Record<string, unknown>[],
  });

  return (
    <CompliancePageShell
      title="Legal & Compliance Documents"
      subtitle="Certificates, licences, quotations, payments and renewal tracking"
      onExportPdf={exportPdf}
      onExportExcel={exportExcel}
      actions={
        <Button size="sm" asChild>
          <Link href="/compliance/documents/new">
            <Plus className="mr-1 h-4 w-4" /> New document
          </Link>
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["pending", "submitted", "expired", "under_renewal", "approved", "rejected"].map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue placeholder="Document type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {COMPLIANCE_DOCUMENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{COMPLIANCE_DOCUMENT_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-8 w-56 text-xs"
          placeholder="Search name, certificate #…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
          <Link href="/compliance/expiry-alerts">
            <FileText className="mr-1 h-3 w-3" /> Expiry alerts
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Loading documents…
        </div>
      ) : !items.length ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No compliance documents on file.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Site</th>
                <th className="px-3 py-2 text-left">Document</th>
                <th className="px-3 py-2 text-left">Certificate #</th>
                <th className="px-3 py-2 text-left">Expiry</th>
                <th className="px-3 py-2 text-left">Payment</th>
                <th className="px-3 py-2 text-left">Outstanding</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-t border-border hover:bg-surface/40">
                  <td className="px-3 py-2 font-mono text-xs">{d.location_code ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {d.document_name ?? COMPLIANCE_DOCUMENT_TYPE_LABELS[d.document_type as keyof typeof COMPLIANCE_DOCUMENT_TYPE_LABELS] ?? d.document_type}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{d.issuing_authority ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">{d.certificate_number ?? d.reference_number ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium", expiryTierColor(d.expiry_tier ?? "No Date"))}>
                      {d.expiry_date ? new Date(d.expiry_date).toLocaleDateString() : "—"}
                      {d.days_to_expiry != null ? ` (${d.days_to_expiry}d)` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex rounded-md border px-1.5 py-0.5 text-[10px] uppercase", paymentStatusBadge(d.payment_status))}>
                      {d.payment_status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{fmtQar(d.outstanding_amount)}</td>
                  <td className="px-3 py-2"><ComplianceStatusBadge status={d.status} /></td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/compliance/documents/${d.id}`} className="inline-flex items-center text-xs text-primary hover:underline">
                      View <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CompliancePageShell>
  );
}

export default ComplianceDocumentsRegisterPage;
