"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  EventStaffAddExistingForm,
  EventStaffBulkImportActions,
  EventStaffCreateHireForm,
  downloadEventStaffingTemplate,
  type EventStaffFormOption,
} from "@/components/events/event-staff-assignment-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  bulkCloseEventStaffAssignments,
  bulkDeleteEventStaffAssignments,
  bulkUpdateEventStaffAssignmentDates,
  deleteEventStaffAssignment,
} from "@/lib/event-staff-assignments.functions";
import { type EventRoleRow } from "@/lib/events/event-roles";
import { assignmentTypeLabel } from "@/lib/events/staff-assignments";
import {
  buildEventStaffingExportCsv,
  buildEventStaffingExportMatrix,
  staffingExportFilename,
} from "@/lib/events/staffing-import";
import type { EventStaffAssignmentRow } from "@/lib/events/types";
import { downloadCsvContent } from "@/lib/staff-import";

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
  variant = "manage",
}: {
  eventId: string;
  eventName?: string;
  assignments: EventStaffAssignmentRow[];
  staff: EventStaffFormOption[];
  roles?: EventRoleRow[];
  canEdit: boolean;
  canHire: boolean;
  defaultFrom: string;
  defaultTo: string;
  onChanged: () => void;
  /** summary = read-only Ops hub (no create / import / bulk edit). */
  variant?: "manage" | "summary";
}) {
  const { t } = useTranslation();
  const isSummary = variant === "summary";
  const allowEdit = canEdit && !isSummary;
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFrom, setBulkFrom] = useState(defaultFrom);
  const [bulkTo, setBulkTo] = useState(defaultTo);

  const selectedIds = useMemo(() => [...selected], [selected]);

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

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/40 bg-card p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t("events.staffing.crewList")}</h2>
            <p className="text-xs text-muted-foreground">
              {isSummary ? t("peopleEvent.staffingHub.summaryHint") : t("events.staffing.hint")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {!isSummary && allowEdit ? (
              <EventStaffBulkImportActions
                eventId={eventId}
                roles={roles}
                dateFrom={defaultFrom}
                dateTo={defaultTo}
                disabled={busy}
                onImported={onChanged}
                showHelp={false}
              />
            ) : null}
            {!isSummary && !allowEdit ? (
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() =>
                  downloadEventStaffingTemplate({
                    roles,
                    dateFrom: defaultFrom,
                    dateTo: defaultTo,
                  })
                }
              >
                {t("events.staffing.import.template")}
              </Button>
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
        {!isSummary ? (
          <p className="mb-3 text-xs text-muted-foreground">{t("events.staffing.import.help")}</p>
        ) : null}
        {allowEdit && selectedIds.length > 0 ? (
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
          <p className="text-sm text-muted-foreground">
            {isSummary ? t("peopleEvent.staffingHub.empty") : t("events.staffing.empty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {allowEdit ? (
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
                {allowEdit ? <TableHead className="w-24" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((row) => (
                <TableRow key={row.id}>
                  {allowEdit ? (
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
                  {allowEdit ? (
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

      {allowEdit ? (
        <section className="rounded-2xl border border-border/40 bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("events.staffing.addExisting")}</h2>
          <EventStaffAddExistingForm
            eventId={eventId}
            staff={staff}
            roles={roles}
            defaultFrom={defaultFrom}
            defaultTo={defaultTo}
            onCreated={onChanged}
          />
        </section>
      ) : null}

      {allowEdit && canHire ? (
        <section className="rounded-2xl border border-border/40 bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold">{t("events.staffing.hireTitle")}</h2>
          <EventStaffCreateHireForm
            eventId={eventId}
            roles={roles}
            defaultFrom={defaultFrom}
            defaultTo={defaultTo}
            onCreated={onChanged}
          />
        </section>
      ) : null}

      {allowEdit && !canHire ? (
        <p className="text-xs text-muted-foreground">{t("events.staffing.hireNeedsPeople")}</p>
      ) : null}
    </div>
  );
}
