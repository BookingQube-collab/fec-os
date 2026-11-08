"use client";

import { Download, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseCsv } from "@/lib/csv-parse";
import {
  bulkImportEventStaffAssignments,
  createEventHireAndAssign,
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
  buildEventStaffingTemplateCsv,
  parseEventStaffingImportRows,
} from "@/lib/events/staffing-import";
import { downloadCsvContent } from "@/lib/staff-import";

export type EventStaffFormOption = {
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

export function EventStaffAddExistingForm({
  eventId,
  staff,
  roles,
  defaultFrom,
  defaultTo,
  onCreated,
  submitLabel,
}: {
  eventId: string;
  staff: EventStaffFormOption[];
  roles: EventRoleRow[];
  defaultFrom: string;
  defaultTo: string;
  onCreated: () => void;
  submitLabel?: string;
}) {
  const { t } = useTranslation();
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

  useEffect(() => {
    if (!roleId && defaultRole?.id) setRoleId(defaultRole.id);
  }, [roleId, defaultRole?.id]);

  useEffect(() => {
    setDateFrom(defaultFrom);
    setDateTo(defaultTo);
  }, [defaultFrom, defaultTo]);

  const selectedRole = activeRoles.find((r) => r.id === roleId) ?? null;
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
    if (!staffId || !eventId) return;
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
      onCreated();
      toast.success(t("events.staffing.toasts.saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 md:grid-cols-2">
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
      </div>
      <p className="text-xs text-muted-foreground">{t("events.staffing.loanedNote")}</p>
      <Button size="sm" disabled={!staffId || !eventId || busy} onClick={() => void addAssignment()}>
        {submitLabel ?? t("events.staffing.addAssignment")}
      </Button>
    </div>
  );
}

export function EventStaffCreateHireForm({
  eventId,
  roles,
  defaultFrom,
  defaultTo,
  onCreated,
}: {
  eventId: string;
  roles: EventRoleRow[];
  defaultFrom: string;
  defaultTo: string;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const activeRoles = useMemo(
    () => roles.filter((r) => r.is_active !== false).sort((a, b) => a.sort_order - b.sort_order),
    [roles],
  );
  const defaultRole = activeRoles.find((r) => r.code === "crew") ?? activeRoles[0] ?? null;
  const [hireName, setHireName] = useState("");
  const [hireRoleId, setHireRoleId] = useState(defaultRole?.id ?? "");
  const [hireFrom, setHireFrom] = useState(defaultFrom);
  const [hireTo, setHireTo] = useState(defaultTo);
  const [hirePhone, setHirePhone] = useState("");
  const [hireDayRate, setHireDayRate] = useState("");
  const [hireHours, setHireHours] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedHireRole = activeRoles.find((r) => r.id === hireRoleId) ?? null;

  useEffect(() => {
    if (!hireRoleId && defaultRole?.id) setHireRoleId(defaultRole.id);
  }, [hireRoleId, defaultRole?.id]);

  useEffect(() => {
    setHireFrom(defaultFrom);
    setHireTo(defaultTo);
  }, [defaultFrom, defaultTo]);

  async function createHire() {
    if (!hireName.trim() || !eventId) return;
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
      onCreated();
      toast.success(t("events.staffing.toasts.hireCreated"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("events.staffing.hireHint")}</p>
      <div className="grid gap-2 md:grid-cols-2">
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
      </div>
      <Button
        size="sm"
        disabled={!hireName.trim() || !eventId || busy}
        onClick={() => void createHire()}
      >
        {t("events.staffing.createHire")}
      </Button>
    </div>
  );
}

export function downloadEventStaffingTemplate() {
  downloadCsvContent(buildEventStaffingTemplateCsv(), "event-crew-import-template.csv");
}

export function EventStaffBulkImportActions({
  eventId,
  disabled,
  onImported,
  showHelp = true,
  allowUpload = true,
}: {
  eventId: string;
  disabled?: boolean;
  onImported: () => void;
  showHelp?: boolean;
  allowUpload?: boolean;
}) {
  const { t } = useTranslation();
  const importRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onImportFile(file: File | null) {
    if (!file || !eventId) return;
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
      onImported();
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
    <div>
      {showHelp ? (
        <p className="mb-3 text-xs text-muted-foreground">{t("events.staffing.import.help")}</p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={busy || disabled}
          onClick={downloadEventStaffingTemplate}
        >
          <Download className="me-1.5 h-3.5 w-3.5" />
          {t("events.staffing.import.template")}
        </Button>
        {allowUpload ? (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" />
            {t("events.staffing.import.upload")}
            <input
              ref={importRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={busy || disabled || !eventId}
              onChange={(e) => void onImportFile(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
