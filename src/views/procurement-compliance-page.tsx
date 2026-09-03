"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Search, Shield, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { PrModuleShell } from "@/components/procurement/pr-module-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVendors } from "@/hooks/queries/useVendors";
import type { VendorListRow } from "@/lib/queries/vendors-api.core";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

function docOk(vendor: VendorListRow, pattern: RegExp): boolean {
  return vendor.doc_types.some((d) => pattern.test(d)) || (pattern.test("cr") && Boolean(vendor.cr_no));
}

export default function ProcurementCompliancePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const locationId = useAppStore((s) => s.currentLocationId);
  const [search, setSearch] = useState("");

  const list = useVendors({ locationId: locationId ?? null, includeInactive: true, page: 1, pageSize: 200 });
  const vendors = list.data?.items ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      [v.name, v.email, v.cr_no, v.trade_license_no].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [vendors, search]);

  const kpis = useMemo(() => {
    const secured = vendors.filter((v) => v.compliance_score >= 100).length;
    const critical = vendors.filter((v) => v.compliance_score < 50 || v.compliance_status === "blocked").length;
    const health =
      vendors.length === 0 ? 0 : Math.round(vendors.reduce((s, v) => s + v.compliance_score, 0) / vendors.length);
    return { health, secured, critical };
  }, [vendors]);

  const scan = useMutation({
    mutationFn: async () => {
      await new Promise((r) => setTimeout(r, 600));
      return { ok: true };
    },
    onSuccess: () => {
      toast.success(t("procurement.compliance.scanDone"));
      void qc.invalidateQueries({ queryKey: queryKeys.vendors.all });
    },
  });

  const exportAudit = () => {
    const header = ["Vendor", "CR", "Tax", "Computer Card", "Master Contract", "Score"];
    const body = filtered.map((v) =>
      [
        v.name,
        docOk(v, /cr|commercial/i) ? "OK" : "Missing",
        docOk(v, /tax|tin/i) ? "OK" : "Missing",
        docOk(v, /establishment|computer/i) ? "OK" : "Missing",
        docOk(v, /contract|master/i) ? "OK" : "Missing",
        `${v.compliance_score}%`,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "compliance-audit.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PrModuleShell>
      <div className="space-y-6">
        <PageHeader
          icon={Shield}
          title={t("procurement.compliance.title")}
          subtitle={t("procurement.compliance.subtitle")}
          actions={
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <KpiMini label={t("procurement.compliance.systemHealth")} value={`${kpis.health}%`} />
                <KpiMini label={t("procurement.compliance.fullySecured")} value={`${kpis.secured}`} suffix={t("procurement.compliance.vendors")} />
                <KpiMini label={t("procurement.compliance.regulatoryRisk")} value={`${kpis.critical}`} suffix={t("procurement.compliance.critical")} alert />
              </div>
            </div>
          }
        />

        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t("procurement.compliance.body")}</p>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("procurement.compliance.searchPlaceholder")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/procurement/config">{t("procurement.compliance.policySettings")}</a>
            </Button>
            <Button variant="outline" size="sm" onClick={exportAudit}>
              <Download />
              {t("procurement.compliance.exportAudit")}
            </Button>
            <Button size="sm" disabled={scan.isPending} onClick={() => scan.mutate()}>
              <ShieldCheck />
              {t("procurement.compliance.runScan")}
            </Button>
          </div>
        </div>

        <div className="pr-table-wrap overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-4 py-3 text-start">{t("procurement.compliance.vendorEntity")}</th>
                <th className="px-4 py-3 text-center">{t("procurement.compliance.colCr")}</th>
                <th className="px-4 py-3 text-center">{t("procurement.compliance.colTax")}</th>
                <th className="px-4 py-3 text-center">{t("procurement.compliance.colComputer")}</th>
                <th className="px-4 py-3 text-center">{t("procurement.compliance.colContract")}</th>
                <th className="px-4 py-3 text-start">{t("procurement.compliance.score")}</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    {t("common.loading")}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    {t("vendors.list.emptyTitle")}
                  </td>
                </tr>
              ) : (
                filtered.map((vendor) => {
                  const cr = docOk(vendor, /cr|commercial/i);
                  const tax = docOk(vendor, /tax|tin/i);
                  const computer = docOk(vendor, /establishment|computer/i);
                  const contract = docOk(vendor, /contract|master/i);
                  return (
                    <tr key={vendor.id} className="border-b border-border/30 hover:bg-secondary/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{vendor.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("procurement.compliance.entityId", {
                            id: vendor.id.slice(0, 8),
                            status: vendor.compliance_status.toUpperCase(),
                          })}
                        </p>
                      </td>
                      <CellOk ok={cr} />
                      <CellOk ok={tax} />
                      <CellOk ok={computer} />
                      <CellOk ok={contract} />
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                vendor.compliance_score >= 75 ? "bg-emerald-500" : vendor.compliance_score >= 40 ? "bg-amber-500" : "bg-destructive",
                              )}
                              style={{ width: `${vendor.compliance_score}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold tabular-nums">{vendor.compliance_score}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PrModuleShell>
  );
}

function KpiMini({
  label,
  value,
  suffix,
  alert,
}: {
  label: string;
  value: string;
  suffix?: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card px-3 py-2 shadow-elevated-xs">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums", alert && "text-destructive")}>
        {value}
        {suffix ? <span className="ms-1 text-[10px] font-semibold uppercase">{suffix}</span> : null}
      </p>
    </div>
  );
}

function CellOk({ ok }: { ok: boolean }) {
  return (
    <td className="px-4 py-3 text-center">
      <span
        className={cn(
          "inline-grid h-7 w-7 place-items-center rounded-full text-xs font-bold",
          ok ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-destructive/15 text-destructive",
        )}
      >
        {ok ? "✓" : "!"}
      </span>
    </td>
  );
}
