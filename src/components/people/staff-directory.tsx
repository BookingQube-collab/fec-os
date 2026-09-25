"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Columns3,
  Download,
  MoreHorizontal,
  Plus,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import {
  FecButton as Button,
  FecDrawer as Sheet,
  FecDrawerContent as SheetContent,
  FecDrawerHeader as SheetHeader,
  FecDrawerTitle as SheetTitle,
  FecDropdown as DropdownMenu,
  FecDropdownCheckboxItem as DropdownMenuCheckboxItem,
  FecDropdownContent as DropdownMenuContent,
  FecDropdownItem as DropdownMenuItem,
  FecDropdownSeparator as DropdownMenuSeparator,
  FecDropdownTrigger as DropdownMenuTrigger,
  FecFilter,
  FecFilterGroup,
  FecLoader,
  FecSearch,
} from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MobileListCard } from "@/components/layout/mobile-list-card";
import { ResponsiveDataView } from "@/components/layout/responsive-data-view";
import { StaffAvatar } from "@/components/people/staff-photo-field";
import { StaffMasterfileImportDialog } from "@/components/people/staff-masterfile-import-dialog";
import { useMasterDepartments } from "@/hooks/queries/useDepartments";
import { useStaffDirectory } from "@/hooks/queries/usePeople";
import { usePermission } from "@/hooks/use-permission";
import { queryKeys } from "@/lib/query-keys";
import {
  type StaffDirectoryKpis,
  type StaffDirectorySort,
} from "@/lib/staff-directory-kpis";
import {
  hrAlertSeverityLabel,
  staffHrAlerts,
  type HrAlertSeverity,
  type StaffHrAlert,
} from "@/lib/staff-hr-alerts";
import { restoreStaffMember } from "@/lib/staff-roster.functions";
import type { StaffRow } from "@/lib/queries/module-queries.core";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { STAFF_DIRECTORY_STATUSES } from "@/lib/staff-status";
import { cn } from "@/lib/utils";

type DirectoryKpiKey = "total" | "active" | "secondment" | "temporary" | "new_joiners" | "exiting";

const DIRECTORY_KPI_EXPIRY = new Set(["temporary_project", "new_joiners", "exiting"]);

function expiryChipLabel(expiry: string): string {
  if (expiry === "temporary_project") return "Temporary / Project";
  if (expiry === "new_joiners") return "New joiners (90d)";
  if (expiry === "exiting") return "Exiting";
  return `Attention: ${expiry.replace(/_/g, " ")}`;
}

function selectedDirectoryKpi(status: string, type: string, expiry: string): DirectoryKpiKey | null {
  if (expiry === "temporary_project" && !type) return "temporary";
  if (expiry === "new_joiners" && !type) return "new_joiners";
  if (expiry === "exiting" && !type) return "exiting";
  if (DIRECTORY_KPI_EXPIRY.has(expiry) || type) return null;
  if (status === "secondment") return "secondment";
  if (status === "active") return "active";
  if (status === "") return "total";
  return null;
}

function formatLocation(s: StaffRow): string {
  return formatLocationLabel(s.location_code, s.location_name);
}

/** Display-only: Title Case ALL-CAPS roster names; leave mixed-case names alone. */
function formatStaffDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return name;
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (!letters) return trimmed;
  const upper = [...letters].filter((c) => c >= "A" && c <= "Z").length;
  if (upper / letters.length < 0.85) return trimmed;
  return trimmed.toLowerCase().replace(/(^|[\s'\-])(\S)/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

function staffStatusBadgeVariant(
  status: string,
): "success" | "warning" | "destructive" | "info" | "muted" | "outline" {
  const s = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "active" || s === "probation") return "success";
  if (s === "terminated" || s === "resigned" || s === "released") return "destructive";
  if (s === "secondment" || s === "remote" || s === "serving_notice") return "warning";
  if (s === "on_leave" || s === "vacation" || s === "sick_leave" || s === "unpaid_leave") return "info";
  return "outline";
}

function alertBadgeClass(severity: HrAlertSeverity): string {
  switch (severity) {
    case "expired":
    case "critical":
      return "border-rose-300 bg-rose-50 text-rose-800";
    case "urgent":
      return "border-amber-300 bg-amber-50 text-amber-900";
    case "watch":
      return "border-orange-200 bg-orange-50 text-orange-900";
    default:
      return "border-border bg-muted/60 text-muted-foreground";
  }
}

const FILTER_TRIGGER = "h-10 min-h-10 w-full font-normal";
const COLS_STORAGE_KEY = "fec.people.employee-columns.v2";
const PAGE_SIZE_KEY = "fec.people.employee-page-size";

const DEFAULT_COLS = [
  "employee",
  "code",
  "position",
  "location",
  "type",
  "joining",
  "status",
  "alerts",
] as const;

const ALL_COLUMNS = [
  "employee",
  "code",
  "position",
  "dept",
  "location",
  "type",
  "sponsorship",
  "nationality",
  "mobile",
  "joining",
  "qid_expiry",
  "passport_expiry",
  "status",
  "alerts",
] as const;

type ColKey = (typeof ALL_COLUMNS)[number];

function loadCols(): Set<ColKey> {
  if (typeof window === "undefined") return new Set(DEFAULT_COLS);
  try {
    const raw = localStorage.getItem(COLS_STORAGE_KEY);
    if (!raw) return new Set(DEFAULT_COLS);
    const parsed = JSON.parse(raw) as string[];
    const next = new Set(parsed.filter((k): k is ColKey => (ALL_COLUMNS as readonly string[]).includes(k)));
    return next.size ? next : new Set(DEFAULT_COLS);
  } catch {
    return new Set(DEFAULT_COLS);
  }
}

function loadPageSize(): number {
  if (typeof window === "undefined") return 25;
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY) ?? "25");
  return n === 50 || n === 100 ? n : 25;
}

function HrAlertBadges({ alerts }: { alerts: StaffHrAlert[] }) {
  if (!alerts.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {alerts.map((a) => (
        <span
          key={`${a.kind}-${a.severity}`}
          className={cn(
            "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none",
            alertBadgeClass(a.severity),
          )}
          title={`${a.label} · ${hrAlertSeverityLabel(a.severity)}`}
        >
          {a.label}
          <span className="ml-1 opacity-70">{hrAlertSeverityLabel(a.severity)}</span>
        </span>
      ))}
    </div>
  );
}

export function StaffDirectory({
  locationId,
  canEdit,
  onEdit,
  onArchive,
  onAdd,
}: {
  locationId: string | null;
  canEdit: boolean;
  onEdit: (row: StaffRow) => void;
  onArchive: (id: string) => void;
  onAdd?: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: departments = [] } = useMasterDepartments();
  const canSalary = usePermission("people.view_salary");
  const canImport = usePermission("people.import_roster");
  const canSensitive = usePermission("hr.profile.view_sensitive") || canSalary;
  const qc = useQueryClient();

  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [position, setPosition] = useState("");
  const [type, setType] = useState(() => searchParams.get("type") ?? "");
  const [e3, setE3] = useState("");
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "active");
  const [missing, setMissing] = useState(() => searchParams.get("missing") === "1");
  const [loc, setLoc] = useState(() => searchParams.get("loc") ?? "");
  const [department, setDepartment] = useState(() => searchParams.get("department") ?? "");
  const [nationality, setNationality] = useState("");
  const [gender, setGender] = useState("");
  const [sponsorship, setSponsorship] = useState("");
  const [expiry, setExpiry] = useState(() => searchParams.get("expiry") ?? "");
  const [sort, setSort] = useState<StaffDirectorySort>("name");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(loadPageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quickView, setQuickView] = useState<StaffRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(loadCols);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [q]);

  // Sync deep-link filters from Overview attention links
  useEffect(() => {
    const nextExpiry = searchParams.get("expiry") ?? "";
    const nextMissing = searchParams.get("missing") === "1";
    const nextStatus = searchParams.get("status");
    const nextType = searchParams.get("type") ?? "";
    const nextLoc = searchParams.get("loc") ?? "";
    const nextDept = searchParams.get("department") ?? "";
    const nextQ = searchParams.get("q") ?? "";
    if (nextExpiry) setExpiry(nextExpiry);
    if (searchParams.has("missing")) setMissing(nextMissing);
    if (nextStatus != null) setStatus(nextStatus);
    if (nextType) setType(nextType);
    if (nextLoc) setLoc(nextLoc);
    if (nextDept) setDepartment(nextDept);
    if (nextQ) {
      setQ(nextQ);
      setDebouncedQ(nextQ);
    }
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    try {
      localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...visibleCols]));
    } catch {
      /* ignore */
    }
  }, [visibleCols]);

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(pageSize));
    } catch {
      /* ignore */
    }
  }, [pageSize]);

  const departmentName = useMemo(
    () => departments.find((d) => d.id === department)?.name ?? "",
    [departments, department],
  );

  const directory = useStaffDirectory({
    locationId,
    includeArchived: true,
    page,
    pageSize,
    q: debouncedQ,
    loc,
    department,
    departmentName,
    position,
    employmentType: type,
    status,
    nationality,
    gender,
    sponsorship,
    e3,
    missing,
    expiry,
    sort,
  });

  const staff = directory.data?.data ?? [];
  const pagination = directory.data?.pagination;
  const rosterKpis: StaffDirectoryKpis = directory.data?.kpis ?? {
    total: 0,
    active: 0,
    secondment: 0,
    temporary: 0,
    newJoiners: 0,
    exiting: 0,
    remote: 0,
    onLeave: 0,
    resigned: 0,
    terminated: 0,
    qidExpiringSoon: 0,
    passportExpiringSoon: 0,
    missingInfo: 0,
  };
  const positions = directory.data?.facets.positions ?? [];
  const nationalities = directory.data?.facets.nationalities ?? [];
  const locations = useMemo(
    () => (directory.data?.facets.locations ?? []).map((l) => [l.code, l.label] as [string, string]),
    [directory.data?.facets.locations],
  );

  const invalidateDirectory = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.staffDirectory() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.staff(locationId, true) });
    void qc.invalidateQueries({ queryKey: queryKeys.people.staff(locationId, false) });
  };

  const restoreMut = useMutation({
    mutationFn: (id: string) => restoreStaffMember({ id }),
    onSuccess: () => {
      toast.success(t("people.staff.restore"));
      invalidateDirectory();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const departmentOptions = useMemo(
    () =>
      departments
        .filter((d) => d.active)
        .map((d) => ({ value: d.id, label: d.name, keywords: `${d.name} ${d.code ?? ""}` })),
    [departments],
  );

  const selectedKpi = selectedDirectoryKpi(status, type, expiry);

  function applyDirectoryKpi(key: DirectoryKpiKey) {
    if (selectedKpi === key) {
      setStatus("");
      setType("");
      setExpiry("");
      setPage(1);
      return;
    }
    setType("");
    switch (key) {
      case "total":
        setStatus("");
        setExpiry("");
        break;
      case "active":
        setStatus("active");
        setExpiry("");
        break;
      case "secondment":
        setStatus("secondment");
        setExpiry("");
        break;
      case "temporary":
        setStatus("");
        setExpiry("temporary_project");
        break;
      case "new_joiners":
        setStatus("");
        setExpiry("new_joiners");
        break;
      case "exiting":
        setStatus("");
        setExpiry("exiting");
        break;
    }
    setPage(1);
  }

  const pages = pagination?.totalPages ?? 1;
  const safePage = pagination?.page ?? page;
  const filteredTotal = pagination?.total ?? 0;
  const from = filteredTotal ? (safePage - 1) * pageSize + 1 : 0;
  const to = Math.min(safePage * pageSize, filteredTotal);
  const pageRows = staff;
  const isInitialLoading = directory.isLoading && !directory.data;
  const isRefreshing = directory.isFetching && Boolean(directory.data);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (q.trim()) chips.push({ key: "q", label: `Search: ${q.trim()}`, clear: () => setQ("") });
    if (loc) {
      const label = locations.find(([c]) => c === loc)?.[1] ?? loc;
      chips.push({ key: "loc", label: `Location: ${label}`, clear: () => setLoc("") });
    }
    if (department) {
      chips.push({
        key: "dept",
        label: `Dept: ${departmentName || department}`,
        clear: () => setDepartment(""),
      });
    }
    if (type) chips.push({ key: "type", label: `Type: ${type}`, clear: () => setType("") });
    if (status) chips.push({ key: "status", label: `Status: ${status.replace(/_/g, " ")}`, clear: () => setStatus("") });
    if (position) chips.push({ key: "pos", label: `Position: ${position}`, clear: () => setPosition("") });
    if (nationality) chips.push({ key: "nat", label: `Nationality: ${nationality}`, clear: () => setNationality("") });
    if (gender) chips.push({ key: "gen", label: `Gender: ${gender}`, clear: () => setGender("") });
    if (sponsorship) chips.push({ key: "spon", label: `Sponsorship: ${sponsorship}`, clear: () => setSponsorship("") });
    if (missing) chips.push({ key: "miss", label: "Missing info", clear: () => setMissing(false) });
    if (expiry) chips.push({ key: "exp", label: expiryChipLabel(expiry), clear: () => setExpiry("") });
    if (e3) chips.push({ key: "e3", label: `E3: ${e3}`, clear: () => setE3("") });
    return chips;
  }, [q, loc, locations, department, departmentName, type, status, position, nationality, gender, sponsorship, missing, expiry, e3]);

  function clearAllFilters() {
    setQ("");
    setLoc("");
    setDepartment("");
    setPosition("");
    setType("");
    setStatus("");
    setNationality("");
    setGender("");
    setSponsorship("");
    setMissing(false);
    setExpiry("");
    setE3("");
    setPage(1);
    // Strip filter query params while keeping tab=staff
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["q", "loc", "department", "type", "status", "missing", "expiry"]) {
      params.delete(key);
    }
    params.set("tab", "staff");
    router.replace(`/people?${params.toString()}`, { scroll: false });
  }

  async function exportRoster(scope: "all" | "active" | "filtered" | "selected", format: "csv" | "xlsx") {
    const params = new URLSearchParams({ format, scope });
    if (locationId) params.set("locationId", locationId);
    if (scope === "filtered") {
      params.set("status", status);
      params.set("q", q);
      params.set("type", type);
      params.set("loc", loc);
    }
    if (scope === "selected") {
      params.set("ids", [...selected].join(","));
    }
    const res = await fetch(`/api/people/roster-export?${params}`, { credentials: "include" });
    const body = (await res.json()) as {
      csv?: string;
      base64?: string;
      filename?: string;
      mime?: string;
      error?: string;
    };
    if (!res.ok) throw new Error(body.error ?? "Export failed");
    if (body.csv) {
      const blob = new Blob([body.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = body.filename ?? "employee-master.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (body.base64) {
      const bin = Uint8Array.from(atob(body.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bin], { type: body.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = body.filename ?? "employee-master.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  const col = (key: ColKey) => visibleCols.has(key);

  const colLabel: Record<ColKey, string> = {
    employee: t("people.staff.employeeCol", "Employee"),
    code: t("people.staff.employeeCode", "Employee code"),
    position: t("people.staff.position", "Position"),
    dept: t("people.staff.dept"),
    location: t("people.staff.location"),
    type: t("people.staff.type"),
    sponsorship: t("people.staff.sponsorship", "Sponsorship"),
    nationality: t("people.staff.nationality", "Nationality"),
    mobile: t("people.staff.contact"),
    joining: t("people.staff.joiningDate", "Joining date"),
    qid_expiry: t("people.staff.qidExpiry", "QID expiry"),
    passport_expiry: t("people.staff.passportExpiry", "Passport expiry"),
    status: t("people.staff.status"),
    alerts: t("people.staff.hrAlerts", "HR alerts"),
  };

  return (
    <div className="space-y-4">
      {isRefreshing ? (
        <FecLoader size="sm" className="min-h-0 justify-start text-xs" label={t("people.staff.refreshing", "Updating…")} />
      ) : null}
      {/* Headcount KPI quick filters — keep essential counts on phone */}
      <div className={cn("grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:grid-cols-6", isRefreshing && "opacity-90")}>
        {(
          [
            {
              key: "total" as const,
              label: t("people.dashboard.kpiTotal", "Total"),
              value: rosterKpis.total,
              tint: "sky" as KpiTint,
              mobile: true,
            },
            {
              key: "active" as const,
              label: t("people.dashboard.kpiActive", "Active"),
              value: rosterKpis.active,
              tint: "green" as KpiTint,
              mobile: true,
            },
            {
              key: "secondment" as const,
              label: t("people.dashboard.kpiSecondment", "Secondment"),
              value: rosterKpis.secondment,
              tint: "orange" as KpiTint,
              mobile: true,
            },
            {
              key: "temporary" as const,
              label: t("people.dashboard.kpiTemporary", "Temporary / Project"),
              value: rosterKpis.temporary,
              tint: "amber" as KpiTint,
              mobile: false,
            },
            {
              key: "new_joiners" as const,
              label: t("people.dashboard.kpiNewJoiners", "New Joiners (90d)"),
              value: rosterKpis.newJoiners,
              tint: "sky" as KpiTint,
              mobile: false,
            },
            {
              key: "exiting" as const,
              label: t("people.dashboard.kpiExiting", "Exiting"),
              value: rosterKpis.exiting,
              tint: "orange" as KpiTint,
              mobile: true,
            },
          ] as const
        ).map((item) => {
          const selected = selectedKpi === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => applyDirectoryKpi(item.key)}
              aria-pressed={selected}
              className={cn(
                "h-full text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 rounded-2xl",
                !item.mobile && "max-md:hidden",
              )}
            >
              <TintedKpiCard
                title={item.label}
                value={item.value}
                tint={item.tint}
                compact
                className={cn(
                  "h-full transition-all hover:opacity-90",
                  selected && "ring-2 ring-foreground/25 border-foreground/25 shadow-[0_4px_20px_rgba(0,0,0,0.08)]",
                )}
              />
            </button>
          );
        })}
      </div>

      {/* Toolbar — sticky search/filters on phone */}
      <div className="sticky top-0 z-20 -mx-1 space-y-2 bg-background/95 px-1 py-2 backdrop-blur md:static md:z-auto md:mx-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
      <div className="flex flex-wrap items-center gap-2">
        <FecSearch containerClassName="min-w-0 flex-1 md:min-w-[14rem] sm:max-w-md" className="h-10" placeholder={t("people.staff.search", "Search staff…")} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canEdit && onAdd ? (
            <Button size="sm" onClick={onAdd} className="max-md:h-10 max-md:w-10 max-md:px-0" aria-label={t("people.staff.addEmployee", "Add employee")}>
              <Plus className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
              <span className="max-md:hidden">{t("people.staff.addEmployee", "Add employee")}</span>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary">
                {t("people.actions")} <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[14rem]">
              {canImport ? (
                <DropdownMenuItem onClick={() => setImportOpen(true)}>
                  <Upload className="mr-2 h-3.5 w-3.5" />
                  {t("people.staff.importMaster", "Import E3 masterfile")}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void exportRoster("all", "xlsx").catch((e) => toast.error((e as Error).message))}>
                <Download className="mr-2 h-3.5 w-3.5" />
                {t("people.staff.downloadMasterAll", "Download master (all)")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportRoster("active", "xlsx").catch((e) => toast.error((e as Error).message))}>
                {t("people.staff.downloadMasterActive", "Download master (active)")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportRoster("filtered", "xlsx").catch((e) => toast.error((e as Error).message))}>
                {t("people.staff.downloadCurrentView", "Download current view")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!selected.size}
                onClick={() => void exportRoster("selected", "xlsx").catch((e) => toast.error((e as Error).message))}
              >
                {t("people.staff.downloadSelected", "Download selected")} ({selected.size})
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void exportRoster("filtered", "csv").catch((e) => toast.error((e as Error).message))}>
                {t("people.staff.exportCsv", "Export CSV")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      </div>

      {/* Smart filters */}
      <div className="space-y-3 rounded-lg border border-border/80 bg-card/40 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SearchableSelect
            value={loc}
            onValueChange={(next) => {
              setLoc(next);
              setPage(1);
            }}
            placeholder={t("people.staff.allLocations")}
            emptyOption={{ value: "", label: t("people.staff.allLocations") }}
            options={locations.map(([code, label]) => ({ value: code, label, keywords: `${code} ${label}` }))}
            triggerClassName={FILTER_TRIGGER}
            className="w-full"
          />
          <SearchableSelect
            value={department}
            onValueChange={(next) => {
              setDepartment(next);
              setPage(1);
            }}
            placeholder={t("people.staff.allDepartments")}
            emptyOption={{ value: "", label: t("people.staff.allDepartments") }}
            options={departmentOptions}
            triggerClassName={FILTER_TRIGGER}
            className="w-full"
          />
          <SearchableSelect
            value={type}
            onValueChange={(next) => {
              setType(next);
              setPage(1);
            }}
            placeholder={t("people.staff.allTypes")}
            emptyOption={{ value: "", label: t("people.staff.allTypes") }}
            options={[
              { value: "permanent", label: t("people.staff.employmentTypes.permanent") },
              { value: "secondment", label: t("people.staff.employmentTypes.secondment") },
              { value: "joker", label: t("people.staff.employmentTypes.joker") },
              { value: "temporary", label: t("people.staff.employmentTypes.temporary") },
            ]}
            triggerClassName={FILTER_TRIGGER}
            className="w-full"
          />
          <SearchableSelect
            value={status}
            onValueChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
            placeholder={t("people.staff.status")}
            emptyOption={{ value: "", label: t("people.staff.allStatuses", "All statuses") }}
            options={STAFF_DIRECTORY_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
            triggerClassName={FILTER_TRIGGER}
            className="w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setMoreFilters((v) => !v)}>
            {moreFilters
              ? t("people.staff.hideMoreFilters", "Hide filters")
              : t("people.staff.moreFilters", "More filters")}
            <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", moreFilters && "rotate-180")} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary" className="max-md:hidden">
                <Columns3 className="mr-1 h-3.5 w-3.5" /> {t("people.staff.columns", "Columns")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              {ALL_COLUMNS.map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={visibleCols.has(key)}
                  onCheckedChange={(checked) => {
                    setVisibleCols((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(key);
                      else next.delete(key);
                      return next;
                    });
                  }}
                >
                  {colLabel[key]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <SearchableSelect
            value={sort}
            onValueChange={(next) => setSort(next as StaffDirectorySort)}
            placeholder={t("people.staff.sort", "Sort")}
            options={[
              { value: "name", label: "Name" },
              { value: "code", label: "Employee code" },
              { value: "location", label: "Location" },
              { value: "joining", label: "Joining date" },
              { value: "qid_expiry", label: "QID expiry" },
              { value: "passport_expiry", label: "Passport expiry" },
            ]}
            triggerClassName="h-9 w-[10rem] font-normal"
            className="w-auto"
          />
        </div>

        {moreFilters ? (
          <div className="grid grid-cols-1 gap-2 border-t border-border/60 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <SearchableSelect
              value={position}
              onValueChange={(next) => {
                setPosition(next);
                setPage(1);
              }}
              placeholder={t("people.staff.allPositions")}
              emptyOption={{ value: "", label: t("people.staff.allPositions") }}
              options={positions.map((p) => ({ value: p, label: p }))}
              triggerClassName={FILTER_TRIGGER}
              className="w-full"
            />
            {nationalities.length ? (
              <SearchableSelect
                value={nationality}
                onValueChange={(next) => {
                  setNationality(next);
                  setPage(1);
                }}
                placeholder={t("people.staff.nationality", "Nationality")}
                emptyOption={{ value: "", label: t("people.staff.allNationalities", "All nationalities") }}
                options={nationalities.map((n) => ({ value: n, label: n }))}
                triggerClassName={FILTER_TRIGGER}
                className="w-full"
              />
            ) : null}
            <SearchableSelect
              value={gender}
              onValueChange={(next) => {
                setGender(next);
                setPage(1);
              }}
              placeholder={t("people.staff.gender", "Gender")}
              emptyOption={{ value: "", label: t("people.staff.allGenders", "All genders") }}
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Other" },
              ]}
              triggerClassName={FILTER_TRIGGER}
              className="w-full"
            />
            <Input
              className="h-10"
              placeholder={t("people.staff.sponsorship", "Sponsorship")}
              value={sponsorship}
              onChange={(e) => {
                setSponsorship(e.target.value);
                setPage(1);
              }}
            />
            <label className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={missing}
                onCheckedChange={(checked) => {
                  setMissing(checked === true);
                  setPage(1);
                }}
              />
              {t("people.staff.missingInfo")}
            </label>
          </div>
        ) : null}

        {activeChips.length ? (
          <FecFilterGroup className="border-t border-border/60 pt-3">
            {activeChips.map((chip) => (
              <FecFilter key={chip.key} active onClick={() => { chip.clear(); setPage(1); }}>
                {chip.label}<span aria-hidden className="ms-1 text-muted-foreground">×</span>
              </FecFilter>
            ))}
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearAllFilters}>{t("people.staff.clearAll", "Clear all")}</Button>
          </FecFilterGroup>
        ) : null}
      </div>

      {/* Table / mobile cards */}
      <div className={cn("relative", isRefreshing && "opacity-70 transition-opacity")}>
      {isInitialLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-border px-4 py-16">
          <FecLoader size="sm" label={t("people.staff.loading")} />
        </div>
      ) : (
      <ResponsiveDataView
        mobile={
          <div className="space-y-2">
            {pageRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                {t("common.empty")}
              </p>
            ) : (
              pageRows.map((s) => {
                const displayName = formatStaffDisplayName(s.full_name);
                return (
                  <MobileListCard
                    key={s.id}
                    href={`/people/staff/${s.id}`}
                    title={displayName}
                    subtitle={[s.job_title, formatLocation(s)].filter(Boolean).join(" · ") || s.employee_code}
                    meta={
                      <Badge variant={staffStatusBadgeVariant(s.status)}>{s.status}</Badge>
                    }
                    trailing={
                      <StaffAvatar
                        staffId={s.id}
                        name={displayName}
                        hasPhoto={s.has_photo}
                        photoUpdatedAt={s.photo_updated_at}
                      />
                    }
                  />
                );
              })
            )}
          </div>
        }
        desktop={
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[56rem] text-sm">
                    <thead className="sticky top-0 z-10 bg-surface/95 text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                      <tr>
                        <th className="px-3 py-2.5 text-left">
                          <Checkbox
                            checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))}
                            onCheckedChange={(checked) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                for (const r of pageRows) {
                                  if (checked) next.add(r.id);
                                  else next.delete(r.id);
                                }
                                return next;
                              });
                            }}
                          />
                        </th>
                        {col("employee") ? <th className="min-w-[12rem] px-3 py-2.5 text-left">{colLabel.employee}</th> : null}
                        {col("code") ? <th className="min-w-[5.5rem] px-3 py-2.5 text-left">{colLabel.code}</th> : null}
                        {col("position") ? <th className="min-w-[9rem] px-3 py-2.5 text-left">{colLabel.position}</th> : null}
                        {col("dept") ? <th className="min-w-[7rem] px-3 py-2.5 text-left">{colLabel.dept}</th> : null}
                        {col("location") ? <th className="min-w-[9rem] px-3 py-2.5 text-left">{colLabel.location}</th> : null}
                        {col("type") ? <th className="px-3 py-2.5 text-left">{colLabel.type}</th> : null}
                        {col("sponsorship") ? <th className="px-3 py-2.5 text-left">{colLabel.sponsorship}</th> : null}
                        {col("nationality") ? <th className="px-3 py-2.5 text-left">{colLabel.nationality}</th> : null}
                        {col("mobile") ? <th className="min-w-[7rem] px-3 py-2.5 text-left">{colLabel.mobile}</th> : null}
                        {col("joining") ? <th className="whitespace-nowrap px-3 py-2.5 text-left">{colLabel.joining}</th> : null}
                        {col("qid_expiry") ? <th className="whitespace-nowrap px-3 py-2.5 text-left">{colLabel.qid_expiry}</th> : null}
                        {col("passport_expiry") ? (
                          <th className="whitespace-nowrap px-3 py-2.5 text-left">{colLabel.passport_expiry}</th>
                        ) : null}
                        {col("status") ? <th className="px-3 py-2.5 text-left">{colLabel.status}</th> : null}
                        {col("alerts") ? <th className="min-w-[10rem] px-3 py-2.5 text-left">{colLabel.alerts}</th> : null}
                        <th className="px-3 py-2.5 text-right">{t("people.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((s) => {
                        const multiSite = s.is_roaming || (s.work_locations?.length ?? 0) > 1;
                        const displayName = formatStaffDisplayName(s.full_name);
                        const alerts = staffHrAlerts(s);
                        const deptLabel =
                          s.department || (s.department_names?.length ? s.department_names.join(", ") : null);
                        return (
                          <tr
                            key={s.id}
                            className="cursor-pointer border-t border-border hover:bg-surface/40"
                            onClick={(e) => {
                              const target = e.target as HTMLElement;
                              if (target.closest("a,button,input,[role='checkbox'],[data-radix-collection-item]")) return;
                              setQuickView(s);
                            }}
                          >
                            <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selected.has(s.id)}
                                onCheckedChange={(checked) => {
                                  setSelected((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(s.id);
                                    else next.delete(s.id);
                                    return next;
                                  });
                                }}
                              />
                            </td>
                            {col("employee") ? (
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2.5">
                                  <StaffAvatar
                                    staffId={s.id}
                                    name={displayName}
                                    hasPhoto={s.has_photo}
                                    photoUpdatedAt={s.photo_updated_at}
                                  />
                                  <div className="min-w-0 leading-snug">
                                    <Link
                                      className="font-medium text-foreground hover:underline"
                                      href={`/people/staff/${s.id}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {displayName}
                                    </Link>
                                    <div className="text-xs tabular-nums text-muted-foreground">{s.phone ?? "—"}</div>
                                  </div>
                                </div>
                              </td>
                            ) : null}
                            {col("code") ? (
                              <td className="px-3 py-2.5 font-mono text-xs tabular-nums">{s.employee_code}</td>
                            ) : null}
                            {col("position") ? (
                              <td className="px-3 py-2.5">
                                <div className="leading-snug">
                                  <div className="text-sm text-foreground">{s.job_title ?? "—"}</div>
                                  {deptLabel ? (
                                    <div className="mt-0.5 text-[11px] text-muted-foreground">{deptLabel}</div>
                                  ) : null}
                                </div>
                              </td>
                            ) : null}
                            {col("dept") ? (
                              <td className="px-3 py-2.5 text-sm text-muted-foreground">{deptLabel ?? "—"}</td>
                            ) : null}
                            {col("location") ? (
                              <td className="px-3 py-2.5">
                                <div className="leading-snug">
                                  {s.location_code ? (
                                    <div className="font-mono text-[11px] text-muted-foreground">{s.location_code}</div>
                                  ) : null}
                                  <div className="text-sm text-foreground">{s.location_name ?? formatLocation(s)}</div>
                                  {multiSite ? (
                                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                                      {t("people.staff.multiSite")}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                            ) : null}
                            {col("type") ? (
                              <td className="px-3 py-2.5 text-sm">
                                {s.employment_type
                                  ? t(`people.staff.employmentTypes.${s.employment_type}`, s.employment_type)
                                  : "—"}
                              </td>
                            ) : null}
                            {col("sponsorship") ? (
                              <td className="px-3 py-2.5 text-sm">{s.sponsorship_info ?? "—"}</td>
                            ) : null}
                            {col("nationality") ? (
                              <td className="px-3 py-2.5 text-sm">{s.nationality ?? "—"}</td>
                            ) : null}
                            {col("mobile") ? (
                              <td className="px-3 py-2.5 text-sm tabular-nums">{s.phone ?? "—"}</td>
                            ) : null}
                            {col("joining") ? (
                              <td className="px-3 py-2.5 text-sm tabular-nums">{s.hire_date ?? "—"}</td>
                            ) : null}
                            {col("qid_expiry") ? (
                              <td className="px-3 py-2.5 text-sm tabular-nums">
                                {canSensitive ? (s.qid_expiry ?? "—") : "••••"}
                              </td>
                            ) : null}
                            {col("passport_expiry") ? (
                              <td className="px-3 py-2.5 text-sm tabular-nums">
                                {canSensitive ? (s.passport_expiry ?? "—") : "••••"}
                              </td>
                            ) : null}
                            {col("status") ? (
                              <td className="px-3 py-2.5">
                                <Badge variant={staffStatusBadgeVariant(s.status)} className="uppercase tracking-wide">
                                  {s.status.replace(/_/g, " ")}
                                </Badge>
                              </td>
                            ) : null}
                            {col("alerts") ? (
                              <td className="px-3 py-2.5">
                                <HrAlertBadges alerts={alerts} />
                              </td>
                            ) : null}
                            <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost" aria-label={t("people.actions")}>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[12rem]">
                                  <DropdownMenuItem onClick={() => setQuickView(s)}>
                                    {t("people.staff.quickView", "Quick view")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/people/staff/${s.id}`}>
                                      {t("people.staff.viewProfile", "View profile")}
                                    </Link>
                                  </DropdownMenuItem>
                                  {canEdit ? (
                                    <DropdownMenuItem onClick={() => onEdit(s)}>
                                      {t("people.staff.editEmployee", "Edit")}
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem asChild>
                                    <Link href={`/people/staff/${s.id}?tab=documents`}>
                                      {t("people.staff.menuDocuments", "Documents")}
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/people/staff/${s.id}?tab=attendance`}>
                                      {t("people.staff.menuAttendance", "Attendance")}
                                    </Link>
                                  </DropdownMenuItem>
                                  {canSalary ? (
                                    <DropdownMenuItem asChild>
                                      <Link href={`/people/staff/${s.id}?tab=payroll`}>
                                        {t("people.staff.menuPayroll", "Payroll")}
                                      </Link>
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuItem asChild>
                                    <Link href={`/people/staff/${s.id}?tab=training`}>
                                      {t("people.staff.menuTraining", "Training")}
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/people/staff/${s.id}?tab=employment`}>
                                      {t("people.staff.menuTransfer", "Transfer location")}
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/people/staff/${s.id}?tab=history`}>
                                      {t("people.staff.menuHistory", "Employment history")}
                                    </Link>
                                  </DropdownMenuItem>
                                  {canEdit ? (
                                    <>
                                      <DropdownMenuSeparator />
                                      {s.status === "terminated" ||
                                      s.status === "resigned" ||
                                      s.status === "released" ? (
                                        <DropdownMenuItem onClick={() => restoreMut.mutate(s.id)}>
                                          {t("people.staff.restore")}
                                        </DropdownMenuItem>
                                      ) : (
                                        <DropdownMenuItem
                                          className="text-amber-800 focus:text-amber-900"
                                          onClick={() => onArchive(s.id)}
                                        >
                                          {t("people.staff.archiveExit", "Archive / exit")}
                                        </DropdownMenuItem>
                                      )}
                                    </>
                                  ) : null}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

        }
      />
      )}
      </div>
      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {t("people.staff.showingRange", "Showing {{from}}–{{to}} of {{total}}", {
            from,
            to,
            total: filteredTotal,
          })}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            aria-label={t("people.staff.rowsPerPage", "Rows per page")}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t("people.staff.prevPage", "Previous")}
          </Button>
          <span className="tabular-nums">
            {safePage} / {pages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={safePage >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            {t("people.staff.nextPage", "Next")}
          </Button>
        </div>
      </div>

      {/* Quick view drawer */}
      <Sheet open={Boolean(quickView)} onOpenChange={(open) => !open && setQuickView(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          {quickView ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <StaffAvatar
                    staffId={quickView.id}
                    name={formatStaffDisplayName(quickView.full_name)}
                    hasPhoto={quickView.has_photo}
                    photoUpdatedAt={quickView.photo_updated_at}
                  />
                  <span>{formatStaffDisplayName(quickView.full_name)}</span>
                </SheetTitle>
              </SheetHeader>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("people.staff.employeeCode", "Employee code")}</dt>
                  <dd className="font-mono">{quickView.employee_code}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("people.staff.position", "Position")}</dt>
                  <dd>{quickView.job_title ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("people.staff.dept")}</dt>
                  <dd>{quickView.department ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("people.staff.location")}</dt>
                  <dd>
                    {quickView.location_code ? `${quickView.location_code} · ` : ""}
                    {quickView.location_name ?? formatLocation(quickView)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("people.staff.status")}</dt>
                  <dd>
                    <Badge variant={staffStatusBadgeVariant(quickView.status)} className="uppercase tracking-wide">
                      {quickView.status.replace(/_/g, " ")}
                    </Badge>
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("people.staff.contact")}</dt>
                  <dd>{quickView.phone ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("people.staff.joiningDate", "Joining date")}</dt>
                  <dd>{quickView.hire_date ?? "—"}</dd>
                </div>
                {canSensitive ? (
                  <>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">QID expiry</dt>
                      <dd className="tabular-nums">{quickView.qid_expiry ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Passport expiry</dt>
                      <dd className="tabular-nums">{quickView.passport_expiry ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Contract end</dt>
                      <dd className="tabular-nums">{quickView.contract_end ?? "—"}</dd>
                    </div>
                  </>
                ) : null}
              </dl>
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("people.staff.hrAlerts", "HR alerts")}
                </p>
                <HrAlertBadges alerts={staffHrAlerts(quickView)} />
              </div>
              <div className="mt-6 flex flex-col gap-2">
                <Button asChild className="w-full">
                  <Link href={`/people/staff/${quickView.id}`}>
                    {t("people.staff.viewProfile", "View full profile")}
                  </Link>
                </Button>
                {canEdit ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      onEdit(quickView);
                      setQuickView(null);
                    }}
                  >
                    {t("people.staff.editEmployee", "Edit")}
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <StaffMasterfileImportDialog open={importOpen} onOpenChange={setImportOpen} locationId={locationId} />
    </div>
  );
}
