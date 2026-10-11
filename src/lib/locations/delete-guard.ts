/**
 * A location delete is safe only when no child row would be removed or would
 * block the delete. Optional links that set the location to null are left to
 * the existing foreign keys and are not treated as blockers.
 */

export const LOCATION_DELETE_LINK_KINDS = [
  "staff",
  "staffSites",
  "punches",
  "shifts",
  "departments",
  "other",
] as const;

export type LocationDeleteLinkKind = (typeof LOCATION_DELETE_LINK_KINDS)[number];

export type LocationDeleteLinkProbe = {
  table: string;
  column: string;
  kind: LocationDeleteLinkKind;
};

export type LocationDeleteLinkCounts = Record<LocationDeleteLinkKind, number>;

export const LOCATION_DELETE_BLOCKED = "LOCATION_DELETE_BLOCKED";
export const LOCATION_DELETE_FK = "LOCATION_DELETE_FK";
export const LOCATION_DELETE_VERIFY_FAILED = "LOCATION_DELETE_VERIFY_FAILED";

const LINK_LABELS: Record<LocationDeleteLinkKind, string> = {
  staff: "staff",
  staffSites: "site assignments",
  punches: "punches",
  shifts: "shifts",
  departments: "departments",
  other: "other linked records",
};

/** CASCADE and RESTRICT foreign keys on locations. SET NULL links are omitted. */
export const LOCATION_DELETE_LINK_PROBES: readonly LocationDeleteLinkProbe[] = [
  { table: "staff", column: "location_id", kind: "staff" },
  { table: "staff_work_locations", column: "location_id", kind: "staffSites" },
  { table: "attendance_logs", column: "location_id", kind: "punches" },
  { table: "attendance_daily_summary", column: "location_id", kind: "punches" },
  { table: "attendance_exceptions", column: "location_id", kind: "punches" },
  { table: "attendance_corrections", column: "location_id", kind: "punches" },
  { table: "attendance_biometric_users", column: "location_id", kind: "punches" },
  { table: "attendance_devices", column: "location_id", kind: "punches" },
  { table: "attendance_import_files", column: "location_id", kind: "punches" },
  { table: "attendance_leave_records", column: "location_id", kind: "punches" },
  { table: "shifts", column: "location_id", kind: "shifts" },
  { table: "attendance_roster_assignments", column: "location_id", kind: "shifts" },
  { table: "attendance_shift_templates", column: "location_id", kind: "shifts" },
  { table: "shift_briefings", column: "location_id", kind: "shifts" },
  { table: "daily_ops_roster_uploads", column: "location_id", kind: "shifts" },
  { table: "location_areas", column: "location_id", kind: "departments" },
  { table: "ai_artifacts", column: "location_id", kind: "other" },
  { table: "amc_contracts", column: "location_id", kind: "other" },
  { table: "arcade_pm_schedules", column: "location_id", kind: "other" },
  { table: "assets", column: "location_id", kind: "other" },
  { table: "attendance_geofences", column: "location_id", kind: "other" },
  { table: "attendance_holidays", column: "location_id", kind: "other" },
  { table: "attendance_rule_sets", column: "location_id", kind: "other" },
  { table: "attendance_site_settings", column: "location_id", kind: "other" },
  { table: "attractions", column: "location_id", kind: "other" },
  { table: "audits", column: "location_id", kind: "other" },
  { table: "bookings", column: "location_id", kind: "other" },
  { table: "complaints", column: "location_id", kind: "other" },
  { table: "compliance_calendar_events", column: "location_id", kind: "other" },
  { table: "compliance_documents", column: "location_id", kind: "other" },
  { table: "compliance_followups", column: "location_id", kind: "other" },
  { table: "compliance_recurring_tasks", column: "location_id", kind: "other" },
  { table: "daily_reports", column: "location_id", kind: "other" },
  { table: "delivery_requests", column: "location_id", kind: "other" },
  { table: "downtime_events", column: "location_id", kind: "other" },
  { table: "escalation_rules", column: "location_id", kind: "other" },
  { table: "escalations", column: "location_id", kind: "other" },
  { table: "facility_tasks", column: "location_id", kind: "other" },
  { table: "financial_snapshots", column: "location_id", kind: "other" },
  { table: "findings", column: "location_id", kind: "other" },
  { table: "forecast_results", column: "location_id", kind: "other" },
  { table: "handovers", column: "location_id", kind: "other" },
  { table: "hr_workforce_quotas", column: "location_id", kind: "other" },
  { table: "incidents", column: "location_id", kind: "other" },
  { table: "inventory_movements", column: "location_id", kind: "other" },
  { table: "inventory_stock", column: "location_id", kind: "other" },
  { table: "kpi_assignments", column: "location_id", kind: "other" },
  { table: "leakage_cases", column: "location_id", kind: "other" },
  { table: "location_compliance_items", column: "location_id", kind: "other" },
  { table: "maintenance_requests", column: "location_id", kind: "other" },
  { table: "maintenance_weekly_reports", column: "location_id", kind: "other" },
  { table: "mall_requests", column: "location_id", kind: "other" },
  { table: "obligations", column: "location_id", kind: "other" },
  { table: "opening_readiness", column: "location_id", kind: "other" },
  { table: "pm_schedules", column: "location_id", kind: "other" },
  { table: "proc_budgets", column: "location_id", kind: "other" },
  { table: "purchase_orders", column: "location_id", kind: "other" },
  { table: "risk_register", column: "location_id", kind: "other" },
  { table: "snag_items", column: "location_id", kind: "other" },
  { table: "snag_lists", column: "location_id", kind: "other" },
  { table: "sop_assignments", column: "location_id", kind: "other" },
  { table: "supervisor_issues", column: "location_id", kind: "other" },
  { table: "task_instances", column: "location_id", kind: "other" },
  { table: "task_templates", column: "location_id", kind: "other" },
  { table: "tickets", column: "location_id", kind: "other" },
  { table: "training_enrollments", column: "location_id", kind: "other" },
  { table: "transactions", column: "location_id", kind: "other" },
  { table: "utility_consumption", column: "location_id", kind: "other" },
  { table: "weekly_reports", column: "location_id", kind: "other" },
  { table: "weekly_review_aggregators", column: "location_id", kind: "other" },
  { table: "weekly_review_loyalty", column: "location_id", kind: "other" },
  { table: "weekly_review_social", column: "location_id", kind: "other" },
  { table: "work_orders", column: "location_id", kind: "other" },
  { table: "arcade_faults", column: "location_id", kind: "other" },
  { table: "arcade_installations", column: "location_id", kind: "other" },
  { table: "arcade_machines", column: "location_id", kind: "other" },
  { table: "arcade_observation_checks", column: "location_id", kind: "other" },
  { table: "arcade_observations", column: "location_id", kind: "other" },
  { table: "arcade_part_requests", column: "location_id", kind: "other" },
  { table: "arcade_part_usages", column: "location_id", kind: "other" },
  { table: "arcade_pm_records", column: "location_id", kind: "other" },
  { table: "arcade_pm_results", column: "location_id", kind: "other" },
  { table: "arcade_repairs", column: "location_id", kind: "other" },
  { table: "chat_conversations", column: "location_id", kind: "other" },
  { table: "events", column: "location_id", kind: "other" },
  { table: "purchase_requisitions", column: "location_id", kind: "other" },
  { table: "staff_temporary_site_moves", column: "to_location_id", kind: "other" },
  { table: "staff_transfers", column: "to_location_id", kind: "other" },
  { table: "training_assignment_rules", column: "location_id", kind: "other" },
  { table: "training_saved_rules", column: "location_id", kind: "other" },
  { table: "training_sessions", column: "location_id", kind: "other" },
];

const KIND_SET = new Set<string>(LOCATION_DELETE_LINK_KINDS);

export function emptyLocationDeleteLinkCounts(): LocationDeleteLinkCounts {
  return { staff: 0, staffSites: 0, punches: 0, shifts: 0, departments: 0, other: 0 };
}

export function foldLocationDeleteCounts(
  rows: ReadonlyArray<{ kind: LocationDeleteLinkKind; count: number }>,
): LocationDeleteLinkCounts {
  const counts = emptyLocationDeleteLinkCounts();
  for (const row of rows) {
    if (row.count > 0) counts[row.kind] += row.count;
  }
  return counts;
}

export function locationDeleteBlockers(counts: LocationDeleteLinkCounts): LocationDeleteLinkKind[] {
  return LOCATION_DELETE_LINK_KINDS.filter((kind) => counts[kind] > 0);
}

export function locationDeleteBlockedMessage(kinds: readonly LocationDeleteLinkKind[]): string {
  const labels = kinds.map((kind) => LINK_LABELS[kind]).join(", ");
  return `Cannot delete this location while it still has ${labels}. Staff, site assignments, punches, shifts, departments, and other linked records were not removed.`;
}

export function locationDeleteBlockedError(kinds: readonly LocationDeleteLinkKind[]): string {
  return `${LOCATION_DELETE_BLOCKED}:${kinds.join(",")}: ${locationDeleteBlockedMessage(kinds)}`;
}

export function locationDeleteForeignKeyError(): string {
  return `${LOCATION_DELETE_FK}:Cannot delete this location because another record still references it. The location was not removed.`;
}

export function locationDeleteVerifyError(): string {
  return `${LOCATION_DELETE_VERIFY_FAILED}:Could not check whether this location is safe to delete. It was not removed.`;
}

export function parseLocationDeleteFailure(
  message: string,
):
  | { code: "blocked"; kinds: LocationDeleteLinkKind[] }
  | { code: "foreignKey" }
  | { code: "verify" }
  | null {
  if (message.startsWith(`${LOCATION_DELETE_BLOCKED}:`)) {
    const payload = message.slice(LOCATION_DELETE_BLOCKED.length + 1);
    const token = payload.split(":")[0] ?? "";
    const kinds = token
      .split(",")
      .map((part) => part.trim())
      .filter((part): part is LocationDeleteLinkKind => KIND_SET.has(part));
    return { code: "blocked", kinds };
  }
  if (message.startsWith(`${LOCATION_DELETE_FK}:`) || message === LOCATION_DELETE_FK) {
    return { code: "foreignKey" };
  }
  if (message.startsWith(`${LOCATION_DELETE_VERIFY_FAILED}:`) || message === LOCATION_DELETE_VERIFY_FAILED) {
    return { code: "verify" };
  }
  return null;
}
