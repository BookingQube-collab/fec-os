"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, LayoutList, Loader2, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  forwardRef,
  memo,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FecLoader } from "@/components/fec";

import { OrgDepartmentsFilter } from "@/components/people/exclude-org-departments-filter";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCanAmendShiftRoster } from "@/hooks/use-auth";
import { filterDepartmentsForLocation } from "@/lib/department-audience";
import {
  ALL_ORG_DEPARTMENTS_CHECKED,
  activeShowOnlyOrgDepartments,
  orgDepartmentIdsFor,
  orgDepartmentSelectionIsAll,
  type OrgDepartmentChecks,
} from "@/lib/exclude-org-departments";
import { useMasterDepartments } from "@/hooks/queries/useDepartments";
import { useSites } from "@/hooks/queries/useSites";
import {
  createRosterAssignment,
  deleteRosterAssignment,
  deleteRosterAssignments,
  listRosterAssignStaff,
  listUploadedRosterAssignments,
  updateRosterAssignment,
  type RosterRegisterRow,
} from "@/lib/attendance-hr/roster-register.functions";
import { formatPayrollRange } from "@/lib/attendance-hr/roster-period";
import {
  buildRosterMatrix,
  filterRosterRegisterRows,
  isWeekendYmd,
  rosterDayStatusFromRow,
  rosterEmptyDayCanAdd,
  rosterEmptyPeriodShowsDayGrid,
  rosterMatrixCellKey,
  rosterPatchFromDayStatus,
  rosterRegisterHasExtraFilters,
  rosterTeamStaffForLocationCode,
  rosterTeamStaffForMatrix,
  type RosterDayStatus,
  type RosterMatrixStaff,
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
  selectedCount: number;
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
  /** Fires once the month grid request has settled so sibling fetches can start. */
  onGridFetched?: () => void;
};

type Draft = {
  locationId: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  dayStatus: RosterDayStatus;
  compOffForDate: string;
  compOffNote: string;
};

function dayStatusLabel(status: RosterDayStatus, t: (key: string) => string) {
  if (status === "weekly_off") return t("people.roster.dutyOff");
  if (status === "annual_leave") return t("people.roster.dutyAnnualLeave");
  if (status === "sick_leave") return t("people.roster.dutySickLeave");
  if (status === "comp_off") return t("people.roster.dutyCompOff");
  return t("people.roster.dutyYes");
}

function cellStatusLabel(row: Pick<RosterRegisterRow, "isWeekOff" | "leaveType">, t: (key: string) => string) {
  return dayStatusLabel(rosterDayStatusFromRow(row), t);
}

type ViewMode = "grid" | "list";

function sourceLabel(source: string, t: (key: string) => string) {
  if (source === "amend") return t("people.roster.registerSourceAmend");
  if (source === "upload") return t("people.roster.registerSourceUpload");
  if (source === "manual") return t("people.roster.registerSourceManual");
  if (source === "copied") return t("people.roster.registerSourceCopied");
  if (source === "device_punch") return t("people.roster.registerSourceDevicePunch");
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

type RosterMatrixStaffRowProps = {
  person: RosterMatrixStaff;
  index: number;
  dates: readonly string[];
  byStaffDate: Map<string, RosterRegisterRow[]>;
  canAmend: boolean;
  onEdit: (row: RosterRegisterRow) => void;
  onCreate: (workDate: string, staffId: string | null) => void;
  offLabel: string;
  annualLabel: string;
  sickLabel: string;
  compOffLabel: string;
  addDayLabel: (ymd: string) => string;
};

/** One staff × month row — memoized so filter UI updates do not remount every cell. */
const RosterMatrixStaffRow = memo(function RosterMatrixStaffRow({
  person,
  index,
  dates,
  byStaffDate,
  canAmend,
  onEdit,
  onCreate,
  offLabel,
  annualLabel,
  sickLabel,
  compOffLabel,
  addDayLabel,
}: RosterMatrixStaffRowProps) {
  return (
    <tr className="border-b border-border/50" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 3rem" }}>
      <td className="sticky start-0 z-10 border-e border-border/70 bg-card px-1.5 py-1 text-center tabular-nums text-muted-foreground">
        {index + 1}
      </td>
      <td className="sticky start-10 z-10 min-w-[11rem] max-w-[14rem] border-e border-border/70 bg-card px-2 py-1.5">
        <div className="truncate font-medium leading-tight">{person.staffName || "—"}</div>
        <div className="truncate text-[10px] text-muted-foreground">
          {person.employeeCode || person.qid || ""}
        </div>
      </td>
      {dates.map((ymd) => {
        const weekend = isWeekendYmd(ymd);
        const entries = byStaffDate.get(rosterMatrixCellKey(person.staffId, ymd)) ?? [];
        return (
          <td
            key={`${person.staffId}-${ymd}`}
            className={cn("align-top border-border/40 px-0.5 py-0.5", weekend ? "bg-muted/50" : "bg-card")}
          >
            {entries.length === 0 ? (
              rosterEmptyDayCanAdd(canAmend, entries.length) ? (
                <div className="flex min-h-[2.75rem] items-center justify-center">
                  <button
                    type="button"
                    className="inline-flex h-7 items-center justify-center rounded-md px-1.5 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    onClick={() => onCreate(ymd, person.staffId)}
                    aria-label={addDayLabel(ymd)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="min-h-[2.75rem]" />
              )
            ) : (
              <div className="flex flex-col gap-0.5">
                {entries.map((entry) => {
                  const status = rosterDayStatusFromRow(entry);
                  const offDuty = status !== "on_duty";
                  const body = (
                    <>
                      {offDuty ? (
                        <div className="text-center text-[11px] font-semibold uppercase tracking-wide">
                          {entry.leaveType === "annual_leave"
                            ? annualLabel
                            : entry.leaveType === "sick_leave"
                              ? sickLabel
                              : entry.leaveType === "comp_off"
                                ? compOffLabel
                                : offLabel}
                        </div>
                      ) : (
                        <div className="text-center leading-tight tabular-nums">
                          <div>{entry.shiftStart || "—"}</div>
                          <div className="text-muted-foreground">{entry.shiftEnd || "—"}</div>
                        </div>
                      )}
                      {entry.locationCode ? (
                        <div className="mt-0.5 text-center text-[9px] text-muted-foreground">{entry.locationCode}</div>
                      ) : null}
                    </>
                  );
                  // Click-to-amend avoids mounting Pencil/Trash Button trees in every cell (INP).
                  if (canAmend) {
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => onEdit(entry)}
                        className={cn(
                          "w-full rounded-md px-1 py-1 text-start transition-colors hover:ring-1 hover:ring-border",
                          offDuty ? "bg-destructive/10 text-destructive" : "hover:bg-muted/60",
                        )}
                      >
                        {body}
                      </button>
                    );
                  }
                  return (
                    <div
                      key={entry.id}
                      className={cn("rounded-md px-1 py-1", offDuty ? "bg-destructive/10 text-destructive" : undefined)}
                    >
                      {body}
                    </div>
                  );
                })}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
});

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
      onGridFetched,
    },
    ref,
  ) {
    const { t, i18n } = useTranslation();
    const qc = useQueryClient();
    const canAmend = useCanAmendShiftRoster();
    const sites = useSites();
    const { data: departments = [] } = useMasterDepartments();

    const [locationId, setLocationId] = useState(defaultLocationId ?? "");
    const [staffId, setStaffId] = useState("");
    const [excludedDepartmentIds, setExcludedDepartmentIds] = useState<string[]>([]);
    const [orgChecks, setOrgChecks] = useState<OrgDepartmentChecks>(ALL_ORG_DEPARTMENTS_CHECKED);
    const [sourceFilter, setSourceFilter] = useState<RosterSourceFilter>("all");
    const [query, setQuery] = useState("");
    // Search / filter highlight must not sync-rebuild the month matrix on every keystroke.
    const deferredQuery = useDeferredValue(query);
    const deferredStaffId = useDeferredValue(staffId);
    const deferredLocationId = useDeferredValue(locationId);
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [createWorkDate, setCreateWorkDate] = useState<string | null>(null);
    const [createStaffId, setCreateStaffId] = useState("");
    const [draft, setDraft] = useState<Draft | null>(null);
    const [deleteAllOpen, setDeleteAllOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

    // Branch switcher seeds the Location filter. Keep them aligned when the
    // switcher changes so supervisors cannot query all managed sites while the
    // top bar still shows a single venue (KDS-CC vs INF+KDS+CAR double count).
    useEffect(() => {
      setLocationId(defaultLocationId ?? "");
    }, [defaultLocationId]);

    const showOnlyOrgDepartments = useMemo(
      () => activeShowOnlyOrgDepartments(orgChecks, excludedDepartmentIds),
      [orgChecks, excludedDepartmentIds],
    );
    const showOnlyDepartmentIds = useMemo(
      () => orgDepartmentIdsFor(departments, showOnlyOrgDepartments),
      [departments, showOnlyOrgDepartments],
    );
    const selectedLocationCode = useMemo(
      () => (sites.data ?? []).find((site) => site.id === deferredLocationId)?.code ?? null,
      [sites.data, deferredLocationId],
    );
    const filters = useMemo(
      () => ({
        locationId: locationId || null,
        staffId: staffId || null,
        excludedDepartmentIds: excludedDepartmentIds.length ? excludedDepartmentIds : undefined,
        showOnlyDepartmentIds: showOnlyDepartmentIds.length ? showOnlyDepartmentIds : undefined,
        // Always send focus keys so Operations still applies when master-department
        // UUIDs failed to load (Venue Supervisor without people.view_roster).
        showOnlyOrgDepartments: showOnlyOrgDepartments.length ? showOnlyOrgDepartments : undefined,
        dateFrom,
        dateTo,
        sourceUploadOnly,
        source:
          !sourceUploadOnly && sourceFilter !== "all"
            ? (sourceFilter as "upload" | "amend" | "manual" | "copied")
            : null,
      }),
      [
        locationId,
        staffId,
        excludedDepartmentIds,
        showOnlyDepartmentIds,
        showOnlyOrgDepartments,
        dateFrom,
        dateTo,
        sourceUploadOnly,
        sourceFilter,
      ],
    );

    const register = useQuery({
      queryKey: [...queryKeys.people.rosterRegister(filters), refreshToken ?? 0],
      queryFn: () => listUploadedRosterAssignments(filters),
      staleTime: STALE.people,
      enabled: Boolean(dateFrom && dateTo),
    });

    useEffect(() => {
      if (register.isFetched) onGridFetched?.();
    }, [register.isFetched, onGridFetched, dateFrom, dateTo]);

    const rows = useMemo(() => register.data?.rows ?? [], [register.data?.rows]);
    const teamStaff = register.data?.teamStaff ?? null;

    const staffOptions = useMemo(() => {
      const map = new Map<string, string>();
      for (const person of teamStaff ?? []) {
        map.set(person.staffId, person.staffName || person.employeeCode || person.qid || person.staffId);
      }
      for (const row of rows) {
        if (!map.has(row.staffId)) {
          map.set(row.staffId, row.staffName || row.employeeCode || row.qid || row.staffId);
        }
      }
      return [...map.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }, [rows, teamStaff]);

    const filtered = useMemo(
      () =>
        filterRosterRegisterRows(rows, {
          staffId: deferredStaffId,
          search: deferredQuery,
          locationId: deferredLocationId || null,
        }),
      [rows, deferredQuery, deferredStaffId, deferredLocationId],
    );

    const matrix = useMemo(() => {
      const rowStaffIds = new Set(filtered.map((row) => row.staffId));
      const scopedTeam = rosterTeamStaffForLocationCode(
        rosterTeamStaffForMatrix(teamStaff, { staffId: deferredStaffId, search: deferredQuery }),
        selectedLocationCode,
        rowStaffIds,
      );
      return buildRosterMatrix(filtered, dateFrom, dateTo, scopedTeam);
    }, [filtered, dateFrom, dateTo, teamStaff, deferredStaffId, deferredQuery, selectedLocationCode]);
    const showEmptyDayGrid = rosterEmptyPeriodShowsDayGrid(filtered.length, canAmend);
    const teamGridWithoutRows = filtered.length === 0 && matrix.staff.length > 0;
    const assignStaff = useQuery({
      queryKey: [...queryKeys.people.all, "roster-assign-staff"],
      queryFn: () => listRosterAssignStaff(),
      enabled: canAmend && Boolean(createWorkDate),
      staleTime: STALE.people,
    });
    const createStaffOptions = useMemo(() => {
      const options = (assignStaff.data ?? []).map((person) => ({
        value: String(person.id),
        label: person.full_name || person.employee_code || String(person.id),
      }));
      if (createStaffId && !options.some((option) => option.value === createStaffId)) {
        const known = matrix.staff.find((person) => person.staffId === createStaffId);
        options.unshift({
          value: createStaffId,
          label: known?.staffName || known?.employeeCode || createStaffId,
        });
      }
      return options.sort((a, b) => a.label.localeCompare(b.label));
    }, [assignStaff.data, createStaffId, matrix.staff]);

    const editingRow = useMemo(
      () => (editingId ? filtered.find((row) => row.id === editingId) ?? null : null),
      [editingId, filtered],
    );

    const hasExtraFilters = rosterRegisterHasExtraFilters({
      locationId,
      staffId,
      excludedDepartmentIds,
      sourceUploadOnly,
      source: !sourceUploadOnly && sourceFilter !== "all" ? sourceFilter : null,
      search: query,
    });
    const periodRange = formatPayrollRange(dateFrom, dateTo, i18n.language);
    const gridPending =
      deferredQuery !== query || deferredStaffId !== staffId || deferredLocationId !== locationId;

    const selectionScopeKey = [
      dateFrom,
      dateTo,
      locationId,
      staffId,
      excludedDepartmentIds.join(","),
      showOnlyDepartmentIds.join(","),
      sourceFilter,
      sourceUploadOnly ? "upload" : "all",
      deferredQuery,
    ].join("|");

    useEffect(() => {
      setSelectedIds(new Set());
    }, [selectionScopeKey]);

    const selectedVisibleIds = useMemo(
      () => filtered.filter((row) => selectedIds.has(row.id)).map((row) => row.id),
      [filtered, selectedIds],
    );
    const selectedCount = selectedVisibleIds.length;
    const allVisibleSelected = filtered.length > 0 && selectedCount === filtered.length;
    const headerChecked: boolean | "indeterminate" = allVisibleSelected
      ? true
      : selectedCount > 0
        ? "indeterminate"
        : false;

    const setVisibleSelection = (select: boolean) => {
      setSelectedIds(() => {
        if (!select) return new Set();
        return new Set(filtered.map((row) => row.id));
      });
    };

    const toggleRowSelected = (id: string, checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) next.add(id);
        else next.delete(id);
        return next;
      });
    };

    const saveMut = useMutation({
      mutationFn: async (row: RosterRegisterRow) => {
        if (!draft) throw new Error(t("people.roster.registerNothingToSave"));
        const patch = rosterPatchFromDayStatus(draft.dayStatus);
        if (draft.dayStatus === "comp_off") {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.compOffForDate)) {
            throw new Error(t("people.roster.compOffDateRequired"));
          }
          if (!draft.compOffNote.trim()) {
            throw new Error(t("people.roster.compOffNoteRequired"));
          }
        }
        const result = await updateRosterAssignment({
          id: row.id,
          locationId: draft.locationId,
          shiftStart: patch.needsShiftTimes ? draft.shiftStart : null,
          shiftEnd: patch.needsShiftTimes ? draft.shiftEnd : null,
          dayStatus: draft.dayStatus,
          compOffForDate: draft.dayStatus === "comp_off" ? draft.compOffForDate : null,
          compOffNote: draft.dayStatus === "comp_off" ? draft.compOffNote.trim() : null,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      onSuccess: () => {
        toast.success(t("people.roster.registerSaved"));
        setEditingId(null);
        setDraft(null);
        void qc.invalidateQueries({ queryKey: queryKeys.people.all });
      },
      onError: (e: Error) => toast.error(e.message),
    });

    const createMut = useMutation({
      mutationFn: async () => {
        if (!draft || !createWorkDate) throw new Error(t("people.roster.registerNothingToSave"));
        if (!createStaffId) throw new Error(t("people.roster.registerPickStaff"));
        if (!draft.locationId) throw new Error(t("people.roster.registerPickLocation"));
        const patch = rosterPatchFromDayStatus(draft.dayStatus);
        if (draft.dayStatus === "comp_off") {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.compOffForDate)) {
            throw new Error(t("people.roster.compOffDateRequired"));
          }
          if (!draft.compOffNote.trim()) {
            throw new Error(t("people.roster.compOffNoteRequired"));
          }
        }
        const result = await createRosterAssignment({
          staffId: createStaffId,
          locationId: draft.locationId,
          workDate: createWorkDate,
          shiftStart: patch.needsShiftTimes ? draft.shiftStart : null,
          shiftEnd: patch.needsShiftTimes ? draft.shiftEnd : null,
          dayStatus: draft.dayStatus,
          compOffForDate: draft.dayStatus === "comp_off" ? draft.compOffForDate : null,
          compOffNote: draft.dayStatus === "comp_off" ? draft.compOffNote.trim() : null,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      onSuccess: () => {
        toast.success(t("people.roster.registerAdded"));
        setCreateWorkDate(null);
        setCreateStaffId("");
        setDraft(null);
        void qc.invalidateQueries({ queryKey: queryKeys.people.all });
      },
      onError: (e: Error) => toast.error(e.message),
    });

    const deleteMut = useMutation({
      mutationFn: async (id: string) => {
        const result = await deleteRosterAssignment({ id });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      onSuccess: (_result, id) => {
        toast.success(t("people.roster.registerDeleted"));
        setEditingId(null);
        setDraft(null);
        setSelectedIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        void qc.invalidateQueries({ queryKey: queryKeys.people.all });
      },
      onError: (e: Error) => toast.error(e.message),
    });

    const deleteAllMut = useMutation({
      mutationFn: (ids: string[] | null) =>
        deleteRosterAssignments({
          locationId: locationId || null,
          staffId: staffId || null,
          excludedDepartmentIds: excludedDepartmentIds.length ? excludedDepartmentIds : undefined,
          dateFrom,
          dateTo,
          sourceUploadOnly,
          source: !sourceUploadOnly && sourceFilter !== "all" ? sourceFilter : null,
          search: query.trim() || null,
          ...(ids ? { ids } : {}),
        }),
      onSuccess: (result) => {
        toast.success(t("people.roster.registerDeletedAll", { count: result.deleted }));
        setDeleteAllOpen(false);
        setEditingId(null);
        setDraft(null);
        setSelectedIds(new Set());
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
      onDeleteAllStateChange?.({ canDelete: canAmend, disabled: deleteAllDisabled, selectedCount });
    }, [canAmend, deleteAllDisabled, onDeleteAllStateChange, selectedCount]);

    const startEdit = useCallback((row: RosterRegisterRow) => {
      setCreateWorkDate(null);
      setCreateStaffId("");
      setEditingId(row.id);
      setDraft({
        locationId: row.locationId,
        shiftStart: row.shiftStart,
        shiftEnd: row.shiftEnd,
        dayStatus: rosterDayStatusFromRow(row),
        compOffForDate: row.compOffForDate ?? "",
        compOffNote: row.compOffNote ?? "",
      });
    }, []);

    const startCreate = useCallback(
      (workDate: string, nextStaffId: string | null) => {
        setEditingId(null);
        setCreateWorkDate(workDate);
        setCreateStaffId(nextStaffId ?? "");
        setDraft({
          locationId: locationId || defaultLocationId || "",
          shiftStart: "08:00",
          shiftEnd: "17:00",
          dayStatus: "on_duty",
          compOffForDate: "",
          compOffNote: "",
        });
      },
      [defaultLocationId, locationId],
    );

    const cancelEdit = () => {
      setEditingId(null);
      setCreateWorkDate(null);
      setCreateStaffId("");
      setDraft(null);
    };

    const confirmDelete = useCallback(
      (id: string) => {
        if (window.confirm(t("people.roster.registerDeleteConfirm"))) {
          deleteMut.mutate(id);
        }
      },
      [deleteMut, t],
    );

    const onLocationFilter = useCallback((value: string) => {
      startTransition(() => setLocationId(value));
    }, []);
    const onStaffFilter = useCallback((value: string) => {
      startTransition(() => setStaffId(value));
    }, []);
    const onDepartmentsFilter = useCallback((values: string[]) => {
      startTransition(() => setExcludedDepartmentIds(values));
    }, []);
    const onSourceFilter = useCallback((value: string) => {
      startTransition(() => setSourceFilter((value || "all") as RosterSourceFilter));
    }, []);
    const onOrgChecksFilter = useCallback((next: OrgDepartmentChecks) => {
      startTransition(() => setOrgChecks(next));
    }, []);
    const onSearchFilter = useCallback((value: string) => {
      setQuery(value);
    }, []);
    const addDayLabel = useCallback(
      (ymd: string) => t("people.roster.registerAddDay", { date: ymd }),
      [t],
    );
    const cellOffLabel = t("people.roster.registerCellOff");
    const cellAnnualLabel = t("people.roster.registerCellAnnual");
    const cellSickLabel = t("people.roster.registerCellSick");
    const cellCompOffLabel = t("people.roster.registerCellCompOff");

    const emptyMessage = sourceUploadOnly
      ? t("people.roster.registerEmpty")
      : t("people.roster.registerEmptyAll");

    const deleteActionLabel =
      selectedCount > 0
        ? t("people.roster.registerDeleteSelected", { count: selectedCount })
        : t("people.roster.registerDeleteAll");

    // When the parent page owns Delete all (hideHeader), keep it off this card on phone/desktop.
    const deleteAllButton =
      canAmend && !hideHeader ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="hidden shrink-0 sm:inline-flex"
          disabled={deleteAllDisabled}
          onClick={() => setDeleteAllOpen(true)}
        >
          {deleteAllMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          {deleteActionLabel}
        </Button>
      ) : null;

    const dayStatusOptions = [
      { value: "on_duty", label: t("people.roster.dutyYes") },
      { value: "weekly_off", label: t("people.roster.dutyOff") },
      { value: "annual_leave", label: t("people.roster.dutyAnnualLeave") },
      { value: "sick_leave", label: t("people.roster.dutySickLeave") },
      { value: "comp_off", label: t("people.roster.dutyCompOff") },
    ];

    const locationOptions = useMemo(
      () =>
        (sites.data ?? []).map((loc) => ({
          value: loc.id,
          label: formatLocationLabel(loc.code, loc.name),
          keywords: [loc.code, loc.name].filter(Boolean).join(" "),
        })),
      [sites.data],
    );

    const rosterLocationCode = (sites.data ?? []).find((site) => site.id === locationId)?.code ?? null;
    const departmentOptions = useMemo(
      () =>
        filterDepartmentsForLocation(departments, rosterLocationCode, excludedDepartmentIds)
          .filter((d) => d.active !== false)
          .map((d) => ({ value: d.id, label: d.name, keywords: `${d.name} ${d.code ?? ""}` })),
      [departments, rosterLocationCode, excludedDepartmentIds],
    );

    const showSource = showSourceFilter && !sourceUploadOnly;

    const renderLocationEditor = () => {
      if (!draft) return null;
      return (
        <SearchableSelect
          value={draft.locationId}
          onValueChange={(value) =>
            setDraft((prev) => (prev && value ? { ...prev, locationId: value } : prev))
          }
          options={locationOptions}
          triggerClassName="h-8 min-w-[8rem] text-xs"
        />
      );
    };

    const renderCompOffFields = (idPrefix: string) => {
      if (!draft || draft.dayStatus !== "comp_off") return null;
      const dateId = `${idPrefix}-comp-off-date`;
      const noteId = `${idPrefix}-comp-off-note`;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={dateId}>{t("people.roster.compOffForDate")}</Label>
            <Input
              id={dateId}
              type="date"
              required
              value={draft.compOffForDate}
              onChange={(event) =>
                setDraft((prev) => (prev ? { ...prev, compOffForDate: event.target.value } : prev))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={noteId}>{t("people.roster.compOffNote")}</Label>
            <Textarea
              id={noteId}
              required
              rows={2}
              maxLength={500}
              value={draft.compOffNote}
              placeholder={t("people.roster.compOffNotePlaceholder")}
              onChange={(event) =>
                setDraft((prev) => (prev ? { ...prev, compOffNote: event.target.value } : prev))
              }
            />
          </div>
        </div>
      );
    };

    const renderDayStatusEditor = () => {
      if (!draft) return null;
      const needsTimes = rosterPatchFromDayStatus(draft.dayStatus).needsShiftTimes;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("people.roster.col.location")}</Label>
            {renderLocationEditor()}
          </div>
          <div className="space-y-1.5">
            <Label>{t("people.roster.colDuty")}</Label>
            <SearchableSelect
              value={draft.dayStatus}
              onValueChange={(value) =>
                setDraft((prev) =>
                  prev ? { ...prev, dayStatus: (value || "on_duty") as RosterDayStatus } : prev,
                )
              }
              options={dayStatusOptions}
            />
          </div>
          {renderCompOffFields("amend-dialog")}
          <div className="space-y-1.5">
            <Label>{t("people.roster.colShift")}</Label>
            <ShiftRangeEditor
              start={draft.shiftStart}
              end={draft.shiftEnd}
              disabled={!needsTimes}
              onStartChange={(value) => setDraft((prev) => (prev ? { ...prev, shiftStart: value } : prev))}
              onEndChange={(value) => setDraft((prev) => (prev ? { ...prev, shiftEnd: value } : prev))}
            />
          </div>
        </div>
      );
    };

    const viewToggle = (
      <div className="inline-flex shrink-0 rounded-lg border border-border/70 p-0.5">
        <Button
          type="button"
          size="sm"
          variant={viewMode === "grid" ? "secondary" : "ghost"}
          className="h-9 gap-1.5 px-2.5 sm:h-8"
          onClick={() => setViewMode("grid")}
          aria-pressed={viewMode === "grid"}
          aria-label={t("people.roster.registerViewGrid")}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("people.roster.registerViewGrid")}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={viewMode === "list" ? "secondary" : "ghost"}
          className="h-9 gap-1.5 px-2.5 sm:h-8"
          onClick={() => setViewMode("list")}
          aria-pressed={viewMode === "list"}
          aria-label={t("people.roster.registerViewList")}
        >
          <LayoutList className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("people.roster.registerViewList")}</span>
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

    const filtersActive = hasExtraFilters;

    const renderFilterFields = (idPrefix: string, stacked = false) => (
      <>
        <div className="space-y-1.5">
          <Label>{t("people.roster.registerFilterLocation")}</Label>
          <SearchableSelect
            value={locationId}
            onValueChange={onLocationFilter}
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
            onValueChange={onStaffFilter}
            emptyOption={{ value: "", label: t("people.roster.registerAllStaff") }}
            options={staffOptions}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("people.roster.registerFilterDepartment")}</Label>
          <SearchableSelect
            multiple
            exclude
            values={excludedDepartmentIds}
            onValuesChange={onDepartmentsFilter}
            placeholder={t("people.roster.registerAllDepartments")}
            emptyOption={{ value: "", label: t("people.roster.registerAllDepartments") }}
            selectedCountLabel={(count) => t("people.roster.registerDepartmentsExcluding", { count })}
            options={departmentOptions}
            aria-label={t("people.roster.registerFilterDepartment")}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label className="sr-only">{t("common.orgDepartmentsMenu")}</Label>
          <div className={stacked ? undefined : "md:pt-6"}>
            <OrgDepartmentsFilter
              checks={orgChecks}
              disabled={!orgDepartmentSelectionIsAll(excludedDepartmentIds)}
              onChange={onOrgChecksFilter}
            />
          </div>
        </div>
        {showSource ? (
          <div className="space-y-1.5">
            <Label>{t("people.roster.registerFilterSource")}</Label>
            <SearchableSelect
              value={sourceFilter}
              onValueChange={onSourceFilter}
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
        <div className={cn("space-y-1.5", !showSource && !stacked && "sm:col-span-2")}>
          <Label htmlFor={`${idPrefix}-search`}>{t("people.roster.searchRows")}</Label>
          <Input
            id={`${idPrefix}-search`}
            className="min-h-10"
            value={query}
            onChange={(e) => onSearchFilter(e.target.value)}
            placeholder={t("people.roster.searchRows")}
            aria-busy={gridPending}
          />
        </div>
      </>
    );

    const clearMobileFilters = () => {
      startTransition(() => {
        setLocationId(defaultLocationId ?? "");
        setStaffId("");
        setExcludedDepartmentIds([]);
        setOrgChecks(ALL_ORG_DEPARTMENTS_CHECKED);
        setSourceFilter("all");
        setQuery("");
      });
    };

    return (
      <div className="surface-card space-y-3 overflow-visible p-4 md:space-y-4 md:p-5">
        <div className="space-y-1">
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 md:gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {!hideHeader ? <h2 className="text-sm font-semibold">{t("people.roster.registerTitle")}</h2> : null}
              <Badge variant="outline" className="max-w-full truncate">
                {periodRange}
              </Badge>
              <Badge variant="secondary">{t("people.roster.registerCount", { count: filtered.length })}</Badge>
              <Badge variant="outline" className="hidden sm:inline-flex">
                {t("people.roster.registerStaffCount", { count: matrix.staff.length })}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {viewToggle}
              {deleteAllButton}
            </div>
          </div>
          {!hideHeader ? (
            <p className="hidden text-xs text-muted-foreground sm:block">
              {sourceUploadOnly ? t("people.roster.registerHelp") : t("people.roster.registerHelpAll")}
            </p>
          ) : null}
        </div>

        <div className="md:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 w-full justify-start gap-2"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" />
            <span className="truncate">{t("common.filters")}</span>
            {filtersActive ? (
              <span className="ms-auto inline-flex h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
            ) : null}
          </Button>
        </div>

        <div
          className={cn(
            "hidden gap-3 md:grid md:grid-cols-2",
            showSource ? "lg:grid-cols-5" : "lg:grid-cols-4",
          )}
        >
          {renderFilterFields("roster-desktop")}
        </div>

        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent
            side="bottom"
            className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 sm:max-w-none"
          >
            <SheetHeader className="shrink-0 border-b border-border/60 px-4 py-3 text-start">
              <SheetTitle>{t("common.filters")}</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {renderFilterFields("roster-mobile", true)}
            </div>
            <SheetFooter className="shrink-0 !flex-row gap-2 border-t border-border/60 px-4 py-3 sm:justify-stretch sm:space-x-0">
              <Button type="button" variant="outline" className="min-h-10 flex-1" onClick={clearMobileFilters}>
                {t("common.clear")}
              </Button>
              <Button type="button" className="min-h-10 flex-1" onClick={() => setFiltersOpen(false)}>
                {t("common.apply")}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {register.isLoading ? (
          <FecLoader density="chip" label={t("people.roster.registerLoading")} />
        ) : register.isError ? (
          <p className="text-sm text-destructive">
            {register.error instanceof Error ? register.error.message : t("people.roster.registerLoadFailed")}
          </p>
        ) : filtered.length === 0 && !showEmptyDayGrid && !teamGridWithoutRows ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : viewMode === "grid" || showEmptyDayGrid || teamGridWithoutRows ? (
          <>
          {showEmptyDayGrid && !teamGridWithoutRows ? (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          ) : null}
          <div
            className={cn(
              "overflow-auto rounded-lg border border-border/70",
              gridPending && "opacity-70 transition-opacity",
            )}
            style={{ maxHeight }}
            aria-busy={gridPending}
          >
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
                {matrix.staff.length === 0 && canAmend ? (
                  <tr className="border-b border-border/50" style={{ contentVisibility: "auto" }}>
                    <td className="sticky start-0 z-10 border-e border-border/70 bg-card px-1.5 py-1 text-center tabular-nums text-muted-foreground">
                      1
                    </td>
                    <td className="sticky start-10 z-10 min-w-[11rem] max-w-[14rem] border-e border-border/70 bg-card px-2 py-1.5">
                      <div className="truncate font-medium leading-tight">{t("people.roster.registerAdd")}</div>
                    </td>
                    {matrix.dates.map((ymd) => {
                      const weekend = isWeekendYmd(ymd);
                      return (
                        <td
                          key={`add-${ymd}`}
                          className={cn(
                            "align-top border-border/40 px-0.5 py-0.5",
                            weekend ? "bg-muted/50" : "bg-card",
                          )}
                        >
                          <div className="flex min-h-[2.75rem] items-center justify-center">
                            <button
                              type="button"
                              className="inline-flex h-7 items-center justify-center rounded-md px-1.5 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                              onClick={() => startCreate(ymd, null)}
                              aria-label={t("people.roster.registerAddDay", { date: ymd })}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ) : null}
                {matrix.staff.map((person, index) => (
                  <RosterMatrixStaffRow
                    key={person.staffId}
                    person={person}
                    index={index}
                    dates={matrix.dates}
                    byStaffDate={matrix.byStaffDate}
                    canAmend={canAmend}
                    onEdit={startEdit}
                    onCreate={startCreate}
                    offLabel={cellOffLabel}
                    annualLabel={cellAnnualLabel}
                    sickLabel={cellSickLabel}
                    compOffLabel={cellCompOffLabel}
                    addDayLabel={addDayLabel}
                  />
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <div className="overflow-auto rounded-lg border border-border/70" style={{ maxHeight }}>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  {canAmend ? (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={headerChecked}
                        disabled={deleting || filtered.length === 0}
                        onCheckedChange={(value) => setVisibleSelection(value === true)}
                        aria-label={
                          allVisibleSelected
                            ? t("people.roster.registerDeselectAll")
                            : t("people.roster.registerSelectAll")
                        }
                      />
                    </TableHead>
                  ) : null}
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
                  const rowSelected = selectedIds.has(row.id);
                  return (
                    <TableRow key={row.id} data-state={rowSelected ? "selected" : undefined}>
                      {canAmend ? (
                        <TableCell>
                          <Checkbox
                            checked={rowSelected}
                            disabled={deleting}
                            onCheckedChange={(value) => toggleRowSelected(row.id, value === true)}
                            aria-label={t("people.roster.registerSelectRow", {
                              name: row.staffName || row.employeeCode || row.qid || row.workDate,
                              date: row.workDate,
                            })}
                          />
                        </TableCell>
                      ) : null}
                      <TableCell className="whitespace-nowrap">{row.workDate}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.staffName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{row.employeeCode || row.qid || ""}</div>
                      </TableCell>
                      <TableCell>{editing ? renderLocationEditor() : (row.locationCode ?? "—")}</TableCell>
                      <TableCell>
                        {editing ? (
                          <ShiftRangeEditor
                            start={draft.shiftStart}
                            end={draft.shiftEnd}
                            disabled={!rosterPatchFromDayStatus(draft.dayStatus).needsShiftTimes}
                            onStartChange={(value) => setDraft((prev) => (prev ? { ...prev, shiftStart: value } : prev))}
                            onEndChange={(value) => setDraft((prev) => (prev ? { ...prev, shiftEnd: value } : prev))}
                          />
                        ) : rosterDayStatusFromRow(row) !== "on_duty" ? (
                          "—"
                        ) : (
                          <ShiftRangeEditor
                            start={row.shiftStart}
                            end={row.shiftEnd}
                            readOnly
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {editing ? (
                          <div className="min-w-[14rem] space-y-2">
                            <SearchableSelect
                              value={draft.dayStatus}
                              onValueChange={(value) =>
                                setDraft((prev) =>
                                  prev ? { ...prev, dayStatus: (value || "on_duty") as RosterDayStatus } : prev,
                                )
                              }
                              options={dayStatusOptions}
                            />
                            {renderCompOffFields("amend-list")}
                          </div>
                        ) : (
                          cellStatusLabel(row, t)
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
          open={Boolean(draft) && (Boolean(createWorkDate) || (viewMode === "grid" && Boolean(editingRow)))}
          onOpenChange={(open) => {
            if (!open && !saveMut.isPending && !createMut.isPending) cancelEdit();
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {createWorkDate ? t("people.roster.registerAdd") : t("people.roster.registerAmend")}
              </DialogTitle>
              <DialogDescription>
                {createWorkDate
                  ? t("people.roster.registerAddDay", { date: createWorkDate })
                  : editingRow
                    ? `${editingRow.staffName || editingRow.employeeCode || "—"} · ${editingRow.workDate}`
                    : null}
              </DialogDescription>
            </DialogHeader>
            {createWorkDate && draft ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{t("people.roster.registerAddStaff")}</Label>
                  <SearchableSelect
                    value={createStaffId}
                    onValueChange={(value) => setCreateStaffId(value || "")}
                    options={createStaffOptions}
                    placeholder={t("people.roster.registerPickStaff")}
                  />
                  {assignStaff.isError ? (
                    <p className="text-xs text-destructive">
                      {assignStaff.error instanceof Error
                        ? assignStaff.error.message
                        : t("people.roster.registerLoadFailed")}
                    </p>
                  ) : null}
                </div>
                {renderDayStatusEditor()}
              </div>
            ) : editingRow && draft ? (
              <div className="space-y-4">
                {renderDayStatusEditor()}
                <Badge variant="outline">{sourceLabel(editingRow.source, t)}</Badge>
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              {createWorkDate ? null : (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!editingRow || deleting}
                  onClick={() => editingRow && confirmDelete(editingRow.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("common.delete")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={cancelEdit}
                disabled={saveMut.isPending || createMut.isPending}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={
                  createWorkDate
                    ? createMut.isPending || !createStaffId || !draft?.locationId
                    : !editingRow || saveMut.isPending
                }
                onClick={() => {
                  if (createWorkDate) createMut.mutate();
                  else if (editingRow) saveMut.mutate(editingRow);
                }}
              >
                {saveMut.isPending || createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("people.roster.registerSave")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteAllOpen} onOpenChange={(open) => !open && !deleteAllMut.isPending && setDeleteAllOpen(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {selectedCount > 0
                  ? t("people.roster.registerDeleteSelectedTitle")
                  : t("people.roster.registerDeleteAllTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {selectedCount > 0
                  ? t("people.roster.registerDeleteSelectedConfirm", { count: selectedCount, range: periodRange })
                  : hasExtraFilters
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
                  deleteAllMut.mutate(selectedCount > 0 ? selectedVisibleIds : null);
                }}
              >
                {deleteAllMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {selectedCount > 0
                  ? t("people.roster.registerDeleteSelectedConfirmAction")
                  : t("people.roster.registerDeleteAllConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  },
);

RosterRegisterPanel.displayName = "RosterRegisterPanel";
