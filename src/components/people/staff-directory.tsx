"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { usePermission } from "@/hooks/use-permission";
import { queryKeys } from "@/lib/query-keys";
import { archiveStaffMember, restoreStaffMember } from "@/lib/staff-roster.functions";
import type { StaffRow } from "@/lib/queries/module-queries.core";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { isActiveStaffStatus } from "@/lib/staff-status";

function formatLocation(s: StaffRow): string {
  return formatLocationLabel(s.location_code, s.location_name);
}

function staffLocationCodes(s: StaffRow): string[] {
  const codes = new Set<string>();
  if (s.location_code) codes.add(s.location_code);
  for (const loc of s.work_locations ?? []) {
    if (loc.code) codes.add(loc.code);
  }
  return [...codes];
}

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
  const canSalary = usePermission("people.view_salary");
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [position, setPosition] = useState("");
  const [type, setType] = useState("");
  const [e3, setE3] = useState("");
  const [status, setStatus] = useState("active");
  const [missing, setMissing] = useState(false);
  const [loc, setLoc] = useState("");
  const [sort, setSort] = useState<"name" | "code" | "location">("name");
  const [page, setPage] = useState(1);
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
  const locations = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staff) {
      if (s.location_code) map.set(s.location_code, formatLocationLabel(s.location_code, s.location_name));
      for (const loc of s.work_locations ?? []) {
        if (loc.code && !map.has(loc.code)) map.set(loc.code, formatLocationLabel(loc.code, loc.name));
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [staff]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return staff
      .filter((s) => {
        if (needle) {
          const blob = `${s.full_name} ${s.employee_code} ${s.qid ?? ""} ${s.phone ?? ""}`.toLowerCase();
          if (!blob.includes(needle)) return false;
        }
                        if (loc && !staffLocationCodes(s).includes(loc)) return false;
        if (position && s.job_title !== position) return false;
        if (type && s.employment_type !== type) return false;
        if (e3 === "yes" && s.e3_enrolled !== true) return false;
        if (e3 === "no" && s.e3_enrolled !== false) return false;
        if (status === "active" && !isActiveStaffStatus(s.status)) return false;
        if (status === "inactive" && isActiveStaffStatus(s.status)) return false;
        if (missing && s.qid && s.phone && s.hire_date) return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === "code") return a.employee_code.localeCompare(b.employee_code);
        if (sort === "location") return formatLocation(a).localeCompare(formatLocation(b));
        return a.full_name.localeCompare(b.full_name);
      });
  }, [staff, q, loc, position, type, e3, status, missing, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  async function exportRoster(format: "csv" | "xlsx") {
    const res = await fetch(
      `/api/people/roster-export?format=${format}${locationId ? `&locationId=${locationId}` : ""}`,
      { credentials: "include" },
    );
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
      a.download = body.filename ?? "employee-roster.csv";
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
      a.download = body.filename ?? "employee-roster.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          className="max-w-xs"
          placeholder={t("people.staff.search")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <SearchableSelect
          value={loc}
          onValueChange={(next) => { setLoc(next); setPage(1); }}
          placeholder={t("people.staff.allLocations")}
          emptyOption={{ value: "", label: t("people.staff.allLocations") }}
          options={locations.map(([code, label]) => ({ value: code, label, keywords: `${code} ${label}` }))}
          triggerClassName="h-10 min-h-10 w-auto min-w-[9.5rem] font-normal"
          className="w-auto"
        />
        <SearchableSelect
          value={position}
          onValueChange={(next) => { setPosition(next); setPage(1); }}
          placeholder={t("people.staff.allPositions")}
          emptyOption={{ value: "", label: t("people.staff.allPositions") }}
          options={positions.map((p) => ({ value: p, label: p }))}
          triggerClassName="h-10 min-h-10 w-auto min-w-[9.5rem] font-normal"
          className="w-auto"
        />
        <SearchableSelect
          value={type}
          onValueChange={(next) => { setType(next); setPage(1); }}
          placeholder={t("people.staff.allTypes")}
          emptyOption={{ value: "", label: t("people.staff.allTypes") }}
          options={[
            { value: "permanent", label: t("people.dashboard.permanent") },
            { value: "temporary", label: t("people.dashboard.temporary") },
          ]}
          triggerClassName="h-10 min-h-10 w-auto min-w-[9.5rem] font-normal"
          className="w-auto"
        />
        <SearchableSelect
          value={e3}
          onValueChange={(next) => { setE3(next); setPage(1); }}
          placeholder={t("people.staff.allE3")}
          emptyOption={{ value: "", label: t("people.staff.allE3") }}
          options={[
            { value: "yes", label: t("people.staff.e3Yes") },
            { value: "no", label: t("people.staff.e3No") },
          ]}
          triggerClassName="h-10 min-h-10 w-auto min-w-[9.5rem] font-normal"
          className="w-auto"
        />
        <SearchableSelect
          value={status}
          onValueChange={(next) => { setStatus(next); setPage(1); }}
          placeholder={t("people.staff.status")}
          emptyOption={{ value: "", label: t("people.staff.status") }}
          options={[
            { value: "active", label: t("people.staff.activeOnly") },
            { value: "inactive", label: t("people.staff.inactiveOnly") },
          ]}
          triggerClassName="h-10 min-h-10 w-auto min-w-[9.5rem] font-normal"
          className="w-auto"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={missing} onChange={(e) => { setMissing(e.target.checked); setPage(1); }} />
          {t("people.staff.missingInfo")}
        </label>
        <SearchableSelect
          value={sort}
          onValueChange={(next) => setSort(next as typeof sort)}
          options={[
            { value: "name", label: t("people.staff.name") },
            { value: "code", label: t("people.staff.code") },
            { value: "location", label: t("people.staff.location") },
          ]}
          triggerClassName="h-10 min-h-10 w-auto min-w-[9.5rem] font-normal"
          className="w-auto"
        />
        <Button size="sm" variant="secondary" onClick={() => void exportRoster("csv").catch((e) => toast.error((e as Error).message))}>
          <Download className="mr-1 h-3 w-3" /> {t("people.staff.exportCsv")}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void exportRoster("xlsx").catch((e) => toast.error((e as Error).message))}>
          <Download className="mr-1 h-3 w-3" /> {t("people.staff.exportXlsx")}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">{t("people.staff.code")}</th>
              <th className="px-3 py-2 text-left">{t("people.staff.name")}</th>
              <th className="px-3 py-2 text-left">{t("people.staff.qid")}</th>
              <th className="px-3 py-2 text-left">{t("people.staff.e3")}</th>
              <th className="px-3 py-2 text-left">{t("people.staff.type")}</th>
              <th className="px-3 py-2 text-left">{t("people.staff.contact")}</th>
              <th className="px-3 py-2 text-left">{t("people.staff.title")}</th>
              <th className="px-3 py-2 text-left">{t("people.staff.location")}</th>
              {canSalary ? <th className="px-3 py-2 text-right">{t("people.staff.salary")}</th> : null}
              <th className="px-3 py-2 text-left">{t("people.staff.status")}</th>
              {canEdit ? <th className="px-3 py-2 text-right">{t("people.actions")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((s) => (
              <tr key={s.id} className="border-t border-border hover:bg-surface/40">
                <td className="px-3 py-2 font-mono text-xs">{s.employee_code}</td>
                <td className="px-3 py-2 font-medium">
                  <Link className="hover:underline" href={`/people/staff/${s.id}`}>{s.full_name}</Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{s.qid ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{s.e3_enrolled == null ? "—" : s.e3_enrolled ? t("people.training.yes") : t("people.training.no")}</td>
                <td className="px-3 py-2 text-xs capitalize">{s.employment_type ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{s.phone ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{s.job_title ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-1">
                    <span>{formatLocation(s)}</span>
                    {s.is_roaming || (s.work_locations?.length ?? 0) > 1 ? (
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {t("people.staff.multiSite")}
                      </Badge>
                    ) : null}
                    {(s.work_locations ?? [])
                      .filter((loc) => loc.code && loc.code !== s.location_code)
                      .map((loc) => (
                        <Badge key={loc.id} variant="secondary" className="text-[10px]" title={formatLocationLabel(loc.code, loc.name)}>
                          {formatLocationLabel(loc.code, loc.name)}
                        </Badge>
                      ))}
                  </div>
                </td>
                {canSalary ? (
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {s.monthly_salary_qar != null ? s.monthly_salary_qar.toLocaleString() : "—"}
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  <Badge variant="outline" className="uppercase text-[10px]">{s.status}</Badge>
                </td>
                {canEdit ? (
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/people/staff/${s.id}`}>{t("people.staff.view")}</Link>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onEdit(s)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      {s.status === "terminated" ? (
                        <Button size="sm" variant="ghost" onClick={() => restoreMut.mutate(s.id)}>
                          {t("people.staff.restore")}
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => onArchive(s.id)}>
                          <Trash2 className="h-3 w-3 text-rose-400" />
                        </Button>
                      )}
                    </div>
                  </td>
                ) : null}
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
    </div>
  );
}
