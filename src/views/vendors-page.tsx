"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutGrid,
  LayoutList,
  MapPin,
  PauseCircle,
  Phone,
  Plus,
  Search,
  Truck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";
import { PageHeader } from "@/components/layout/page-header";
import { VendorCreateDialog } from "@/components/vendors/vendor-create-dialog";
import { VendorDetailDialog } from "@/components/vendors/vendor-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVendors } from "@/hooks/queries/useVendors";
import { fmtQar } from "@/lib/currency";
import type { VendorListRow } from "@/lib/queries/vendors-api.core";
import { cn } from "@/lib/utils";
import { VENDOR_CATEGORIES } from "@/lib/vendors/constants";
import { useAppStore } from "@/stores/app-store";

const PAGE_SIZE = 10;

type Chip = "all" | "active" | "inactive" | "nearExpiry";
type SortKey = "name" | "spend" | "recent";
type ViewMode = "cards" | "list";

function vendorRef(v: VendorListRow) {
  if (v.cr_no) return `CR ${v.cr_no}`;
  if (v.trade_license_no) return v.trade_license_no;
  return v.id.slice(0, 8).toUpperCase();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || "V";
}

function matchesChip(v: VendorListRow, chip: Chip) {
  if (chip === "all") return true;
  if (chip === "nearExpiry") return v.near_expiry;
  if (chip === "inactive") return !v.active || v.status === "inactive";
  return v.active && v.status !== "inactive";
}

function VendorStatusPill({ vendor }: { vendor: VendorListRow }) {
  const { t } = useTranslation();
  if (vendor.near_expiry) {
    return <Badge variant="warning">{t("vendors.status.nearExpiry")}</Badge>;
  }
  if (!vendor.active || vendor.status === "inactive") {
    return <Badge variant="muted">{t("vendors.status.inactive")}</Badge>;
  }
  if (vendor.amc_status) {
    return <Badge variant="success">{vendor.amc_status}</Badge>;
  }
  return <Badge variant="success">{t("vendors.status.active")}</Badge>;
}

function EmptyList() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
        <Truck className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">{t("vendors.list.emptyTitle")}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{t("vendors.list.emptyHint")}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function VendorCard({ vendor, onView }: { vendor: VendorListRow; onView: () => void }) {
  const { t } = useTranslation();
  const location = vendor.address || vendor.location_names[0] || null;
  const category = t(`vendors.category.${vendor.category}`, { defaultValue: vendor.service_category || vendor.category });

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-elevated-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
          {initials(vendor.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{vendor.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {vendorRef(vendor)} · {category}
              </p>
            </div>
            <VendorStatusPill vendor={vendor} />
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t("vendors.metrics.activePrs")} value={String(vendor.active_pr_count)} />
        <Metric
          label={t("vendors.metrics.totalSpend")}
          value={vendor.total_spend > 0 ? fmtQar(vendor.total_spend) : "—"}
        />
        <Metric label={t("vendors.metrics.amc")} value={vendor.amc_status || "—"} />
        <Metric label={t("vendors.metrics.paymentTerms")} value={vendor.payment_terms || "—"} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {location ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{location}</span>
            </span>
          ) : null}
          {vendor.phone || vendor.contact_person || vendor.email ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{vendor.phone || vendor.contact_person || vendor.email}</span>
            </span>
          ) : null}
        </div>
        <Button size="sm" variant="ghost" className="text-primary" onClick={onView}>
          {t("vendors.list.view")}
        </Button>
      </div>
    </div>
  );
}

export default function VendorsPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [category, setCategory] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<ViewMode>("cards");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const list = useVendors({
    locationId: locationId ?? null,
    includeInactive: true,
    page: 1,
    pageSize: 200,
  });
  const vendors = list.data?.items;

  const baseRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (vendors ?? []).filter((v) => {
      if (category !== "all" && v.category !== category) return false;
      if (!q) return true;
      const hay = [
        v.name,
        v.category,
        v.service_category,
        v.contact_person,
        v.phone,
        v.email,
        v.cr_no,
        v.trade_license_no,
        v.address,
        vendorRef(v),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [vendors, search, category]);

  const chipCounts = useMemo(() => {
    const counts = { all: baseRows.length, active: 0, inactive: 0, nearExpiry: 0 };
    for (const row of baseRows) {
      if (matchesChip(row, "active")) counts.active += 1;
      if (matchesChip(row, "inactive")) counts.inactive += 1;
      if (row.near_expiry) counts.nearExpiry += 1;
    }
    return counts;
  }, [baseRows]);

  const sorted = useMemo(() => {
    const next = baseRows.filter((row) => matchesChip(row, chip));
    next.sort((a, b) => {
      if (sortKey === "spend") return b.total_spend - a.total_spend;
      if (sortKey === "recent") return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      return a.name.localeCompare(b.name);
    });
    return next;
  }, [baseRows, chip, sortKey]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const filterActive = category !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("vendors.pageTitle")}
        subtitle={t("vendors.pageSubtitle")}
        actions={
          <CapabilityGate capability="vendors.manage">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus />
              {t("vendors.newVendor")}
            </Button>
          </CapabilityGate>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <TintedKpiCard
          title={t("vendors.chip.all")}
          value={chipCounts.all}
          icon={Truck}
          tint="sky"
        />
        <TintedKpiCard
          title={t("vendors.chip.active")}
          value={chipCounts.active}
          icon={CheckCircle2}
          tint="green"
        />
        <TintedKpiCard
          title={t("vendors.chip.inactive")}
          value={chipCounts.inactive}
          icon={PauseCircle}
          tint="slate"
        />
        <TintedKpiCard
          title={t("vendors.chip.nearExpiry")}
          value={chipCounts.nearExpiry}
          icon={AlertTriangle}
          tint="orange"
        />
      </div>

      <Tabs
        value={chip}
        onValueChange={(v) => {
          setChip(v as Chip);
          setPage(1);
        }}
      >
        <TabsList>
          {(
            [
              ["all", chipCounts.all],
              ["active", chipCounts.active],
              ["inactive", chipCounts.inactive],
              ["nearExpiry", chipCounts.nearExpiry],
            ] as const
          ).map(([key, count]) => (
            <TabsTrigger key={key} value={key}>
              {t(`vendors.chip.${key}`)} ({count})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("vendors.searchPlaceholder")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn(filterActive && "border-primary/40")}>
                <Filter />
                {t("vendors.filtersButton")}
                <ChevronDown className="opacity-70" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <div className="space-y-1.5">
                <Label>{t("vendors.filters.category")}</Label>
                <Select
                  value={category}
                  onValueChange={(v) => {
                    setCategory(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("vendors.filters.all")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("vendors.filters.all")}</SelectItem>
                    {VENDOR_CATEGORIES.map((key) => (
                      <SelectItem key={key} value={key}>
                        {t(`vendors.category.${key}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setCategory("all");
                  setPage(1);
                }}
              >
                {t("vendors.filters.clear")}
              </Button>
            </PopoverContent>
          </Popover>
          <Select
            value={sortKey}
            onValueChange={(v) => {
              setSortKey(v as SortKey);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[11.5rem]" aria-label={t("vendors.sortBy")}>
              <SelectValue placeholder={t("vendors.sortBy")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{t("vendors.sort.name")}</SelectItem>
              <SelectItem value="spend">{t("vendors.sort.spend")}</SelectItem>
              <SelectItem value="recent">{t("vendors.sort.recent")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="inline-flex rounded-full border border-border/60 bg-card p-1">
            <Button
              type="button"
              size="icon"
              variant={view === "list" ? "default" : "ghost"}
              className="h-9 w-9"
              onClick={() => setView("list")}
              aria-label={t("vendors.viewList")}
            >
              <LayoutList />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={view === "cards" ? "default" : "ghost"}
              className="h-9 w-9"
              onClick={() => setView("cards")}
              aria-label={t("vendors.viewCards")}
            >
              <LayoutGrid />
            </Button>
          </div>
        </div>
      </div>

      {view === "cards" ? (
        list.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted/70" />
            ))}
          </div>
        ) : pageRows.length === 0 ? (
          <div className="rounded-2xl border border-border/40 bg-card shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <EmptyList />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pageRows.map((vendor) => (
              <VendorCard key={vendor.id} vendor={vendor} onView={() => setDetailId(vendor.id)} />
            ))}
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/40 bg-card shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("vendors.list.vendor")}</TableHead>
                <TableHead>{t("vendors.list.status")}</TableHead>
                <TableHead>{t("vendors.list.contact")}</TableHead>
                <TableHead>{t("vendors.metrics.activePrs")}</TableHead>
                <TableHead>{t("vendors.list.spend")}</TableHead>
                <TableHead className="text-end">{t("vendors.list.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6}>
                    <EmptyList />
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((vendor) => (
                  <TableRow key={vendor.id} className="hover:bg-secondary/50">
                    <TableCell>
                      <p className="font-semibold text-foreground">{vendor.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          vendorRef(vendor),
                          t(`vendors.category.${vendor.category}`, {
                            defaultValue: vendor.service_category || vendor.category,
                          }),
                        ].join(" · ")}
                      </p>
                    </TableCell>
                    <TableCell>
                      <VendorStatusPill vendor={vendor} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {vendor.contact_person || vendor.phone || vendor.email || "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{vendor.active_pr_count}</TableCell>
                    <TableCell className="font-bold tabular-nums">
                      {vendor.total_spend > 0 ? fmtQar(vendor.total_spend) : "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-primary"
                        onClick={() => setDetailId(vendor.id)}
                      >
                        {t("vendors.list.view")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>{t("vendors.list.page", { page: safePage, pages: pageCount })}</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft />
            {t("vendors.list.prev")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            {t("vendors.list.next")}
            <ChevronRight />
          </Button>
        </div>
      </div>

      <VendorCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <VendorDetailDialog vendorId={detailId} onOpenChange={(open) => !open && setDetailId(null)} />
    </div>
  );
}
