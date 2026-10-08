"use server";

import { z } from "zod";

import { defaultPayrollPeriod } from "@/lib/attendance-hr/roster-period";
import { canUserDo } from "@/lib/rbac";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

import { buildDocumentNotes, buildWarningNotes } from "./compliance-notes";
import { answerHrCopilot, buildActionCards, type CopilotAnswer, type CopilotBundle } from "./copilot";
import { buildEngagementSummary } from "./engagement-summary";
import { buildOnboardingNotes } from "./onboarding-notes";
import { buildPayrollReview, payrollReviewLineFromRow } from "./payroll-review";
import { countKpiDrops, buildPerformanceNotes, type PerformanceNoteInput } from "./performance-notes";
import { getAttendanceReviewFlags, getLeaveAssistInsights, getRosterAssistRecommendations } from "./read.functions";
import { candidateMatchFacts, buildRecruitmentMatch, type RoleMatchInput } from "./recruitment-match";
import {
  PAYROLL_ASSIST_SELECT,
  RECRUITMENT_CANDIDATE_SELECT,
  RECRUITMENT_QID_PRESENCE_SELECT,
} from "./report-notes";
import { buildTrainingGaps, countOverdueRequired, type TrainingEnrollmentNote } from "./training-gaps";
import { dayDiff, ymdAdd } from "./time";
import type { AssistResult } from "./types";
import { buildWorkforceNotes } from "./workforce-notes";

/**
 * Read-only notes for payroll, recruitment, performance, training, documents,
 * warnings, workforce, and the question box. These actions do not insert,
 * update, or delete payroll, roster, attendance, leave, or employee master rows.
 */

const insufficient: AssistResult = { status: "insufficient", items: [] };
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
type Row = Record<string, unknown>;

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function rel(row: Row, key: string): Row | null {
  const value = row[key];
  if (Array.isArray(value)) return (value[0] as Row | undefined) ?? null;
  if (value && typeof value === "object") return value as Row;
  return null;
}

function missingTable(error: { message?: string } | null): boolean {
  return Boolean(error?.message && /does not exist|schema cache/i.test(error.message));
}

function requireCap(context: AuthContext, cap: Parameters<typeof canUserDo>[1]) {
  if (!canUserDo(context.roles ?? [], cap)) throw new ForbiddenError(`Missing capability: ${cap}`);
}

async function assertSite(context: AuthContext, locationId: string | null | undefined) {
  if (!locationId) return;
  const viewAll = canUserDo(context.roles ?? [], "attendance.view_all") || canUserDo(context.roles ?? [], "hr.manage");
  if (viewAll) return;
  await assertLocationAccess(context, locationId);
}

function qatarToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

export async function loadPayrollReview(context: AuthContext, periodId: string): Promise<AssistResult> {
  const { data: period, error: periodError } = await context.supabase
    .from("hr_payroll_periods")
    .select("id, month, date_from, date_to")
    .eq("id", periodId)
    .maybeSingle();
  if (periodError) {
    if (missingTable(periodError)) return insufficient;
    throw periodError;
  }
  if (!period) return insufficient;
  const { data: lines, error } = await context.supabase
    .from("hr_payroll_lines")
    .select(PAYROLL_ASSIST_SELECT)
    .eq("period_id", periodId)
    .limit(200);
  if (error) {
    if (missingTable(error)) return insufficient;
    throw error;
  }
  const { data: previousPeriod } = await context.supabase
    .from("hr_payroll_periods")
    .select("id")
    .lt("month", text(period.month))
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();
  const previousByStaff = new Map<string, ReturnType<typeof payrollReviewLineFromRow>>();
  if (previousPeriod?.id) {
    const { data: previousLines, error: previousError } = await context.supabase
      .from("hr_payroll_lines")
      .select(PAYROLL_ASSIST_SELECT)
      .eq("period_id", previousPeriod.id)
      .limit(200);
    if (previousError && !missingTable(previousError)) throw previousError;
    for (const row of previousLines ?? []) {
      const record = row as Row;
      const mapped = payrollReviewLineFromRow({
        ...(record as object),
        staffName: text(rel(record, "staff")?.full_name),
      } as Parameters<typeof payrollReviewLineFromRow>[0]);
      previousByStaff.set(text(record.staff_id), mapped);
    }
  }
  const mappedLines = (lines ?? []).map((row) => {
    const record = row as Row;
    const previous = previousByStaff.get(text(record.staff_id));
    return payrollReviewLineFromRow({
      ...(record as object),
      staffName: text(rel(record, "staff")?.full_name),
      hasPrevious: Boolean(previous),
      previousDeductionCodes: previous?.deductions.map((line) => line.code) ?? [],
      previousOtQar: previous ? previous.otQar : null,
    } as Parameters<typeof payrollReviewLineFromRow>[0]);
  });
  return buildPayrollReview({
    periodLabel: `${text(period.date_from)}–${text(period.date_to)}`,
    lines: mappedLines,
  });
}

export const getPayrollReview = createAuthenticatedAction(
  z.object({ periodId: z.string().uuid() }),
  async (data, context) => loadPayrollReview(context, data.periodId),
  { auth: { capability: "payroll.view" } },
);

export async function loadRecruitmentMatch(context: AuthContext, vacancyId: string | null): Promise<AssistResult> {
  let applications = context.supabase
    .from("hr_applications")
    .select("id, candidate_id, vacancy_id, stage")
    .neq("stage", "rejected")
    .limit(40);
  if (vacancyId) applications = applications.eq("vacancy_id", vacancyId);
  const { data: apps, error } = await applications;
  if (error) {
    if (missingTable(error)) return insufficient;
    throw error;
  }
  if (!apps?.length) return { status: "empty", items: [] };
  const vacancyIds = [...new Set(apps.map((row) => text(row.vacancy_id)).filter(Boolean))];
  const candidateIds = [...new Set(apps.map((row) => text(row.candidate_id)).filter(Boolean))];
  const [{ data: vacancies, error: vacancyError }, { data: candidates, error: candidateError }, { data: presence, error: presenceError }] =
    await Promise.all([
      context.supabase
        .from("hr_vacancies")
        .select("id, job_title, job_request_id, requires_qid, requires_visa")
        .in("id", vacancyIds),
      context.supabase.from("hr_candidates").select(RECRUITMENT_CANDIDATE_SELECT).in("id", candidateIds),
      context.supabase.from("hr_candidates").select(RECRUITMENT_QID_PRESENCE_SELECT).in("id", candidateIds),
    ]);
  if (vacancyError && !missingTable(vacancyError)) throw vacancyError;
  if (candidateError && !missingTable(candidateError)) throw candidateError;
  if (presenceError && !missingTable(presenceError)) throw presenceError;
  const qidOnFile = new Map<string, boolean>();
  for (const row of presence ?? []) {
    const facts = candidateMatchFacts({ qid: (row as Row).qid as string | null });
    qidOnFile.set(text((row as Row).id), facts.qidOnFile);
  }
  const requestIds = [...new Set((vacancies ?? []).map((row) => text((row as Row).job_request_id)).filter(Boolean))];
  const { data: requests, error: requestError } = requestIds.length
    ? await context.supabase.from("hr_job_requests").select("id, skills, experience_years, education").in("id", requestIds)
    : { data: [], error: null };
  if (requestError && !missingTable(requestError)) throw requestError;
  const requestById = new Map((requests ?? []).map((row) => [text((row as Row).id), row as Row]));
  const vacancyById = new Map((vacancies ?? []).map((row) => [text((row as Row).id), row as Row]));
  const candidateById = new Map((candidates ?? []).map((row) => [text((row as Row).id), row as Row]));
  const rows: RoleMatchInput[] = [];
  for (const app of apps) {
    const vacancy = vacancyById.get(text(app.vacancy_id));
    const candidate = candidateById.get(text(app.candidate_id));
    if (!vacancy || !candidate) continue;
    const request = requestById.get(text(vacancy.job_request_id));
    const visa = candidateMatchFacts({ visa_status: candidate.visa_status as string | null });
    rows.push({
      candidateId: text(candidate.id),
      candidateName: text(candidate.full_name),
      jobTitle: text(vacancy.job_title),
      requiredSkills: text(request?.skills),
      candidateSkills: text(candidate.skills),
      cvText: text(candidate.cv_text),
      requiredExperienceYears: request?.experience_years == null ? null : Number(request.experience_years),
      candidateExperienceYears: candidate.experience_years == null ? null : Number(candidate.experience_years),
      requiredEducation: text(request?.education),
      candidateEducation: text(candidate.education),
      requiresQid: Boolean(vacancy.requires_qid),
      qidOnFile: qidOnFile.get(text(candidate.id)) ?? false,
      requiresVisa: Boolean(vacancy.requires_visa),
      visaOnFile: visa.visaOnFile,
    });
  }
  return buildRecruitmentMatch({ rows });
}

export const getRecruitmentMatch = createAuthenticatedAction(
  z.object({ vacancyId: z.string().uuid().nullable().optional() }),
  async (data, context) => loadRecruitmentMatch(context, data.vacancyId ?? null),
  { auth: { capability: "recruitment.request" } },
);

export const getOnboardingNotes = createAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    const { data, error } = await context.supabase
      .from("hr_staff_checklists")
      .select("id, staff_id, kind, status, staff(full_name), hr_staff_checklist_items(title, status)")
      .eq("kind", "onboarding")
      .eq("status", "open")
      .limit(40);
    if (error) {
      if (missingTable(error)) return insufficient;
      throw error;
    }
    return buildOnboardingNotes({
      rows: (data ?? []).map((row) => {
        const record = row as Row;
        const items = Array.isArray(record.hr_staff_checklist_items) ? record.hr_staff_checklist_items : [];
        return {
          staffId: text(record.staff_id),
          staffName: text(rel(record, "staff")?.full_name),
          kind: text(record.kind),
          openItems: (items as Row[])
            .filter((item) => {
              const status = text(item.status).toLowerCase();
              return status !== "done" && status !== "skipped" && status !== "completed";
            })
            .map((item) => text(item.title)),
        };
      }),
    });
  },
  { auth: { capability: "hr.manage" } },
);

async function loadPerformance(context: AuthContext): Promise<{ result: AssistResult; drops: number }> {
  const { data: evaluations, error } = await context.supabase
    .from("employee_evaluations")
    .select("id, staff_id, cycle_id, supervisor_comments, manager_comments, staff(full_name)")
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) {
    if (missingTable(error)) return { result: insufficient, drops: 0 };
    throw error;
  }
  const staffIds = [...new Set((evaluations ?? []).map((row) => text((row as Row).staff_id)).filter(Boolean))];
  const cycleIds = [...new Set((evaluations ?? []).map((row) => text((row as Row).cycle_id)).filter(Boolean))];
  const { data: cycles } = cycleIds.length
    ? await context.supabase.from("performance_cycles").select("id, name").in("id", cycleIds)
    : { data: [] };
  const cycleName = new Map((cycles ?? []).map((row) => [text((row as Row).id), text((row as Row).name)]));
  const { data: kpis } = staffIds.length
    ? await context.supabase.from("employee_kpis").select("id, staff_id, label").in("staff_id", staffIds).limit(80)
    : { data: [] };
  const kpiIds = (kpis ?? []).map((row) => text((row as Row).id)).filter(Boolean);
  const { data: actuals } = kpiIds.length
    ? await context.supabase
        .from("kpi_actuals")
        .select("employee_kpi_id, period_end, actual_value")
        .in("employee_kpi_id", kpiIds)
        .order("period_end", { ascending: false })
        .limit(200)
    : { data: [] };
  const actualsByKpi = new Map<string, Array<{ period: string; value: number }>>();
  for (const row of actuals ?? []) {
    const record = row as Row;
    const value = Number(record.actual_value);
    if (!Number.isFinite(value)) continue;
    const list = actualsByKpi.get(text(record.employee_kpi_id)) ?? [];
    list.push({ period: text(record.period_end).slice(0, 10), value });
    actualsByKpi.set(text(record.employee_kpi_id), list);
  }
  const kpiByStaff = new Map<string, Row>();
  for (const row of kpis ?? []) {
    const record = row as Row;
    if (!kpiByStaff.has(text(record.staff_id))) kpiByStaff.set(text(record.staff_id), record);
  }
  const notes: PerformanceNoteInput[] = (evaluations ?? []).map((row) => {
    const record = row as Row;
    const kpi = kpiByStaff.get(text(record.staff_id));
    const series = kpi ? (actualsByKpi.get(text(kpi.id)) ?? []) : [];
    const later = series[0];
    const earlier = series[1];
    return {
      staffId: text(record.staff_id),
      staffName: text(rel(record, "staff")?.full_name),
      cycleName: cycleName.get(text(record.cycle_id)) ?? "",
      kpiLabel: text(kpi?.label),
      earlier: earlier?.value ?? null,
      later: later?.value ?? null,
      earlierLabel: earlier?.period ?? "",
      laterLabel: later?.period ?? "",
      supervisorComments: text(record.supervisor_comments),
      managerComments: text(record.manager_comments),
    };
  });
  return { result: buildPerformanceNotes({ rows: notes }), drops: countKpiDrops(notes) };
}

export const getPerformanceNotes = createAuthenticatedAction(
  z.object({}),
  async (_data, context) => (await loadPerformance(context)).result,
  { auth: { capability: "performance.view" } },
);

async function loadTraining(context: AuthContext, locationId: string | null): Promise<{ result: AssistResult; overdue: number }> {
  let query = context.supabase
    .from("training_enrollments")
    .select("id, staff_id, course_name, required, status, due_on, staff(full_name)")
    .limit(200);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query;
  if (error) {
    if (missingTable(error)) return { result: insufficient, overdue: 0 };
    throw error;
  }
  const staffIds = [...new Set((data ?? []).map((row) => text((row as Row).staff_id)).filter(Boolean))];
  const { data: skills } = staffIds.length
    ? await context.supabase.from("staff_profile_ext").select("staff_id, skills").in("staff_id", staffIds)
    : { data: [] };
  const skillByStaff = new Map((skills ?? []).map((row) => [text((row as Row).staff_id), text((row as Row).skills)]));
  const { data: courses } = await context.supabase.from("training_courses").select("title").eq("status", "PUBLISHED").limit(80);
  const enrollments: TrainingEnrollmentNote[] = (data ?? []).map((row) => {
    const record = row as Row;
    return {
      staffId: text(record.staff_id),
      staffName: text(rel(record, "staff")?.full_name),
      courseName: text(record.course_name),
      required: Boolean(record.required),
      status: text(record.status),
      dueOn: record.due_on ? text(record.due_on).slice(0, 10) : null,
      skills: skillByStaff.get(text(record.staff_id)) ?? "",
    };
  });
  const today = qatarToday();
  return {
    result: buildTrainingGaps({
      today,
      enrollments,
      publishedCourses: (courses ?? []).map((row) => text((row as Row).title)).filter(Boolean),
    }),
    overdue: countOverdueRequired(enrollments, today),
  };
}

export const getTrainingGaps = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context) => {
    await assertSite(context, data.locationId);
    return (await loadTraining(context, data.locationId ?? null)).result;
  },
  { auth: { capability: "people.view_roster" } },
);

export const getDocumentNotes = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context) => {
    await assertSite(context, data.locationId);
    const { data: rows, error } = await context.supabase
      .from("hr_employee_documents")
      .select("id, doc_type, expiry_date, staff(full_name, location_id)")
      .is("deleted_at", null)
      .limit(200);
    if (error) {
      if (missingTable(error)) return insufficient;
      throw error;
    }
    const filtered = (rows ?? []).filter((row) => {
      if (!data.locationId) return true;
      return text(rel(row as Row, "staff")?.location_id) === data.locationId;
    });
    return buildDocumentNotes({
      today: qatarToday(),
      rows: filtered.map((row) => {
        const record = row as Row;
        return {
          staffId: text(record.id),
          staffName: text(rel(record, "staff")?.full_name),
          docType: text(record.doc_type),
          expiryDate: record.expiry_date ? text(record.expiry_date).slice(0, 10) : null,
        };
      }),
    });
  },
  { auth: { capability: "hr.docs.manage" } },
);

export const getWarningNotes = createAuthenticatedAction(
  z.object({ dateFrom: ymd, dateTo: ymd }),
  async (data, context) => {
    const { data: rows, error } = await context.supabase
      .from("hr_warnings")
      .select("id, staff_id, category, warning_level, issued_on, status, employee_explanation, staff(full_name)")
      .gte("issued_on", data.dateFrom)
      .lte("issued_on", data.dateTo)
      .limit(80);
    if (error) {
      if (missingTable(error)) return insufficient;
      throw error;
    }
    return buildWarningNotes({
      periodFrom: data.dateFrom,
      periodTo: data.dateTo,
      rows: (rows ?? []).map((row) => {
        const record = row as Row;
        return {
          staffId: text(record.staff_id),
          staffName: text(rel(record, "staff")?.full_name),
          category: text(record.category),
          level: text(record.warning_level),
          issuedOn: text(record.issued_on).slice(0, 10),
          status: text(record.status),
          hasEmployeeExplanation: Boolean(text(record.employee_explanation).trim()),
        };
      }),
    });
  },
  { auth: { capability: "hr.warnings.manage" } },
);

async function loadWorkforce(
  context: AuthContext,
  input: { locationId: string | null; dateFrom: string; dateTo: string },
): Promise<AssistResult> {
  if (input.dateTo < input.dateFrom) return insufficient;
  const midpoint = ymdAdd(input.dateFrom, Math.floor(dayDiff(input.dateFrom, input.dateTo) / 2));
  const canQuota = canUserDo(context.roles ?? [], "quota.view");
  let approved: number | null = null;
  let site = input.locationId ? "" : "all sites";
  if (canQuota) {
    let quotas = context.supabase.from("hr_workforce_quotas").select("approved_headcount, locations(name)").eq("active", true).limit(80);
    if (input.locationId) quotas = quotas.eq("location_id", input.locationId);
    const { data, error } = await quotas;
    if (error && !missingTable(error)) throw error;
    if (!error && data) {
      approved = data.reduce((total, row) => total + (Number((row as Row).approved_headcount) || 0), 0);
      const name = text(rel((data[0] as Row | undefined) ?? {}, "locations")?.name);
      if (name) site = name;
    }
  }
  let roster = context.supabase
    .from("attendance_roster_assignments")
    .select("staff_id")
    .eq("is_week_off", false)
    .gte("work_date", input.dateFrom)
    .lte("work_date", input.dateTo)
    .limit(1000);
  if (input.locationId) roster = roster.eq("location_id", input.locationId);
  const { data: rosterRows, error: rosterError } = await roster;
  if (rosterError && !missingTable(rosterError)) throw rosterError;
  const rostered = rosterError ? null : new Set((rosterRows ?? []).map((row) => text((row as Row).staff_id)).filter(Boolean)).size;

  let days = context.supabase
    .from("attendance_daily_summary")
    .select("work_date, overtime_minutes, missed_punch")
    .gte("work_date", input.dateFrom)
    .lte("work_date", input.dateTo)
    .limit(1000);
  if (input.locationId) days = days.eq("location_id", input.locationId);
  const { data: dayRows, error: dayError } = await days;
  if (dayError && !missingTable(dayError)) throw dayError;
  let first = 0;
  let second = 0;
  let missed = 0;
  for (const row of dayRows ?? []) {
    const record = row as Row;
    const workDate = text(record.work_date).slice(0, 10);
    const minutes = Number(record.overtime_minutes) || 0;
    if (workDate <= midpoint) first += minutes;
    else second += minutes;
    if (record.missed_punch) missed += 1;
  }

  const { data: leaveRows, error: leaveError } = await context.supabase
    .from("hr_leave_requests")
    .select("date_from, date_to, status")
    .in("status", ["pending", "approved"])
    .lte("date_from", input.dateTo)
    .gte("date_to", input.dateFrom)
    .limit(200);
  if (leaveError && !missingTable(leaveError)) throw leaveError;
  let leaveDays = 0;
  for (const row of leaveRows ?? []) {
    const record = row as Row;
    const start = text(record.date_from).slice(0, 10);
    const end = text(record.date_to).slice(0, 10);
    const from = start > input.dateFrom ? start : input.dateFrom;
    const to = end < input.dateTo ? end : input.dateTo;
    if (to >= from) leaveDays += Math.min(31, dayDiff(from, to) + 1);
  }

  const training = canUserDo(context.roles ?? [], "people.view_roster")
    ? await loadTraining(context, input.locationId)
    : { overdue: 0, result: insufficient };
  const performance = canUserDo(context.roles ?? [], "performance.view")
    ? await loadPerformance(context)
    : { drops: 0, result: insufficient };

  return buildWorkforceNotes({
    periodFrom: input.dateFrom,
    periodTo: input.dateTo,
    midpoint,
    site,
    approvedHeadcount: approved,
    rosteredPeople: rostered,
    otFirstHalfMinutes: dayError ? null : first,
    otSecondHalfMinutes: dayError ? null : second,
    missedPunchDays: dayError ? null : missed,
    leaveDays: leaveError ? null : leaveDays,
    overdueRequiredCourses: training.overdue,
    kpiDropCount: performance.drops,
  });
}

export const getWorkforceNotes = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: ymd.optional(),
    dateTo: ymd.optional(),
  }),
  async (data, context) => {
    const canRoster = canUserDo(context.roles ?? [], "people.view_roster");
    const canQuota = canUserDo(context.roles ?? [], "quota.view");
    if (!canRoster && !canQuota) throw new ForbiddenError("Missing capability: quota.view");
    await assertSite(context, data.locationId);
    const period = defaultPayrollPeriod(qatarToday());
    return loadWorkforce(context, {
      locationId: data.locationId ?? null,
      dateFrom: data.dateFrom ?? period.dateFrom,
      dateTo: data.dateTo ?? period.dateTo,
    });
  },
);

async function safeResult(load: () => Promise<AssistResult>): Promise<AssistResult> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ForbiddenError) return insufficient;
    throw error;
  }
}

function emptyBundle(input: {
  question: string;
  periodFrom: string;
  periodTo: string;
  filters: string;
  canPayroll: boolean;
}): CopilotBundle {
  return {
    ...input,
    payroll: { status: "empty", items: [] },
    attendance: { status: "empty", items: [] },
    roster: { status: "empty", items: [] },
    leave: { status: "empty", items: [] },
    recruitment: { status: "empty", items: [] },
    performance: { status: "empty", items: [] },
    training: { status: "empty", items: [] },
    documents: { status: "empty", items: [] },
    warnings: { status: "empty", items: [] },
    workforce: { status: "empty", items: [] },
  };
}

export const askHrCopilot = createAuthenticatedAction(
  z.object({
    question: z.string().trim().max(500),
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: ymd,
    dateTo: ymd,
    filters: z.string().max(300).optional(),
  }),
  async (data, context): Promise<CopilotAnswer> => {
    requireCap(context, "people.view_roster");
    await assertSite(context, data.locationId);
    const canPayroll = canUserDo(context.roles ?? [], "payroll.view");
    const bundle = emptyBundle({
      question: data.question,
      periodFrom: data.dateFrom,
      periodTo: data.dateTo,
      filters: data.filters ?? (data.locationId ? data.locationId : "all sites"),
      canPayroll,
    });
    const question = data.question.toLowerCase();
    if (/(payroll|salary|wage|wps|deduction|net pay)/.test(question) && canPayroll) {
      const { data: period } = await context.supabase
        .from("hr_payroll_periods")
        .select("id")
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle();
      bundle.payroll = period?.id ? await loadPayrollReview(context, text(period.id)) : insufficient;
    }
    if (/(attendance|punch|absent)/.test(question)) {
      bundle.attendance = await safeResult(() =>
        getAttendanceReviewFlags({ locationId: data.locationId ?? null, dateFrom: data.dateFrom, dateTo: data.dateTo }),
      );
    }
    if (/(roster|shift)/.test(question)) {
      bundle.roster = await safeResult(() =>
        getRosterAssistRecommendations({ locationId: data.locationId ?? null, dateFrom: data.dateFrom, dateTo: data.dateTo }),
      );
    }
    if (/(leave|vacation)/.test(question)) {
      bundle.leave = await safeResult(() => getLeaveAssistInsights({}));
    }
    if (/(recruit|candidate|hiring|vacancy)/.test(question)) {
      bundle.recruitment = await safeResult(() => loadRecruitmentMatch(context, null));
    }
    if (/(performance|kra|kpi|evaluation)/.test(question)) {
      bundle.performance = canUserDo(context.roles ?? [], "performance.view")
        ? (await loadPerformance(context)).result
        : insufficient;
    }
    if (/(training|course|skill)/.test(question)) {
      bundle.training = (await loadTraining(context, data.locationId ?? null)).result;
    }
    if (/(document|expiry|passport)/.test(question) && canUserDo(context.roles ?? [], "hr.docs.manage")) {
      const { data: rows, error } = await context.supabase
        .from("hr_employee_documents")
        .select("id, doc_type, expiry_date, staff(full_name, location_id)")
        .is("deleted_at", null)
        .limit(200);
      if (!error) {
        bundle.documents = buildDocumentNotes({
          today: qatarToday(),
          rows: (rows ?? [])
            .filter((row) => !data.locationId || text(rel(row as Row, "staff")?.location_id) === data.locationId)
            .map((row) => {
              const record = row as Row;
              return {
                staffId: text(record.id),
                staffName: text(rel(record, "staff")?.full_name),
                docType: text(record.doc_type),
                expiryDate: record.expiry_date ? text(record.expiry_date).slice(0, 10) : null,
              };
            }),
        });
      }
    }
    if (/(warning|disciplinary)/.test(question) && canUserDo(context.roles ?? [], "hr.warnings.manage")) {
      const { data: rows, error } = await context.supabase
        .from("hr_warnings")
        .select("id, staff_id, category, warning_level, issued_on, status, employee_explanation, staff(full_name)")
        .gte("issued_on", data.dateFrom)
        .lte("issued_on", data.dateTo)
        .limit(80);
      if (!error) {
        bundle.warnings = buildWarningNotes({
          periodFrom: data.dateFrom,
          periodTo: data.dateTo,
          rows: (rows ?? []).map((row) => {
            const record = row as Row;
            return {
              staffId: text(record.staff_id),
              staffName: text(rel(record, "staff")?.full_name),
              category: text(record.category),
              level: text(record.warning_level),
              issuedOn: text(record.issued_on).slice(0, 10),
              status: text(record.status),
              hasEmployeeExplanation: Boolean(text(record.employee_explanation).trim()),
            };
          }),
        });
      }
    }
    if (/(headcount|quota|overtime|workload|engagement)/.test(question)) {
      bundle.workforce = await loadWorkforce(context, {
        locationId: data.locationId ?? null,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
      });
    }
    return answerHrCopilot(bundle);
  },
  { auth: { capability: "people.view_roster" } },
);

export const getHrActionCenter = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: ymd,
    dateTo: ymd,
  }),
  async (data, context) => {
    requireCap(context, "people.view_roster");
    await assertSite(context, data.locationId);
    const groups: AssistResult[] = [];
    if (canUserDo(context.roles ?? [], "performance.view")) groups.push((await loadPerformance(context)).result);
    groups.push((await loadTraining(context, data.locationId ?? null)).result);
    if (canUserDo(context.roles ?? [], "hr.docs.manage")) {
      const { data: rows, error } = await context.supabase
        .from("hr_employee_documents")
        .select("id, doc_type, expiry_date, staff(full_name, location_id)")
        .is("deleted_at", null)
        .limit(100);
      if (!error) {
        groups.push(
          buildDocumentNotes({
            today: qatarToday(),
            rows: (rows ?? [])
              .filter((row) => !data.locationId || text(rel(row as Row, "staff")?.location_id) === data.locationId)
              .map((row) => {
                const record = row as Row;
                return {
                  staffId: text(record.id),
                  staffName: text(rel(record, "staff")?.full_name),
                  docType: text(record.doc_type),
                  expiryDate: record.expiry_date ? text(record.expiry_date).slice(0, 10) : null,
                };
              }),
          }),
        );
      }
    }
    groups.push(
      await loadWorkforce(context, {
        locationId: data.locationId ?? null,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
      }),
    );
    if (canUserDo(context.roles ?? [], "payroll.view")) {
      const { data: period } = await context.supabase
        .from("hr_payroll_periods")
        .select("id")
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (period?.id) {
        const payroll = await loadPayrollReview(context, text(period.id));
        groups.push({
          ...payroll,
          items: payroll.items.map((item) => ({
            ...item,
            href: `/people/payroll/${text(period.id)}`,
            linkKey: "hrAssist.openModule",
          })),
        });
      }
    }
    return buildActionCards(groups);
  },
  { auth: { capability: "people.view_roster" } },
);

export const getEngagementSummary = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: ymd.optional(),
    dateTo: ymd.optional(),
  }),
  async (data, context) => {
    requireCap(context, "people.view_roster");
    await assertSite(context, data.locationId);
    const period = defaultPayrollPeriod(qatarToday());
    const dateFrom = data.dateFrom ?? period.dateFrom;
    const dateTo = data.dateTo ?? period.dateTo;
    if (dateTo < dateFrom) return insufficient;

    let achievementsQuery = context.supabase
      .from("employee_achievements")
      .select("title, achieved_on")
      .gte("achieved_on", dateFrom)
      .lte("achieved_on", dateTo)
      .limit(20);
    if (data.locationId) achievementsQuery = achievementsQuery.eq("location_id", data.locationId);
    const { data: achievements, error: achievementError } = await achievementsQuery;
    if (achievementError && !missingTable(achievementError)) throw achievementError;
    let awardsQuery = context.supabase.from("employee_awards").select("title, award_month").limit(20);
    if (data.locationId) awardsQuery = awardsQuery.eq("location_id", data.locationId);
    const { data: awards, error: awardError } = await awardsQuery;
    if (awardError && !missingTable(awardError)) throw awardError;
    const recognition = [
      ...(achievements ?? []).map((row) => ({
        title: text((row as Row).title),
        on: text((row as Row).achieved_on).slice(0, 10),
      })),
      ...(awards ?? [])
        .filter((row) => {
          const month = text((row as Row).award_month).slice(0, 7);
          return month >= dateFrom.slice(0, 7) && month <= dateTo.slice(0, 7);
        })
        .map((row) => ({ title: text((row as Row).title), on: text((row as Row).award_month) })),
    ];

    const { data: warnings, error: warningError } = await context.supabase
      .from("hr_warnings")
      .select("category, issued_on")
      .gte("issued_on", dateFrom)
      .lte("issued_on", dateTo)
      .limit(200);
    if (warningError && !missingTable(warningError)) throw warningError;
    const warningCounts = new Map<string, number>();
    for (const row of warnings ?? []) {
      const category = text((row as Row).category) || "other";
      warningCounts.set(category, (warningCounts.get(category) ?? 0) + 1);
    }

    let days = context.supabase
      .from("attendance_daily_summary")
      .select("missed_punch")
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .limit(1000);
    if (data.locationId) days = days.eq("location_id", data.locationId);
    const { data: dayRows, error: dayError } = await days;
    if (dayError && !missingTable(dayError)) throw dayError;
    const missed = dayError ? null : (dayRows ?? []).filter((row) => Boolean((row as Row).missed_punch)).length;

    const { data: leaveRows, error: leaveError } = await context.supabase
      .from("hr_leave_requests")
      .select("date_from, date_to")
      .in("status", ["pending", "approved"])
      .lte("date_from", dateTo)
      .gte("date_to", dateFrom)
      .limit(200);
    if (leaveError && !missingTable(leaveError)) throw leaveError;
    let leaveDays = 0;
    for (const row of leaveRows ?? []) {
      const record = row as Row;
      const start = text(record.date_from).slice(0, 10);
      const end = text(record.date_to).slice(0, 10);
      const from = start > dateFrom ? start : dateFrom;
      const to = end < dateTo ? end : dateTo;
      if (to >= from) leaveDays += Math.min(31, dayDiff(from, to) + 1);
    }

    return buildEngagementSummary({
      periodFrom: dateFrom,
      periodTo: dateTo,
      surveysStored: false,
      recognition,
      warningCategories: [...warningCounts.entries()].map(([category, count]) => ({ category, count })),
      missedPunchDays: missed,
      leaveDays: leaveError ? null : leaveDays,
    });
  },
  { auth: { capability: "people.view_roster" } },
);
