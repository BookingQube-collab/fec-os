"use server";

import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import { isOnProbation } from "@/lib/hr-probation";
import { readPolicySection } from "@/lib/hr-policy-read";
import {
  assertWarningLetterRequired,
  countActiveWarnings,
  evaluateWarningEscalation,
  HR_WARNING_CATEGORIES,
  HR_WARNING_LEVELS,
  HR_WARNING_STATUSES,
  requiresDecideCapability,
  warningPolicyFromSection,
  type HrWarningCategory,
  type HrWarningLevel,
  type HrWarningStatus,
} from "@/lib/hr-warnings";
import { canUserDo } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  type AuthContext,
} from "@/lib/server/create-action";

function qatarToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

async function myStaff(context: AuthContext) {
  const { data } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code, user_id, location_id, status")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

function assertCanViewDisciplinary(context: AuthContext, isSelf: boolean) {
  if (isSelf) return;
  if (
    !canUserDo(context.roles ?? [], "hr.warnings.manage") &&
    !canUserDo(context.roles ?? [], "hr.profile.view_sensitive")
  ) {
    throw new ForbiddenError("Disciplinary records require sensitive HR access.");
  }
}

async function audit(
  context: AuthContext,
  action: string,
  rowId: string,
  after: Record<string, unknown>,
  locationId?: string | null,
) {
  try {
    await context.supabase.rpc("log_audit", {
      _action: action,
      _table_name: "hr_warnings",
      _row_id: rowId,
      _after: after as unknown as Json,
      _location_id: locationId ?? undefined,
      _metadata: {},
    });
  } catch {
    /* non-blocking */
  }
}

async function appendWarningAction(
  context: AuthContext,
  warningId: string,
  action: string,
  note?: string | null,
) {
  const { error } = await context.supabase.from("hr_warning_actions").insert({
    warning_id: warningId,
    action,
    actor_id: context.userId,
    note: note ?? null,
  });
  if (error && !tableMissing(error.message)) throw error;
}

function mapWarning(row: Record<string, unknown>) {
  const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
    employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
    staffStatus: (staff as { status?: string } | null)?.status ?? null,
    incidentOn: String(row.incident_on).slice(0, 10),
    category: String(row.category) as HrWarningCategory,
    description: String(row.description ?? ""),
    location: (row.location as string | null) ?? null,
    reportedBy: (row.reported_by as string | null) ?? null,
    employeeExplanation: (row.employee_explanation as string | null) ?? null,
    witnesses: (row.witnesses as string | null) ?? null,
    evidence: (row.evidence as string | null) ?? null,
    warningLevel: String(row.warning_level) as HrWarningLevel,
    issuedOn: String(row.issued_on).slice(0, 10),
    validUntil: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
    status: String(row.status) as HrWarningStatus,
    letterDocumentId: String(row.letter_document_id),
    acknowledgement: (row.acknowledgement as Record<string, unknown>) ?? {},
    appeal: (row.appeal as Record<string, unknown>) ?? {},
    managementDecision: (row.management_decision as Record<string, unknown>) ?? {},
    requiresFormalReview: Boolean(row.requires_formal_review),
    blocksCasualLeave: Boolean(row.blocks_casual_leave),
    triggersProbationReview: Boolean(row.triggers_probation_review),
    activeCountAtIssue: Number(row.active_count_at_issue ?? 1),
    createdAt: String(row.created_at),
  };
}

const WARNING_SELECT =
  "id, staff_id, incident_on, category, description, location, reported_by, employee_explanation, witnesses, evidence, warning_level, issued_on, valid_until, status, letter_document_id, acknowledgement, appeal, management_decision, requires_formal_review, blocks_casual_leave, triggers_probation_review, active_count_at_issue, created_at, staff(full_name, employee_code, status, user_id, location_id)";

async function loadStaffWarnings(
  context: AuthContext,
  staffId: string,
): Promise<Array<{ status: string; validUntil: string | null }>> {
  const { data, error } = await context.supabase
    .from("hr_warnings")
    .select("status, valid_until")
    .eq("staff_id", staffId);
  if (error) {
    if (tableMissing(error.message)) return [];
    throw error;
  }
  return (data ?? []).map((r) => ({
    status: String(r.status),
    validUntil: r.valid_until ? String(r.valid_until) : null,
  }));
}

async function staffOnProbation(context: AuthContext, staffId: string, today: string) {
  const { data } = await context.supabase
    .from("staff_profile_ext")
    .select("probation_start, probation_end")
    .eq("staff_id", staffId)
    .maybeSingle();
  return isOnProbation({
    probationStart: data?.probation_start ?? null,
    probationEnd: data?.probation_end ?? null,
    today,
  });
}

function isActiveWarningRow(status: string, validUntil: string | null, today: string) {
  if (status !== "active") return false;
  if (validUntil && validUntil.slice(0, 10) < today.slice(0, 10)) return false;
  return true;
}

export const listWarnings = createAuthenticatedAction(
  z.object({
    status: z.enum([...HR_WARNING_STATUSES, "all", "escalations"]).optional().nullable(),
    staffId: z.string().uuid().optional().nullable(),
    mineOnly: z.boolean().optional(),
  }),
  async (data, context) => {
    const canManage = canUserDo(context.roles ?? [], "hr.warnings.manage");
    const canSensitive = canUserDo(context.roles ?? [], "hr.profile.view_sensitive");
    const mine = await myStaff(context);

    if (!canManage && !canSensitive && !mine?.id) {
      throw new ForbiddenError("Missing warnings permission.");
    }

    let query = context.supabase
      .from("hr_warnings")
      .select(WARNING_SELECT)
      .order("issued_on", { ascending: false })
      .limit(200);

    if (data.mineOnly || (!canManage && !canSensitive)) {
      if (!mine?.id) return [];
      query = query.eq("staff_id", mine.id);
    } else if (data.staffId) {
      assertCanViewDisciplinary(context, false);
      query = query.eq("staff_id", data.staffId);
    } else {
      assertCanViewDisciplinary(context, false);
    }

    if (data.status === "escalations") {
      query = query.eq("requires_formal_review", true).eq("status", "active");
    } else if (data.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    const { data: rows, error } = await query;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => mapWarning(r as Record<string, unknown>));
  },
  { auth: { anyCapability: ["hr.warnings.manage", "hr.profile.view_sensitive", "hr.employee_app"] } },
);

export const getWarningEscalationForStaff = createAuthenticatedAction(
  z.object({ staffId: z.string().uuid() }),
  async (data, context) => {
    if (
      !canUserDo(context.roles ?? [], "hr.warnings.manage") &&
      !canUserDo(context.roles ?? [], "hr.profile.view_sensitive")
    ) {
      const mine = await myStaff(context);
      if (mine?.id !== data.staffId) throw new ForbiddenError("Missing warnings permission.");
    }
    const today = qatarToday();
    const warnings = await loadStaffWarnings(context, data.staffId);
    const policy = warningPolicyFromSection(await readPolicySection(context, "warning"));
    const activeCount = countActiveWarnings(warnings, today);
    const onProbation = await staffOnProbation(context, data.staffId, today);
    return evaluateWarningEscalation({ activeCount, onProbation, policy });
  },
  { auth: { anyCapability: ["hr.warnings.manage", "hr.profile.view_sensitive", "hr.employee_app"] } },
);

export const issueWarning = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    incidentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    category: z.enum(HR_WARNING_CATEGORIES).default("conduct"),
    description: z.string().min(1).max(4000),
    location: z.string().max(200).optional().nullable(),
    witnesses: z.string().max(1000).optional().nullable(),
    evidence: z.string().max(2000).optional().nullable(),
    warningLevel: z.enum(HR_WARNING_LEVELS).default("written"),
    issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    letterDocumentId: z.string().uuid(),
  }),
  async (data, context) => {
    if (!canUserDo(context.roles ?? [], "hr.warnings.manage")) {
      throw new ForbiddenError("Missing hr.warnings.manage.");
    }
    const letterId = assertWarningLetterRequired(data.letterDocumentId);

    const { data: letter, error: letterErr } = await context.supabase
      .from("hr_employee_documents")
      .select("id, staff_id, doc_type, deleted_at")
      .eq("id", letterId)
      .maybeSingle();
    if (letterErr) throw letterErr;
    if (!letter || letter.deleted_at) throw new Error("Warning letter document not found.");
    if (letter.staff_id !== data.staffId) {
      throw new Error("Warning letter must belong to the same staff member.");
    }
    if (String(letter.doc_type) !== "warning_letter") {
      throw new Error("Document must be type warning_letter.");
    }

    const { data: staff, error: staffErr } = await context.supabase
      .from("staff")
      .select("id, full_name, user_id, location_id, status")
      .eq("id", data.staffId)
      .is("deleted_at", null)
      .maybeSingle();
    if (staffErr) throw staffErr;
    if (!staff) throw new Error("Staff not found.");

    const today = qatarToday();
    const prior = await loadStaffWarnings(context, data.staffId);
    const policy = warningPolicyFromSection(await readPolicySection(context, "warning"));
    const priorActive = countActiveWarnings(prior, today);
    const activeCount = priorActive + 1;
    const onProbation = await staffOnProbation(context, data.staffId, today);
    const escalation = evaluateWarningEscalation({ activeCount, onProbation, policy });

    const issuedOn = data.issuedOn ?? today;
    const { data: row, error } = await context.supabase
      .from("hr_warnings")
      .insert({
        staff_id: data.staffId,
        incident_on: data.incidentOn,
        category: data.category,
        description: data.description,
        location: data.location ?? null,
        reported_by: context.userId,
        witnesses: data.witnesses ?? null,
        evidence: data.evidence ?? null,
        warning_level: data.warningLevel,
        issued_on: issuedOn,
        valid_until: data.validUntil ?? null,
        status: "active",
        letter_document_id: letterId,
        requires_formal_review: escalation.requiresFormalReview,
        blocks_casual_leave: escalation.blocksCasualLeave,
        triggers_probation_review: escalation.triggersProbationReview,
        active_count_at_issue: activeCount,
        created_by: context.userId,
      })
      .select(WARNING_SELECT)
      .single();
    if (error) throw error;

    const mapped = mapWarning(row as Record<string, unknown>);
    await appendWarningAction(context, mapped.id, "issued");
    await appendEmployeeEvent(context, {
      staffId: data.staffId,
      eventType: "warning_issued",
      effectiveOn: issuedOn,
      payload: {
        warning_id: mapped.id,
        level: data.warningLevel,
        active_count: activeCount,
        requires_formal_review: escalation.requiresFormalReview,
        triggers_probation_review: escalation.triggersProbationReview,
        auto_terminate: false,
        staff_status: staff.status,
      },
      documentId: letterId,
      sourceTable: "hr_warnings",
      sourceId: mapped.id,
    });
    await audit(
      context,
      "hr.warning.issue",
      mapped.id,
      {
        staff_id: data.staffId,
        active_count: activeCount,
        requires_formal_review: escalation.requiresFormalReview,
        staff_status_unchanged: staff.status,
      },
      staff.location_id,
    );

    if (escalation.requiresFormalReview || escalation.triggersProbationReview) {
      const { findUsersWithCapability, notifyUsers } = await import(
        "@/lib/notifications/action-notify"
      );
      const hrIds = await findUsersWithCapability("hr.warnings.decide");
      await notifyUsers({
        userIds: hrIds,
        category: "hr_warning",
        title: escalation.requiresFormalReview
          ? `Third-warning escalation: ${staff.full_name ?? "employee"}`
          : `Probation warning review: ${staff.full_name ?? "employee"}`,
        body: escalation.requiresFormalReview
          ? `${activeCount} active warnings — formal HR/management review required. Casual leave blocked. Staff NOT terminated.`
          : `Warning while on probation — probation review triggered. Staff NOT terminated.`,
        severity: "critical",
        actionUrl: "/people/hr/warnings",
        sourceType: "hr_warnings",
        sourceId: mapped.id,
      });
      if (staff.user_id) {
        await notifyUsers({
          userIds: [String(staff.user_id)],
          category: "hr_warning",
          title: "Warning issued",
          body: "A disciplinary warning was issued. Please acknowledge in My HR.",
          severity: "warning",
          actionUrl: "/hr/me",
          sourceType: "hr_warnings",
          sourceId: mapped.id,
        });
      }
    } else if (staff.user_id) {
      const { notifyUsers } = await import("@/lib/notifications/action-notify");
      await notifyUsers({
        userIds: [String(staff.user_id)],
        category: "hr_warning",
        title: "Warning issued",
        body: "A disciplinary warning was issued. Please acknowledge in My HR.",
        severity: "warning",
        actionUrl: "/hr/me",
        sourceType: "hr_warnings",
        sourceId: mapped.id,
      });
    }

    return { warning: mapped, escalation };
  },
  { auth: { capability: "hr.warnings.manage" } },
);

export const employeeRespondToWarning = createAuthenticatedAction(
  z.object({
    warningId: z.string().uuid(),
    action: z.enum(["acknowledge", "appeal", "explain"]),
    note: z.string().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    const mine = await myStaff(context);
    if (!mine?.id) throw new ForbiddenError("Your login is not linked to a staff record.");

    const { data: row, error } = await context.supabase
      .from("hr_warnings")
      .select(WARNING_SELECT)
      .eq("id", data.warningId)
      .maybeSingle();
    if (error) throw error;
    if (!row || String(row.staff_id) !== mine.id) throw new Error("Warning not found.");

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    if (data.action === "acknowledge") {
      patch.status = "acknowledged";
      patch.acknowledgement = {
        acknowledged_at: now,
        acknowledged_by: context.userId,
        note: data.note ?? null,
      };
    } else if (data.action === "appeal") {
      patch.status = "appealed";
      patch.appeal = {
        appealed_at: now,
        reason: data.note ?? "",
        status: "pending",
      };
    } else {
      patch.employee_explanation = data.note ?? null;
    }

    const { data: updated, error: updErr } = await context.supabase
      .from("hr_warnings")
      .update(patch)
      .eq("id", data.warningId)
      .select(WARNING_SELECT)
      .single();
    if (updErr) throw updErr;

    await appendWarningAction(
      context,
      data.warningId,
      data.action === "acknowledge" ? "acknowledged" : data.action === "appeal" ? "appealed" : "issued",
      data.note,
    );
    if (data.action === "acknowledge") {
      await appendEmployeeEvent(context, {
        staffId: mine.id,
        eventType: "warning_acknowledged",
        payload: { warning_id: data.warningId },
        sourceTable: "hr_warnings",
        sourceId: data.warningId,
      });
    }
    return mapWarning(updated as Record<string, unknown>);
  },
  { auth: { capability: "hr.employee_app" } },
);

export const decideWarning = createAuthenticatedAction(
  z.object({
    warningId: z.string().uuid(),
    action: z.enum(["withdraw", "amend", "management_decision"]),
    note: z.string().max(2000).optional().nullable(),
    decision: z.string().max(200).optional().nullable(),
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    description: z.string().max(4000).optional().nullable(),
  }),
  async (data, context) => {
    if (!canUserDo(context.roles ?? [], "hr.warnings.decide")) {
      throw new ForbiddenError("Missing hr.warnings.decide.");
    }
    if (data.action === "withdraw" || data.action === "amend") {
      requiresDecideCapability(data.action === "withdraw" ? "withdraw" : "amend");
    }

    const { data: row, error } = await context.supabase
      .from("hr_warnings")
      .select(WARNING_SELECT)
      .eq("id", data.warningId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Warning not found.");

    const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
    const patch: Record<string, unknown> = {};
    let actionLabel = "management_decision";

    if (data.action === "withdraw") {
      patch.status = "withdrawn";
      actionLabel = "withdrawn";
    } else if (data.action === "amend") {
      patch.status = "amended";
      if (data.description != null) patch.description = data.description;
      if (data.validUntil !== undefined) patch.valid_until = data.validUntil;
      actionLabel = "amended";
    } else {
      patch.management_decision = {
        decision: data.decision ?? "reviewed",
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        note: data.note ?? null,
      };
    }

    const { data: updated, error: updErr } = await context.supabase
      .from("hr_warnings")
      .update(patch)
      .eq("id", data.warningId)
      .select(WARNING_SELECT)
      .single();
    if (updErr) throw updErr;

    await appendWarningAction(context, data.warningId, actionLabel, data.note);
    if (data.action === "withdraw") {
      await appendEmployeeEvent(context, {
        staffId: String(row.staff_id),
        eventType: "warning_withdrawn",
        payload: { warning_id: data.warningId, note: data.note ?? null },
        sourceTable: "hr_warnings",
        sourceId: data.warningId,
      });
    }
    await audit(
      context,
      `hr.warning.${data.action}`,
      data.warningId,
      { action: data.action, note: data.note ?? null, staff_status: (staff as { status?: string } | null)?.status },
      (staff as { location_id?: string } | null)?.location_id,
    );

    return mapWarning(updated as Record<string, unknown>);
  },
  { auth: { capability: "hr.warnings.decide" } },
);

export const getWarningsDashboardCounts = createAuthenticatedActionNoInput(async (context) => {
  if (
    !canUserDo(context.roles ?? [], "hr.warnings.manage") &&
    !canUserDo(context.roles ?? [], "hr.manage")
  ) {
    return { activeWarnings: 0, thirdWarningEscalations: 0 };
  }
  const today = qatarToday();
  const { data, error } = await context.supabase
    .from("hr_warnings")
    .select("id, status, valid_until, requires_formal_review");
  if (error) {
    if (tableMissing(error.message)) return { activeWarnings: 0, thirdWarningEscalations: 0 };
    throw error;
  }
  const rows = data ?? [];
  const activeWarnings = countActiveWarnings(
    rows.map((r) => ({
      status: String(r.status),
      validUntil: r.valid_until ? String(r.valid_until) : null,
    })),
    today,
  );
  const thirdWarningEscalations = rows.filter(
    (r) =>
      r.requires_formal_review &&
      isActiveWarningRow(String(r.status), r.valid_until ? String(r.valid_until) : null, today),
  ).length;
  return { activeWarnings, thirdWarningEscalations };
}, { auth: { anyCapability: ["hr.warnings.manage", "hr.manage", "people.view_roster"] } });
