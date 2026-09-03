"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  Filter,
  Hourglass,
  LayoutGrid,
  LayoutList,
  Plus,
  Search,
  ShoppingCart,
} from "lucide-react";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { PrKpiStrip } from "@/components/procurement/pr-kpi-cards";
import {
  PrRowActions,
  usePrActions,
  type PrActionTarget,
} from "@/components/procurement/pr-row-actions";
import { PrStatusPill } from "@/components/procurement/pr-status-pill";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
import { fmtNumber } from "@/lib/currency";
import {
  isActiveWorkStatus,
  isApprovedStatus,
  isPendingStatus,
  statusBucket,
} from "@/lib/procurement/dashboard";
import { reviseRequisitionPath } from "@/lib/procurement/display";
import { listPurchaseRequisitions } from "@/lib/procurement.functions";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

const PAGE_SIZE = 10;

type SortKey = "number" | "title" | "status" | "amount" | "date";
type SortDir = "asc" | "desc";
type StatusChip = "all" | "pending" | "approved" | "rejected";
type ViewMode = "list" | "cards";

type PrListRow = {
  id: string;
  pr_number: string | null;
  requested_at: string | null;
  requester_name: string;
  department_name: string;
  location_name: string;
  vendor_name: string | null;
  project_name: string | null;
  title?: string | null;
  event_id?: string | null;
  event_label?: string | null;
  purpose: string;
  total_amount: number;
  status: string;
  current_step_role: string | null;
  required_by: string | null;
  priority?: string | null;
  canAct?: boolean;
  canEdit?: boolean;
  canReissue?: boolean;
  isOwner?: boolean;
  over_budget?: boolean;
  excess_amount?: number;
  budget_increase_pending?: boolean;
};

function toActionTarget(row: PrListRow): PrActionTarget {
  return {
    id: row.id,
    prNumber: row.pr_number ?? "",
    title: prTitle(row) || row.pr_number || "",
    amount: row.total_amount,
    requester: row.requester_name,
    department: row.department_name,
    canAct: Boolean(row.canAct),
    canReissue: Boolean(row.canReissue),
    isOwner: Boolean(row.isOwner),
    overBudget: Boolean(row.over_budget),
    excessAmount: Number(row.excess_amount || 0),
    budgetIncreasePending: Boolean(row.budget_increase_pending),
    currentStepRole: row.current_step_role,
  };
}

function prTitle(row: PrListRow): string {
  const titled = (row as { title?: string | null }).title?.trim();
  if (titled) return titled;
  const project = row.project_name?.trim();
  if (project) return project;
  const purpose = row.purpose?.trim();
  if (purpose) return purpose.split(/[.\n]/)[0]?.trim() || purpose;
  return row.pr_number ?? "";
}

function matchesChip(status: string, chip: StatusChip): boolean {
  if (chip === "all") return true;
  return statusBucket(status) === chip;
}

function exportCsv(rows: PrListRow[], filename: string) {
  const header = ["Request #", "Title", "Requester", "Department", "Vendor", "Project", "Status", "Amount", "Date"];
  const body = rows.map((row) =>
    [
      row.pr_number ?? "Draft",
      prTitle(row),
      row.requester_name,
      row.department_name,
      row.vendor_name ?? "",
      row.project_name ?? "",
      row.status,
      String(row.total_amount ?? 0),
      row.requested_at ?? "",
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
  );
  const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProcurementRequisitionsPage(props: {
  mine?: boolean;
  pendingMine?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <ProcurementRequisitionsInner {...props} />
    </Suspense>
  );
}

function ProcurementRequisitionsInner({
  mine = false,
  pendingMine = false,
}: {
  mine?: boolean;
  pendingMine?: boolean;
}) {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const eventId = searchParams.get("eventId");

  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<StatusChip>("all");
  const [department, setDepartment] = useState("all");
  const [vendor, setVendor] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ViewMode>("list");
  const actions = usePrActions();

  const filters = useMemo(
    () => ({
      locationId,
      mine,
      pendingMine,
      eventId: eventId || null,
    }),
    [locationId, mine, pendingMine, eventId],
  );

  const list = useQuery({
    queryKey: queryKeys.procurement.list(filters),
    queryFn: () => listPurchaseRequisitions(filters),
  });

  const rows = useMemo(() => (list.data ?? []) as PrListRow[], [list.data]);

  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department_name).filter((n) => n && n !== "—"))].sort(),
    [rows],
  );
  const vendors = useMemo(
    () => [...new Set(rows.map((r) => r.vendor_name).filter((n): n is string => Boolean(n)))].sort(),
    [rows],
  );

  const advancedActive =
    department !== "all" || vendor !== "all" || Boolean(dateFrom || dateTo || minAmount || maxAmount);

  const baseRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = minAmount ? Number(minAmount) : null;
    const max = maxAmount ? Number(maxAmount) : null;
    return rows.filter((row) => {
      if (department !== "all" && row.department_name !== department) return false;
      if (vendor !== "all" && row.vendor_name !== vendor) return false;
      if (dateFrom && (row.requested_at ?? "") < dateFrom) return false;
      if (dateTo && (row.requested_at ?? "") > dateTo) return false;
      if (min != null && !Number.isNaN(min) && row.total_amount < min) return false;
      if (max != null && !Number.isNaN(max) && row.total_amount > max) return false;
      if (!q) return true;
      const hay = [
        row.pr_number,
        prTitle(row),
        row.purpose,
        row.vendor_name,
        row.department_name,
        row.requester_name,
        row.project_name,
        row.location_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, department, vendor, dateFrom, dateTo, minAmount, maxAmount]);

  const kpis = useMemo(() => {
    let approvedAmount = 0;
    let approvedCount = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    let activeCount = 0;
    let awaitingCount = 0;
    for (const row of baseRows) {
      if (isApprovedStatus(row.status)) {
        approvedAmount += row.total_amount;
        approvedCount += 1;
      }
      if (isPendingStatus(row.status)) {
        pendingAmount += row.total_amount;
        pendingCount += 1;
        awaitingCount += 1;
      }
      if (isActiveWorkStatus(row.status)) activeCount += 1;
    }
    return { approvedAmount, approvedCount, pendingAmount, pendingCount, activeCount, awaitingCount };
  }, [baseRows]);

  const chipCounts = useMemo(() => {
    const counts = { all: baseRows.length, pending: 0, approved: 0, rejected: 0 };
    for (const row of baseRows) {
      const bucket = statusBucket(row.status);
      if (bucket !== "other") counts[bucket] += 1;
    }
    return counts;
  }, [baseRows]);

  const sorted = useMemo(() => {
    const next = baseRows.filter((row) => matchesChip(row.status, chip));
    const dir = sortDir === "asc" ? 1 : -1;
    next.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "amount") cmp = a.total_amount - b.total_amount;
      else if (sortKey === "date") cmp = (a.requested_at ?? "").localeCompare(b.requested_at ?? "");
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else if (sortKey === "number") cmp = (a.pr_number ?? "").localeCompare(b.pr_number ?? "");
      else cmp = prTitle(a).localeCompare(prTitle(b));
      return cmp * dir;
    });
    return next;
  }, [baseRows, chip, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const allPageSelected = pageRows.length > 0 && pageRows.every((row) => selected.has(row.id));

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "title" || key === "number" ? "asc" : "desc");
    }
  }

  function toggleAllPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageRows.forEach((row) => next.delete(row.id));
      else pageRows.forEach((row) => next.add(row.id));
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExport() {
    const chosen = selected.size ? sorted.filter((row) => selected.has(row.id)) : sorted;
    if (!chosen.length) {
      toast.message(t("procurement.exportEmpty"));
      return;
    }
    exportCsv(chosen, "purchase-requests.csv");
  }

  async function copyNumber(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("procurement.list.copied"));
    } catch {
      toast.error(t("procurement.list.copyFailed"));
    }
  }

  function clearFilters() {
    setDepartment("all");
    setVendor("all");
    setDateFrom("");
    setDateTo("");
    setMinAmount("");
    setMaxAmount("");
    setPage(1);
  }

  const queueHref = eventId ? `/procurement/approvals?eventId=${eventId}` : "/procurement/approvals";
  const allHref = eventId ? `/procurement/requisitions?eventId=${eventId}` : "/procurement/requisitions";
  const allActive = !mine && !pendingMine && pathname.startsWith("/procurement/requisitions");
  const queueActive = pendingMine;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("procurement.pageTitle")}
        subtitle={t("procurement.pageSubtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-border/60 bg-card p-1 shadow-elevated-xs">
              <Button
                asChild
                size="sm"
                variant={allActive ? "default" : "ghost"}
                className={cn(!allActive && "text-foreground/80")}
              >
                <Link href={allHref}>{t("procurement.allPrs")}</Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant={queueActive ? "default" : "ghost"}
                className={cn(!queueActive && "text-foreground/80")}
              >
                <Link href={queueHref}>
                  <Hourglass />
                  {t("procurement.myQueue")}
                </Link>
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={handleExport}
            >
              <Download />
              {t("procurement.export")}
            </Button>
            <CapabilityGate capability="procurement.create">
              <Button size="sm" asChild>
                <Link href={eventId ? `/procurement/requisitions/new?eventId=${eventId}` : "/procurement/requisitions/new"}>
                  <Plus />
                  {t("procurement.newRequest")}
                </Link>
              </Button>
            </CapabilityGate>
          </div>
        }
      />

      <PrKpiStrip values={kpis} loading={list.isLoading} />

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
            placeholder={t("procurement.searchPlaceholder")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", chipCounts.all],
              ["pending", chipCounts.pending],
              ["approved", chipCounts.approved],
              ["rejected", chipCounts.rejected],
            ] as const
          ).map(([key, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setChip(key);
                setPage(1);
              }}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
                chip === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/70 bg-card text-muted-foreground hover:bg-secondary",
              )}
            >
              {t(`procurement.statusChip.${key}`)} ({count})
            </button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn(advancedActive && "border-primary/40")}>
                <Filter />
                {t("procurement.filtersButton")}
                <ChevronDown className="opacity-70" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3">
              <div className="space-y-1.5">
                <Label>{t("procurement.filters.department")}</Label>
                <Select
                  value={department}
                  onValueChange={(v) => {
                    setDepartment(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("procurement.filters.all")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("procurement.filters.all")}</SelectItem>
                    {departments.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("procurement.filters.vendor")}</Label>
                <Select
                  value={vendor}
                  onValueChange={(v) => {
                    setVendor(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("procurement.filters.all")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("procurement.filters.all")}</SelectItem>
                    {vendors.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>{t("procurement.filters.from")}</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("procurement.filters.to")}</Label>
                  <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>{t("procurement.filters.minAmount")}</Label>
                  <Input type="number" min={0} value={minAmount} onChange={(e) => { setMinAmount(e.target.value); setPage(1); }} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("procurement.filters.maxAmount")}</Label>
                  <Input type="number" min={0} value={maxAmount} onChange={(e) => { setMaxAmount(e.target.value); setPage(1); }} />
                </div>
              </div>
              <Button variant="ghost" size="sm" className="w-full" onClick={clearFilters}>
                {t("procurement.filters.clear")}
              </Button>
            </PopoverContent>
          </Popover>
          <div className="inline-flex rounded-full border border-border/60 bg-card p-1">
            <Button
              type="button"
              size="icon"
              variant={view === "list" ? "default" : "ghost"}
              className="h-9 w-9"
              onClick={() => setView("list")}
              aria-label={t("procurement.viewList")}
            >
              <LayoutList />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={view === "cards" ? "default" : "ghost"}
              className="h-9 w-9"
              onClick={() => setView("cards")}
              aria-label={t("procurement.viewCards")}
            >
              <LayoutGrid />
            </Button>
          </div>
        </div>
      </div>

      {view === "cards" ? (
        <PrCardGrid
          rows={pageRows}
          empty={!list.isLoading && sorted.length === 0}
          loading={list.isLoading}
          pending={actions.pending}
          onApprove={(row) => actions.open("approve", toActionTarget(row))}
          onReject={(row) => actions.open("reject", toActionTarget(row))}
          onReturn={(row) => actions.open("return", toActionTarget(row))}
          onReissue={(row) => actions.reissue(toActionTarget(row))}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/40 bg-card shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={toggleAllPage}
                    aria-label={t("procurement.list.selectAll")}
                  />
                </TableHead>
                <SortableHead
                  label={t("procurement.list.requestNumber")}
                  active={sortKey === "number"}
                  dir={sortDir}
                  onClick={() => toggleSort("number")}
                />
                <SortableHead
                  label={t("procurement.list.titleRequester")}
                  active={sortKey === "title"}
                  dir={sortDir}
                  onClick={() => toggleSort("title")}
                />
                <SortableHead
                  label={t("procurement.list.status")}
                  active={sortKey === "status"}
                  dir={sortDir}
                  onClick={() => toggleSort("status")}
                />
                <SortableHead
                  label={t("procurement.list.amount")}
                  active={sortKey === "amount"}
                  dir={sortDir}
                  onClick={() => toggleSort("amount")}
                />
                <TableHead className="text-end">{t("procurement.list.actions")}</TableHead>
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
                pageRows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-secondary/50">
                    <TableCell>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={() => toggleRow(row.id)}
                        aria-label={row.pr_number ?? row.id}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex max-w-[16rem] truncate rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        {row.pr_number ?? t("procurement.list.draftNumber")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold text-foreground">{prTitle(row) || t("procurement.list.untitled")}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          [row.requester_name, row.department_name].filter(Boolean).join(" • "),
                          row.vendor_name ?? t("procurement.dashboard.noVendor"),
                          row.project_name || row.location_name,
                        ]
                          .filter(Boolean)
                          .join(" | ")}
                      </p>
                      {row.event_id ? (
                        <Link
                          href={`/events/${row.event_id}`}
                          className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          {row.event_label || t("procurement.event.openWorkspace")}
                        </Link>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <PrStatusPill status={row.status} />
                    </TableCell>
                    <TableCell className="font-bold tabular-nums">
                      {fmtNumber(row.total_amount)} QAR
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {isApprovedStatus(row.status) ? (
                          <Badge variant="success">{t("procurement.list.fullyApproved")}</Badge>
                        ) : null}
                        <PrRowActions
                          href={`/procurement/requisitions/${row.id}`}
                          reviseHref={reviseRequisitionPath(row.id)}
                          canAct={row.canAct}
                          canEdit={row.canEdit}
                          canReissue={row.canReissue}
                          pending={actions.pending}
                          onApprove={() => actions.open("approve", toActionTarget(row))}
                          onReject={() => actions.open("reject", toActionTarget(row))}
                          onReturn={() => actions.open("return", toActionTarget(row))}
                          onReissue={() => actions.reissue(toActionTarget(row))}
                          extraMenu={
                            <>
                              {row.pr_number ? (
                                <DropdownMenuItem onClick={() => copyNumber(row.pr_number!)}>
                                  <Copy />
                                  {t("procurement.list.copyNumber")}
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem onClick={() => exportCsv([row], `${row.pr_number ?? row.id}.csv`)}>
                                <FileSpreadsheet />
                                {t("procurement.export")}
                              </DropdownMenuItem>
                            </>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>
          {selected.size
            ? t("procurement.list.selected", { n: selected.size })
            : t("procurement.list.page", { page: safePage, pages: pageCount })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft />
            {t("procurement.list.prev")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            {t("procurement.list.next")}
            <ChevronRight />
          </Button>
        </div>
      </div>
      {actions.dialogs}
    </div>
  );
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 uppercase tracking-[0.06em] hover:text-foreground"
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", active ? "text-foreground" : "opacity-50")} />
      </button>
    </TableHead>
  );
}

function EmptyList() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
        <ShoppingCart className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">{t("procurement.list.emptyTitle")}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{t("procurement.list.emptyHint")}</p>
    </div>
  );
}

function PrCardGrid({
  rows,
  empty,
  loading,
  pending,
  onApprove,
  onReject,
  onReturn,
  onReissue,
}: {
  rows: PrListRow[];
  empty: boolean;
  loading: boolean;
  pending: boolean;
  onApprove: (row: PrListRow) => void;
  onReject: (row: PrListRow) => void;
  onReturn: (row: PrListRow) => void;
  onReissue: (row: PrListRow) => void;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted/70" />
        ))}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <EmptyList />
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((row) => (
        <div
          key={row.id}
          className="rounded-2xl border border-border/40 bg-card p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-elevated-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{prTitle(row) || t("procurement.list.untitled")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {(row.pr_number ?? t("procurement.list.draftNumber"))} • {row.department_name}
              </p>
              {row.event_id ? (
                <Link
                  href={`/events/${row.event_id}`}
                  className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                >
                  {row.event_label || t("procurement.event.openWorkspace")}
                </Link>
              ) : null}
            </div>
            <PrStatusPill status={row.status} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("procurement.list.requester")}
              </p>
              <p className="mt-0.5 font-medium">{row.requester_name}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("procurement.list.amount")}
              </p>
              <p className="mt-0.5 font-bold tabular-nums">{fmtNumber(row.total_amount)} QAR</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("procurement.dashboard.vendor")}
              </p>
              <p className="mt-0.5">{row.vendor_name ?? t("procurement.dashboard.noVendor")}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("procurement.list.required")}
              </p>
              <p className="mt-0.5">{row.required_by ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
            {isApprovedStatus(row.status) ? (
              <Badge variant="success">{t("procurement.list.fullyApproved")}</Badge>
            ) : (
              <span />
            )}
            <PrRowActions
              href={`/procurement/requisitions/${row.id}`}
              reviseHref={reviseRequisitionPath(row.id)}
              canAct={row.canAct}
              canEdit={row.canEdit}
              canReissue={row.canReissue}
              pending={pending}
              onApprove={() => onApprove(row)}
              onReject={() => onReject(row)}
              onReturn={() => onReturn(row)}
              onReissue={() => onReissue(row)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
