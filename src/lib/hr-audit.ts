/**
 * Shared HR → audit_log helpers (AT#18).
 * Callers pass these args into supabase.rpc("log_audit", …).
 */

export type HrAuditRpcArgs = {
  _action: string;
  _table_name: string;
  _row_id: string;
  _after: Record<string, unknown>;
  _location_id?: string;
  _metadata: Record<string, unknown>;
};

/** Build rpc("log_audit") payload used across HR modules. */
export function buildHrAuditRpcArgs(input: {
  action: string;
  tableName: string;
  rowId: string;
  after?: Record<string, unknown>;
  locationId?: string | null;
  metadata?: Record<string, unknown>;
}): HrAuditRpcArgs {
  const args: HrAuditRpcArgs = {
    _action: input.action,
    _table_name: input.tableName,
    _row_id: input.rowId,
    _after: input.after ?? {},
    _metadata: input.metadata ?? {},
  };
  if (input.locationId) args._location_id = input.locationId;
  return args;
}

/**
 * Spot-check catalog of key HR audit actions that must land in audit_log
 * (approvals / rejections / status / finance).
 */
export const HR_AUDIT_SPOT_CHECK = {
  approvals: [
    "hr_document.approve",
    "hr.resignation.approved",
    "hr.probation.approve",
    "hr.termination.approval",
  ],
  rejections: ["hr_document.reject"],
  status: [
    "hr.payroll.advance.draft_to_hr_review",
    "hr.termination.applied",
    "hr.probation.decision",
  ],
  finance: [
    "hr.payroll.lock",
    "hr.payroll.export.wps",
    "hr.payroll.export.cheque",
    "hr.payroll.export.bank_transfer",
    "hr.air_ticket.paid",
  ],
} as const;

export function allHrAuditSpotCheckActions(): string[] {
  return [
    ...HR_AUDIT_SPOT_CHECK.approvals,
    ...HR_AUDIT_SPOT_CHECK.rejections,
    ...HR_AUDIT_SPOT_CHECK.status,
    ...HR_AUDIT_SPOT_CHECK.finance,
  ];
}
