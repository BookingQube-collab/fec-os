"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Columns3, Download, Eye, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StaffAvatar } from "@/components/people/staff-photo-field";
import { StaffMasterfileImportDialog } from "@/components/people/staff-masterfile-import-dialog";
import { useMasterDepartments } from "@/hooks/queries/useDepartments";
import { usePermission } from "@/hooks/use-permission";
import { queryKeys } from "@/lib/query-keys";
import {
  computeStaffDirectoryKpis,
  filterStaffDirectory,
  type StaffDirectorySort,
} from "@/lib/staff-directory-kpis";
import { archiveStaffMember, restoreStaffMember } from "@/lib/staff-roster.functions";
import type { StaffRow } from "@/lib/queries/module-queries.core";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { STAFF_DIRECTORY_STATUSES } from "@/lib/staff-status";
import { cn } from "@/lib/utils";

function formatLocation(s: StaffRow): string {
  return formatLocationLabel(s.location_code, s.location_name);
}

const ALL_COLUMNS = [
  "photo",
  "code",
  "name",
  "dept",
  "position",
  "location",
  "type",
  "sponsorship",
  "nationality",
  "mobile",
  "joining",
  "qid_expiry",
  "passport_expiry",
  "status",
] as const;

type ColKey = (typeof ALL_COLUMNS)[number];

export function StaffDirectory({
  staff,
  locationId,
  canEdit,
  onEdit,
  onArchive,
}: {
  staff: StaffRow[];
  locationId: string | null;
  canEdit: boolean;
  onEdit: (row: StaffRow) => void;
  onArchive: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { data: departments = [] } = useMasterDepartments();
  const canSalary = usePermission("people.view_salary");
  const canImport = usePermission("people.import_roster");
  const canSensitive = usePermission("hr.profile.view_sensitive") || canSalary;
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [position, setPosition] = useState("");
  const [type, setType] = useState("");
  const [e3, setE3] = useState("");
  const [status, setStatus] = useState("active");
  const [missing, setMissing] = useState(false);
  const [loc, setLoc] = useState("");
  const [department, setDepartment] = useState("");
  const [nationality, setNationality] = useState("");
  const [gender, setGender] = useState("");
  const [sponsorship, setSponsorship] = useState("");
  const [expiry, setExpiry] = useState("");
  const [sort, setSort] = useState<StaffDirectorySort>("name");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quickView, setQuickView] = useState<StaffRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(
    () => new Set(["photo", "code", "name", "dept", "position", "location", "type", "mobile", "joining", "status"]),
  );
  const pageSize = 25;

  const restoreMut = useMutation({
    mutationFn: (id: string) => restoreStaffMember({ id }),
    onSuccess: () => {
      toast.success(t("people.staff.restore"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.staff(locationId, true) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const positions = useMemo(
    () => [...new Set(staff.map((s) => s.job_title).filter(Boolean))] as string[],
    [staff],
  );
  const nationalities = useMemo(
    () => [...new Set(staff.map((s) => s.nationality).filter(Boolean))] as string[],
    [staff],
  );
  const locations = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staff) {
      if (s.location_code) map.set(s.location_code, formatLocationLabel(s.location_code, s.location_name));
      for (const wl of s.work_locations ?? []) {
        if (wl.code && !map.has(wl.code)) map.set(wl.code, formatLocationLabel(wl.code, wl.name));
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [staff]);

  const departmentOptions = useMemo(
    () =>
      departments
        .filter((d) => d.active)
        .map((d) => ({ value: d.id, label: d.name, keywords: `${d.name} ${d.code ?? ""}` })),
    [departments],
  );

  const departmentName = useMemo(
    () => departments.find((d) => d.id === department)?.name ?? "",
    [departments, department],
  );

  const filtered = filterStaffDirectory(staff, {
    q,
    loc,
    position,
    department,
    departmentName,
    type,
    e3,
    status,
    nationality,
    gender,
    sponsorship,
    missing,
    expiry,
    sort,
  });
  const kpis = computeStaffDirectoryKpis(filtered);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  function setStatusKpi(next: string) {
    setStatus((prev) => (prev === next ? "" : next));
    setExpiry("");
    setPage(1);
  }

  function setExpiryKpi(next: string) {
    setExpiry((prev) => (prev === next ? "" : next));
    setPage(1);
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

  return (
    <div className="space-y-3">
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9"
        role="region"
        aria-label={t("people.staff.kpiStrip")}
      >
        <button type="button" className={cn("text-start", !status && !expiry && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => { setStatus(""); setExpiry(""); setPage(1); }}>
          <TintedKpiCard title={t("people.staff.kpiTotal")} value={kpis.total} tint="sky" compact />
        </button>
        <button type="button" className={cn("text-start", status === "active" && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => setStatusKpi("active")}>
          <TintedKpiCard title={t("people.staff.kpiActive", "Active")} value={kpis.active} tint="green" compact />
        </button>
        <button type="button" className={cn("text-start", status === "secondment" && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => setStatusKpi("secondment")}>
          <TintedKpiCard title={t("people.staff.kpiSecondment")} value={kpis.secondment} tint="orange" compact />
        </button>
        <button type="button" className={cn("text-start", status === "remote" && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => setStatusKpi("remote")}>
          <TintedKpiCard title={t("people.staff.kpiRemote", "Remote")} value={kpis.remote} tint="sky" compact />
        </button>
        <button type="button" className={cn("text-start", status === "on_leave" && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => setStatusKpi("on_leave")}>
          <TintedKpiCard title={t("people.staff.kpiOnLeave", "On Leave")} value={kpis.onLeave} tint="amber" compact />
        </button>
        <button type="button" className={cn("text-start", status === "resigned" && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => setStatusKpi("resigned")}>
          <TintedKpiCard title={t("people.staff.kpiResigned", "Resigned")} value={kpis.resigned} tint="amber" compact />
        </button>
        <button type="button" className={cn("text-start", status === "terminated" && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => setStatusKpi("terminated")}>
          <TintedKpiCard title={t("people.staff.kpiTerminated", "Terminated")} value={kpis.terminated} tint="red" compact />
        </button>
        <button type="button" className={cn("text-start", expiry === "qid_expiring" && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => setExpiryKpi("qid_expiring")}>
          <TintedKpiCard title={t("people.staff.kpiQidExpiring", "QID Expiring")} value={kpis.qidExpiringSoon} tint="red" compact />
        </button>
        <button type="button" className={cn("text-start", expiry === "passport_expiring" && "ring-2 ring-primary/30 rounded-2xl")} onClick={() => setExpiryKpi("passport_expiring")}>
          <TintedKpiCard title={t("people.staff.kpiPassportExpiring", "Passport Expiring")} value={kpis.passportExpiringSoon} tint="red" compact />
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Input
          className="max-w-xs"
          placeholder={t("people.staff.searchWide", "Search code, name, QID, passport, mobile, position…")}
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <SearchableSelect value={loc} onValueChange={(next) => { setLoc(next); setPage(1); }} placeholder={t("people.staff.allLocations")} emptyOption={{ value: "", label: t("people.staff.allLocations") }} options={locations.map(([code, label]) => ({ value: code, label, keywords: `${code} ${label}` }))} triggerClassName="h-10 min-h-10 w-auto min-w-[9.5rem] font-normal" className="w-auto" />
        <SearchableSelect value={department} onValueChange={(next) => { setDepartment(next); setPage(1); }} placeholder={t("people.staff.allDepartments")} emptyOption={{ value: "", label: t("people.staff.allDepartments") }} options={departmentOptions} triggerClassName="h-10 min-h-10 w-auto min-w-[9.5rem] font-normal" className="w-auto" />
        <SearchableSelect value={position} onValueChange={(next) => { setPosition(next); setPage(1); }} placeholder={t("people.staff.allPositions")} emptyOption={{ value: "", label: t("people.staff.allPositions") }} options={positions.map((p) => ({ value: p, label: p }))} triggerClassName="h-10 min-h-10 w-auto min-w-[9.5rem] font-normal" className="w-auto" />
        <SearchableSelect value={type} onValueChange={(next) => { setType(next); setPage(1); }} placeholder={t("people.staff.allTypes")} emptyOption={{ value: "", label: t("people.staff.allTypes") }} options={[{ value: "permanent", label: t("people.staff.employmentTypes.permanent") }, { value: "secondment", label: t("people.staff.employmentTypes.secondment") }, { value: "joker", label: t("people.staff.employmentTypes.joker") }, { value: "temporary", label: t("people.staff.employmentTypes.temporary") }]} triggerClassName="h-10 min-h-10 w-auto min-w-[9.5rem] font-normal" className="w-auto" />
        <SearchableSelect value={status} onValueChange={(next) => { setStatus(next); setPage(1); }} placeholder={t("people.staff.status")} emptyOption={{ value: "", label: t("people.staff.allStatuses", "All statuses") }} options={STAFF_DIRECTORY_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} triggerClassName="h-10 min-h-10 w-auto min-w-[9.5rem] font-normal" className="w-auto" />
        {nationalities.length ? (
          <SearchableSelect value={nationality} onValueChange={(next) => { setNationality(next); setPage(1); }} placeholder={t("people.staff.nationality", "Nationality")} emptyOption={{ value: "", label: t("people.staff.allNationalities", "All nationalities") }} options={nationalities.map((n) => ({ value: n, label: n }))} triggerClassName="h-10 min-h-10 w-auto min-w-[9.5rem] font-normal" className="w-auto" />
        ) : null}
        <SearchableSelect value={gender} onValueChange={(next) => { setGender(next); setPage(1); }} placeholder={t("people.staff.gender", "Gender")} emptyOption={{ value: "", label: t("people.staff.allGenders", "All genders") }} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }]} triggerClassName="h-10 min-h-10 w-auto min-w-[8rem] font-normal" className="w-auto" />
        <Input className="max-w-[8rem]" placeholder={t("people.staff.sponsorship", "Sponsorship")} value={sponsorship} onChange={(e) => { setSponsorship(e.target.value); setPage(1); }} />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={missing} onChange={(e) => { setMissing(e.target.checked); setPage(1); }} />
          {t("people.staff.missingInfo")}
        </label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary"><Columns3 className="mr-1 h-3 w-3" /> {t("people.staff.columns", "Columns")}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
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
                {key.replace(/_/g, " ")}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary"><Download className="mr-1 h-3 w-3" /> {t("people.staff.downloadMaster", "Download Employee Master Excel")}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void exportRoster("all", "xlsx").catch((e) => toast.error((e as Error).message))}>All</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void exportRoster("active", "xlsx").catch((e) => toast.error((e as Error).message))}>Active</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void exportRoster("filtered", "xlsx").catch((e) => toast.error((e as Error).message))}>Current Filtered</DropdownMenuItem>
            <DropdownMenuItem disabled={!selected.size} onClick={() => void exportRoster("selected", "xlsx").catch((e) => toast.error((e as Error).message))}>Selected ({selected.size})</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void exportRoster("filtered", "csv").catch((e) => toast.error((e as Error).message))}>Filtered CSV</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {canImport ? (
          <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1 h-3 w-3" /> {t("people.staff.importMaster", "Import E3 Masterfile")}
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface/95 text-xs uppercase tracking-wider text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-2 py-2 text-left">
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
              {col("photo") ? <th className="px-3 py-2 text-left">{t("people.staff.photo")}</th> : null}
              {col("code") ? <th className="px-3 py-2 text-left">{t("people.staff.code")}</th> : null}
              {col("name") ? <th className="px-3 py-2 text-left">{t("people.staff.name")}</th> : null}
              {col("dept") ? <th className="px-3 py-2 text-left">{t("people.staff.dept")}</th> : null}
              {col("position") ? <th className="px-3 py-2 text-left">{t("people.staff.title")}</th> : null}
              {col("location") ? <th className="px-3 py-2 text-left">{t("people.staff.location")}</th> : null}
              {col("type") ? <th className="px-3 py-2 text-left">{t("people.staff.type")}</th> : null}
              {col("sponsorship") ? <th className="px-3 py-2 text-left">{t("people.staff.sponsorship", "Sponsorship")}</th> : null}
              {col("nationality") ? <th className="px-3 py-2 text-left">{t("people.staff.nationality", "Nationality")}</th> : null}
              {col("mobile") ? <th className="px-3 py-2 text-left">{t("people.staff.contact")}</th> : null}
              {col("joining") ? <th className="px-3 py-2 text-left">{t("people.staff.hireDate")}</th> : null}
              {col("qid_expiry") ? <th className="px-3 py-2 text-left">{t("people.staff.qidExpiry", "QID expiry")}</th> : null}
              {col("passport_expiry") ? <th className="px-3 py-2 text-left">{t("people.staff.passportExpiry", "Passport expiry")}</th> : null}
              {col("status") ? <th className="px-3 py-2 text-left">{t("people.staff.status")}</th> : null}
              <th className="px-3 py-2 text-right">{t("people.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((s) => (
              <tr key={s.id} className="border-t border-border hover:bg-surface/40">
                <td className="px-2 py-2">
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
                {col("photo") ? (
                  <td className="px-3 py-2">
                    <StaffAvatar staffId={s.id} name={s.full_name} hasPhoto={s.has_photo} photoUpdatedAt={s.photo_updated_at} />
                  </td>
                ) : null}
                {col("code") ? <td className="px-3 py-2 font-mono text-xs">{s.employee_code}</td> : null}
                {col("name") ? (
                  <td className="px-3 py-2 font-medium">
                    <Link className="hover:underline" href={`/people/staff/${s.id}`}>{s.full_name}</Link>
                  </td>
                ) : null}
                {col("dept") ? (
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {s.department || (s.department_names?.length ? s.department_names.join(", ") : "—")}
                  </td>
                ) : null}
                {col("position") ? <td className="px-3 py-2 text-xs text-muted-foreground">{s.job_title ?? "—"}</td> : null}
                {col("location") ? (
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-1">
                      <span>{formatLocation(s)}</span>
                      {s.is_roaming || (s.work_locations?.length ?? 0) > 1 ? (
                        <Badge variant="outline" className="text-[10px] uppercase">{t("people.staff.multiSite")}</Badge>
                      ) : null}
                    </div>
                  </td>
                ) : null}
                {col("type") ? (
                  <td className="px-3 py-2 text-xs">
                    {s.employment_type ? t(`people.staff.employmentTypes.${s.employment_type}`, s.employment_type) : "—"}
                  </td>
                ) : null}
                {col("sponsorship") ? <td className="px-3 py-2 text-xs">{s.sponsorship_info ?? "—"}</td> : null}
                {col("nationality") ? <td className="px-3 py-2 text-xs">{s.nationality ?? "—"}</td> : null}
                {col("mobile") ? <td className="px-3 py-2 text-xs">{s.phone ?? "—"}</td> : null}
                {col("joining") ? <td className="px-3 py-2 text-xs tabular-nums">{s.hire_date ?? "—"}</td> : null}
                {col("qid_expiry") ? <td className="px-3 py-2 text-xs tabular-nums">{canSensitive ? (s.qid_expiry ?? "—") : "••••"}</td> : null}
                {col("passport_expiry") ? <td className="px-3 py-2 text-xs tabular-nums">{canSensitive ? (s.passport_expiry ?? "—") : "••••"}</td> : null}
                {col("status") ? (
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="uppercase text-[10px]">{s.status}</Badge>
                  </td>
                ) : null}
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setQuickView(s)} title="Quick view">
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/people/staff/${s.id}`}>{t("people.staff.view")}</Link>
                    </Button>
                    {canEdit ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => onEdit(s)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {s.status === "terminated" || s.status === "resigned" || s.status === "released" ? (
                          <Button size="sm" variant="ghost" onClick={() => restoreMut.mutate(s.id)}>
                            {t("people.staff.restore")}
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => onArchive(s.id)}>
                            <Trash2 className="h-3 w-3 text-rose-400" />
                          </Button>
                        )}
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("people.staff.page", { page, pages })} · {filtered.length}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Button>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</Button>
        </div>
      </div>

      <Sheet open={Boolean(quickView)} onOpenChange={(open) => !open && setQuickView(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {quickView ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <StaffAvatar staffId={quickView.id} name={quickView.full_name} hasPhoto={quickView.has_photo} photoUpdatedAt={quickView.photo_updated_at} />
                  <span>{quickView.full_name}</span>
                </SheetTitle>
              </SheetHeader>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Code</dt><dd className="font-mono">{quickView.employee_code}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Position</dt><dd>{quickView.job_title ?? "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Department</dt><dd>{quickView.department ?? "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Location</dt><dd>{formatLocation(quickView)}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Status</dt><dd><Badge variant="outline" className="uppercase text-[10px]">{quickView.status}</Badge></dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Mobile</dt><dd>{quickView.phone ?? "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Joined</dt><dd>{quickView.hire_date ?? "—"}</dd></div>
              </dl>
              <Button asChild className="mt-6 w-full">
                <Link href={`/people/staff/${quickView.id}`}>Open full profile</Link>
              </Button>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <StaffMasterfileImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        locationId={locationId}
      />
    </div>
  );
}
