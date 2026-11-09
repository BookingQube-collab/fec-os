/** Event staffing bulk import / export helpers (CSV & Excel). */

import { toCsv } from "@/lib/csv-parse";
import { previewEventHireEmployeeCode } from "@/lib/events/event-hire-employee-code";
import {
  assignmentTypeLabel,
  normalizeAssignmentType,
  validateAssignmentDates,
  type EventStaffAssignmentType,
} from "@/lib/events/staff-assignments";
import type { EventStaffAssignmentRow } from "@/lib/events/types";

export type EventStaffingTemplateRole = {
  code: string;
  name: string;
  is_active?: boolean;
  sort_order?: number;
};

export type EventStaffingTemplateOptions = {
  /** Active event roles from HR / event roles master. */
  roles?: readonly EventStaffingTemplateRole[] | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  /**
   * When true, pre-fill illustrative EVT-{role}nn codes (import regenerates for new hires).
   * Default false — leave employee_code blank.
   */
  previewCodes?: boolean;
};

const COL = {
  employee_code: ["employee_code", "emp_code", "code", "staff_code", "employee code", "كود الموظف"],
  staff_name: ["staff_name", "full_name", "name", "person", "staff", "الاسم", "اسم الموظف"],
  assignment_type: [
    "assignment_type",
    "type",
    "role_type",
    "assignment",
    "نوع التعيين",
    "النوع",
  ],
  role_label: ["role_label", "role", "crew_role", "الدور"],
  date_from: ["date_from", "start", "start_date", "from", "من", "تاريخ البداية"],
  date_to: ["date_to", "end", "end_date", "to", "إلى", "تاريخ النهاية"],
  notes: ["notes", "note", "pay_source", "pay source", "ملاحظات"],
  pay_on_event_run: ["pay_on_event_run", "event_pay", "pay_on_event", "pay"],
} as const;

function pick(row: Record<string, string>, keys: readonly string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v?.trim()) return v.trim();
  }
  return "";
}

function normalizeDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // Excel serial date as plain number string
  if (/^\d+(\.\d+)?$/.test(v)) {
    const serial = Number(v);
    if (Number.isFinite(serial) && serial > 20000) {
      const epoch = Date.UTC(1899, 11, 30);
      const ms = epoch + Math.round(serial) * 86400000;
      return new Date(ms).toISOString().slice(0, 10);
    }
  }
  // DD/MM/YYYY or MM/DD/YYYY — prefer ISO-like day-first when day > 12
  const m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = m[3];
    if (a > 12) {
      return `${y}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    // Ambiguous: treat as YYYY-MM-DD style month/day US when coming from Excel text
    return `${y}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  return null;
}

function parseBool(raw: string, fallback: boolean): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

export const EVENT_STAFFING_IMPORT_HEADERS = [
  "employee_code",
  "staff_name",
  "assignment_type",
  "role_label",
  "date_from",
  "date_to",
  "notes",
  "pay_on_event_run",
] as const;

export type EventStaffingImportRow = {
  row: number;
  employee_code: string | null;
  staff_name: string | null;
  assignment_type: EventStaffAssignmentType;
  role_label: string;
  date_from: string;
  date_to: string;
  notes: string | null;
  pay_on_event_run: boolean;
};

export type EventStaffingImportPreview = {
  rows: EventStaffingImportRow[];
  errors: { row: number; message: string }[];
};

/**
 * Sample CSV for bulk crew import.
 * Prefer one row per active event role (role_label from the event).
 * employee_code is left blank (auto-generated from role on import for new event hires)
 * unless `previewCodes` is set for illustration.
 */
export function buildEventStaffingTemplateCsv(options?: EventStaffingTemplateOptions): string {
  const dateFrom = (options?.dateFrom ?? "").trim() || "2026-08-26";
  const dateTo = (options?.dateTo ?? "").trim() || "2026-08-31";
  const activeRoles = (options?.roles ?? [])
    .filter((r) => r.is_active !== false)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));

  if (activeRoles.length > 0) {
    const previewUsed: string[] = [];
    return toCsv(
      [...EVENT_STAFFING_IMPORT_HEADERS],
      activeRoles.map((role, idx) => {
        const code = options?.previewCodes
          ? previewEventHireEmployeeCode(role.code, previewUsed)
          : "";
        if (code) previewUsed.push(code);
        return [
          code,
          `Sample ${role.name}`,
          "event_hire",
          role.name,
          dateFrom,
          dateTo,
          idx === 0 ? "employee_code auto-generated from role — leave blank for new hires" : "",
          "true",
        ];
      }),
    );
  }

  // Fallback when no event roles are available yet (create roles first).
  return toCsv(
    [...EVENT_STAFFING_IMPORT_HEADERS],
    [
      [
        "",
        "Sample Event Hire",
        "event_hire",
        "Crew",
        dateFrom,
        dateTo,
        "employee_code auto-generated from role — leave blank for new hires; use existing codes only for joker/loaned",
        "true",
      ],
    ],
  );
}

export function parseEventStaffingImportRows(
  rawRows: Record<string, string>[],
): EventStaffingImportPreview {
  const rows: EventStaffingImportRow[] = [];
  const errors: { row: number; message: string }[] = [];

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2;
    const employee_code = pick(raw, COL.employee_code).toUpperCase() || null;
    const staff_name = pick(raw, COL.staff_name) || null;
    const typeRaw = pick(raw, COL.assignment_type);
    const role_label = pick(raw, COL.role_label) || "crew";
    const fromRaw = pick(raw, COL.date_from);
    const toRaw = pick(raw, COL.date_to);
    const notes = pick(raw, COL.notes) || null;
    const payRaw = pick(raw, COL.pay_on_event_run);

    if (!employee_code && !staff_name && !typeRaw && !fromRaw && !toRaw) return;

    const assignment_type = normalizeAssignmentType(typeRaw || "event_hire");
    if (!assignment_type) {
      errors.push({
        row: rowNum,
        message: `Unknown assignment_type "${typeRaw}" (use joker, loaned, or event_hire)`,
      });
      return;
    }

    // New event hires need a name (code is auto-generated from role).
    // Joker / loaned need employee_code (preferred) or staff_name to match existing staff.
    if (!employee_code && !staff_name) {
      errors.push({
        row: rowNum,
        message:
          assignment_type === "event_hire"
            ? "staff_name is required for new event hires (employee_code is auto-generated)"
            : "employee_code or staff_name is required",
      });
      return;
    }

    const date_from = normalizeDate(fromRaw);
    const date_to = normalizeDate(toRaw);
    if (!date_from || !date_to) {
      errors.push({ row: rowNum, message: "date_from and date_to must be YYYY-MM-DD" });
      return;
    }
    const dateErr = validateAssignmentDates(date_from, date_to);
    if (dateErr) {
      errors.push({ row: rowNum, message: dateErr });
      return;
    }

    rows.push({
      row: rowNum,
      employee_code,
      staff_name,
      assignment_type,
      role_label: role_label.slice(0, 120),
      date_from,
      date_to,
      notes: notes ? notes.slice(0, 2000) : null,
      pay_on_event_run: parseBool(payRaw, true),
    });
  });

  return { rows, errors };
}

export function buildEventStaffingExportCsv(
  assignments: EventStaffAssignmentRow[],
  staffCodes?: Map<string, string | null>,
): string {
  return toCsv(
    [...EVENT_STAFFING_IMPORT_HEADERS, "status"],
    assignments.map((a) => [
      a.staff_employee_code ?? staffCodes?.get(a.staff_id) ?? "",
      a.staff_name ?? "",
      normalizeAssignmentType(a.assignment_type) ?? a.assignment_type,
      a.role_label,
      a.date_from,
      a.date_to,
      a.notes ?? "",
      a.pay_on_event_run ? "true" : "false",
      a.status,
    ]),
  );
}

export function buildEventStaffingExportMatrix(
  assignments: EventStaffAssignmentRow[],
): unknown[][] {
  const headers = [...EVENT_STAFFING_IMPORT_HEADERS, "status"];
  return [
    headers,
    ...assignments.map((a) => [
      a.staff_employee_code ?? "",
      a.staff_name ?? "",
      normalizeAssignmentType(a.assignment_type) ?? a.assignment_type,
      a.role_label,
      a.date_from,
      a.date_to,
      a.notes ?? "",
      a.pay_on_event_run ? "true" : "false",
      a.status,
    ]),
  ];
}

export function staffingExportFilename(eventName: string, ext: "csv" | "xlsx"): string {
  const slug = eventName
    .trim()
    .replace(/[^\w\u0600-\u06FF]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "event";
  return `event-crew-${slug}.${ext}`;
}

export function describeAssignmentTypeForImportHint(): string {
  return EVENT_STAFFING_IMPORT_HEADERS.join(", ");
}

export { assignmentTypeLabel };
