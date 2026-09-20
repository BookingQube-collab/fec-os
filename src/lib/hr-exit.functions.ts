"use server";

import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import {
  addDaysIso,
  allClearanceComplete,
  assertNoticeOverrideAllowed,
  assertTerminationCanApply,
  assertTerminationTypeAllowed,
  DEFAULT_CLEARANCE_SEED,
  draftTerminationFromProbationFlag,
  HR_CLEARANCE_KINDS,
  HR_RESIGNATION_STATUSES,
  HR_TERMINATION_NOTICE_TREATMENTS,
  HR_TERMINATION_STATUSES,
  HR_TERMINATION_TYPES,
  isExecTerminationApproverSlot,
  isHrTerminationApproverSlot,
  nextTerminationStatusAfterApproval,
  suggestNoticePeriod,
  type HrClearanceKind,
  type HrResignationStatus,
  type HrTerminationNoticeTreatment,
  type HrTerminationStatus,
  type HrTerminationType,
} from "@/lib/hr-exit";
import { readPolicySection } from "@/lib/hr-policy-read";
import { canUserDo, type AppRole } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import {
  createAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";
import { insertStatusHistory } from "@/lib/staff-history";
import { isFloorSupervisorView } from "@/lib/rbac";

function qatarToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

function assertNotFloor(context: AuthContext) {
  if (isFloorSupervisorView((context.roles ?? []) as AppRole[])) {
    throw new ForbiddenError("Floor roles cannot manage resignations or terminations.");
  }
}

async function audit(
  context: AuthContext,
  action: string,
  table: string,
  rowId: string,
  after: Record<string, unknown>,
  locationId?: string | null,
) {
  try {
    await context.supabase.rpc("log_audit", {
      _action: action,
      _table_name: table,
      _row_id: rowId,
      _after: after as unknown as Json,
      _location_id: locationId ?? undefined,
      _metadata: {},
    });
  } catch {
    /* non-blocking */
  }
}

async function loadStaffExitContext(context: AuthContext, staffId: string) {
  const { data: staff, error } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code, status, hire_date, location_id")
    .eq("id", staffId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!staff) throw new Error("Staff not found.");

  const { data: ext } = await context.supabase
    .from("staff_profile_ext")
    .select("employment_category, last_working_date, releasing_date, exit_reason")
    .eq("staff_id", staffId)
    .maybeSingle();

  return {
    staff,
    category: (ext?.employment_category as string | null) ?? null,
    hireDate: staff.hire_date ? String(staff.hire_date).slice(0, 10) : null,
  };
}

async function seedClearance(
  context: AuthContext,
  input: {
    staffId: string;
    resignationId?: string | null;
    terminationId?: string | null;
  },
) {
  const rows = DEFAULT_CLEARANCE_SEED.map((s) => ({
    staff_id: input.staffId,
    resignation_id: input.resignationId ?? null,
    termination_id: input.terminationId ?? null,
    item_kind: s.itemKind,
    label: s.label,
    department: s.department ?? null,
    sort_order: s.sortOrder,
    created_by: context.userId,
  }));
  const { error } = await context.supabase.from("hr_clearance_items").insert(rows);
  if (error && !tableMissing(error.message)) throw error;
}

async function syncProfileExit(
  context: AuthContext,
  staffId: string,
  patch: {
    lastWorkingDate?: string | null;
    releasingDate?: string | null;
    exitReason?: string | null;
  },
) {
  const { error } = await context.supabase.from("staff_profile_ext").upsert({
    staff_id: staffId,
    last_working_date: patch.lastWorkingDate ?? null,
    releasing_date: patch.releasingDate ?? null,
    exit_reason: patch.exitReason ?? null,
    updated_by: context.userId,
  });
  if (error && !tableMissing(error.message)) throw error;
}

function mapResignation(row: Record<string, unknown>) {
  const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
    employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
    staffStatus: (staff as { status?: string } | null)?.status ?? null,
    submittedOn: String(row.submitted_on).slice(0, 10),
    letterDocumentId: (row.letter_document_id as string | null) ?? null,
    reason: String(row.reason ?? ""),
    employmentCategory: (row.employment_category as string | null) ?? null,
    lengthOfServiceDays: row.length_of_service_days != null ? Number(row.length_of_service_days) : null,
    suggestedNoticeDays: Number(row.suggested_notice_days ?? 30),
    requiredNoticeDays: Number(row.required_notice_days ?? 30),
    noticeOverride: Boolean(row.notice_override),
    noticeOverrideReason: (row.notice_override_reason as string | null) ?? null,
    noticeOverrideApprovedBy: (row.notice_override_approved_by as string | null) ?? null,
    proposedLwd: row.proposed_lwd ? String(row.proposed_lwd).slice(0, 10) : null,
    approvedLwd: row.approved_lwd ? String(row.approved_lwd).slice(0, 10) : null,
    noticeWaiver: Boolean(row.notice_waiver),
    noticeRecovery: Boolean(row.notice_recovery),
    handoverNotes: (row.handover_notes as string | null) ?? null,
    assetClearance: Boolean(row.asset_clearance),
    deptClearance: Boolean(row.dept_clearance),
    financeClearance: Boolean(row.finance_clearance),
    finalSettlementStub: (row.final_settlement_stub as Record<string, unknown>) ?? {},
    airTicketEligible: Boolean(row.air_ticket_eligible),
    releasingDate: row.releasing_date ? String(row.releasing_date).slice(0, 10) : null,
    status: String(row.status) as HrResignationStatus,
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function mapTermination(row: Record<string, unknown>) {
  const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
    employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
    staffStatus: (staff as { status?: string } | null)?.status ?? null,
    terminationType: String(row.termination_type) as HrTerminationType,
    employmentCategory: (row.employment_category as string | null) ?? null,
    reason: String(row.reason ?? ""),
    effectiveOn: String(row.effective_on).slice(0, 10),
    lastWorkingDate: String(row.last_working_date).slice(0, 10),
    noticeTreatment: String(row.notice_treatment) as HrTerminationNoticeTreatment,
    supportingDocumentId: (row.supporting_document_id as string | null) ?? null,
    leaveTreatment: (row.leave_treatment as string | null) ?? null,
    loanTreatment: (row.loan_treatment as string | null) ?? null,
    airTicketEligible: Boolean(row.air_ticket_eligible),
    assetClearance: Boolean(row.asset_clearance),
    deptClearance: Boolean(row.dept_clearance),
    financeClearance: Boolean(row.finance_clearance),
    finalSettlementStub: (row.final_settlement_stub as Record<string, unknown>) ?? {},
    releasingDate: row.releasing_date ? String(row.releasing_date).slice(0, 10) : null,
    status: String(row.status) as HrTerminationStatus,
    hrApprovedBy: (row.hr_approved_by as string | null) ?? null,
    hrApprovedAt: (row.hr_approved_at as string | null) ?? null,
    execApprovedBy: (row.exec_approved_by as string | null) ?? null,
    execApprovedAt: (row.exec_approved_at as string | null) ?? null,
    sourceProbationReviewId: (row.source_probation_review_id as string | null) ?? null,
    appliedAt: (row.applied_at as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

const RESIGNATION_SELECT =
  "id, staff_id, submitted_on, letter_document_id, reason, employment_category, length_of_service_days, suggested_notice_days, required_notice_days, notice_override, notice_override_reason, notice_override_approved_by, proposed_lwd, approved_lwd, notice_waiver, notice_recovery, handover_notes, asset_clearance, dept_clearance, finance_clearance, final_settlement_stub, air_ticket_eligible, releasing_date, status, approved_by, approved_at, created_at, staff(full_name, employee_code, status)";

const TERMINATION_SELECT =
  "id, staff_id, termination_type, employment_category, reason, effective_on, last_working_date, notice_treatment, supporting_document_id, leave_treatment, loan_treatment, air_ticket_eligible, asset_clearance, dept_clearance, finance_clearance, final_settlement_stub, releasing_date, status, hr_approved_by, hr_approved_at, exec_approved_by, exec_approved_at, source_probation_review_id, applied_at, created_at, staff(full_name, employee_code, status)";

export const suggestNoticeForStaff = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    asOf: z.string().optional().nullable(),
  }),
  async (data, context) => {
    if (!canUserDo(context.roles ?? [], "hr.resignation.manage") && !canUserDo(context.roles ?? [], "hr.manage")) {
      throw new ForbiddenError("Missing hr.resignation.manage.");
    }
    const today = data.asOf?.slice(0, 10) ?? qatarToday();
    const { category, hireDate } = await loadStaffExitContext(context, data.staffId);
    const policy = await readPolicySection(context, "notice");
    return suggestNoticePeriod({ category, hireDate, asOf: today, policy });
  },
  { auth: { anyCapability: ["hr.resignation.manage", "hr.manage"] } },
);

export const listResignations = createAuthenticatedAction(
  z.object({
    status: z.enum([...HR_RESIGNATION_STATUSES, "all", "serving"]).optional().nullable(),
    staffId: z.string().uuid().optional().nullable(),
  }),
  async (data, context) => {
    if (!canUserDo(context.roles ?? [], "hr.resignation.manage") && !canUserDo(context.roles ?? [], "hr.manage")) {
      throw new ForbiddenError("Missing hr.resignation.manage.");
    }
    let query = context.supabase
      .from("hr_resignations")
      .select(RESIGNATION_SELECT)
      .order("submitted_on", { ascending: false })
      .limit(200);
    if (data.staffId) query = query.eq("staff_id", data.staffId);
    if (data.status === "serving") {
      query = query.in("status", ["approved", "serving_notice"]);
    } else if (data.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }
    const { data: rows, error } = await query;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => mapResignation(r as Record<string, unknown>));
  },
  { auth: { anyCapability: ["hr.resignation.manage", "hr.manage"] } },
);

export const submitResignation = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    submittedOn: z.string().optional().nullable(),
    reason: z.string().min(1),
    letterDocumentId: z.string().uuid().optional().nullable(),
    requiredNoticeDays: z.number().int().positive().optional().nullable(),
    noticeOverrideReason: z.string().optional().nullable(),
    proposedLwd: z.string().optional().nullable(),
    noticeWaiver: z.boolean().optional(),
    noticeRecovery: z.boolean().optional(),
    handoverNotes: z.string().optional().nullable(),
    airTicketEligible: z.boolean().optional(),
    releasingDate: z.string().optional().nullable(),
  }),
  async (data, context) => {
    assertNotFloor(context);
    if (!canUserDo(context.roles ?? [], "hr.resignation.manage")) {
      throw new ForbiddenError("Missing hr.resignation.manage.");
    }
    const today = qatarToday();
    const submittedOn = data.submittedOn?.slice(0, 10) ?? today;
    const { staff, category, hireDate } = await loadStaffExitContext(context, data.staffId);
    const policy = await readPolicySection(context, "notice");
    const suggestion = suggestNoticePeriod({
      category,
      hireDate,
      asOf: submittedOn,
      policy,
    });
    const required = data.requiredNoticeDays ?? suggestion.suggestedDays;
    const override = required !== suggestion.suggestedDays;
    if (override) {
      // AT#10: reason mandatory at submit; approval comes later
      if (!data.noticeOverrideReason?.trim()) {
        throw new Error("Notice override requires a mandatory reason (AT#10).");
      }
    }
    const proposed =
      data.proposedLwd?.slice(0, 10) ?? addDaysIso(submittedOn, required);
    const status: HrResignationStatus = override ? "pending_override_approval" : "submitted";

    const { data: row, error } = await context.supabase
      .from("hr_resignations")
      .insert({
        staff_id: data.staffId,
        submitted_on: submittedOn,
        letter_document_id: data.letterDocumentId ?? null,
        reason: data.reason.trim(),
        employment_category: category,
        length_of_service_days: suggestion.lengthOfServiceDays,
        suggested_notice_days: suggestion.suggestedDays,
        required_notice_days: required,
        notice_override: override,
        notice_override_reason: override ? data.noticeOverrideReason!.trim() : null,
        proposed_lwd: proposed,
        notice_waiver: data.noticeWaiver ?? false,
        notice_recovery: data.noticeRecovery ?? false,
        handover_notes: data.handoverNotes ?? null,
        air_ticket_eligible: data.airTicketEligible ?? false,
        releasing_date: data.releasingDate?.slice(0, 10) ?? null,
        status,
        submitted_by: context.userId,
        created_by: context.userId,
      })
      .select(RESIGNATION_SELECT)
      .single();
    if (error) throw error;

    await seedClearance(context, { staffId: data.staffId, resignationId: row.id });
    await appendEmployeeEvent(context, {
      staffId: data.staffId,
      eventType: "resignation_submitted",
      effectiveOn: submittedOn,
      payload: {
        suggested_notice_days: suggestion.suggestedDays,
        required_notice_days: required,
        notice_override: override,
        status,
      },
      documentId: data.letterDocumentId ?? null,
      sourceTable: "hr_resignations",
      sourceId: row.id,
    });
    await audit(context, "hr.resignation.submitted", "hr_resignations", row.id, {
      staff_id: data.staffId,
      status,
      required_notice_days: required,
    }, staff.location_id);

    return mapResignation(row as Record<string, unknown>);
  },
  { auth: { capability: "hr.resignation.manage" } },
);

export const approveResignation = createAuthenticatedAction(
  z.object({
    resignationId: z.string().uuid(),
    approvedLwd: z.string().optional().nullable(),
    approvalNote: z.string().optional().nullable(),
    approveNoticeOverride: z.boolean().optional(),
  }),
  async (data, context) => {
    assertNotFloor(context);
    if (!canUserDo(context.roles ?? [], "hr.resignation.manage")) {
      throw new ForbiddenError("Missing hr.resignation.manage.");
    }
    const { data: existing, error: loadErr } = await context.supabase
      .from("hr_resignations")
      .select("*")
      .eq("id", data.resignationId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!existing) throw new Error("Resignation not found.");
    if (!["submitted", "pending_override_approval", "draft"].includes(String(existing.status))) {
      throw new Error(`Cannot approve resignation in status "${existing.status}".`);
    }

    if (existing.notice_override) {
      assertNoticeOverrideAllowed({
        suggestedDays: Number(existing.suggested_notice_days),
        requiredNoticeDays: Number(existing.required_notice_days),
        overrideReason: existing.notice_override_reason,
        approved: data.approveNoticeOverride !== false,
      });
    }

    const approvedLwd =
      data.approvedLwd?.slice(0, 10) ??
      (existing.proposed_lwd ? String(existing.proposed_lwd).slice(0, 10) : null);
    if (!approvedLwd) throw new Error("Approved last working date is required.");

    const { data: staff } = await context.supabase
      .from("staff")
      .select("id, status, location_id")
      .eq("id", existing.staff_id)
      .maybeSingle();

    const { data: row, error } = await context.supabase
      .from("hr_resignations")
      .update({
        status: "serving_notice",
        approved_lwd: approvedLwd,
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        approval_note: data.approvalNote ?? null,
        notice_override_approved_by: existing.notice_override ? context.userId : null,
        notice_override_approved_at: existing.notice_override
          ? new Date().toISOString()
          : null,
      })
      .eq("id", data.resignationId)
      .select(RESIGNATION_SELECT)
      .single();
    if (error) throw error;

    // Status history → serving_notice (never bypass)
    await insertStatusHistory(context, {
      staffId: String(existing.staff_id),
      fromStatus: staff?.status ?? null,
      toStatus: "serving_notice",
      effectiveOn: qatarToday(),
      reason: `resignation_approved:${data.resignationId}`,
      documentId: existing.letter_document_id ?? null,
      locationId: staff?.location_id ?? null,
    });
    await context.supabase
      .from("staff")
      .update({ status: "serving_notice" })
      .eq("id", existing.staff_id);

    await syncProfileExit(context, String(existing.staff_id), {
      lastWorkingDate: approvedLwd,
      releasingDate: existing.releasing_date
        ? String(existing.releasing_date).slice(0, 10)
        : null,
      exitReason: String(existing.reason ?? ""),
    });

    await appendEmployeeEvent(context, {
      staffId: String(existing.staff_id),
      eventType: "resignation_approved",
      effectiveOn: qatarToday(),
      payload: {
        approved_lwd: approvedLwd,
        notice_override: Boolean(existing.notice_override),
        required_notice_days: Number(existing.required_notice_days),
      },
      documentId: existing.letter_document_id ?? null,
      sourceTable: "hr_resignations",
      sourceId: data.resignationId,
    });
    await audit(context, "hr.resignation.approved", "hr_resignations", data.resignationId, {
      approved_lwd: approvedLwd,
      status: "serving_notice",
    }, staff?.location_id);

    return mapResignation(row as Record<string, unknown>);
  },
  { auth: { capability: "hr.resignation.manage" } },
);

export const listTerminations = createAuthenticatedAction(
  z.object({
    status: z.enum([...HR_TERMINATION_STATUSES, "all", "queue"]).optional().nullable(),
    staffId: z.string().uuid().optional().nullable(),
  }),
  async (data, context) => {
    const canInit =
      canUserDo(context.roles ?? [], "hr.termination.initiate") ||
      canUserDo(context.roles ?? [], "hr.termination.approve") ||
      canUserDo(context.roles ?? [], "hr.manage");
    if (!canInit) throw new ForbiddenError("Missing termination permission.");

    let query = context.supabase
      .from("hr_terminations")
      .select(TERMINATION_SELECT)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.staffId) query = query.eq("staff_id", data.staffId);
    if (data.status === "queue") {
      query = query.in("status", [
        "draft",
        "pending_hr_approval",
        "pending_exec_approval",
        "approved",
      ]);
    } else if (data.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }
    const { data: rows, error } = await query;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => mapTermination(r as Record<string, unknown>));
  },
  {
    auth: {
      anyCapability: ["hr.termination.initiate", "hr.termination.approve", "hr.manage"],
    },
  },
);

/** Probation Phase 6 flags awaiting / linked in termination queue. */
export const listProbationTerminationQueue = createAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    if (
      !canUserDo(context.roles ?? [], "hr.termination.initiate") &&
      !canUserDo(context.roles ?? [], "hr.manage")
    ) {
      throw new ForbiddenError("Missing hr.termination.initiate.");
    }
    const { data: reviews, error } = await context.supabase
      .from("hr_probation_reviews")
      .select(
        "id, staff_id, decision, status, flags_phase6_termination, decided_at, approved_at, staff(full_name, employee_code, status)",
      )
      .eq("flags_phase6_termination", true)
      .eq("status", "decided")
      .order("approved_at", { ascending: false })
      .limit(100);
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }

    const reviewIds = (reviews ?? []).map((r) => String(r.id));
    let linked = new Set<string>();
    if (reviewIds.length) {
      const { data: terms } = await context.supabase
        .from("hr_terminations")
        .select("source_probation_review_id")
        .in("source_probation_review_id", reviewIds);
      linked = new Set(
        (terms ?? [])
          .map((t) => t.source_probation_review_id)
          .filter(Boolean)
          .map(String),
      );
    }

    return (reviews ?? []).map((r) => {
      const staff = Array.isArray(r.staff) ? r.staff[0] : r.staff;
      return {
        probationReviewId: String(r.id),
        staffId: String(r.staff_id),
        staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
        employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
        staffStatus: (staff as { status?: string } | null)?.status ?? null,
        decision: r.decision,
        hasDraftTermination: linked.has(String(r.id)),
        approvedAt: r.approved_at,
      };
    });
  },
  { auth: { anyCapability: ["hr.termination.initiate", "hr.manage"] } },
);

export const openDraftTerminationFromProbation = createAuthenticatedAction(
  z.object({
    probationReviewId: z.string().uuid(),
    reason: z.string().optional().nullable(),
    effectiveOn: z.string().optional().nullable(),
    lastWorkingDate: z.string().optional().nullable(),
  }),
  async (data, context) => {
    assertNotFloor(context);
    if (!canUserDo(context.roles ?? [], "hr.termination.initiate")) {
      throw new ForbiddenError("Missing hr.termination.initiate.");
    }
    const draftMeta = draftTerminationFromProbationFlag();
    const { data: review, error: revErr } = await context.supabase
      .from("hr_probation_reviews")
      .select("id, staff_id, flags_phase6_termination, status, decision_note")
      .eq("id", data.probationReviewId)
      .maybeSingle();
    if (revErr) throw revErr;
    if (!review) throw new Error("Probation review not found.");
    if (!review.flags_phase6_termination || review.status !== "decided") {
      throw new Error("Probation review is not flagged for Phase 6 termination.");
    }

    const { data: existing } = await context.supabase
      .from("hr_terminations")
      .select("id")
      .eq("source_probation_review_id", data.probationReviewId)
      .maybeSingle();
    if (existing) {
      throw new Error("A termination draft already exists for this probation review.");
    }

    const { staff, category } = await loadStaffExitContext(context, String(review.staff_id));
    const today = qatarToday();
    const effectiveOn = data.effectiveOn?.slice(0, 10) ?? today;
    const lwd = data.lastWorkingDate?.slice(0, 10) ?? today;
    const type: HrTerminationType =
      category === "higher_mgmt" ? "immediate" : "with_notice";

    const { data: row, error } = await context.supabase
      .from("hr_terminations")
      .insert({
        staff_id: review.staff_id,
        termination_type: type,
        employment_category: category,
        reason:
          data.reason?.trim() ||
          String(review.decision_note ?? "Probation terminate decision — Phase 6 draft"),
        effective_on: effectiveOn,
        last_working_date: lwd,
        notice_treatment: type === "immediate" ? "immediate" : "with_notice",
        status: draftMeta.status,
        source_probation_review_id: data.probationReviewId,
        initiated_by: context.userId,
        created_by: context.userId,
      })
      .select(TERMINATION_SELECT)
      .single();
    if (error) throw error;

    await seedClearance(context, {
      staffId: String(review.staff_id),
      terminationId: row.id,
    });
    await appendEmployeeEvent(context, {
      staffId: String(review.staff_id),
      eventType: "termination_draft_opened",
      effectiveOn: today,
      payload: {
        source: "probation",
        probation_review_id: data.probationReviewId,
        staff_status_unchanged: true,
        requires_approval: true,
      },
      sourceTable: "hr_terminations",
      sourceId: row.id,
    });
    await audit(context, "hr.termination.draft_from_probation", "hr_terminations", row.id, {
      staff_id: review.staff_id,
      status: "draft",
      staff_status: staff.status,
    }, staff.location_id);

    return mapTermination(row as Record<string, unknown>);
  },
  { auth: { capability: "hr.termination.initiate" } },
);

export const initiateTermination = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    terminationType: z.enum(HR_TERMINATION_TYPES),
    reason: z.string().min(1),
    effectiveOn: z.string(),
    lastWorkingDate: z.string(),
    noticeTreatment: z.enum(HR_TERMINATION_NOTICE_TREATMENTS).optional().nullable(),
    supportingDocumentId: z.string().uuid().optional().nullable(),
    leaveTreatment: z.string().optional().nullable(),
    loanTreatment: z.string().optional().nullable(),
    airTicketEligible: z.boolean().optional(),
    releasingDate: z.string().optional().nullable(),
  }),
  async (data, context) => {
    assertNotFloor(context);
    if (!canUserDo(context.roles ?? [], "hr.termination.initiate")) {
      throw new ForbiddenError("Missing hr.termination.initiate.");
    }
    const { staff, category } = await loadStaffExitContext(context, data.staffId);
    assertTerminationTypeAllowed(category, data.terminationType);

    const { data: row, error } = await context.supabase
      .from("hr_terminations")
      .insert({
        staff_id: data.staffId,
        termination_type: data.terminationType,
        employment_category: category,
        reason: data.reason.trim(),
        effective_on: data.effectiveOn.slice(0, 10),
        last_working_date: data.lastWorkingDate.slice(0, 10),
        notice_treatment:
          data.noticeTreatment ??
          (data.terminationType === "immediate"
            ? "immediate"
            : data.terminationType === "payment_in_lieu"
              ? "payment_in_lieu"
              : "with_notice"),
        supporting_document_id: data.supportingDocumentId ?? null,
        leave_treatment: data.leaveTreatment ?? null,
        loan_treatment: data.loanTreatment ?? null,
        air_ticket_eligible: data.airTicketEligible ?? false,
        releasing_date: data.releasingDate?.slice(0, 10) ?? null,
        status: "pending_hr_approval",
        initiated_by: context.userId,
        created_by: context.userId,
      })
      .select(TERMINATION_SELECT)
      .single();
    if (error) throw error;

    await seedClearance(context, { staffId: data.staffId, terminationId: row.id });
    await appendEmployeeEvent(context, {
      staffId: data.staffId,
      eventType: "termination_initiated",
      effectiveOn: data.effectiveOn.slice(0, 10),
      payload: {
        termination_type: data.terminationType,
        status: "pending_hr_approval",
        staff_status_unchanged: true,
      },
      documentId: data.supportingDocumentId ?? null,
      sourceTable: "hr_terminations",
      sourceId: row.id,
    });
    await audit(context, "hr.termination.initiated", "hr_terminations", row.id, {
      staff_id: data.staffId,
      type: data.terminationType,
    }, staff.location_id);

    return mapTermination(row as Record<string, unknown>);
  },
  { auth: { capability: "hr.termination.initiate" } },
);

export const approveTermination = createAuthenticatedAction(
  z.object({
    terminationId: z.string().uuid(),
    slot: z.enum(["hr", "exec", "auto"]).optional().nullable(),
    note: z.string().optional().nullable(),
  }),
  async (data, context) => {
    assertNotFloor(context);
    if (!canUserDo(context.roles ?? [], "hr.termination.approve")) {
      throw new ForbiddenError("Missing hr.termination.approve.");
    }
    const roles = (context.roles ?? []) as string[];
    const { data: existing, error: loadErr } = await context.supabase
      .from("hr_terminations")
      .select("*")
      .eq("id", data.terminationId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!existing) throw new Error("Termination not found.");
    if (["applied", "cancelled", "withdrawn"].includes(String(existing.status))) {
      throw new Error(`Cannot approve termination in status "${existing.status}".`);
    }

    let hrBy = existing.hr_approved_by as string | null;
    let execBy = existing.exec_approved_by as string | null;
    const patch: Record<string, unknown> = {};
    const now = new Date().toISOString();

    const prefer =
      data.slot === "hr" || data.slot === "exec"
        ? data.slot
        : isHrTerminationApproverSlot(roles) && !hrBy
          ? "hr"
          : isExecTerminationApproverSlot(roles) && !execBy
            ? "exec"
            : isHrTerminationApproverSlot(roles)
              ? "hr"
              : isExecTerminationApproverSlot(roles)
                ? "exec"
                : null;

    if (!prefer) {
      throw new ForbiddenError("You are not an HR or GM/CEO approver for terminations.");
    }

    if (prefer === "hr") {
      if (hrBy && hrBy !== context.userId) {
        throw new Error("HR approval already recorded by another user.");
      }
      if (execBy === context.userId) {
        throw new Error("Dual approval requires two distinct approvers.");
      }
      hrBy = context.userId;
      patch.hr_approved_by = context.userId;
      patch.hr_approved_at = now;
      patch.hr_approval_note = data.note ?? null;
    } else {
      if (execBy && execBy !== context.userId) {
        throw new Error("Exec approval already recorded by another user.");
      }
      if (hrBy === context.userId) {
        throw new Error("Dual approval requires two distinct approvers.");
      }
      execBy = context.userId;
      patch.exec_approved_by = context.userId;
      patch.exec_approved_at = now;
      patch.exec_approval_note = data.note ?? null;
    }

    const next = nextTerminationStatusAfterApproval({
      hrApproved: Boolean(hrBy),
      execApproved: Boolean(execBy),
    });
    patch.status = next;

    const { data: row, error } = await context.supabase
      .from("hr_terminations")
      .update(patch)
      .eq("id", data.terminationId)
      .select(TERMINATION_SELECT)
      .single();
    if (error) throw error;

    await appendEmployeeEvent(context, {
      staffId: String(existing.staff_id),
      eventType: "termination_approval",
      effectiveOn: qatarToday(),
      payload: {
        slot: prefer,
        status: next,
        hr_approved: Boolean(hrBy),
        exec_approved: Boolean(execBy),
      },
      sourceTable: "hr_terminations",
      sourceId: data.terminationId,
    });
    await audit(context, "hr.termination.approval", "hr_terminations", data.terminationId, {
      slot: prefer,
      status: next,
    });

    return mapTermination(row as Record<string, unknown>);
  },
  { auth: { capability: "hr.termination.approve" } },
);

/** Final step: apply approved termination via status_history. */
export const applyTermination = createAuthenticatedAction(
  z.object({
    terminationId: z.string().uuid(),
  }),
  async (data, context) => {
    assertNotFloor(context);
    if (!canUserDo(context.roles ?? [], "hr.termination.approve")) {
      throw new ForbiddenError("Missing hr.termination.approve.");
    }
    const { data: existing, error: loadErr } = await context.supabase
      .from("hr_terminations")
      .select("*")
      .eq("id", data.terminationId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!existing) throw new Error("Termination not found.");

    assertTerminationCanApply({
      status: String(existing.status),
      hrApprovedBy: existing.hr_approved_by as string | null,
      execApprovedBy: existing.exec_approved_by as string | null,
    });

    const { data: staff } = await context.supabase
      .from("staff")
      .select("id, status, location_id")
      .eq("id", existing.staff_id)
      .maybeSingle();

    const lwd = String(existing.last_working_date).slice(0, 10);
    await insertStatusHistory(context, {
      staffId: String(existing.staff_id),
      fromStatus: staff?.status ?? null,
      toStatus: "terminated",
      effectiveOn: lwd,
      reason: `termination_applied:${data.terminationId}`,
      documentId: (existing.supporting_document_id as string | null) ?? null,
      locationId: staff?.location_id ?? null,
    });
    await context.supabase
      .from("staff")
      .update({ status: "terminated" })
      .eq("id", existing.staff_id);

    await syncProfileExit(context, String(existing.staff_id), {
      lastWorkingDate: lwd,
      releasingDate: existing.releasing_date
        ? String(existing.releasing_date).slice(0, 10)
        : null,
      exitReason: String(existing.reason ?? ""),
    });

    const { data: row, error } = await context.supabase
      .from("hr_terminations")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
      })
      .eq("id", data.terminationId)
      .select(TERMINATION_SELECT)
      .single();
    if (error) throw error;

    await appendEmployeeEvent(context, {
      staffId: String(existing.staff_id),
      eventType: "termination_approved",
      effectiveOn: lwd,
      payload: {
        status: "applied",
        termination_type: existing.termination_type,
      },
      documentId: (existing.supporting_document_id as string | null) ?? null,
      sourceTable: "hr_terminations",
      sourceId: data.terminationId,
    });
    await audit(context, "hr.termination.applied", "hr_terminations", data.terminationId, {
      staff_id: existing.staff_id,
      status: "applied",
    }, staff?.location_id);

    return mapTermination(row as Record<string, unknown>);
  },
  { auth: { capability: "hr.termination.approve" } },
);

export const listClearanceItems = createAuthenticatedAction(
  z.object({
    resignationId: z.string().uuid().optional().nullable(),
    terminationId: z.string().uuid().optional().nullable(),
    staffId: z.string().uuid().optional().nullable(),
  }),
  async (data, context) => {
    if (
      !canUserDo(context.roles ?? [], "hr.resignation.manage") &&
      !canUserDo(context.roles ?? [], "hr.termination.initiate") &&
      !canUserDo(context.roles ?? [], "hr.manage")
    ) {
      throw new ForbiddenError("Missing clearance permission.");
    }
    let query = context.supabase
      .from("hr_clearance_items")
      .select(
        "id, staff_id, resignation_id, termination_id, item_kind, label, department, completed, completed_by, completed_at, notes, sort_order",
      )
      .order("sort_order", { ascending: true });
    if (data.resignationId) query = query.eq("resignation_id", data.resignationId);
    else if (data.terminationId) query = query.eq("termination_id", data.terminationId);
    else if (data.staffId) query = query.eq("staff_id", data.staffId);
    else return [];

    const { data: rows, error } = await query;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => ({
      id: String(r.id),
      staffId: String(r.staff_id),
      resignationId: (r.resignation_id as string | null) ?? null,
      terminationId: (r.termination_id as string | null) ?? null,
      itemKind: String(r.item_kind) as HrClearanceKind,
      label: String(r.label),
      department: (r.department as string | null) ?? null,
      completed: Boolean(r.completed),
      completedBy: (r.completed_by as string | null) ?? null,
      completedAt: (r.completed_at as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      sortOrder: Number(r.sort_order ?? 0),
    }));
  },
  {
    auth: {
      anyCapability: [
        "hr.resignation.manage",
        "hr.termination.initiate",
        "hr.manage",
      ],
    },
  },
);

export const completeClearanceItem = createAuthenticatedAction(
  z.object({
    itemId: z.string().uuid(),
    completed: z.boolean().optional(),
    notes: z.string().optional().nullable(),
  }),
  async (data, context) => {
    assertNotFloor(context);
    if (
      !canUserDo(context.roles ?? [], "hr.resignation.manage") &&
      !canUserDo(context.roles ?? [], "hr.termination.initiate")
    ) {
      throw new ForbiddenError("Missing clearance permission.");
    }
    const completed = data.completed !== false;
    const { data: row, error } = await context.supabase
      .from("hr_clearance_items")
      .update({
        completed,
        completed_by: completed ? context.userId : null,
        completed_at: completed ? new Date().toISOString() : null,
        notes: data.notes ?? null,
      })
      .eq("id", data.itemId)
      .select("*")
      .single();
    if (error) throw error;

    // If all complete for parent, emit timeline
    const parentFilter = row.resignation_id
      ? { resignation_id: row.resignation_id }
      : { termination_id: row.termination_id };
    const { data: siblings } = await context.supabase
      .from("hr_clearance_items")
      .select("completed")
      .match(parentFilter);
    if (allClearanceComplete(siblings ?? [])) {
      await appendEmployeeEvent(context, {
        staffId: String(row.staff_id),
        eventType: "clearance_complete",
        effectiveOn: qatarToday(),
        payload: {
          resignation_id: row.resignation_id,
          termination_id: row.termination_id,
        },
        sourceTable: "hr_clearance_items",
        sourceId: data.itemId,
      });
      // Mirror flags on parent
      if (row.resignation_id) {
        await context.supabase
          .from("hr_resignations")
          .update({
            asset_clearance: true,
            dept_clearance: true,
            finance_clearance: true,
          })
          .eq("id", row.resignation_id);
      }
      if (row.termination_id) {
        await context.supabase
          .from("hr_terminations")
          .update({
            asset_clearance: true,
            dept_clearance: true,
            finance_clearance: true,
          })
          .eq("id", row.termination_id);
      }
    }

    return {
      id: String(row.id),
      completed: Boolean(row.completed),
      allComplete: allClearanceComplete(siblings ?? []),
    };
  },
  {
    auth: {
      anyCapability: ["hr.resignation.manage", "hr.termination.initiate"],
    },
  },
);

// silence unused kind import used only for type export surface
void HR_CLEARANCE_KINDS;
