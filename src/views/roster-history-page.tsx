"use client";

/* Hallmark · redesign · Monthly Roster Change History · studied-DNA (mockup)
 * macrostructure: Stat-Led · tone: utilitarian soft-glass HR · design-system: FEC People/HR
 * theme: studied-DNA (source: image) · paper light · accent #7c3aed · grotesk-sans
 * designed-as-app · preserve: listMonthlyRosterHistory, CapabilityGate, reason column
 */

import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock3,
  Download,
  Eye,
  History,
  MapPin,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSites } from "@/hooks/queries/useSites";
import {
  listMonthlyRosterHistory,
  type RosterHistoryRow,
} from "@/lib/attendance-hr/roster-history.functions";
import { defaultPayrollPeriod, formatPayrollRange, monthBounds } from "@/lib/attendance-hr/roster-period";
import { formatLocationRecord } from "@/lib/locations/normalize";
import { QUERY_DEFAULTS } from "@/lib/query-client";
import { downloadCsvContent } from "@/lib/staff-import";
import { cn } from "@/lib/utils";

type UiChangeType = "amendment" | "upload" | "bulk_delete";
type DetailChangeKind = "added" | "modified" | "removed" | "info";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function uiChangeType(row: RosterHistoryRow): UiChangeType {
  if (row.action === "roster.bulk_delete") return "bulk_delete";
  if (row.action === "roster.upload" || row.changeKind === "first_plan" || row.changeKind === "reupload") {
    return "upload";
  }
  return "amendment";
}

function changeTypeLabel(type: UiChangeType, t: (key: string) => string): string {
  if (type === "upload") return t("people.rosterHistory.kindUploadBulk");
  if (type === "bulk_delete") return t("people.rosterHistory.kindBulkDelete");
  return t("people.rosterHistory.kindAmendment");
}

function changeTypeIcon(type: UiChangeType): LucideIcon {
  if (type === "upload") return Upload;
  if (type === "bulk_delete") return Trash2;
  return Pencil;
}

function changeTypeBadgeClass(type: UiChangeType): string {
  if (type === "upload") return "bg-sky-50 text-sky-800 ring-sky-200";
  if (type === "bulk_delete") return "bg-rose-50 text-rose-800 ring-rose-200";
  return "bg-amber-50 text-amber-900 ring-amber-200";
}

function impactLabel(row: RosterHistoryRow, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const after = asRecord(row.after);
  const before = asRecord(row.before);
  if (row.action === "roster.upload") {
    const n = Number(after?.imported ?? after?.rowCount ?? 0);
    if (Number.isFinite(n) && n > 0) return t("people.rosterHistory.impactRecords", { count: n });
  }
  if (row.action === "roster.bulk_delete") {
    const n = Number(after?.deleted ?? 0);
    if (Number.isFinite(n) && n > 0) return t("people.rosterHistory.impactRecords", { count: n });
  }
  if (row.action === "roster.pattern_apply") {
    const n = Number(after?.created ?? 0) + Number(after?.updated ?? 0);
    if (Number.isFinite(n) && n > 0) return t("people.rosterHistory.impactRecords", { count: n });
  }
  if (row.staffId || row.staffName) {
    return t("people.rosterHistory.impactEmployees", { count: 1 });
  }
  if (before || after) return t("people.rosterHistory.impactEmployees", { count: 1 });
  return "—";
}

function formatDateTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatWorkDate(ymd: string | null, locale: string): string {
  if (!ymd) return "—";
  try {
    return new Date(`${ymd}T12:00:00`).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
}

function formatRosterSnap(
  snap: Record<string, unknown> | null,
  t: (key: string) => string,
): string {
  if (!snap) return "—";
  const dayStatus = snap.dayStatus ? String(snap.dayStatus) : null;
  const weekOff = Boolean(snap.isWeekOff) || dayStatus === "weekly_off";
  if (weekOff) return t("people.rosterHistory.rosterOff");
  if (dayStatus && dayStatus !== "on_duty") {
    return dayStatus.replace(/_/g, " ");
  }
  const start = snap.shiftStart ? String(snap.shiftStart).slice(0, 5) : null;
  const end = snap.shiftEnd ? String(snap.shiftEnd).slice(0, 5) : null;
  if (start && end) {
    const source = snap.source ? String(snap.source) : null;
    const label =
      source === "upload"
        ? t("people.rosterHistory.shiftGeneral")
        : source
          ? source.replace(/_/g, " ")
          : t("people.rosterHistory.shiftDuty");
    return `${start} - ${end} (${label})`;
  }
  return "—";
}

function detailChangeKind(row: RosterHistoryRow): DetailChangeKind {
  if (row.action === "roster.create") return "added";
  if (row.action === "roster.delete" || row.action === "roster.bulk_delete") return "removed";
  if (row.action === "roster.update" || row.action === "roster.pattern_apply") return "modified";
  if (row.action === "roster.upload") return "added";
  return "info";
}

function detailChangeLabel(kind: DetailChangeKind, t: (key: string) => string): string {
  if (kind === "added") return t("people.rosterHistory.changeAdded");
  if (kind === "removed") return t("people.rosterHistory.changeRemoved");
  if (kind === "modified") return t("people.rosterHistory.changeModified");
  return t("people.rosterHistory.changeInfo");
}

function detailChangeBadgeClass(kind: DetailChangeKind): string {
  if (kind === "added") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (kind === "removed") return "bg-rose-50 text-rose-800 ring-rose-200";
  if (kind === "modified") return "bg-amber-50 text-amber-900 ring-amber-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
}

function changeIdFor(row: RosterHistoryRow): string {
  const d = row.createdAt.slice(0, 10).replace(/-/g, "");
  const short = row.id.replace(/-/g, "").slice(0, 3).toUpperCase();
  return `RCH-${d}-${short}`;
}

function payloadCount(row: RosterHistoryRow, key: "imported" | "rowCount" | "deleted" | "created" | "updated"): number {
  const after = asRecord(row.after);
  const n = Number(after?.[key] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function KpiCard({
  title,
  value,
  icon: Icon,
  iconClass,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  iconClass: string;
}) {
  return (
    <article className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums text-foreground">{value}</p>
        </div>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", iconClass)}>
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
    </article>
  );
}

function ChangeTypeBadge({ type, label }: { type: UiChangeType; label: string }) {
  const Icon = changeTypeIcon(type);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        changeTypeBadgeClass(type),
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}

export default function RosterHistoryPage() {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultMonth = defaultPayrollPeriod(today).month;
  const [month, setMonth] = useState(defaultMonth);
  const [locationId, setLocationId] = useState("");
  const [changeType, setChangeType] = useState<string>("");
  const [changedBy, setChangedBy] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"roster" | "summary">("roster");
  const { data: sites = [] } = useSites();

  const range = useMemo(() => {
    const { dateFrom, dateTo } = monthBounds(month);
    return formatPayrollRange(dateFrom, dateTo, i18n.language);
  }, [month, i18n.language]);

  const historyQuery = useQuery({
    queryKey: ["roster-history", month, locationId || null],
    queryFn: () =>
      listMonthlyRosterHistory({
        month,
        locationId: locationId || null,
        staffSearch: null,
      }),
    staleTime: QUERY_DEFAULTS.staleTime,
  });

  const rows = historyQuery.data?.rows ?? [];

  const actorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.actorId && row.actorName) map.set(row.actorId, row.actorName);
    }
    return [
      { value: "", label: t("people.rosterHistory.allUsers") },
      ...[...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [rows, t]);

  const locationOptions = useMemo(
    () => [
      { value: "", label: t("people.rosterHistory.allLocations") },
      ...sites.map((s) => ({
        value: s.id,
        label: formatLocationRecord(s),
      })),
    ],
    [sites, t],
  );

  const changeTypeOptions = useMemo(
    () => [
      { value: "", label: t("people.rosterHistory.allTypes") },
      { value: "amendment", label: t("people.rosterHistory.kindAmendment") },
      { value: "upload", label: t("people.rosterHistory.kindUploadBulk") },
      { value: "bulk_delete", label: t("people.rosterHistory.kindBulkDelete") },
    ],
    [t],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const type = uiChangeType(row);
      if (changeType && type !== changeType) return false;
      if (changedBy && row.actorId !== changedBy) return false;
      if (!q) return true;
      const hay = [
        row.staffName,
        row.employeeCode,
        row.actorName,
        row.changeReason,
        row.summary,
        row.locationCode,
        row.locationName,
        row.workDate,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, changeType, changedBy, search]);

  const kpis = useMemo(() => {
    let amendments = 0;
    let uploads = 0;
    let bulkDeletes = 0;
    for (const row of rows) {
      const type = uiChangeType(row);
      if (type === "amendment") amendments += 1;
      else if (type === "upload") uploads += 1;
      else bulkDeletes += 1;
    }
    return {
      total: rows.length,
      amendments,
      uploads,
      bulkDeletes,
    };
  }, [rows]);

  const selected = useMemo(
    () => filteredRows.find((r) => r.id === selectedId) ?? null,
    [filteredRows, selectedId],
  );

  const detailKind = selected ? detailChangeKind(selected) : "info";
  const legend = useMemo(() => {
    if (!selected) return { added: 0, modified: 0, removed: 0 };
    if (detailKind === "added") return { added: 1, modified: 0, removed: 0 };
    if (detailKind === "removed") return { added: 0, modified: 0, removed: 1 };
    if (detailKind === "modified") return { added: 0, modified: 1, removed: 0 };
    if (selected.action === "roster.upload") {
      const n = payloadCount(selected, "imported") || payloadCount(selected, "rowCount") || 1;
      return { added: n, modified: 0, removed: 0 };
    }
    if (selected.action === "roster.bulk_delete") {
      return { added: 0, modified: 0, removed: payloadCount(selected, "deleted") || 1 };
    }
    if (selected.action === "roster.pattern_apply") {
      return {
        added: payloadCount(selected, "created"),
        modified: payloadCount(selected, "updated"),
        removed: 0,
      };
    }
    return { added: 0, modified: 0, removed: 0 };
  }, [selected, detailKind]);

  function applySearch() {
    setSearch(searchDraft.trim());
  }

  function exportCsv() {
    const header = [
      "#",
      "Date & Time",
      "Change Type",
      "Changed By",
      "Location",
      "Impact",
      "Reason",
      "Summary",
      "Change ID",
    ];
    const lines = filteredRows.map((row, index) => {
      const type = uiChangeType(row);
      const cells = [
        String(index + 1),
        formatDateTime(row.createdAt, i18n.language),
        changeTypeLabel(type, t),
        row.actorName ?? "",
        row.locationCode ?? row.locationName ?? "",
        impactLabel(row, t),
        row.changeReason ?? "",
        row.summary,
        changeIdFor(row),
      ];
      return cells.map((cell) => {
        const v = String(cell ?? "");
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(",");
    });
    downloadCsvContent([header.join(","), ...lines].join("\n"), `roster-history-${month}.csv`);
  }

  function toggleSelected(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
    setDetailTab("roster");
  }

  return (
    <CapabilityGate
      capability="people.roster_history"
      fallback={<HrEmptyState message={t("people.rosterHistory.noAccess")} />}
    >
      <div className="rh-history space-y-5 overflow-x-clip">
        <header className="relative overflow-hidden rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.55]"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 100% 0%, rgba(124,58,237,0.12), transparent 55%), radial-gradient(ellipse 50% 40% at 0% 100%, rgba(167,139,250,0.10), transparent 50%)",
            }}
          />
          <div className="relative flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-100 text-[#7c3aed]">
                <History className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">{t("people.rosterHistory.kicker")}</p>
                <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
                  {t("people.rosterHistory.title")}
                </h1>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("people.rosterHistory.subtitle")}</p>
              </div>
            </div>

            <div className="grid w-full min-w-0 grid-cols-2 gap-3 sm:grid-cols-4 xl:max-w-3xl">
              {historyQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[5.5rem] rounded-2xl" />)
              ) : (
                <>
                  <KpiCard
                    title={t("people.rosterHistory.kpiTotal")}
                    value={kpis.total}
          icon={History}
                    iconClass="bg-violet-100 text-[#7c3aed]"
                  />
                  <KpiCard
                    title={t("people.rosterHistory.kpiAmendments")}
                    value={kpis.amendments}
                    icon={Pencil}
                    iconClass="bg-emerald-100 text-emerald-700"
                  />
                  <KpiCard
                    title={t("people.rosterHistory.kpiUploads")}
                    value={kpis.uploads}
                    icon={Upload}
                    iconClass="bg-sky-100 text-sky-700"
                  />
                  <KpiCard
                    title={t("people.rosterHistory.kpiBulkDeletes")}
                    value={kpis.bulkDeletes}
                    icon={Trash2}
                    iconClass="bg-rose-100 text-rose-700"
                  />
                </>
              )}
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-black/5 bg-white p-3 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0 space-y-1.5">
                <label
                  htmlFor="roster-history-month"
                  className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {t("people.rosterHistory.month")}
                </label>
            <Input
              id="roster-history-month"
              type="month"
              value={month}
                  onChange={(e) => {
                    setMonth(e.target.value.slice(0, 7));
                    setSelectedId(null);
                  }}
                  className="h-10 rounded-xl"
                />
                <p className="text-[11px] text-muted-foreground">{range}</p>
          </div>

              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("people.rosterHistory.location")}
                </p>
            <SearchableSelect
              value={locationId}
                  onValueChange={(v) => {
                    setLocationId(v);
                    setSelectedId(null);
                  }}
              options={locationOptions}
              placeholder={t("people.rosterHistory.allLocations")}
                  triggerClassName="h-10 rounded-xl"
                />
              </div>

              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("people.rosterHistory.changeType")}
                </p>
                <SearchableSelect
                  value={changeType}
                  onValueChange={setChangeType}
                  options={changeTypeOptions}
                  placeholder={t("people.rosterHistory.allTypes")}
                  triggerClassName="h-10 rounded-xl"
            />
          </div>

              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("people.rosterHistory.changedBy")}
                </p>
                <SearchableSelect
                  value={changedBy}
                  onValueChange={setChangedBy}
                  options={actorOptions}
                  placeholder={t("people.rosterHistory.allUsers")}
                  triggerClassName="h-10 rounded-xl"
            />
          </div>
        </div>

            <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-end xl:w-auto xl:max-w-md">
              <div className="min-w-0 flex-1 space-y-1.5">
                <label
                  htmlFor="roster-history-search"
                  className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {t("people.rosterHistory.search")}
                </label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search
                      className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="roster-history-search"
                      value={searchDraft}
                      onChange={(e) => setSearchDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applySearch();
                      }}
                      placeholder={t("people.rosterHistory.searchPlaceholder")}
                      className="h-10 rounded-xl ps-9"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={applySearch}
                    className="h-10 shrink-0 rounded-xl bg-[#7c3aed] px-4 text-white hover:bg-[#6d28d9] focus-visible:ring-[#7c3aed]/40"
                  >
                    {t("people.rosterHistory.searchAction")}
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={exportCsv}
                disabled={!filteredRows.length}
                className="h-10 shrink-0 rounded-xl border-border/80 bg-white"
              >
                <Download className="me-1.5 h-3.5 w-3.5" aria-hidden />
                {t("people.rosterHistory.export")}
              </Button>
            </div>
          </div>
        </section>

        {historyQuery.isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : historyQuery.isError ? (
          <HrEmptyState message={t("people.rosterHistory.loadFailed")} />
        ) : filteredRows.length === 0 ? (
          <HrEmptyState message={t("people.rosterHistory.empty")} icon={History} />
        ) : (
          <>
            <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_4px_20px_rgba(124,58,237,0.06)]">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead className="w-12 text-xs font-semibold uppercase tracking-wide">#</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide">
                        {t("people.rosterHistory.colWhen")}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide">
                        {t("people.rosterHistory.colKind")}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide">
                        {t("people.rosterHistory.colWho")}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide">
                        {t("people.rosterHistory.colLocation")}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide">
                        {t("people.rosterHistory.colImpact")}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide">
                        {t("people.rosterHistory.colReason")}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide">
                        {t("people.rosterHistory.colActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row, index) => {
                      const type = uiChangeType(row);
                      const active = selectedId === row.id;
                      return (
                        <TableRow
                          key={row.id}
                          className={cn(active && "bg-violet-50/60")}
                          data-state={active ? "selected" : undefined}
                        >
                          <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDateTime(row.createdAt, i18n.language)}
                          </TableCell>
                          <TableCell>
                            <ChangeTypeBadge type={type} label={changeTypeLabel(type, t)} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-violet-100 text-[11px] font-semibold text-[#7c3aed]">
                                  {initials(row.actorName)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-medium">{row.actorName ?? "—"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {row.locationCode || row.locationName ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                                <MapPin className="h-3 w-3 text-muted-foreground" aria-hidden />
                                {row.locationCode ?? row.locationName}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Users className="h-3.5 w-3.5" aria-hidden />
                              {impactLabel(row, t)}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[16rem] text-sm">
                            {row.changeReason ? (
                              <span className="line-clamp-2 text-foreground" title={row.changeReason}>
                                {row.changeReason}
                              </span>
                            ) : (
                              <span
                                className="text-muted-foreground"
                                title={t("people.rosterHistory.reasonLegacyHint")}
                              >
                                {t("people.rosterHistory.reasonMissing")}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant={active ? "default" : "outline"}
                                onClick={() => toggleSelected(row.id)}
                                className={cn(
                                  "h-9 rounded-xl",
                                  active && "bg-[#7c3aed] text-white hover:bg-[#6d28d9]",
                                )}
                              >
                                <Eye className="me-1.5 h-3.5 w-3.5" aria-hidden />
                                {t("people.rosterHistory.viewChanges")}
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-9 w-9 rounded-xl"
                                    aria-label={t("people.rosterHistory.moreActions")}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(changeIdFor(row));
                                      } catch {
                                        /* ignore */
                                      }
                                    }}
                                  >
                                    {t("people.rosterHistory.copyChangeId")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => toggleSelected(row.id)}>
                                    {active
                                      ? t("people.rosterHistory.hideDetails")
                                      : t("people.rosterHistory.viewChanges")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>

            {selected ? (
              <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_4px_20px_rgba(124,58,237,0.06)] sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold tracking-tight text-foreground">
                      {t("people.rosterHistory.detailsTitle", {
                        type: changeTypeLabel(uiChangeType(selected), t),
                      })}
                    </h2>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("people.rosterHistory.changeId")}:{" "}
                    <span className="font-mono text-foreground">{changeIdFor(selected)}</span>
                  </p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-xl bg-slate-50/80 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                      {t("people.rosterHistory.metaChangedOn")}
                    </p>
                    <p className="mt-1 text-sm font-medium">{formatDateTime(selected.createdAt, i18n.language)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50/80 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("people.rosterHistory.metaChangedBy")}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="bg-violet-100 text-[10px] font-semibold text-[#7c3aed]">
                          {initials(selected.actorName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{selected.actorName ?? "—"}</span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50/80 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {t("people.rosterHistory.metaLocation")}
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {selected.locationCode ?? selected.locationName ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50/80 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Users className="h-3.5 w-3.5" aria-hidden />
                      {t("people.rosterHistory.metaAffected")}
                    </p>
                    <p className="mt-1 text-sm font-medium">{impactLabel(selected, t)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50/80 px-3 py-2.5 sm:col-span-2 lg:col-span-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("people.rosterHistory.metaReason")}
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {selected.changeReason ?? t("people.rosterHistory.reasonMissing")}
                    </p>
                  </div>
                </div>

                <Tabs
                  value={detailTab}
                  onValueChange={(v) => setDetailTab(v as "roster" | "summary")}
                  className="mt-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <TabsList className="h-auto w-fit rounded-xl bg-slate-100 p-1">
                      <TabsTrigger
                        value="roster"
                        className="rounded-lg px-3 py-1.5 data-[state=active]:bg-[#7c3aed] data-[state=active]:text-white"
                      >
                        {t("people.rosterHistory.tabRosterChanges", {
                          count: Math.max(1, legend.added + legend.modified + legend.removed),
                        })}
                      </TabsTrigger>
                      <TabsTrigger
                        value="summary"
                        className="rounded-lg px-3 py-1.5 data-[state=active]:bg-[#7c3aed] data-[state=active]:text-white"
                      >
                        {t("people.rosterHistory.tabSummary")}
                      </TabsTrigger>
                    </TabsList>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" aria-hidden />
                        {t("people.rosterHistory.legendAdded", { count: legend.added })}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" aria-hidden />
                        {t("people.rosterHistory.legendModified", { count: legend.modified })}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" aria-hidden />
                        {t("people.rosterHistory.legendRemoved", { count: legend.removed })}
                      </span>
                    </div>
                  </div>

                  <TabsContent value="roster" className="mt-4">
                    <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                          <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                            <TableHead>{t("people.rosterHistory.detailEmployee")}</TableHead>
                            <TableHead>{t("people.rosterHistory.detailDate")}</TableHead>
                            <TableHead>{t("people.rosterHistory.detailPrevious")}</TableHead>
                            <TableHead>{t("people.rosterHistory.detailNew")}</TableHead>
                            <TableHead>{t("people.rosterHistory.detailChange")}</TableHead>
                            <TableHead>{t("people.rosterHistory.detailRemarks")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                          <TableRow>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="bg-violet-100 text-[11px] font-semibold text-[#7c3aed]">
                                    {initials(selected.staffName ?? selected.actorName)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">
                                    {selected.staffName ??
                                      (uiChangeType(selected) === "upload" ||
                                      uiChangeType(selected) === "bulk_delete"
                                        ? t("people.rosterHistory.bulkScope")
                                        : "—")}
                                  </p>
                                  {selected.employeeCode ? (
                                    <p className="text-xs text-muted-foreground">{selected.employeeCode}</p>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {formatWorkDate(selected.workDate, i18n.language)}
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-800">
                                <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                {selected.action === "roster.create"
                                  ? "—"
                                  : formatRosterSnap(asRecord(selected.before), t)}
                              </span>
                    </TableCell>
                    <TableCell>
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800">
                                <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                {selected.action === "roster.delete" ||
                                selected.action === "roster.bulk_delete"
                                  ? "—"
                                  : formatRosterSnap(asRecord(selected.after), t)}
                              </span>
                    </TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
                                  detailChangeBadgeClass(detailKind),
                                )}
                              >
                                {detailChangeLabel(detailKind, t)}
                              </span>
                    </TableCell>
                            <TableCell className="max-w-[14rem] text-sm text-muted-foreground">
                              {selected.changeReason ?? selected.summary}
                    </TableCell>
                  </TableRow>
              </TableBody>
            </Table>
          </div>
                    {(uiChangeType(selected) === "upload" || uiChangeType(selected) === "bulk_delete") && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {t("people.rosterHistory.bulkDetailHint")}
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="summary" className="mt-4">
                    <div className="rounded-xl border border-border/60 bg-slate-50/50 p-4 text-sm leading-relaxed text-muted-foreground">
                      <p className="font-medium text-foreground">{selected.summary}</p>
                      {selected.changeReason ? (
                        <p className="mt-2">
                          <span className="font-semibold text-foreground">
                            {t("people.rosterHistory.colReason")}:
                          </span>{" "}
                          {selected.changeReason}
                        </p>
                      ) : null}
                    </div>
                  </TabsContent>
                </Tabs>
              </section>
            ) : null}
          </>
        )}
      </div>
    </CapabilityGate>
  );
}
