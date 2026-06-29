"use client";

import Link from "next/link";
import { useMemo } from "react";

import { CompliancePageShell, KpiStrip } from "@/components/compliance/compliance-page-shell";
import {
  COMPLIANCE_DOCUMENT_TYPE_LABELS,
  expiryTierColor,
} from "@/lib/compliance/constants";
import { useExpiryAlerts } from "@/hooks/queries/useExpiryAlerts";
import { useReportExport } from "@/hooks/use-report-export";
import { useAppStore } from "@/stores/app-store";
import { fmtQar } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

function AlertSection({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: string;
  rows: { id: string; location_code: string | null; document_type: string; document_name: string | null; expiry_date: string; days_to_expiry: number; outstanding_amount: number }[];
}) {
  if (!rows.length) return null;
  return (
    <div className="space-y-2">
      <h3 className={cn("text-sm font-semibold", tone)}>{title} ({rows.length})</h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead>Document</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Outstanding</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.location_code ?? "—"}</TableCell>
                <TableCell>{r.document_name ?? COMPLIANCE_DOCUMENT_TYPE_LABELS[r.document_type as keyof typeof COMPLIANCE_DOCUMENT_TYPE_LABELS] ?? r.document_type}</TableCell>
                <TableCell>{new Date(r.expiry_date).toLocaleDateString()}</TableCell>
                <TableCell className={r.days_to_expiry < 0 ? "text-rose-400" : ""}>{r.days_to_expiry}</TableCell>
                <TableCell>{fmtQar(r.outstanding_amount)}</TableCell>
                <TableCell>
                  <Link href={`/compliance/documents/${r.id}`} className="text-xs text-primary hover:underline">View</Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ComplianceExpiryAlertsPage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const { data, isLoading } = useExpiryAlerts({ locationId: locationId ?? null });
  const k = data?.kpis;

  const exportRows = useMemo(() => {
    if (!data) return [];
    return [
      ...data.sections.expired,
      ...data.sections.due_7,
      ...data.sections.due_15,
      ...data.sections.due_30,
      ...data.sections.due_60,
    ];
  }, [data]);

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "ComplianceExpiryAlerts",
    title: "Document Expiry Alerts",
    venueLabel: locationId ? "Branch" : "Portfolio",
    kpis: k
      ? [
          { label: "Expired", value: k.expired },
          { label: "≤7 days", value: k.due_7 },
          { label: "≤30 days", value: k.due_30 },
          { label: "Outstanding", value: fmtQar(k.total_outstanding) },
        ]
      : [],
    columns: [
      { key: "location_code", header: "Site" },
      { key: "document_type", header: "Type" },
      { key: "expiry_date", header: "Expiry" },
      { key: "days_to_expiry", header: "Days" },
      { key: "expiry_tier", header: "Tier" },
    ],
    rows: exportRows as unknown as Record<string, unknown>[],
  });

  return (
    <CompliancePageShell
      title="Document Expiry Alerts"
      subtitle="Expired and expiring certificates — 7 / 15 / 30 / 60 day windows"
      onExportPdf={exportPdf}
      onExportExcel={exportExcel}
      actions={
        <Link href="/compliance/documents" className="text-xs text-primary hover:underline">← Document register</Link>
      }
    >
      <KpiStrip
        items={[
          { label: "Expired", value: k?.expired ?? "—", tone: "text-rose-400" },
          { label: "≤7 days", value: k?.due_7 ?? "—", tone: "text-orange-400" },
          { label: "≤15 days", value: k?.due_15 ?? "—", tone: "text-amber-400" },
          { label: "≤30 days", value: k?.due_30 ?? "—", tone: "text-amber-300" },
          { label: "≤60 days", value: k?.due_60 ?? "—", tone: "text-sky-400" },
        ]}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <div className="text-muted-foreground">Total quotation</div>
          <div className="font-semibold">{k ? fmtQar(k.total_quotation) : "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <div className="text-muted-foreground">Total paid</div>
          <div className="font-semibold text-emerald-400">{k ? fmtQar(k.total_paid) : "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <div className="text-muted-foreground">Outstanding / pending renewals</div>
          <div className="font-semibold text-amber-400">{k ? `${fmtQar(k.total_outstanding)} · ${k.pending_renewals} renewals` : "—"}</div>
        </div>
      </div>

      {data?.site_status?.length ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium">Key documents by site (QCDD, Trade Licence, CR, Civil Defence, Building Completion)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                {["qcdd", "trade_licence", "cr", "civil_defence", "building_completion"].map((t) => (
                  <TableHead key={t}>{COMPLIANCE_DOCUMENT_TYPE_LABELS[t as keyof typeof COMPLIANCE_DOCUMENT_TYPE_LABELS]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.site_status.map((site) => (
                <TableRow key={site.location_id}>
                  <TableCell className="font-mono text-xs">{site.location_code}</TableCell>
                  {site.documents.map((d) => (
                    <TableCell key={d.document_type}>
                      <Badge variant="outline" className={expiryTierColor(d.expiry_tier)}>{d.expiry_tier}</Badge>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading alerts…</p>
      ) : (
        <div className="space-y-6">
          <AlertSection title="Expired" tone="text-rose-400" rows={data?.sections.expired ?? []} />
          <AlertSection title="Expiring within 7 days" tone="text-orange-400" rows={data?.sections.due_7 ?? []} />
          <AlertSection title="Expiring within 15 days" tone="text-amber-400" rows={data?.sections.due_15 ?? []} />
          <AlertSection title="Expiring within 30 days" tone="text-amber-300" rows={data?.sections.due_30 ?? []} />
          <AlertSection title="Expiring within 60 days" tone="text-sky-400" rows={data?.sections.due_60 ?? []} />
        </div>
      )}
    </CompliancePageShell>
  );
}

export default ComplianceExpiryAlertsPage;
