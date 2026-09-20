"use server";

import { z } from "zod";

import {
  assertCanPublishVacancy,
  assertQuotaOverrideAllowed,
  buildQuotaEmployeeRows,
  computeQuotaMetrics,
  defaultJobApprovalSteps,
  evaluateJobRequestAgainstQuota,
  HR_EMPLOYMENT_CATEGORIES,
  HR_JOB_APPROVAL_ROLES,
  HR_JOB_PRIORITIES,
  HR_JOB_REQUEST_STATUSES,
  HR_JOB_REQUEST_TYPES,
  HR_VACANCY_STATUSES,
  JOB_STEP_CAPABILITY,
  maskJobRequestSalary,
  requiresFinanceForBudget,
  type HrJobApprovalRole,
  type HrJobRequestStatus,
  type HrQuotaOverrideStatus,
} from "@/lib/hr-recruitment";
import { HR_SELECTED_NOT_JOINED_STAGES, isSelectedNotJoinedStage } from "@/lib/hr-ats";
import { canUserDo } from "@/lib/rbac";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  type AuthContext,
} from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import {
  isActiveStaffStatus,
  isOnLeaveStaffStatus,
  isServingNoticeStaffStatus,
} from "@/lib/staff-status";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

const uuidOpt = z.string().uuid().nullable().optional();

async function loadQuotaLookup(context: AuthContext) {
  const { data, error } = await context.supabase
    .from("hr_workforce_quotas")
    .select(
      "id, location_id, department_id, designation, employment_category, approved_headcount, effective_on, active",
    )
    .eq("active", true)
    .order("effective_on", { ascending: false });
  if (error) {
    if (tableMissing(error.message)) return [];
    throw error;
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    locationId: (r.location_id as string | null) ?? null,
    departmentId: (r.department_id as string | null) ?? null,
    designation: (r.designation as string | null) ?? null,
    employmentCategory: (r.employment_category as string | null) ?? null,
    approvedHeadcount: Number(r.approved_headcount),
    effectiveOn: String(r.effective_on).slice(0, 10),
  }));
}

async function staffHeadcountForScope(
  context: AuthContext,
  scope: {
    locationId?: string | null;
    departmentId?: string | null;
    designation?: string | null;
    employmentCategory?: string | null;
  },
) {
  let staffQ = context.supabase
    .from("staff")
    .select("id, full_name, status, job_title, qid, location_id, staff_departments(department_id)")
    .is("deleted_at", null)
    .in("status", ["active", "on_leave", "serving_notice", "leave", "vacation"]);
  if (scope.locationId) staffQ = staffQ.eq("location_id", scope.locationId);
  const { data: staffRows, error } = await staffQ.limit(5000);
  if (error && !tableMissing(error.message)) throw error;

  type StaffRow = {
    id: string;
    full_name: string;
    status: string | null;
    job_title: string | null;
    qid: string | null;
    location_id: string | null;
    staff_departments?: Array<{ department_id: string }> | null;
    employment_category?: string | null;
  };

  const rows = (staffRows ?? []) as StaffRow[];
  const ids = rows.map((s) => s.id);
  const catByStaff = new Map<string, string | null>();
  if (ids.length) {
    const { data: extRows, error: extErr } = await context.supabase
      .from("staff_profile_ext")
      .select("staff_id, employment_category")
      .in("staff_id", ids.slice(0, 1000));
    if (extErr && !tableMissing(extErr.message)) throw extErr;
    for (const e of extRows ?? []) {
      catByStaff.set(String(e.staff_id), (e.employment_category as string | null) ?? null);
    }
  }
  for (const s of rows) {
    s.employment_category = catByStaff.get(s.id) ?? null;
  }

  const filtered = rows.filter((s) => {
    if (scope.departmentId) {
      const deps = s.staff_departments ?? [];
      if (!deps.some((d) => d.department_id === scope.departmentId)) return false;
    }
    if (scope.designation) {
      const t = (s.job_title ?? "").trim().toLowerCase();
      if (t !== scope.designation.trim().toLowerCase()) return false;
    }
    if (scope.employmentCategory) {
      const cat = (s.employment_category ?? "").trim().toLowerCase();
      if (cat !== scope.employmentCategory.trim().toLowerCase()) return false;
    }
    return true;
  });

  let active = 0;
  let onLeave = 0;
  let servingNotice = 0;
  for (const s of filtered) {
    if (isServingNoticeStaffStatus(s.status)) servingNotice += 1;
    else if (isOnLeaveStaffStatus(s.status)) onLeave += 1;
    else if (isActiveStaffStatus(s.status)) active += 1;
  }
  return { active, onLeave, servingNotice, staff: filtered };
}

/** Count selected-not-joined applications for a vacancy scope (quota occupancy). */
export async function countSelectedNotJoined(
  context: AuthContext,
  scope: {
    locationId?: string | null;
    departmentId?: string | null;
  },
): Promise<number> {
  let vacQ = context.supabase
    .from("hr_vacancies")
    .select("id, location_id, department_id")
    .in("status", ["open", "on_hold", "filled"]);
  if (scope.locationId) vacQ = vacQ.eq("location_id", scope.locationId);
  if (scope.departmentId) vacQ = vacQ.eq("department_id", scope.departmentId);
  const { data: vacs, error } = await vacQ;
  if (error) {
    if (tableMissing(error.message)) return 0;
    throw error;
  }
  const ids = (vacs ?? []).map((v) => String(v.id));
  if (!ids.length) return 0;

  const { data: apps, error: appErr } = await context.supabase
    .from("hr_applications")
    .select("id, vacancy_id, stage")
    .in("vacancy_id", ids)
    .in("stage", [...HR_SELECTED_NOT_JOINED_STAGES]);
  if (appErr) {
    if (tableMissing(appErr.message)) return 0;
    throw appErr;
  }
  return (apps ?? []).filter((a) => isSelectedNotJoinedStage(String(a.stage))).length;
}

async function openVacancyCount(
  context: AuthContext,
  scope: { locationId?: string | null; departmentId?: string | null },
) {
  let q = context.supabase
    .from("hr_vacancies")
    .select("id, vacancies_count", { count: "exact" })
    .eq("status", "open");
  if (scope.locationId) q = q.eq("location_id", scope.locationId);
  if (scope.departmentId) q = q.eq("department_id", scope.departmentId);
  const { data, error } = await q;
  if (error) {
    if (tableMissing(error.message)) return 0;
    throw error;
  }
  return (data ?? []).reduce((sum, r) => sum + Number(r.vacancies_count ?? 1), 0);
}

async function seedJobApprovalSteps(
  context: AuthContext,
  jobRequestId: string,
  requiresFinance: boolean,
) {
  const steps = defaultJobApprovalSteps({ requiresFinance }).map((s) => ({
    job_request_id: jobRequestId,
    step_order: s.stepOrder,
    step_role: s.stepRole,
    status: "pending",
  }));
  await context.supabase.from("hr_job_request_approvals").delete().eq("job_request_id", jobRequestId);
  const { error } = await context.supabase.from("hr_job_request_approvals").insert(steps);
  if (error && !tableMissing(error.message)) throw error;
  await context.supabase
    .from("hr_job_requests")
    .update({
      current_step_role: "dept_ops",
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobRequestId);
}

function canActOnStep(roles: string[], stepRole: HrJobApprovalRole): boolean {
  if (stepRole === "quota_override") {
    return canUserDo(roles as never[], "quota.override_approve");
  }
  const cap = JOB_STEP_CAPABILITY[stepRole];
  if (stepRole === "dept_ops") {
    return (
      canUserDo(roles as never[], "recruitment.request") ||
      canUserDo(roles as never[], "recruitment.manage") ||
      canUserDo(roles as never[], "hr.manage")
    );
  }
  if (stepRole === "gm") {
    return (
      canUserDo(roles as never[], "recruitment.manage") ||
      (roles as string[]).includes("ceo") ||
      (roles as string[]).includes("coo")
    );
  }
  return canUserDo(roles as never[], cap);
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export const listRecruitmentLookups = createAuthenticatedActionNoInput(
  async (context) => {
    const [locs, depts] = await Promise.all([
      context.supabase.from("locations").select("id, code, name").order("name").limit(200),
      context.supabase
        .from("master_departments")
        .select("id, name, code")
        .eq("active", true)
        .order("sort_order")
        .limit(300),
    ]);
    if (locs.error && !tableMissing(locs.error.message)) throw locs.error;
    if (depts.error && !tableMissing(depts.error.message)) throw depts.error;
    return {
      locations: (locs.data ?? []).map((l) => ({
        id: String(l.id),
        code: String(l.code ?? ""),
        name: String(l.name ?? ""),
      })),
      departments: (depts.data ?? []).map((d) => ({
        id: String(d.id),
        name: String(d.name),
        code: (d.code as string | null) ?? null,
      })),
      categories: [...HR_EMPLOYMENT_CATEGORIES],
    };
  },
  { auth: { anyCapability: ["quota.view", "recruitment.request", "recruitment.manage"] } },
);

// ---------------------------------------------------------------------------
// Quotas
// ---------------------------------------------------------------------------

export const listWorkforceQuotas = createAuthenticatedAction(
  z.object({
    locationId: uuidOpt,
    departmentId: uuidOpt,
  }),
  async (data, context) => {
    let q = context.supabase
      .from("hr_workforce_quotas")
      .select(
        "id, location_id, department_id, designation, employment_category, approved_headcount, effective_on, notes, active, created_at, locations(name), master_departments(name)",
      )
      .eq("active", true)
      .order("effective_on", { ascending: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.departmentId) q = q.eq("department_id", data.departmentId);
    const { data: rows, error } = await q;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => {
      const loc = r.locations as { name: string } | null;
      const dept = r.master_departments as { name: string } | null;
      return {
        id: String(r.id),
        locationId: (r.location_id as string | null) ?? null,
        locationName: loc?.name ?? null,
        departmentId: (r.department_id as string | null) ?? null,
        departmentName: dept?.name ?? null,
        designation: (r.designation as string | null) ?? null,
        employmentCategory: (r.employment_category as string | null) ?? null,
        approvedHeadcount: Number(r.approved_headcount),
        effectiveOn: String(r.effective_on).slice(0, 10),
        notes: (r.notes as string | null) ?? null,
      };
    });
  },
  { auth: { capability: "quota.view" } },
);

export const upsertWorkforceQuota = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    locationId: z.string().uuid().nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    designation: z.string().max(120).nullable().optional(),
    employmentCategory: z.enum(HR_EMPLOYMENT_CATEGORIES).nullable().optional(),
    approvedHeadcount: z.number().int().min(0).max(5000),
    effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().max(1000).nullable().optional(),
  }),
  async (data, context) => {
    const payload = {
      location_id: data.locationId ?? null,
      department_id: data.departmentId ?? null,
      designation: data.designation?.trim() || null,
      employment_category: data.employmentCategory ?? null,
      approved_headcount: data.approvedHeadcount,
      effective_on: data.effectiveOn,
      notes: data.notes ?? null,
      active: true,
      created_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("hr_workforce_quotas")
        .update(payload)
        .eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("hr_workforce_quotas")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { id: String(row.id) };
  },
  { auth: { capability: "quota.manage" } },
);

export const getQuotaDashboard = createAuthenticatedAction(
  z.object({
    groupBy: z.enum(["location", "department"]).default("location"),
    locationId: uuidOpt,
    departmentId: uuidOpt,
  }),
  async (data, context) => {
    const quotas = await loadQuotaLookup(context);
    const scoped = quotas.filter((q) => {
      if (data.locationId && q.locationId && q.locationId !== data.locationId) return false;
      if (data.departmentId && q.departmentId && q.departmentId !== data.departmentId) return false;
      return true;
    });

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
    const groups = new Map<
      string,
      {
        key: string;
        locationId: string | null;
        departmentId: string | null;
        designation: string | null;
        employmentCategory: string | null;
        approvedHeadcount: number;
        quotaIds: string[];
      }
    >();

    for (const q of scoped) {
      const key =
        data.groupBy === "location"
          ? `${q.locationId ?? "all"}|${q.departmentId ?? ""}|${q.designation ?? ""}|${q.employmentCategory ?? ""}`
          : `${q.departmentId ?? "all"}|${q.locationId ?? ""}|${q.designation ?? ""}|${q.employmentCategory ?? ""}`;
      const existing = groups.get(key);
      if (existing) {
        existing.approvedHeadcount += q.approvedHeadcount;
        existing.quotaIds.push(q.id);
      } else {
        groups.set(key, {
          key,
          locationId: q.locationId,
          departmentId: q.departmentId,
          designation: q.designation,
          employmentCategory: q.employmentCategory,
          approvedHeadcount: q.approvedHeadcount,
          quotaIds: [q.id],
        });
      }
    }

    const locIds = [...new Set([...groups.values()].map((g) => g.locationId).filter(Boolean))] as string[];
    const deptIds = [...new Set([...groups.values()].map((g) => g.departmentId).filter(Boolean))] as string[];
    const locNames = new Map<string, string>();
    const deptNames = new Map<string, string>();
    if (locIds.length) {
      const { data: locs } = await context.supabase.from("locations").select("id, name").in("id", locIds);
      for (const l of locs ?? []) locNames.set(String(l.id), String(l.name));
    }
    if (deptIds.length) {
      const { data: depts } = await context.supabase
        .from("master_departments")
        .select("id, name")
        .in("id", deptIds);
      for (const d of depts ?? []) deptNames.set(String(d.id), String(d.name));
    }

    const tiles = [];
    for (const g of groups.values()) {
      const counts = await staffHeadcountForScope(context, g);
      const open = await openVacancyCount(context, g);
      const selectedNotJoined = await countSelectedNotJoined(context, {
        locationId: g.locationId,
        departmentId: g.departmentId,
      });
      const metrics = computeQuotaMetrics({
        approvedHeadcount: g.approvedHeadcount,
        activeCount: counts.active,
        onLeaveCount: counts.onLeave,
        servingNoticeCount: counts.servingNotice,
        openVacanciesCount: open,
        selectedNotJoinedCount: selectedNotJoined,
      });
      tiles.push({
        key: g.key,
        locationId: g.locationId,
        locationName: g.locationId ? locNames.get(g.locationId) ?? null : null,
        departmentId: g.departmentId,
        departmentName: g.departmentId ? deptNames.get(g.departmentId) ?? null : null,
        designation: g.designation,
        employmentCategory: g.employmentCategory,
        ...metrics,
      });
    }

    tiles.sort((a, b) =>
      String(a.locationName ?? a.departmentName ?? "").localeCompare(
        String(b.locationName ?? b.departmentName ?? ""),
      ),
    );

    const shortage = tiles.reduce((n, t) => n + Math.min(0, t.excessShortage), 0);
    const excess = tiles.reduce((n, t) => n + Math.max(0, t.excessShortage), 0);
    const openVacancies = tiles.reduce((n, t) => n + t.openVacanciesCount, 0);

    return {
      groupBy: data.groupBy,
      asOf: today,
      summary: {
        openVacancies,
        quotaShortage: Math.abs(shortage),
        quotaExcess: excess,
      },
      tiles,
    };
  },
  { auth: { capability: "quota.view" } },
);

export const listQuotaEmployees = createAuthenticatedAction(
  z.object({
    locationId: uuidOpt,
    departmentId: uuidOpt,
    designation: z.string().max(120).nullable().optional(),
    employmentCategory: z.enum(HR_EMPLOYMENT_CATEGORIES).nullable().optional(),
    statusFilter: z.enum(["active", "on_leave", "serving_notice", "all"]).default("all"),
  }),
  async (data, context) => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
    const { staff } = await staffHeadcountForScope(context, {
      locationId: data.locationId,
      departmentId: data.departmentId,
      designation: data.designation,
      employmentCategory: data.employmentCategory,
    });

    let filtered = staff;
    if (data.statusFilter === "active") {
      filtered = staff.filter((s) => isActiveStaffStatus(s.status));
    } else if (data.statusFilter === "on_leave") {
      filtered = staff.filter((s) => isOnLeaveStaffStatus(s.status));
    } else if (data.statusFilter === "serving_notice") {
      filtered = staff.filter((s) => isServingNoticeStaffStatus(s.status));
    }

    const ids = filtered.map((s) => s.id);
    const docsByStaff = new Map<
      string,
      Array<{ docType: string; expiryDate?: string | null; filePath?: string | null }>
    >();
    if (ids.length) {
      const { data: docs, error } = await context.supabase
        .from("hr_employee_documents")
        .select("staff_id, doc_type, expiry_date, file_path")
        .in("staff_id", ids.slice(0, 500))
        .is("deleted_at", null);
      if (error && !tableMissing(error.message)) throw error;
      for (const d of docs ?? []) {
        const sid = String(d.staff_id);
        const list = docsByStaff.get(sid) ?? [];
        list.push({
          docType: String(d.doc_type),
          expiryDate: d.expiry_date ? String(d.expiry_date).slice(0, 10) : null,
          filePath: (d.file_path as string | null) ?? null,
        });
        docsByStaff.set(sid, list);
      }
    }

    const rows = buildQuotaEmployeeRows(
      filtered.map((s) => ({
        staffId: s.id,
        fullName: s.full_name,
        employmentCategory: s.employment_category ?? null,
        staffQid: s.qid,
        documents: docsByStaff.get(s.id) ?? [],
        asOfDate: today,
      })),
    );

    return rows.map((r, i) => ({
      ...r,
      status: filtered[i]?.status ?? null,
      jobTitle: filtered[i]?.job_title ?? null,
    }));
  },
  { auth: { capability: "quota.view" } },
);

// ---------------------------------------------------------------------------
// Job requests
// ---------------------------------------------------------------------------

function mapJobRequestRow(
  r: Record<string, unknown>,
  canViewSalary: boolean,
) {
  const loc = r.locations as { name: string } | null | undefined;
  const dept = r.master_departments as { name: string } | null | undefined;
  const base = {
    id: String(r.id),
    jobTitle: String(r.job_title),
    departmentId: (r.department_id as string | null) ?? null,
    departmentName: dept?.name ?? null,
    locationId: (r.location_id as string | null) ?? null,
    locationName: loc?.name ?? null,
    vacanciesCount: Number(r.vacancies_count),
    requestType: String(r.request_type),
    replacedStaffId: (r.replaced_staff_id as string | null) ?? null,
    employmentCategory: (r.employment_category as string | null) ?? null,
    jobDescription: (r.job_description as string | null) ?? null,
    skills: (r.skills as string | null) ?? null,
    experienceYears: r.experience_years != null ? Number(r.experience_years) : null,
    education: (r.education as string | null) ?? null,
    salaryBudgetQar: r.salary_budget_qar != null ? Number(r.salary_budget_qar) : null,
    requiresFinance: Boolean(r.requires_finance),
    requiredJoiningDate: r.required_joining_date
      ? String(r.required_joining_date).slice(0, 10)
      : null,
    justification: (r.justification as string | null) ?? null,
    priority: String(r.priority),
    attachments: Array.isArray(r.attachments) ? r.attachments : [],
    status: String(r.status) as HrJobRequestStatus,
    currentStepRole: (r.current_step_role as string | null) ?? null,
    exceedsQuota: Boolean(r.exceeds_quota),
    quotaOverrideStatus: String(r.quota_override_status) as HrQuotaOverrideStatus,
    returnReason: (r.return_reason as string | null) ?? null,
    rejectionReason: (r.rejection_reason as string | null) ?? null,
    requestedBy: (r.requested_by as string | null) ?? null,
    createdAt: String(r.created_at),
  };
  return maskJobRequestSalary(base, canViewSalary);
}

export const listJobRequests = createAuthenticatedAction(
  z.object({
    status: z.enum(HR_JOB_REQUEST_STATUSES).nullable().optional(),
    mineOnly: z.boolean().optional(),
    adminQueue: z.boolean().optional(),
  }),
  async (data, context) => {
    const manage = canUserDo(context.roles ?? [], "recruitment.manage");
    const canViewSalary = canUserDo(context.roles ?? [], "recruitment.view_salary_budget");
    let q = context.supabase
      .from("hr_job_requests")
      .select(
        "id, job_title, department_id, location_id, vacancies_count, request_type, replaced_staff_id, employment_category, job_description, skills, experience_years, education, salary_budget_qar, requires_finance, required_joining_date, justification, priority, attachments, status, current_step_role, exceeds_quota, quota_override_status, return_reason, rejection_reason, requested_by, created_at, locations(name), master_departments(name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    if (data.mineOnly || (!manage && !data.adminQueue)) {
      q = q.eq("requested_by", context.userId);
    }
    const { data: rows, error } = await q;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => mapJobRequestRow(r as Record<string, unknown>, canViewSalary));
  },
  { auth: { anyCapability: ["recruitment.request", "recruitment.manage"] } },
);

export const listJobRequestApprovals = createAuthenticatedAction(
  z.object({ jobRequestId: z.string().uuid() }),
  async (data, context) => {
    const { data: rows, error } = await context.supabase
      .from("hr_job_request_approvals")
      .select("id, job_request_id, step_order, step_role, status, acted_by, acted_at, comments")
      .eq("job_request_id", data.jobRequestId)
      .order("step_order");
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => ({
      id: String(r.id),
      jobRequestId: String(r.job_request_id),
      stepOrder: Number(r.step_order),
      stepRole: String(r.step_role) as HrJobApprovalRole,
      status: String(r.status),
      actedBy: (r.acted_by as string | null) ?? null,
      actedAt: (r.acted_at as string | null) ?? null,
      comments: (r.comments as string | null) ?? null,
    }));
  },
  { auth: { anyCapability: ["recruitment.request", "recruitment.manage"] } },
);

export const submitJobRequest = createAuthenticatedAction(
  z.object({
    jobTitle: z.string().min(2).max(200),
    departmentId: z.string().uuid().nullable().optional(),
    locationId: z.string().uuid().nullable().optional(),
    vacanciesCount: z.number().int().min(1).max(200).default(1),
    requestType: z.enum(HR_JOB_REQUEST_TYPES).default("new"),
    replacedStaffId: z.string().uuid().nullable().optional(),
    employmentCategory: z.enum(HR_EMPLOYMENT_CATEGORIES).nullable().optional(),
    jobDescription: z.string().max(8000).nullable().optional(),
    skills: z.string().max(2000).nullable().optional(),
    experienceYears: z.number().min(0).max(50).nullable().optional(),
    education: z.string().max(500).nullable().optional(),
    salaryBudgetQar: z.number().min(0).max(1_000_000).nullable().optional(),
    requiredJoiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    justification: z.string().max(2000).nullable().optional(),
    priority: z.enum(HR_JOB_PRIORITIES).default("normal"),
    acknowledgeQuotaWarning: z.boolean().optional(),
  }),
  async (data, context) => {
    const canViewSalary = canUserDo(context.roles ?? [], "recruitment.view_salary_budget");
    if (data.salaryBudgetQar != null && !canViewSalary) {
      throw new ForbiddenError("Salary budget requires recruitment.view_salary_budget.");
    }

    const quotas = await loadQuotaLookup(context);
    const occupied = await staffHeadcountForScope(context, {
      locationId: data.locationId,
      departmentId: data.departmentId,
      designation: data.jobTitle,
      employmentCategory: data.employmentCategory,
    });
    const open = await openVacancyCount(context, {
      locationId: data.locationId,
      departmentId: data.departmentId,
    });
    const evalResult = evaluateJobRequestAgainstQuota({
      request: {
        locationId: data.locationId,
        departmentId: data.departmentId,
        designation: data.jobTitle,
        employmentCategory: data.employmentCategory,
        vacanciesCount: data.vacanciesCount,
      },
      quotas,
      occupiedCount: occupied.active + occupied.onLeave + occupied.servingNotice,
      openVacanciesCount: open,
    });

    if (evalResult.exceeds && !data.acknowledgeQuotaWarning) {
      return {
        id: null as string | null,
        exceedsQuota: true,
        warning: evalResult.warning,
        requiresAck: true as const,
      };
    }

    assertQuotaOverrideAllowed({
      exceedsQuota: evalResult.exceeds,
      overrideStatus: "none",
      actorHasOverrideCapability: canUserDo(context.roles ?? [], "quota.override_approve"),
      action: "submit",
    });

    const requiresFinance = requiresFinanceForBudget(data.salaryBudgetQar);
    const { data: row, error } = await context.supabase
      .from("hr_job_requests")
      .insert({
        job_title: data.jobTitle.trim(),
        department_id: data.departmentId ?? null,
        location_id: data.locationId ?? null,
        vacancies_count: data.vacanciesCount,
        request_type: data.requestType,
        replaced_staff_id: data.replacedStaffId ?? null,
        employment_category: data.employmentCategory ?? null,
        job_description: data.jobDescription ?? null,
        skills: data.skills ?? null,
        experience_years: data.experienceYears ?? null,
        education: data.education ?? null,
        salary_budget_qar: data.salaryBudgetQar ?? null,
        requires_finance: requiresFinance,
        required_joining_date: data.requiredJoiningDate ?? null,
        justification: data.justification ?? null,
        priority: data.priority,
        status: "pending",
        exceeds_quota: evalResult.exceeds,
        quota_override_status: evalResult.exceeds ? "pending" : "none",
        requested_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    await seedJobApprovalSteps(context, String(row.id), requiresFinance);

    return {
      id: String(row.id),
      exceedsQuota: evalResult.exceeds,
      warning: evalResult.warning,
      requiresAck: false as const,
    };
  },
  { auth: { capability: "recruitment.request" } },
);

export const actOnJobRequestStep = createAuthenticatedAction(
  z.object({
    jobRequestId: z.string().uuid(),
    action: z.enum(["approved", "rejected", "returned"]),
    comments: z.string().max(1000).nullable().optional(),
  }),
  async (data, context) => {
    const { data: existing, error: readErr } = await context.supabase
      .from("hr_job_requests")
      .select(
        "id, status, current_step_role, exceeds_quota, quota_override_status, requires_finance",
      )
      .eq("id", data.jobRequestId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) throw new Error("Job request not found.");
    if (existing.status !== "pending") throw new Error("Job request is not pending approval.");

    if (data.action === "returned") {
      if (!canUserDo(context.roles ?? [], "recruitment.manage")) {
        throw new ForbiddenError("Only recruitment managers can return for correction.");
      }
      const { error } = await context.supabase
        .from("hr_job_requests")
        .update({
          status: "returned",
          return_reason: data.comments ?? null,
          current_step_role: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.jobRequestId);
      if (error) throw error;
      return { status: "returned" as const };
    }

    const { data: steps, error: stepErr } = await context.supabase
      .from("hr_job_request_approvals")
      .select("id, step_order, step_role, status")
      .eq("job_request_id", data.jobRequestId)
      .order("step_order");
    if (stepErr && !tableMissing(stepErr.message)) throw stepErr;

    const pending = (steps ?? []).find((s) => s.status === "pending");
    if (!pending) throw new Error("No pending approval step.");
    const stepRole = String(pending.step_role) as HrJobApprovalRole;
    if (!canActOnStep(context.roles ?? [], stepRole)) {
      throw new ForbiddenError(`You cannot act on the ${stepRole} step.`);
    }

    if (data.action === "approved") {
      assertQuotaOverrideAllowed({
        exceedsQuota: Boolean(existing.exceeds_quota),
        overrideStatus: String(existing.quota_override_status) as HrQuotaOverrideStatus,
        actorHasOverrideCapability: canUserDo(context.roles ?? [], "quota.override_approve"),
        action: "approve_step",
      });
    }

    const now = new Date().toISOString();
    const { error: updStepErr } = await context.supabase
      .from("hr_job_request_approvals")
      .update({
        status: data.action === "approved" ? "approved" : "rejected",
        acted_by: context.userId,
        acted_at: now,
        comments: data.comments ?? null,
      })
      .eq("id", pending.id);
    if (updStepErr) throw updStepErr;

    if (data.action === "rejected") {
      const { error } = await context.supabase
        .from("hr_job_requests")
        .update({
          status: "rejected",
          rejection_reason: data.comments ?? null,
          current_step_role: null,
          updated_at: now,
        })
        .eq("id", data.jobRequestId);
      if (error) throw error;
      try {
        const { findUsersWithCapability, notifyUsers } = await import("@/lib/notifications/action-notify");
        const ids = await findUsersWithCapability("recruitment.manage");
        if (existing.requested_by) ids.push(String(existing.requested_by));
        await notifyUsers({
          userIds: ids,
          excludeUserId: context.userId,
          category: "hr_recruitment",
          title: "Job request rejected",
          body: `${String(existing.job_title ?? "Job request")} was rejected.`,
          severity: "warning",
          actionUrl: "/people/recruitment/jobs/admin",
          sourceType: "hr_job_requests",
          sourceId: data.jobRequestId,
        });
      } catch {
        /* non-blocking */
      }
      return { status: "rejected" as const };
    }

    const remaining = (steps ?? []).filter(
      (s) => s.id !== pending.id && s.status === "pending",
    );
    if (!remaining.length) {
      const { error } = await context.supabase
        .from("hr_job_requests")
        .update({
          status: "approved",
          current_step_role: null,
          updated_at: now,
        })
        .eq("id", data.jobRequestId);
      if (error) throw error;
      try {
        const { findUsersWithCapability, notifyUsers } = await import("@/lib/notifications/action-notify");
        const ids = await findUsersWithCapability("recruitment.manage");
        await notifyUsers({
          userIds: ids,
          excludeUserId: context.userId,
          category: "hr_recruitment",
          title: "Job request approved",
          body: `${String(existing.job_title ?? "Job request")} is fully approved.`,
          severity: "info",
          actionUrl: "/people/recruitment/jobs/admin",
          sourceType: "hr_job_requests",
          sourceId: data.jobRequestId,
        });
      } catch {
        /* non-blocking */
      }
      return { status: "approved" as const };
    }

    const next = remaining.sort((a, b) => Number(a.step_order) - Number(b.step_order))[0]!;
    const { error } = await context.supabase
      .from("hr_job_requests")
      .update({
        current_step_role: String(next.step_role),
        updated_at: now,
      })
      .eq("id", data.jobRequestId);
    if (error) throw error;
    return { status: "pending" as const, currentStepRole: String(next.step_role) };
  },
  { auth: { anyCapability: ["recruitment.request", "recruitment.manage", "quota.override_approve"] } },
);

export const grantQuotaOverride = createAuthenticatedAction(
  z.object({
    jobRequestId: z.string().uuid(),
    reason: z.string().min(3).max(1000),
  }),
  async (data, context) => {
    assertQuotaOverrideAllowed({
      exceedsQuota: true,
      overrideStatus: "pending",
      actorHasOverrideCapability: canUserDo(context.roles ?? [], "quota.override_approve"),
      action: "grant_override",
    });
    const { data: existing, error: readErr } = await context.supabase
      .from("hr_job_requests")
      .select("id, exceeds_quota, status")
      .eq("id", data.jobRequestId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) throw new Error("Job request not found.");
    if (!existing.exceeds_quota) throw new Error("Job request does not exceed quota.");

    const { error } = await context.supabase
      .from("hr_job_requests")
      .update({
        quota_override_status: "approved",
        quota_override_by: context.userId,
        quota_override_at: new Date().toISOString(),
        quota_override_reason: data.reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.jobRequestId);
    if (error) throw error;
    return { ok: true as const };
  },
  { auth: { capability: "quota.override_approve" } },
);

// ---------------------------------------------------------------------------
// Admin vacancy portal
// ---------------------------------------------------------------------------

export const publishVacancyFromJobRequest = createAuthenticatedAction(
  z.object({
    jobRequestId: z.string().uuid(),
    recruiterUserId: z.string().uuid().nullable().optional(),
  }),
  async (data, context) => {
    const { data: jr, error } = await context.supabase
      .from("hr_job_requests")
      .select(
        "id, job_title, department_id, location_id, vacancies_count, employment_category, status, exceeds_quota, quota_override_status",
      )
      .eq("id", data.jobRequestId)
      .maybeSingle();
    if (error) throw error;
    if (!jr) throw new Error("Job request not found.");

    assertCanPublishVacancy({
      jobRequestStatus: String(jr.status) as HrJobRequestStatus,
      exceedsQuota: Boolean(jr.exceeds_quota),
      overrideStatus: String(jr.quota_override_status) as HrQuotaOverrideStatus,
    });

    const now = new Date().toISOString();
    const { data: vac, error: vacErr } = await context.supabase
      .from("hr_vacancies")
      .insert({
        job_request_id: jr.id,
        job_title: jr.job_title,
        department_id: jr.department_id,
        location_id: jr.location_id,
        vacancies_count: jr.vacancies_count,
        employment_category: jr.employment_category,
        status: "open",
        recruiter_user_id: data.recruiterUserId ?? null,
        published_at: now,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (vacErr) throw vacErr;

    await context.supabase
      .from("hr_job_requests")
      .update({ status: "published", updated_at: now })
      .eq("id", jr.id);

    return { vacancyId: String(vac.id) };
  },
  { auth: { capability: "recruitment.manage" } },
);

export const updateVacancyStatus = createAuthenticatedAction(
  z.object({
    vacancyId: z.string().uuid(),
    status: z.enum(["on_hold", "closed", "cancelled", "open"]),
    reason: z.string().max(1000).nullable().optional(),
    recruiterUserId: z.string().uuid().nullable().optional(),
  }),
  async (data, context) => {
    if (!HR_VACANCY_STATUSES.includes(data.status as never) && data.status !== "open") {
      throw new Error("Invalid vacancy status.");
    }
    const patch: Record<string, unknown> = {
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    if (data.recruiterUserId !== undefined) patch.recruiter_user_id = data.recruiterUserId;
    if (data.status === "on_hold") patch.hold_reason = data.reason ?? null;
    if (data.status === "closed" || data.status === "cancelled") {
      patch.close_reason = data.reason ?? null;
      patch.closed_at = new Date().toISOString();
    }
    const { error } = await context.supabase.from("hr_vacancies").update(patch).eq("id", data.vacancyId);
    if (error) throw error;
    return { ok: true as const };
  },
  { auth: { capability: "recruitment.manage" } },
);

export const listVacancies = createAuthenticatedAction(
  z.object({
    status: z.enum(HR_VACANCY_STATUSES).nullable().optional(),
  }),
  async (data, context) => {
    let q = context.supabase
      .from("hr_vacancies")
      .select(
        "id, job_request_id, job_title, department_id, location_id, vacancies_count, employment_category, status, recruiter_user_id, published_at, hold_reason, close_reason, created_at, locations(name), master_departments(name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => {
      const loc = r.locations as { name: string } | null;
      const dept = r.master_departments as { name: string } | null;
      return {
        id: String(r.id),
        jobRequestId: (r.job_request_id as string | null) ?? null,
        jobTitle: String(r.job_title),
        departmentId: (r.department_id as string | null) ?? null,
        departmentName: dept?.name ?? null,
        locationId: (r.location_id as string | null) ?? null,
        locationName: loc?.name ?? null,
        vacanciesCount: Number(r.vacancies_count),
        employmentCategory: (r.employment_category as string | null) ?? null,
        status: String(r.status),
        recruiterUserId: (r.recruiter_user_id as string | null) ?? null,
        publishedAt: (r.published_at as string | null) ?? null,
        holdReason: (r.hold_reason as string | null) ?? null,
        closeReason: (r.close_reason as string | null) ?? null,
        createdAt: String(r.created_at),
      };
    });
  },
  { auth: { anyCapability: ["recruitment.manage", "recruitment.request", "quota.view"] } },
);

// silence unused enum import used for zod only in some builds
void HR_JOB_APPROVAL_ROLES;
