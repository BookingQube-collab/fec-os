"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CompliancePageShell, KpiStrip } from "@/components/compliance/compliance-page-shell";
import { useComplianceRegister } from "@/hooks/queries/useComplianceRegister";
import { alertTierClass, COMPLIANCE_DOMAINS, formatDisplayDate } from "@/lib/compliance/compliance-derive";
import { useReportExport } from "@/hooks/use-report-export";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function ComplianceRegisterPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const [domain, setDomain] = useState("all");
  const [status, setStatus] = useState("all");
  const [risk, setRisk] = useState("all");

  const filters = useMemo(
    () => ({
      locationCode: locationId ? undefined : null,
      domain: domain !== "all" ? domain : null,
      status: status !== "all" ? status : null,
      risk: risk !== "all" ? risk : null,
    }),
    [domain, status, risk, locationId],
  );

  const { data: rows, isLoading } = useComplianceRegister(filters);

  const exportRows = (rows ?? []).map((r) => ({
    domain: r.domain,
    item: r.item_name,
    venue: r.venue_scope,
    vendor: r.vendor_authority ?? "—",
    expiry: r.expiry_date ?? "—",
    days: r.days_remaining ?? "—",
    tier: r.alert_tier,
    status: r.status,
    cost: r.renewal_cost,
  }));

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "ComplianceRegister",
    title: t("complianceHub.register.title"),
    venueLabel: locationId ? "Filtered" : "All",
    filters: { domain, status, risk },
    kpis: [{ label: "Items", value: rows?.length ?? 0 }],
    columns: [
      { key: "domain", header: "Domain" },
      { key: "item", header: "Item" },
      { key: "venue", header: "Venue" },
      { key: "vendor", header: "Vendor" },
      { key: "expiry", header: "Expiry", format: "date" },
      { key: "days", header: "Days" },
      { key: "tier", header: "Alert" },
      { key: "status", header: "Status" },
      { key: "cost", header: "Cost", format: "qar" },
    ],
    rows: exportRows,
  });

  return (
    <CompliancePageShell
      title={t("complianceHub.register.title")}
      subtitle={t("complianceHub.register.subtitle")}
      onExportPdf={exportPdf}
      onExportExcel={exportExcel}
      filters={
        <>
          <Select value={domain} onValueChange={setDomain}>
            <SelectTrigger className="w-[180px] bg-zinc-800 text-zinc-50"><SelectValue placeholder="Domain" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("complianceHub.register.allDomains")}</SelectItem>
              {COMPLIANCE_DOMAINS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[140px] bg-zinc-800 text-zinc-50"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("complianceHub.register.allStatus")}</SelectItem>
              <SelectItem value="Active">{t("complianceHub.register.active")}</SelectItem>
              <SelectItem value="Pending Renewal">{t("complianceHub.tracker.statuses.Pending Renewal")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={risk} onValueChange={setRisk}>
            <SelectTrigger className="w-[120px] bg-zinc-800 text-zinc-50"><SelectValue placeholder="Risk" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("complianceHub.register.allRisk")}</SelectItem>
              {["Critical", "High", "Medium", "Low"].map((r) => <SelectItem key={r} value={r}>{t(`complianceHub.tracker.riskLevels.${r}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      }
    >
      <KpiStrip items={[{ label: t("complianceHub.tracker.totalItems"), value: rows?.length ?? "—" }]} />
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("complianceHub.register.domain")}</TableHead>
              <TableHead>{t("amc.columns.item")}</TableHead>
              <TableHead>{t("amc.columns.venue")}</TableHead>
              <TableHead>{t("common.vendor")}</TableHead>
              <TableHead>{t("complianceHub.tracker.expiry")}</TableHead>
              <TableHead>{t("complianceHub.tracker.days")}</TableHead>
              <TableHead>{t("complianceHub.register.alert")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("amc.columns.cost")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">{t("common.loading")}</TableCell></TableRow>
            ) : !rows?.length ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">{t("complianceHub.register.noItems")}</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{String(r.domain)}</TableCell>
                  <TableCell className="font-medium">{String(r.item_name)}</TableCell>
                  <TableCell className="font-mono text-xs">{String(r.venue_scope)}</TableCell>
                  <TableCell>{String(r.vendor_authority ?? "—")}</TableCell>
                  <TableCell>{formatDisplayDate(r.expiry_date as string | null)}</TableCell>
                  <TableCell className={Number(r.days_remaining) < 0 ? "rag-red" : ""}>{String(r.days_remaining ?? "—")}</TableCell>
                  <TableCell><Badge variant="outline" className={alertTierClass(r.alert_tier as never)}>{String(r.alert_tier)}</Badge></TableCell>
                  <TableCell>{String(r.status)}</TableCell>
                  <TableCell>QAR {Number(r.renewal_cost).toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </CompliancePageShell>
  );
}

export default ComplianceRegisterPage;
