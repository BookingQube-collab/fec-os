"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ShiftRangeEditor } from "@/components/people/shift-range-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermission } from "@/hooks/use-permission";
import { useSites } from "@/hooks/queries/useSites";
import {
  deleteRosterAssignment,
  listUploadedRosterAssignments,
  updateRosterAssignment,
  type RosterRegisterRow,
} from "@/lib/attendance-hr/roster-register.functions";
import { formatPayrollRange } from "@/lib/attendance-hr/roster-period";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { formatLocationLabel } from "@/lib/locations/normalize";

export type RosterSourceFilter = "all" | "upload" | "amend" | "manual";

type RosterRegisterPanelProps = {
  dateFrom: string;
  dateTo: string;
  defaultLocationId?: string | null;
  refreshToken?: number | string;
  /** When true (default), only upload + amend. Set false on the monthly roster page. */
  sourceUploadOnly?: boolean;
  /** Show source filter dropdown (useful when sourceUploadOnly is false). */
  showSourceFilter?: boolean;
  /** Hide the card title/help when the parent page already has a header. */
  hideHeader?: boolean;
  /** Table scroll height in px. */
  maxHeight?: number;
};

type Draft = {
  shiftStart: string | null;
  shiftEnd: string | null;
  isWeekOff: boolean;
};

function sourceLabel(source: string, t: (key: string) => string) {
  if (source === "amend") return t("people.roster.registerSourceAmend");
  if (source === "upload") return t("people.roster.registerSourceUpload");
  if (source === "manual") return t("people.roster.registerSourceManual");
  return source;
}

export function RosterRegisterPanel({
  dateFrom,
  dateTo,
  defaultLocationId,
  refreshToken,
  sourceUploadOnly = true,
  showSourceFilter = false,
  hideHeader = false,
  maxHeight = 480,
}: RosterRegisterPanelProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const canImportRoster = usePermission("people.import_roster");
  const canEditRoster = usePermission("people.edit_roster");
  const canUploadRoster = usePermission("daily_ops.roster.upload");
  const canAmend = canImportRoster || canEditRoster || canUploadRoster;
  const sites = useSites();

  const [locationId, setLocationId] = useState(defaultLocationId ?? "");
  const [staffId, setStaffId] = useState("");
  const [sourceFilter, setSourceFilter] = useState<RosterSourceFilter>("all");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (defaultLocationId && !locationId) setLocationId(defaultLocationId);
  }, [defaultLocationId, locationId]);

  const filters = useMemo(
    () => ({
      locationId: locationId || null,
      dateFrom,
      dateTo,
      sourceUploadOnly,
      source:
        !sourceUploadOnly && sourceFilter !== "all"
          ? (sourceFilter as "upload" | "amend" | "manual")
          : null,
    }),
    [locationId, dateFrom, dateTo, sourceUploadOnly, sourceFilter],
  );

  const register = useQuery({
    queryKey: [...queryKeys.people.rosterRegister(filters), refreshToken ?? 0],
    queryFn: () => listUploadedRosterAssignments(filters),
    staleTime: STALE.people,
    enabled: Boolean(dateFrom && dateTo),
  });

  const rows = register.data?.rows ?? [];

  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (!map.has(row.staffId)) {
        map.set(row.staffId, row.staffName || row.employeeCode || row.qid || row.staffId);
      }
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (staffId && row.staffId !== staffId) return false;
      if (!q) return true;
      return [row.staffName, row.employeeCode, row.qid, row.locationCode, row.workDate, row.source]
        .some((value) => String(value ?? "").toLowerCase().includes(q));
    });
  }, [rows, query, staffId]);

  const saveMut = useMutation({
    mutationFn: async (row: RosterRegisterRow) => {
      if (!draft) throw new Error(t("people.roster.registerNothingToSave"));
      return updateRosterAssignment({
        id: row.id,
        shiftStart: draft.isWeekOff ? null : draft.shiftStart,
        shiftEnd: draft.isWeekOff ? null : draft.shiftEnd,
        isWeekOff: draft.isWeekOff,
      });
    },
    onSuccess: () => {
      toast.success(t("people.roster.registerSaved"));
      setEditingId(null);
      setDraft(null);
      void qc.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteRosterAssignment({ id }),
    onSuccess: () => {
      toast.success(t("people.roster.registerDeleted"));
      setEditingId(null);
      setDraft(null);
      void qc.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (row: RosterRegisterRow) => {
    setEditingId(row.id);
    setDraft({
      shiftStart: row.shiftStart,
      shiftEnd: row.shiftEnd,
      isWeekOff: row.isWeekOff,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const emptyMessage = sourceUploadOnly
    ? t("people.roster.registerEmpty")
    : t("people.roster.registerEmptyAll");

  return (
    <div className="surface-card space-y-4 p-5">
      {!hideHeader ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{t("people.roster.registerTitle")}</h2>
            <Badge variant="outline">
              {formatPayrollRange(dateFrom, dateTo, i18n.language)}
            </Badge>
            <Badge variant="secondary">{t("people.roster.registerCount", { count: filtered.length })}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {sourceUploadOnly ? t("people.roster.registerHelp") : t("people.roster.registerHelpAll")}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {formatPayrollRange(dateFrom, dateTo, i18n.language)}
          </Badge>
          <Badge variant="secondary">{t("people.roster.registerCount", { count: filtered.length })}</Badge>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>{t("people.roster.registerFilterLocation")}</Label>
          <SearchableSelect
            value={locationId}
            onValueChange={setLocationId}
            emptyOption={{ value: "", label: t("people.roster.registerAllLocations") }}
            options={(sites.data ?? []).map((loc) => ({
              value: loc.id,
              label: formatLocationLabel(loc.code, loc.name),
            }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("people.roster.registerFilterStaff")}</Label>
          <SearchableSelect
            value={staffId}
            onValueChange={setStaffId}
            emptyOption={{ value: "", label: t("people.roster.registerAllStaff") }}
            options={staffOptions}
          />
        </div>
        {showSourceFilter && !sourceUploadOnly ? (
          <div className="space-y-1.5">
            <Label>{t("people.roster.registerFilterSource")}</Label>
            <SearchableSelect
              value={sourceFilter}
              onValueChange={(value) => setSourceFilter((value || "all") as RosterSourceFilter)}
              options={[
                { value: "all", label: t("people.roster.registerAllSources") },
                { value: "upload", label: t("people.roster.registerSourceUpload") },
                { value: "amend", label: t("people.roster.registerSourceAmend") },
                { value: "manual", label: t("people.roster.registerSourceManual") },
              ]}
            />
          </div>
        ) : null}
        <div className={`space-y-1.5 ${showSourceFilter && !sourceUploadOnly ? "" : "sm:col-span-2"}`}>
          <Label htmlFor="roster-register-search">{t("people.roster.searchRows")}</Label>
          <Input
            id="roster-register-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("people.roster.searchRows")}
          />
        </div>
      </div>

      {register.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("people.roster.registerLoading")}
        </p>
      ) : register.isError ? (
        <p className="text-sm text-destructive">
          {register.error instanceof Error ? register.error.message : t("people.roster.registerLoadFailed")}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-border/70" style={{ maxHeight }}>
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>{t("people.roster.colDate")}</TableHead>
                <TableHead>{t("people.roster.colStaff")}</TableHead>
                <TableHead>{t("people.roster.col.location")}</TableHead>
                <TableHead>{t("people.roster.colShift")}</TableHead>
                <TableHead>{t("people.roster.colDuty")}</TableHead>
                <TableHead>{t("people.roster.registerSource")}</TableHead>
                {canAmend ? <TableHead className="text-end">{t("people.roster.registerActions")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const editing = editingId === row.id && draft;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{row.workDate}</TableCell>
                    <TableCell>
                      <div className="font-medium">{row.staffName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{row.employeeCode || row.qid || ""}</div>
                    </TableCell>
                    <TableCell>{row.locationCode ?? "—"}</TableCell>
                    <TableCell>
                      {editing ? (
                        <ShiftRangeEditor
                          start={draft.shiftStart}
                          end={draft.shiftEnd}
                          disabled={draft.isWeekOff}
                          onStartChange={(value) => setDraft((prev) => (prev ? { ...prev, shiftStart: value } : prev))}
                          onEndChange={(value) => setDraft((prev) => (prev ? { ...prev, shiftEnd: value } : prev))}
                        />
                      ) : (
                        <ShiftRangeEditor start={row.shiftStart} end={row.shiftEnd} disabled={row.isWeekOff} readOnly />
                      )}
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={draft.isWeekOff}
                            onChange={(e) =>
                              setDraft((prev) => (prev ? { ...prev, isWeekOff: e.target.checked } : prev))
                            }
                          />
                          {draft.isWeekOff ? t("people.roster.dutyOff") : t("people.roster.dutyYes")}
                        </label>
                      ) : row.isWeekOff ? (
                        t("people.roster.dutyOff")
                      ) : (
                        t("people.roster.dutyYes")
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{sourceLabel(row.source, t)}</Badge>
                    </TableCell>
                    {canAmend ? (
                      <TableCell className="text-end">
                        {editing ? (
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              size="sm"
                              disabled={saveMut.isPending}
                              onClick={() => saveMut.mutate(row)}
                            >
                              {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                              {t("people.roster.registerSave")}
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
                              {t("people.roster.closePreview")}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button type="button" size="sm" variant="outline" onClick={() => startEdit(row)}>
                              <Pencil className="h-3.5 w-3.5" />
                              {t("people.roster.registerAmend")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={deleteMut.isPending}
                              onClick={() => {
                                if (window.confirm(t("people.roster.registerDeleteConfirm"))) {
                                  deleteMut.mutate(row.id);
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
