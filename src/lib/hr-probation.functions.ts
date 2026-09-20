"use server";

import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import {
  applyProbationDecision,
  assertProbationDecisionRequiresApproval,
  daysUntilProbationEnd,
  defaultProbationEnd,
  HR_PROBATION_DECISIONS,
  HR_PROBATION_STATUSES,
  isOnProbation,
  type HrProbationDecision,
  type HrProbationStatus,
} from "@/lib/hr-probation";
import { policyNumber } from "@/lib/hr-policy";
import { readPolicySection } from "@/lib/hr-policy-read";
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

async function audit(
  context: AuthContext,
  action: string,
  rowId: string,
  after: Record<string, unknown>,
) {
  try {
    await context.supabase.rpc("log_audit", {
      _action: action,
      _table_name: "hr_probation_reviews",
      _row_id: rowId,
      _after: after as unknown as Json,
      _metadata: {},
    });
  } catch {
    /* non-blocking */
  }
}

function mapReview(row: Record<string, unknown>, today: string) {
  const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
  const end = String(row.probation_end).slice(0, 10);
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
    employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
    staffStatus: (staff as { status?: string } | null)?.status ?? null,
    probationStart: String(row.probation_start).slice(0, 10),
    probationEnd: end,
    daysRemaining: daysUntilProbationEnd(end, today),
    managerFeedback: (row.manager_feedback as string | null) ?? null,
    performanceRating: (row.performance_rating as string | null) ?? null,
    performanceEvaluationId: (row.performance_evaluation_id as string | null) ?? null,
    supportingComments: (row.supporting_comments as string | null) ?? null,
    decision: row.decision ? (String(row.decision) as HrProbationDecision) : null,
    decisionNote: (row.decision_note as string | null) ?? null,
    status: String(row.status) as HrProbationStatus,
    flagsPhase6Termination: Boolean(row.flags_phase6_termination),
    decidedBy: (row.decided_by as string | null) ?? null,
    decidedAt: (row.decided_at as string | null) ?? null,
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    approvalNote: (row.approval_note as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

const REVIEW_SELECT =
  "id, staff_id, probation_start, probation_end, manager_feedback, performance_rating, performance_evaluation_id, supporting_comments, decision, decision_note, status, flags_phase6_termination, decided_by, decided_at, approved_by, approved_at, approval_note, created_at, staff(full_name, employee_code, status)";

export const listProbationReviews = createAuthenticatedAction(
  z.object({
    status: z.enum([...HR_PROBATION_STATUSES, "all", "upcoming"]).optional().nullable(),
    staffId: z.string().uuid().optional().nullable(),
  }),
  async (data, context) => {
    if (!canUserDo(context.roles ?? [], "hr.probation.manage")) {
      throw new ForbiddenError("Missing hr.probation.manage.");
    }
    const today = qatarToday();
    let query = context.supabase
      .from("hr_probation_reviews")
      .select(REVIEW_SELECT)
      .order("probation_end", { ascending: true })
      .limit(200);

    if (data.staffId) query = query.eq("staff_id", data.staffId);
    if (data.status === "upcoming") {
      query = query.in("status", ["open", "pending_approval"]).gte("probation_end", today);
    } else if (data.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    const { data: rows, error } = await query;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => mapReview(r as Record<string, unknown>, today));
  },
  { auth: { capability: "hr.probation.manage" } },
);

export const listProbationDashboard = createAuthenticatedActionNoInput(async (context) => {
  type UpcomingRow = {
    staffId: string;
    staffName: string | null;
    employeeCode: string | null;
    staffStatus: string | null;
    probationStart: string;
    probationEnd: string;
    daysRemaining: number;
    reviewId: string | null;
    reviewStatus: string | null;
    decision: string | null;
    flagsPhase6Termination: boolean;
    onProbation: boolean;
  };
  if (!canUserDo(context.roles ?? [], "hr.probation.manage") && !canUserDo(context.roles ?? [], "hr.manage")) {
    return { upcoming: [] as UpcomingRow[], upcomingCount: 0 };
  }
  const today = qatarToday();
  const horizon = new Date(`${today}T00:00:00+03:00`);
  horizon.setDate(horizon.getDate() + 45);
  const to = horizon.toISOString().slice(0, 10);

  const { data: profiles, error } = await context.supabase
    .from("staff_profile_ext")
    .select(
      "staff_id, probation_start, probation_end, staff(full_name, employee_code, status, deleted_at)",
    )
    .not("probation_end", "is", null)
    .gte("probation_end", today)
    .lte("probation_end", to)
    .limit(200);
  if (error) {
    if (tableMissing(error.message)) return { upcoming: [] as UpcomingRow[], upcomingCount: 0 };
    throw error;
  }

  const { data: openReviews } = await context.supabase
    .from("hr_probation_reviews")
    .select("id, staff_id, status, decision, flags_phase6_termination")
    .in("status", ["open", "pending_approval", "decided"]);

  const reviewByStaff = new Map(
    (openReviews ?? []).map((r) => [String(r.staff_id), r]),
  );

  const upcoming: UpcomingRow[] = [];
  for (const p of profiles ?? []) {
    const staff = Array.isArray(p.staff) ? p.staff[0] : p.staff;
    if ((staff as { deleted_at?: string | null } | null)?.deleted_at) continue;
    if ((staff as { status?: string } | null)?.status === "terminated") continue;
    const end = String(p.probation_end).slice(0, 10);
    const start = p.probation_start ? String(p.probation_start).slice(0, 10) : end;
    const review = reviewByStaff.get(String(p.staff_id));
    upcoming.push({
      staffId: String(p.staff_id),
      staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
      employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
      staffStatus: (staff as { status?: string } | null)?.status ?? null,
      probationStart: start,
      probationEnd: end,
      daysRemaining: daysUntilProbationEnd(end, today),
      reviewId: review ? String(review.id) : null,
      reviewStatus: review ? String(review.status) : null,
      decision: review?.decision ? String(review.decision) : null,
      flagsPhase6Termination: Boolean(review?.flags_phase6_termination),
      onProbation: isOnProbation({ probationStart: start, probationEnd: end, today }),
    });
  }
  upcoming.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return { upcoming, upcomingCount: upcoming.length };
}, { auth: { anyCapability: ["hr.probation.manage", "hr.manage", "people.view_roster"] } });

export const getProbationStaffDetail = createAuthenticatedAction(
  z.object({ staffId: z.string().uuid() }),
  async (data, context) => {
    if (!canUserDo(context.roles ?? [], "hr.probation.manage")) {
      throw new ForbiddenError("Missing hr.probation.manage.");
    }
    const today = qatarToday();
    const { data: ext } = await context.supabase
      .from("staff_profile_ext")
      .select("probation_start, probation_end, reporting_manager_staff_id")
      .eq("staff_id", data.staffId)
      .maybeSingle();

    const { data: staff } = await context.supabase
      .from("staff")
      .select("id, full_name, employee_code, status, department")
      .eq("id", data.staffId)
      .maybeSingle();

    // Cheap attendance summary from daily summary (last 30 days)
    const from = new Date(`${today}T00:00:00+03:00`);
    from.setDate(from.getDate() - 30);
    const fromStr = from.toISOString().slice(0, 10);
    const { data: attRows } = await context.supabase
      .from("attendance_daily_summary")
      .select("status")
      .eq("staff_id", data.staffId)
      .gte("work_date", fromStr)
      .lte("work_date", today)
      .limit(500);
    const attendanceSummary = {
      present: 0,
      late: 0,
      absent: 0,
      leave: 0,
      other: 0,
    };
    for (const r of attRows ?? []) {
      const s = String(r.status);
      if (s === "present" || s === "overtime" || s === "early_leave" || s === "early_departure") {
        attendanceSummary.present += 1;
      } else if (s === "late") attendanceSummary.late += 1;
      else if (s === "absent") attendanceSummary.absent += 1;
      else if (s === "leave" || s === "on_leave") attendanceSummary.leave += 1;
      else attendanceSummary.other += 1;
    }

    const { data: warnings } = await context.supabase
      .from("hr_warnings")
      .select("id, status, valid_until, warning_level, issued_on, requires_formal_review")
      .eq("staff_id", data.staffId)
      .order("issued_on", { ascending: false })
      .limit(20);

    const { data: reviews } = await context.supabase
      .from("hr_probation_reviews")
      .select(REVIEW_SELECT)
      .eq("staff_id", data.staffId)
      .order("created_at", { ascending: false })
      .limit(10);

    const start = ext?.probation_start ? String(ext.probation_start).slice(0, 10) : null;
    const end = ext?.probation_end ? String(ext.probation_end).slice(0, 10) : null;

    return {
      staff: staff
        ? {
            id: staff.id,
            fullName: staff.full_name,
            employeeCode: staff.employee_code,
            status: staff.status,
            department: staff.department,
          }
        : null,
      probationStart: start,
      probationEnd: end,
      daysRemaining: end ? daysUntilProbationEnd(end, today) : null,
      onProbation: isOnProbation({ probationStart: start, probationEnd: end, today }),
      attendanceSummary,
      warnings: warnings ?? [],
      reviews: (reviews ?? []).map((r) => mapReview(r as Record<string, unknown>, today)),
    };
  },
  { auth: { capability: "hr.probation.manage" } },
);

export const upsertProbationDates = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    probationStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    probationEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  }),
  async (data, context) => {
    if (
      !canUserDo(context.roles ?? [], "hr.probation.manage") &&
      !canUserDo(context.roles ?? [], "hr.profile.edit")
    ) {
      throw new ForbiddenError("Missing probation or profile edit permission.");
    }
    const policy = await readPolicySection(context, "probation");
    const months = policyNumber(policy.default_months, 6);
    const end = data.probationEnd ?? defaultProbationEnd(data.probationStart, months);
    if (end < data.probationStart) throw new Error("Probation end must be on or after start.");

    const { error } = await context.supabase.from("staff_profile_ext").upsert(
      {
        staff_id: data.staffId,
        probation_start: data.probationStart,
        probation_end: end,
        updated_by: context.userId,
      },
      { onConflict: "staff_id" },
    );
    if (error) throw error;
    await audit(context, "hr.probation.dates", data.staffId, {
      probation_start: data.probationStart,
      probation_end: end,
    });
    return { staffId: data.staffId, probationStart: data.probationStart, probationEnd: end };
  },
  { auth: { anyCapability: ["hr.probation.manage", "hr.profile.edit"] } },
);

export const openProbationReview = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    managerFeedback: z.string().max(4000).optional().nullable(),
    performanceRating: z.string().max(100).optional().nullable(),
    performanceEvaluationId: z.string().uuid().optional().nullable(),
    supportingComments: z.string().max(4000).optional().nullable(),
  }),
  async (data, context) => {
    if (!canUserDo(context.roles ?? [], "hr.probation.manage")) {
      throw new ForbiddenError("Missing hr.probation.manage.");
    }
    const today = qatarToday();
    const { data: ext } = await context.supabase
      .from("staff_profile_ext")
      .select("probation_start, probation_end")
      .eq("staff_id", data.staffId)
      .maybeSingle();
    if (!ext?.probation_start || !ext?.probation_end) {
      throw new Error("Set probation_start / probation_end on staff profile first.");
    }

    const { data: row, error } = await context.supabase
      .from("hr_probation_reviews")
      .insert({
        staff_id: data.staffId,
        probation_start: ext.probation_start,
        probation_end: ext.probation_end,
        manager_feedback: data.managerFeedback ?? null,
        performance_rating: data.performanceRating ?? null,
        performance_evaluation_id: data.performanceEvaluationId ?? null,
        supporting_comments: data.supportingComments ?? null,
        status: "open",
        created_by: context.userId,
      })
      .select(REVIEW_SELECT)
      .single();
    if (error) throw error;
    return mapReview(row as Record<string, unknown>, today);
  },
  { auth: { capability: "hr.probation.manage" } },
);

export const submitProbationDecision = createAuthenticatedAction(
  z.object({
    reviewId: z.string().uuid(),
    decision: z.enum(HR_PROBATION_DECISIONS),
    decisionNote: z.string().max(2000).optional().nullable(),
    supportingComments: z.string().max(4000).optional().nullable(),
    managerFeedback: z.string().max(4000).optional().nullable(),
    performanceRating: z.string().max(100).optional().nullable(),
    extendEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  }),
  async (data, context) => {
    if (!canUserDo(context.roles ?? [], "hr.probation.manage")) {
      throw new ForbiddenError("Missing hr.probation.manage.");
    }
    const today = qatarToday();
    const applied = applyProbationDecision(data.decision);

    const { data: existing, error: loadErr } = await context.supabase
      .from("hr_probation_reviews")
      .select("id, staff_id, status")
      .eq("id", data.reviewId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!existing) throw new Error("Probation review not found.");
    if (existing.status === "decided") throw new Error("Review already decided.");

    const { data: staff } = await context.supabase
      .from("staff")
      .select("id, status, full_name")
      .eq("id", existing.staff_id)
      .maybeSingle();

    const { data: row, error } = await context.supabase
      .from("hr_probation_reviews")
      .update({
        decision: applied.decision,
        decision_note: data.decisionNote ?? null,
        supporting_comments: data.supportingComments ?? null,
        manager_feedback: data.managerFeedback ?? undefined,
        performance_rating: data.performanceRating ?? undefined,
        flags_phase6_termination: applied.flagsPhase6Termination,
        status: "pending_approval",
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.reviewId)
      .select(REVIEW_SELECT)
      .single();
    if (error) throw error;

    if (data.decision === "extend" && data.extendEndDate) {
      await context.supabase.from("staff_profile_ext").upsert(
        {
          staff_id: existing.staff_id,
          probation_end: data.extendEndDate,
          updated_by: context.userId,
        },
        { onConflict: "staff_id" },
      );
    }

    // NEVER set staff.terminated here — Phase 6 owns that workflow.
    await audit(context, "hr.probation.decision", data.reviewId, {
      decision: applied.decision,
      flags_phase6_termination: applied.flagsPhase6Termination,
      staff_status_unchanged: staff?.status ?? null,
      auto_terminates_staff: false,
    });

    return {
      review: mapReview(row as Record<string, unknown>, today),
      staffStatusUnchanged: staff?.status ?? null,
      flagsPhase6Termination: applied.flagsPhase6Termination,
    };
  },
  { auth: { capability: "hr.probation.manage" } },
);

export const approveProbationDecision = createAuthenticatedAction(
  z.object({
    reviewId: z.string().uuid(),
    approvalNote: z.string().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    if (!canUserDo(context.roles ?? [], "hr.probation.manage")) {
      throw new ForbiddenError("Missing hr.probation.manage.");
    }
    const today = qatarToday();
    const { data: existing, error: loadErr } = await context.supabase
      .from("hr_probation_reviews")
      .select("id, staff_id, decision, status, flags_phase6_termination")
      .eq("id", data.reviewId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!existing) throw new Error("Probation review not found.");
    if (existing.status !== "pending_approval") {
      throw new Error("Review is not pending approval.");
    }
    if (!existing.decision) throw new Error("No decision to approve.");
    assertProbationDecisionRequiresApproval(
      existing.decision as HrProbationDecision,
      true,
    );

    const { data: staff } = await context.supabase
      .from("staff")
      .select("id, status")
      .eq("id", existing.staff_id)
      .maybeSingle();

    const { data: row, error } = await context.supabase
      .from("hr_probation_reviews")
      .update({
        status: "decided",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        approval_note: data.approvalNote ?? null,
      })
      .eq("id", data.reviewId)
      .select(REVIEW_SELECT)
      .single();
    if (error) throw error;

    await appendEmployeeEvent(context, {
      staffId: String(existing.staff_id),
      eventType: "probation_decision",
      payload: {
        review_id: data.reviewId,
        decision: existing.decision,
        flags_phase6_termination: Boolean(existing.flags_phase6_termination),
        staff_status: staff?.status ?? null,
        auto_terminate: false,
      },
      sourceTable: "hr_probation_reviews",
      sourceId: data.reviewId,
    });
    await audit(context, "hr.probation.approve", data.reviewId, {
      decision: existing.decision,
      staff_status_unchanged: staff?.status ?? null,
    });

    return mapReview(row as Record<string, unknown>, today);
  },
  { auth: { capability: "hr.probation.manage" } },
);

export const getProbationUpcomingCount = createAuthenticatedActionNoInput(async (context) => {
  const dash = await listProbationDashboard();
  return { upcomingCount: dash.upcomingCount };
}, { auth: { anyCapability: ["hr.probation.manage", "hr.manage", "people.view_roster"] } });
