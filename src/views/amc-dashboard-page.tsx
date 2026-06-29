"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { Download, FileSpreadsheet, Plus, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";

import { AmcContractCard } from "@/components/amc/amc-contract-card";
import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { DownloadReportButton } from "@/components/reports/download-report-button";
import { Skeleton } from "@/components/ui/skeleton";
import { exportAmcDashboardCsv } from "@/lib/amc.functions";
import { useAmcDashboardSummary, useAmcDashboardContracts } from "@/hooks/queries/useAmcDashboardSummary";
import { useDocumentExpiryKpis } from "@/hooks/queries/useExpiryAlerts";
import { AMC_CATEGORIES, AMC_CATEGORY_LABELS, FEC_BRANCH_CODES } from "@/lib/amc/constants";
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

function KpiCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

export function AmcDashboardPage({ embedded = false }: { embedded?: boolean }) {
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
      toast.success("Exported CSV");
    },
  });

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "AMC_Dashboard",
    title: "Events & Entertainment Enterprises — AMC Dashboard",
    venueLabel: selectedSite ? selectedSite.code : "Portfolio",
    filters: { location: locationFilter, category, status, filter },
    kpis: k
      ? [
          { label: "Active", value: k.total_active },
          { label: "Total value", value: `QAR ${k.total_value.toLocaleString()}` },
          { label: "Paid", value: `QAR ${k.total_paid.toLocaleString()}` },
          { label: "Outstanding", value: `QAR ${k.total_outstanding.toLocaleString()}` },
          { label: "Overdue", value: k.overdue_contracts ?? 0 },
        ]
      : [],
    columns: [
      { key: "location_code", header: "Site" },
      { key: "category", header: "Service" },
      { key: "vendor_name", header: "Vendor" },
      { key: "contract_value", header: "Value", format: "qar" },
      { key: "paid_amount", header: "Paid", format: "qar" },
      { key: "status", header: "Status" },
    ],
    rows: (contractsData?.contracts ?? []) as Record<string, unknown>[],
  });

  return (
    <div className="space-y-5">
      {!embedded ? (
      <div className="rounded-[28px] border border-white/80 bg-white/90 px-5 py-4 shadow-[0_8px_32px_rgba(99,102,241,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#8B5CF6] to-[#3B82F6] text-white shadow-lg">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[#111827]">Events & Entertainment Enterprises — AMC Dashboard</h1>
              <p className="text-xs text-[#9CA3AF]">Site-wise contracts, payment tracker, service visits & renewals</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <DownloadReportButton onPdf={exportPdf} onExcel={exportExcel} />
            <Button variant="secondary" size="sm" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
              <Download className="mr-1 h-4 w-4" />CSV
            </Button>
            <Button size="sm" asChild>
              <Link href="/compliance/amc-contracts/new"><Plus className="mr-1 h-4 w-4" />Add contract</Link>
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
            <Link href="/compliance/amc-contracts/new"><Plus className="mr-1 h-4 w-4" />Add contract</Link>
          </Button>
        </div>
      )}

      {(booting || summaryLoading) ? (
        <KpiSkeletonStrip count={8} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          <KpiCard label="Active" value={k?.total_active ?? "—"} />
          <KpiCard label="Total value (QAR)" value={k ? k.total_value.toLocaleString() : "—"} />
          <KpiCard label="Paid (QAR)" value={k ? k.total_paid.toLocaleString() : "—"} tone="text-emerald-400" />
          <KpiCard label="Outstanding (QAR)" value={k ? k.total_outstanding.toLocaleString() : "—"} tone="text-amber-400" />
          <KpiCard label="Next service" value={k?.next_service_date ?? "—"} />
          <KpiCard label="Overdue" value={k?.overdue_contracts ?? k?.overdue_services ?? "—"} tone="rag-red" />
          <KpiCard label="Certs expired" value={docExpiry?.expired ?? "—"} tone="text-rose-400" />
          <KpiCard label="Certs ≤7d" value={docExpiry?.due_7 ?? "—"} tone="text-orange-400" />
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/compliance/documents" className="text-primary hover:underline">Document register</Link>
        <span className="text-muted-foreground">·</span>
        <Link href="/compliance/expiry-alerts" className="text-primary hover:underline">Expiry alerts</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search vendor, category…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Location" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {branchSites.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {AMC_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{AMC_CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Quick filter" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="overdue">Overdue services</SelectItem>
            <SelectItem value="week">Due this week</SelectItem>
            <SelectItem value="month">Due this month</SelectItem>
            <SelectItem value="expiring">Expiring 30d</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" asChild>
          <Link href="/compliance/amc-schedule"><FileSpreadsheet className="mr-1 h-4 w-4" />Schedule</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/compliance/amc-renewals">Renewals</Link>
        </Button>
      </div>

      {booting || summaryLoading || contractsLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : !contracts?.length ? (
        <p className="text-sm text-muted-foreground">No AMC contracts in scope. Add a contract to get started.</p>
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
                    ({site.contracts.length} contract{site.contracts.length === 1 ? "" : "s"})
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

