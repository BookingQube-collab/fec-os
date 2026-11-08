"use client";

import { Download, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { parseCsv } from "@/lib/csv-parse";
import {
  bulkCloseEventStaffAssignments,
  bulkDeleteEventStaffAssignments,
  bulkImportEventStaffAssignments,
  bulkUpdateEventStaffAssignmentDates,
  createEventHireAndAssign,
  deleteEventStaffAssignment,
  upsertEventStaffAssignment,
} from "@/lib/event-staff-assignments.functions";
import {
  isLabourEventRole,
  type EventRoleRow,
} from "@/lib/events/event-roles";
import {
  assignmentTypeLabel,
  EVENT_STAFF_ASSIGNMENT_TYPES,
  looksLikeJokerPoolStaff,
  type EventStaffAssignmentType,
} from "@/lib/events/staff-assignments";
import {
  buildEventStaffingExportCsv,
  buildEventStaffingExportMatrix,
  buildEventStaffingTemplateCsv,
  parseEventStaffingImportRows,
  staffingExportFilename,
} from "@/lib/events/staffing-import";
import type { EventStaffAssignmentRow } from "@/lib/events/types";
import { downloadCsvContent } from "@/lib/staff-import";

type StaffOption = {
  id: string;
  full_name: string;
  employee_code?: string | null;
  employment_type?: string | null;
  status?: string | null;
  job_title?: string | null;
};

async function readStaffingSpreadsheet(file: File): Promise<Record<string, string>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || file.type === "text/csv") return parseCsv(await file.text());
  if (ext === "xlsx" || ext === "xls") {
    const { readFirstSheetCsv } = await import("@/lib/spreadsheet/workbook");
    return parseCsv(await readFirstSheetCsv(await file.arrayBuffer()));
  }
  throw new Error("unsupported");
}

export function EventStaffingPanel({
  eventId,
  eventName,
  assignments,
  staff,
  roles = [],
  canEdit,
  canHire,
  defaultFrom,
  defaultTo,
  onChanged,
}: {
  eventId: string;
  eventName?: string;
  assignments: EventStaffAssignmentRow[];
  staff: StaffOption[];
  roles?: EventRoleRow[];
  canEdit: boolean;
  canHire: boolean;
  defaultFrom: string;
  defaultTo: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const importRef = useRef<HTMLInputElement>(null);
  const activeRoles = useMemo(
    () => roles.filter((r) => r.is_active !== false).sort((a, b) => a.sort_order - b.sort_order),
    [roles],
  );
  const defaultRole = activeRoles.find((r) => r.code === "crew") ?? activeRoles[0] ?? null;
  const [type, setType] = useState<EventStaffAssignmentType>("loaned");
  const [staffId, setStaffId] = useState("");
  const [roleId, setRoleId] = useState(defaultRole?.id ?? "");
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [notes, setNotes] = useState("");
  const [dayRate, setDayRate] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState("");
  const [busy, setBusy] = useState(false);

  const [hireName, setHireName] = useState("");
  const [hireRoleId, setHireRoleId] = useState(defaultRole?.id ?? "");
  const [hireFrom, setHireFrom] = useState(defaultFrom);
  const [hireTo, setHireTo] = useState(defaultTo);
  const [hirePhone, setHirePhone] = useState("");
  const [hireDayRate, setHireDayRate] = useState("");
  const [hireHours, setHireHours] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFrom, setBulkFrom] = useState(defaultFrom);
  const [bulkTo, setBulkTo] = useState(defaultTo);

  const selectedRole = activeRoles.find((r) => r.id === roleId) ?? null;
  const selectedHireRole = activeRoles.find((r) => r.id === hireRoleId) ?? null;

  const selectedIds = useMemo(() => [...selected], [selected]);

  const staffOptions = useMemo(() => {
    if (type !== "joker") return staff;
    return staff.filter((s) =>
      looksLikeJokerPoolStaff({
        employment_type: s.employment_type,
        status: s.status,
      }),
    );
  }, [staff, type]);

  async function addAssignment() {
    if (!staffId) return;
    setBusy(true);
    try {
      const role = selectedRole;
      await upsertEventStaffAssignment({
        eventId,
        staff_id: staffId,
        assignment_type: type,
        role_label: role?.name ?? "Crew",
        event_role_id: role?.id ?? null,
        hours_per_day:
          role && isLabourEventRole(role)
            ? Number(hoursPerDay) || role.default_hours_per_day || 10
            : null,
        day_rate_qar:
          role && isLabourEventRole(role)
            ? dayRate === ""
              ? role.default_day_rate_qar
              : Math.max(0, Number(dayRate) || 0)
            : null,
        date_from: dateFrom,
        date_to: dateTo,
        notes: notes.trim() || null,
      });
      setStaffId("");
      setNotes("");
      setDayRate("");
      setHoursPerDay("");
      onChanged();
      toast.success(t("events.staffing.toasts.saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeAssignment(id: string) {
    setBusy(true);
    try {
      await deleteEventStaffAssignment({ id });
      onChanged();
      toast.success(t("events.staffing.toasts.removed"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createHire() {
    if (!hireName.trim()) return;
    setBusy(true);
    try {
      const role = selectedHireRole;
      await createEventHireAndAssign({
        eventId,
        fullName: hireName.trim(),
        role_label: role?.name ?? "Crew",
        event_role_id: role?.id ?? null,
        hours_per_day:
          role && isLabourEventRole(role)
            ? Number(hireHours) || role.default_hours_per_day || 10
            : null,
        day_rate_qar:
          role && isLabourEventRole(role)
            ? hireDayRate === ""
              ? role.default_day_rate_qar
              : Math.max(0, Number(hireDayRate) || 0)
            : null,
        date_from: hireFrom,
        date_to: hireTo,
        phone: hirePhone.trim() || undefined,
      });
      setHireName("");
      setHirePhone("");
      setHireDayRate("");
      setHireHours("");
      onChanged();
      toast.success(t("events.staffing.toasts.hireCreated"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    downloadCsvContent(buildEventStaffingTemplateCsv(), "event-crew-import-template.csv");
  }

  async function exportCrew(kind: "csv" | "xlsx") {
    const base = staffingExportFilename(eventName || eventId.slice(0, 8), kind);
    if (kind === "csv") {
      downloadCsvContent(buildEventStaffingExportCsv(assignments), base);
      return;
    }
    const { downloadXlsx } = await import("@/lib/spreadsheet/workbook");
    await downloadXlsx(base, [
      {
        name: "Crew",
        rows: buildEventStaffingExportMatrix(assignments),
        freezeRows: 1,
        colWidths: [16, 24, 12, 14, 12, 12, 28, 10, 10],
      },
    ]);
  }

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(assignments.map((a) => a.id)) : new Set());
  }

  function toggleOne(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function bulkClose() {
    if (!selectedIds.length) return;
    setBusy(true);
    try {
      const res = await bulkCloseEventStaffAssignments({ eventId, ids: selectedIds });
      setSelected(new Set());
      onChanged();
      toast.success(t("peopleEvent.bulk.closed", { n: res.closed }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function bulkRemove() {
    if (!selectedIds.length) return;
    setBusy(true);
    try {
      const res = await bulkDeleteEventStaffAssignments({ eventId, ids: selectedIds });
      setSelected(new Set());
      onChanged();
      toast.success(t("peopleEvent.bulk.removed", { n: res.removed }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function bulkDates() {
    if (!selectedIds.length || !bulkFrom || !bulkTo) return;
    setBusy(true);
    try {
      const res = await bulkUpdateEventStaffAssignmentDates({
        eventId,
        ids: selectedIds,
        date_from: bulkFrom,
        date_to: bulkTo,
      });
      setSelected(new Set());
      onChanged();
      toast.success(t("peopleEvent.bulk.datesUpdated", { n: res.updated }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onImportFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const preview = parseEventStaffingImportRows(await readStaffingSpreadsheet(file));
      if (!preview.rows.length) {
        throw new Error(
          preview.errors[0]
            ? t("events.staffing.import.rowError", {
                row: preview.errors[0].row,
                message: preview.errors[0].message,
              })
            : t("events.staffing.import.noRows"),
        );
      }
      if (preview.errors.length) {
        toast.error(t("events.staffing.import.parsePartial", { n: preview.errors.length }));
      }
      const result = await bulkImportEventStaffAssignments({
        eventId,
        rows: preview.rows,
      });
      onChanged();
      if (result.errors.length && result.imported) {
        toast.error(
          t("events.staffing.import.importedPartial", {
            imported: result.imported,
            errors: result.errors.length,
          }),
        );
      } else if (result.errors.length) {
        toast.error(
          t("events.staffing.import.rowError", {
            row: result.errors[0]!.row,
            message: result.errors[0]!.message,
          }),
        );
      } else {
        toast.success(t("events.staffing.import.imported", { count: result.imported }));
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/40 bg-card p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t("events.staffing.crewList")}</h2>
            <p className="text-xs text-muted-foreground">{t("events.staffing.hint")}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={busy}
              onClick={downloadTemplate}
            >
              <Download className="me-1.5 h-3.5 w-3.5" />
              {t("events.staffing.import.template")}
            </Button>
            {canEdit ? (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted">
                <Upload className="h-3.5 w-3.5" />
                {t("events.staffing.import.upload")}
                <input
                  ref={importRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => void onImportFile(e.target.files?.[0] ?? null)}
                />
              </label>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={busy || assignments.length === 0}
              onClick={() => void exportCrew("csv")}
            >
              {t("events.staffing.export.csv")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={busy || assignments.length === 0}
              onClick={() => void exportCrew("xlsx")}
            >
              {t("events.staffing.export.xlsx")}
            </Button>
          </div>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t("events.staffing.import.help")}</p>
        {canEdit && selectedIds.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-border/40 bg-muted/20 p-2">
            <span className="text-xs text-muted-foreground">
              {t("peopleEvent.bulk.selected", { n: selectedIds.length })}
            </span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void bulkClose()}>
              {t("peopleEvent.bulk.close")}
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void bulkRemove()}>
              {t("peopleEvent.bulk.remove")}
            </Button>
            <Input
              type="date"
              className="h-8 w-auto"
              value={bulkFrom}
              onChange={(e) => setBulkFrom(e.target.value)}
            />
            <Input
              type="date"
              className="h-8 w-auto"
              value={bulkTo}
              onChange={(e) => setBulkTo(e.target.value)}
            />
            <Button
              size="sm"
              disabled={busy || !bulkFrom || !bulkTo}
              onClick={() => void bulkDates()}
            >
              {t("peopleEvent.bulk.updateDates")}
            </Button>
          </div>
        ) : null}
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("events.staffing.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {canEdit ? (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={assignments.length > 0 && selected.size === assignments.length}
                      onCheckedChange={(v) => toggleAll(Boolean(v))}
                      aria-label={t("peopleEvent.bulk.selectAll")}
                    />
                  </TableHead>
                ) : null}
                <TableHead>{t("events.staffing.columns.person")}</TableHead>
                <TableHead>{t("events.staffing.columns.type")}</TableHead>
                <TableHead>{t("events.staffing.columns.role")}</TableHead>
                <TableHead>{t("events.staffing.columns.dates")}</TableHead>
                <TableHead>{t("events.staffing.columns.pay")}</TableHead>
                {canEdit ? <TableHead className="w-24" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((row) => (
                <TableRow key={row.id}>
                  {canEdit ? (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(v) => toggleOne(row.id, Boolean(v))}
                        aria-label={row.staff_name ?? row.id}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{row.staff_name ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.staff_employee_code ? `${row.staff_employee_code} · ` : ""}
                        {row.staff_job_title ?? "—"}
                        {row.assignment_type === "event_hire" ? (
                          <Badge variant="outline" className="ms-2 text-[10px]">
                            {t("events.staffing.eventHireBadge")}
                          </Badge>
                        ) : null}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{assignmentTypeLabel(row.assignment_type)}</Badge>
                      {row.status === "closed" ? (
                        <Badge variant="outline">{t("events.staffing.closedBadge")}</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{row.role_label}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {row.date_from} → {row.date_to}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.pay_on_event_run
                      ? t("events.staffing.payOn")
                      : t("events.staffing.payOff")}
                  </TableCell>
                  {canEdit ? (
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void removeAssignment(row.id)}
                      >
                        {t("common.remove")}
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {canEdit ? (
        <section className="rounded-2xl border border-border/40 bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("events.staffing.addExisting")}</h2>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as EventStaffAssignmentType);
                setStaffId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_STAFF_ASSIGNMENT_TYPES.filter((x) => x !== "event_hire").map((x) => (
                  <SelectItem key={x} value={x}>
                    {assignmentTypeLabel(x)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={staffId || "none"} onValueChange={(v) => setStaffId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("events.overview.selectStaff")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("events.overview.selectStaff")}</SelectItem>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                    {looksLikeJokerPoolStaff(s) ? ` · ${t("events.staffing.jokerTag")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={roleId || "none"}
              onValueChange={(v) => {
                setRoleId(v === "none" ? "" : v);
                setDayRate("");
                setHoursPerDay("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("events.overview.roleLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("events.overview.roleLabel")}</SelectItem>
                {activeRoles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {isLabourEventRole(r) ? ` · ${t("events.roles.kinds.labour")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            {selectedRole && isLabourEventRole(selectedRole) ? (
              <>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  value={hoursPerDay || String(selectedRole.default_hours_per_day || 10)}
                  onChange={(e) => setHoursPerDay(e.target.value)}
                  placeholder={t("events.roles.hoursPerDay")}
                  aria-label={t("events.roles.hoursPerDay")}
                />
                <Input
                  type="number"
                  min={0}
                  value={dayRate}
                  onChange={(e) => setDayRate(e.target.value)}
                  placeholder={t("events.roles.dayRateOptional")}
                  aria-label={t("events.roles.dayRate")}
                />
              </>
            ) : null}
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("events.staffing.notesPlaceholder")}
            />
            <Button size="sm" disabled={!staffId || busy} onClick={() => void addAssignment()}>
              {t("events.staffing.addAssignment")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("events.staffing.loanedNote")}</p>
        </section>
      ) : null}

      {canEdit && canHire ? (
        <section className="rounded-2xl border border-border/40 bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold">{t("events.staffing.hireTitle")}</h2>
          <p className="mb-3 text-xs text-muted-foreground">{t("events.staffing.hireHint")}</p>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            <Input
              value={hireName}
              onChange={(e) => setHireName(e.target.value)}
              placeholder={t("events.staffing.hireName")}
            />
            <Select
              value={hireRoleId || "none"}
              onValueChange={(v) => {
                setHireRoleId(v === "none" ? "" : v);
                setHireDayRate("");
                setHireHours("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("events.overview.roleLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("events.overview.roleLabel")}</SelectItem>
                {activeRoles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {isLabourEventRole(r) ? ` · ${t("events.roles.kinds.labour")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={hirePhone}
              onChange={(e) => setHirePhone(e.target.value)}
              placeholder={t("events.staffing.hirePhone")}
            />
            <Input type="date" value={hireFrom} onChange={(e) => setHireFrom(e.target.value)} />
            <Input type="date" value={hireTo} onChange={(e) => setHireTo(e.target.value)} />
            {selectedHireRole && isLabourEventRole(selectedHireRole) ? (
              <>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  value={hireHours || String(selectedHireRole.default_hours_per_day || 10)}
                  onChange={(e) => setHireHours(e.target.value)}
                  placeholder={t("events.roles.hoursPerDay")}
                />
                <Input
                  type="number"
                  min={0}
                  value={hireDayRate}
                  onChange={(e) => setHireDayRate(e.target.value)}
                  placeholder={t("events.roles.dayRateOptional")}
                />
              </>
            ) : null}
            <Button size="sm" disabled={!hireName.trim() || busy} onClick={() => void createHire()}>
              {t("events.staffing.createHire")}
            </Button>
          </div>
        </section>
      ) : null}

      {canEdit && !canHire ? (
        <p className="text-xs text-muted-foreground">{t("events.staffing.hireNeedsPeople")}</p>
      ) : null}
    </div>
  );
}
