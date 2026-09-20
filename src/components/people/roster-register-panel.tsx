"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, LayoutList, Loader2, Pencil, Trash2 } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ShiftRangeEditor } from "@/components/people/shift-range-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermission } from "@/hooks/use-permission";
import { useSites } from "@/hooks/queries/useSites";
import {
  deleteRosterAssignment,
  deleteRosterAssignments,
  listUploadedRosterAssignments,
  updateRosterAssignment,
  type RosterRegisterRow,
} from "@/lib/attendance-hr/roster-register.functions";
import { formatPayrollRange } from "@/lib/attendance-hr/roster-period";
import {
  buildRosterMatrix,
  filterRosterRegisterRows,
  isWeekendYmd,
  rosterMatrixCellKey,
  rosterRegisterHasExtraFilters,
} from "@/lib/attendance-hr/roster-register-scope";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { cn } from "@/lib/utils";

export type RosterSourceFilter = "all" | "upload" | "amend" | "manual" | "copied";

export type RosterRegisterPanelHandle = {
  openDeleteAll: () => void;
};

export type RosterDeleteAllState = {
  canDelete: boolean;
  disabled: boolean;
};

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
  /** Lets the parent page mirror Delete all in its header. */
  onDeleteAllStateChange?: (state: RosterDeleteAllState) => void;
};

type Draft = {
  shiftStart: string | null;
  shiftEnd: string | null;
  isWeekOff: boolean;
};

type ViewMode = "grid" | "list";

function sourceLabel(source: string, t: (key: string) => string) {
  if (source === "amend") return t("people.roster.registerSourceAmend");
  if (source === "upload") return t("people.roster.registerSourceUpload");
  if (source === "manual") return t("people.roster.registerSourceManual");
  if (source === "copied") return t("people.roster.registerSourceCopied");
  return source;
}

function weekdayShort(ymd: string, locale: string) {
  const intlLocale = locale.toLowerCase().startsWith("ar") ? "ar" : "en-GB";
  return new Intl.DateTimeFormat(intlLocale, { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${ymd.slice(0, 10)}T12:00:00.000Z`),
  );
}

function monthLabel(monthKey: string, locale: string) {
  const intlLocale = locale.toLowerCase().startsWith("ar") ? "ar" : "en-GB";
  return new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${monthKey}-01T12:00:00.000Z`),
  );
}

function dayNumber(ymd: string) {
  return Number(ymd.slice(8, 10));
}

export const RosterRegisterPanel = forwardRef<RosterRegisterPanelHandle, RosterRegisterPanelProps>(
  function RosterRegisterPanel(
    {
      dateFrom,
      dateTo,
      defaultLocationId,
      refreshToken,
      sourceUploadOnly = true,
      showSourceFilter = false,
      hideHeader = false,
      maxHeight = 480,
      onDeleteAllStateChange,
    },
    ref,
  ) {
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
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [deleteAllOpen, setDeleteAllOpen] = useState(false);

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
            ? (sourceFilter as "upload" | "amend" | "manual" | "copied")
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

    const filtered = useMemo(
      () => filterRosterRegisterRows(rows, { staffId, search: query }),
      [rows, query, staffId],
    );

    const matrix = useMemo(
      () => buildRosterMatrix(filtered, dateFrom, dateTo),
      [filtered, dateFrom, dateTo],
    );

    const editingRow = useMemo(
      () => (editingId ? filtered.find((row) => row.id === editingId) ?? null : null),
      [editingId, filtered],
    );

    const hasExtraFilters = rosterRegisterHasExtraFilters({
      locationId,
      staffId,
      sourceUploadOnly,
      source: !sourceUploadOnly && sourceFilter !== "all" ? sourceFilter : null,
      search: query,
    });
    const periodRange = formatPayrollRange(dateFrom, dateTo, i18n.language);

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

    const deleteAllMut = useMutation({
      mutationFn: () =>
        deleteRosterAssignments({
          locationId: locationId || null,
          staffId: staffId || null,
          dateFrom,
          dateTo,
          sourceUploadOnly,
          source: !sourceUploadOnly && sourceFilter !== "all" ? sourceFilter : null,
          search: query.trim() || null,
        }),
      onSuccess: (result) => {
        toast.success(t("people.roster.registerDeletedAll", { count: result.deleted }));
        setDeleteAllOpen(false);
        setEditingId(null);
        setDraft(null);
        void qc.invalidateQueries({ queryKey: queryKeys.people.all });
      },
      onError: (e: Error) => toast.error(e.message),
    });

    const deleting = deleteMut.isPending || deleteAllMut.isPending;
    const deleteAllDisabled = filtered.length === 0 || deleting || register.isLoading;

    useImperativeHandle(
      ref,
      () => ({
        openDeleteAll: () => {
          if (canAmend) setDeleteAllOpen(true);
        },
      }),
      [canAmend],
    );

    useEffect(() => {
      onDeleteAllStateChange?.({ canDelete: canAmend, disabled: deleteAllDisabled });
    }, [canAmend, deleteAllDisabled, onDeleteAllStateChange]);

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

    const confirmDelete = (id: string) => {
      if (window.confirm(t("people.roster.registerDeleteConfirm"))) {
        deleteMut.mutate(id);
      }
    };

    const emptyMessage = sourceUploadOnly
      ? t("people.roster.registerEmpty")
      : t("people.roster.registerEmptyAll");

    const deleteAllButton = canAmend ? (
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="shrink-0"
        disabled={deleteAllDisabled}
        onClick={() => setDeleteAllOpen(true)}
      >
        {deleteAllMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        {t("people.roster.registerDeleteAll")}
      </Button>
    ) : null;

    const viewToggle = (
      <div className="inline-flex shrink-0 rounded-lg border border-border/70 p-0.5">
        <Button
          type="button"
          size="sm"
          variant={viewMode === "grid" ? "secondary" : "ghost"}
          className="h-8 gap-1.5 px-2.5"
          onClick={() => setViewMode("grid")}
          aria-pressed={viewMode === "grid"}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          {t("people.roster.registerViewGrid")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={viewMode === "list" ? "secondary" : "ghost"}
          className="h-8 gap-1.5 px-2.5"
          onClick={() => setViewMode("list")}
          aria-pressed={viewMode === "list"}
        >
          <LayoutList className="h-3.5 w-3.5" />
          {t("people.roster.registerViewList")}
        </Button>
      </div>
    );

    const renderAmendActions = (row: RosterRegisterRow, compact = false) => {
      if (!canAmend) return null;
      const editing = editingId === row.id && draft && viewMode === "list";
      if (editing) {
        return (
          <div className="flex flex-wrap justify-end gap-1">
            <Button type="button" size="sm" disabled={saveMut.isPending} onClick={() => saveMut.mutate(row)}>
              {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("people.roster.registerSave")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
              {t("people.roster.closePreview")}
            </Button>
          </div>
        );
      }
      return (
        <div className={cn("flex flex-wrap gap-1", compact ? "justify-center" : "justify-end")}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={compact ? "h-7 px-1.5" : undefined}
            onClick={() => startEdit(row)}
            aria-label={t("people.roster.registerAmend")}
          >
            <Pencil className="h-3.5 w-3.5" />
            {compact ? null : t("people.roster.registerAmend")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={compact ? "h-7 px-1.5 text-destructive" : undefined}
            disabled={deleting}
            onClick={() => confirmDelete(row.id)}
            aria-label={t("common.delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      );
    };

    return (
      <div className="surface-card space-y-4 overflow-visible p-5">
        <div className="space-y-1">
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {!hideHeader ? <h2 className="text-sm font-semibold">{t("people.roster.registerTitle")}</h2> : null}
              <Badge variant="outline">{periodRange}</Badge>
              <Badge variant="secondary">{t("people.roster.registerCount", { count: filtered.length })}</Badge>
              <Badge variant="outline">
                {t("people.roster.registerStaffCount", { count: matrix.staff.length })}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {viewToggle}
              {deleteAllButton}
            </div>
          </div>
          {!hideHeader ? (
            <p className="text-xs text-muted-foreground">
              {sourceUploadOnly ? t("people.roster.registerHelp") : t("people.roster.registerHelpAll")}
            </p>
          ) : null}
        </div>

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
                  { value: "copied", label: t("people.roster.registerSourceCopied") },
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
        ) : viewMode === "grid" ? (
          <div className="overflow-auto rounded-lg border border-border/70" style={{ maxHeight }}>
            <table className="min-w-max border-collapse text-xs">
              <thead className="sticky top-0 z-20">
                <tr className="bg-muted/80">
                  <th
                    colSpan={2}
                    className="sticky start-0 z-30 border-b border-e border-border/70 bg-muted/95 px-2 py-1.5 text-start font-semibold"
                  >
                    {t("people.roster.registerColEmployee")}
                  </th>
                  {matrix.monthSpans.map((span) => (
                    <th
                      key={span.monthKey}
                      colSpan={span.count}
                      className="border-b border-border/70 px-1 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {monthLabel(span.monthKey, i18n.language)}
                    </th>
                  ))}
                </tr>
                <tr className="bg-card">
                  <th className="sticky start-0 z-30 w-10 border-b border-e border-border/70 bg-card px-1.5 py-1 text-center font-medium">
                    {t("people.roster.registerColNo")}
                  </th>
                  <th className="sticky start-10 z-30 min-w-[11rem] border-b border-e border-border/70 bg-card px-2 py-1 text-start font-medium">
                    {t("people.roster.colStaff")}
                  </th>
                  {matrix.dates.map((ymd) => {
                    const weekend = isWeekendYmd(ymd);
                    return (
                      <th
                        key={`wd-${ymd}`}
                        className={cn(
                          "min-w-[4.75rem] border-b border-border/60 px-1 py-1 text-center font-medium",
                          weekend ? "bg-destructive/10 text-destructive" : "bg-muted/40 text-muted-foreground",
                        )}
                      >
                        {weekdayShort(ymd, i18n.language)}
                      </th>
                    );
                  })}
                </tr>
                <tr className="bg-card">
                  <th className="sticky start-0 z-30 border-b border-e border-border/70 bg-card" />
                  <th className="sticky start-10 z-30 border-b border-e border-border/70 bg-card" />
                  {matrix.dates.map((ymd) => {
                    const weekend = isWeekendYmd(ymd);
                    return (
                      <th
                        key={`dn-${ymd}`}
                        className={cn(
                          "border-b border-border/60 px-1 py-1 text-center tabular-nums font-semibold",
                          weekend ? "bg-destructive/5" : "bg-card",
                        )}
                      >
                        {dayNumber(ymd)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {matrix.staff.map((person, index) => (
                  <tr key={person.staffId} className="border-b border-border/50">
                    <td className="sticky start-0 z-10 border-e border-border/70 bg-card px-1.5 py-1 text-center tabular-nums text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="sticky start-10 z-10 min-w-[11rem] max-w-[14rem] border-e border-border/70 bg-card px-2 py-1.5">
                      <div className="truncate font-medium leading-tight">{person.staffName || "—"}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {person.employeeCode || person.qid || ""}
                      </div>
                    </td>
                    {matrix.dates.map((ymd) => {
                      const weekend = isWeekendYmd(ymd);
                      const entries = matrix.byStaffDate.get(rosterMatrixCellKey(person.staffId, ymd)) ?? [];
                      return (
                        <td
                          key={`${person.staffId}-${ymd}`}
                          className={cn(
                            "align-top border-border/40 px-0.5 py-0.5",
                            weekend ? "bg-muted/50" : "bg-card",
                          )}
                        >
                          {entries.length === 0 ? (
                            <div className="min-h-[2.75rem]" />
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {entries.map((entry) => (
                                <div
                                  key={entry.id}
                                  className={cn(
                                    "group relative rounded-md px-1 py-1",
                                    entry.isWeekOff
                                      ? "bg-destructive/10 text-destructive"
                                      : "hover:bg-muted/60",
                                  )}
                                >
                                  {entry.isWeekOff ? (
                                    <div className="text-center text-[11px] font-semibold uppercase tracking-wide">
                                      {t("people.roster.registerCellOff")}
                                    </div>
                                  ) : (
                                    <div className="text-center leading-tight tabular-nums">
                                      <div>{entry.shiftStart || "—"}</div>
                                      <div className="text-muted-foreground">{entry.shiftEnd || "—"}</div>
                                    </div>
                                  )}
                                  {entry.locationCode ? (
                                    <div className="mt-0.5 text-center text-[9px] text-muted-foreground">
                                      {entry.locationCode}
                                    </div>
                                  ) : null}
                                  {canAmend ? (
                                    <div className="mt-1 flex justify-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                      {renderAmendActions(entry, true)}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                      {canAmend ? <TableCell className="text-end">{renderAmendActions(row)}</TableCell> : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog
          open={viewMode === "grid" && Boolean(editingRow && draft)}
          onOpenChange={(open) => {
            if (!open && !saveMut.isPending) cancelEdit();
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("people.roster.registerAmend")}</DialogTitle>
              <DialogDescription>
                {editingRow
                  ? `${editingRow.staffName || editingRow.employeeCode || "—"} · ${editingRow.workDate}${
                      editingRow.locationCode ? ` · ${editingRow.locationCode}` : ""
                    }`
                  : null}
              </DialogDescription>
            </DialogHeader>
            {editingRow && draft ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{t("people.roster.colShift")}</Label>
                  <ShiftRangeEditor
                    start={draft.shiftStart}
                    end={draft.shiftEnd}
                    disabled={draft.isWeekOff}
                    onStartChange={(value) => setDraft((prev) => (prev ? { ...prev, shiftStart: value } : prev))}
                    onEndChange={(value) => setDraft((prev) => (prev ? { ...prev, shiftEnd: value } : prev))}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.isWeekOff}
                    onChange={(e) => setDraft((prev) => (prev ? { ...prev, isWeekOff: e.target.checked } : prev))}
                  />
                  {draft.isWeekOff ? t("people.roster.dutyOff") : t("people.roster.dutyYes")}
                </label>
                <Badge variant="outline">{sourceLabel(editingRow.source, t)}</Badge>
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="destructive"
                disabled={!editingRow || deleting}
                onClick={() => editingRow && confirmDelete(editingRow.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("common.delete")}
              </Button>
              <Button type="button" variant="outline" onClick={cancelEdit} disabled={saveMut.isPending}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={!editingRow || saveMut.isPending}
                onClick={() => editingRow && saveMut.mutate(editingRow)}
              >
                {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("people.roster.registerSave")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteAllOpen} onOpenChange={(open) => !open && !deleteAllMut.isPending && setDeleteAllOpen(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("people.roster.registerDeleteAllTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {hasExtraFilters
                  ? t("people.roster.registerDeleteAllConfirmFiltered", { count: filtered.length, range: periodRange })
                  : t("people.roster.registerDeleteAllConfirmPeriod", { count: filtered.length, range: periodRange })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteAllMut.isPending}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteAllMut.isPending || filtered.length === 0}
                onClick={(e) => {
                  e.preventDefault();
                  deleteAllMut.mutate();
                }}
              >
                {deleteAllMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("people.roster.registerDeleteAllConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  },
);

RosterRegisterPanel.displayName = "RosterRegisterPanel";
