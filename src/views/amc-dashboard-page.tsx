"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { Download, FileSpreadsheet, Plus, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AmcContractCard } from "@/components/amc/amc-contract-card";
import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { DownloadReportButton } from "@/components/reports/download-report-button";
import { Skeleton } from "@/components/ui/skeleton";
import { exportAmcDashboardCsv } from "@/lib/amc.functions";
import { useAmcDashboardSummary, useAmcDashboardContracts } from "@/hooks/queries/useAmcDashboardSummary";
import { useDocumentExpiryKpis } from "@/hooks/queries/useExpiryAlerts";
import { AMC_CATEGORIES, FEC_BRANCH_CODES, translateAmcCategory } from "@/lib/amc/constants";
import { useReportExport } from "@/hooks/use-report-export";
import { useSites } from "@/hooks/queries/useSites";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function KpiCard({ label, value, tint }: { label: string; value: string | number; tint: KpiTint }) {
  return <TintedKpiCard title={label} value={value} tint={tint} compact />;
}

export function AmcDashboardPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const hydrated = useStoreHydrated();
  const { data: sites } = useSites();
  const [locationFilter, setLocationFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [filter, setFilter] = useState<string>("all");
  const [deferLoad, setDeferLoad] = useState(false);

  const branchSites = useMemo(() => {
    const codes = new Set<string>(FEC_BRANCH_CODES);
    return (sites ?? []).filter((s) => codes.has(s.code));
  }, [sites]);

  const selectedSite = branchSites.find((s) => s.id === locationFilter);

  useEffect(() => {
    if (!hydrated) return;
    const schedule = () => setDeferLoad(true);
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(schedule, { timeout: 500 });
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(schedule, 100);
    return () => window.clearTimeout(id);
  }, [hydrated]);

  const filters = useMemo(
    () => ({
      locationId: locationFilter !== "all" ? locationFilter : null,
      search: search || undefined,
      category: category !== "all" ? category : null,
      status: status !== "all" ? status : null,
      activeOnly: filter === "active",
      overdueOnly: filter === "overdue",
      dueThisWeek: filter === "week",
      dueThisMonth: filter === "month",
      expiringSoon: filter === "expiring",
    }),
    [locationFilter, search, category, status, filter],
  );

  const summaryEnabled = hydrated && deferLoad;
  const { data: summary, isLoading: summaryLoading } = useAmcDashboardSummary(filters, {
    enabled: summaryEnabled,
  });
  const { data: contractsData, isLoading: contractsLoading } = useAmcDashboardContracts(filters, {
    enabled: summaryEnabled && summary !== undefined,
  });

  const booting = !hydrated || !deferLoad;
  const k = summary?.kpis;
  const contracts = contractsData?.by_region;

  const { data: docExpiry } = useDocumentExpiryKpis(locationFilter !== "all" ? locationFilter : null, {
    enabled: hydrated && deferLoad,
  });

  const exportMut = useMutation({
    mutationFn: () => exportAmcDashboardCsv(filters),
    onSuccess: (r) => {
      const blob = new Blob([r.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("amc.exported"));
    },
  });

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "AMC_Dashboard",
    title: t("amc.brandTitle"),
    venueLabel: selectedSite ? selectedSite.code : t("amc.portfolio"),
    filters: { location: locationFilter, category, status, filter },
    kpis: k
      ? [
          { label: t("amc.kpis.active"), value: k.total_active },
          { label: t("amc.kpis.totalValue"), value: t("common.currencyAmount", { amount: k.total_value.toLocaleString() }) },
          { label: t("amc.kpis.paid"), value: t("common.currencyAmount", { amount: k.total_paid.toLocaleString() }) },
          { label: t("amc.kpis.outstanding"), value: t("common.currencyAmount", { amount: k.total_outstanding.toLocaleString() }) },
          { label: t("amc.kpis.overdue"), value: k.overdue_contracts ?? 0 },
        ]
      : [],
    columns: [
      { key: "location_code", header: t("amc.columns.site") },
      { key: "category", header: t("amc.columns.service") },
      { key: "vendor_name", header: t("common.vendor") },
      { key: "contract_value", header: t("amc.columns.value"), format: "qar" },
      { key: "paid_amount", header: t("amc.columns.paid"), format: "qar" },
      { key: "status", header: t("common.status") },
    ],
    rows: (contractsData?.contracts ?? []) as Record<string, unknown>[],
  });

  return (
    <div className="space-y-5">
      {!embedded ? (
      <div className="rounded-[var(--radius-xl)] border border-border/80 bg-card px-5 py-4 shadow-elevated-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-[var(--radius)] bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">{t("amc.brandTitle")}</h1>
              <p className="text-xs text-muted-foreground">{t("amc.subtitle")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <DownloadReportButton onPdf={exportPdf} onExcel={exportExcel} />
            <Button variant="secondary" size="sm" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
              <Download className="mr-1 h-4 w-4" />CSV
            </Button>
            <Button size="sm" asChild>
              <Link href="/compliance/amc-contracts/new"><Plus className="mr-1 h-4 w-4" />{t("amc.addContract")}</Link>
            </Button>
          </div>
        </div>
      </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <DownloadReportButton onPdf={exportPdf} onExcel={exportExcel} />
          <Button variant="secondary" size="sm" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
            <Download className="mr-1 h-4 w-4" />CSV
          </Button>
          <Button size="sm" asChild>
            <Link href="/compliance/amc-contracts/new"><Plus className="mr-1 h-4 w-4" />{t("amc.addContract")}</Link>
          </Button>
        </div>
      )}

      {(booting || summaryLoading) ? (
        <KpiSkeletonStrip count={8} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          <KpiCard label={t("amc.kpis.active")} value={k?.total_active ?? "—"} tint="green" />
          <KpiCard label={t("amc.kpis.totalValueQar", { qar: t("common.qar") })} value={k ? k.total_value.toLocaleString() : "—"} tint="sky" />
          <KpiCard label={t("amc.kpis.paidQar", { qar: t("common.qar") })} value={k ? k.total_paid.toLocaleString() : "—"} tint="green" />
          <KpiCard label={t("amc.kpis.outstandingQar", { qar: t("common.qar") })} value={k ? k.total_outstanding.toLocaleString() : "—"} tint="amber" />
          <KpiCard label={t("amc.kpis.nextService")} value={k?.next_service_date ?? "—"} tint="sky" />
          <KpiCard label={t("amc.kpis.overdue")} value={k?.overdue_contracts ?? k?.overdue_services ?? "—"} tint="red" />
          <KpiCard label={t("amc.kpis.certsExpired")} value={docExpiry?.expired ?? "—"} tint="red" />
          <KpiCard label={t("amc.kpis.certs7d")} value={docExpiry?.due_7 ?? "—"} tint="orange" />
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/compliance/documents" className="text-primary hover:underline">{t("amc.documentRegister")}</Link>
        <span className="text-muted-foreground">·</span>
        <Link href="/compliance/expiry-alerts" className="text-primary hover:underline">{t("amc.expiryAlerts")}</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder={t("amc.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-52"><SelectValue placeholder={t("amc.location")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.allLocations")}</SelectItem>
            {branchSites.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t("common.category")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.allCategories")}</SelectItem>
            {AMC_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{translateAmcCategory(t, c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("amc.allStatus")}</SelectItem>
            <SelectItem value="active">{t("amc.status.active")}</SelectItem>
            <SelectItem value="expired">{t("amc.status.expired")}</SelectItem>
            <SelectItem value="pending">{t("amc.status.pending")}</SelectItem>
            <SelectItem value="draft">{t("amc.status.draft")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("amc.quickFilter")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            <SelectItem value="active">{t("amc.activeOnly")}</SelectItem>
            <SelectItem value="overdue">{t("amc.overdueServices")}</SelectItem>
            <SelectItem value="week">{t("amc.dueThisWeek")}</SelectItem>
            <SelectItem value="month">{t("amc.dueThisMonth")}</SelectItem>
            <SelectItem value="expiring">{t("amc.expiring30")}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" asChild>
          <Link href="/compliance/amc-schedule"><FileSpreadsheet className="mr-1 h-4 w-4" />{t("amc.schedule")}</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/compliance/amc-renewals">{t("amc.renewals")}</Link>
        </Button>
      </div>

      {booting || summaryLoading || contractsLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : !contracts?.length ? (
        <p className="text-sm text-muted-foreground">{t("amc.empty")}</p>
      ) : (
        contracts.map((group) => (
          <section key={group.region} className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.region}</h2>
            {group.locations.map((site) => (
              <div key={site.location_id} className="space-y-3 pl-1 border-l-2 border-primary/20">
                <h3 className="text-xs font-semibold tracking-wide text-foreground">
                  <span className="font-mono text-primary">{site.location_code}</span>
                  <span className="mx-1.5 text-muted-foreground">·</span>
                  {site.location_name}
                  <span className="ml-2 font-normal text-muted-foreground">
                    ({t("amc.contractCount", { count: site.contracts.length })})
                  </span>
                </h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {site.contracts.map((c) => (
                    <AmcContractCard key={c.id} contract={c} showSite={false} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

