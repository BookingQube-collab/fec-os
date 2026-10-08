"use server";

import { z } from "zod";

import {
  EXIT_CAUSES,
  JOURNEY_KINDS,
  JOURNEY_SECTIONS,
  OWNER_ROLES,
  TASK_STATUSES,
  addDays,
  allowanceAmount,
  asRole,
  asSection,
  journeyGates,
  monthlyTotal,
  readAllowances,
  todayInQatar,
  type JourneyAck,
  type JourneyKind,
  type JourneyTask,
  type ReviewStatus,
  type SalaryPackage,
  type TaskStatus,
  type TrainingStatus,
} from "@/lib/hr-journeys";
import type { AuthContext } from "@/lib/server/auth";
import { createAuthenticatedAction } from "@/lib/server/create-action";
import { isJokerStaff } from "@/lib/staff-status";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reasonText = z.string().trim().min(3).max(500);
const money = z.number().min(0).max(1_000_000);

function fail(code: string): never {
  throw new Error(`journey:${code}`);
}

function migrationNeeded(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|Could not find the/i.test(message));
}

function throwDb(error: { message: string } | null | undefined): void {
  if (!error) return;
  if (migrationNeeded(error.message)) fail("migration_required");
  throw new Error(error.message);
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function textOrNull(value: unknown): string | null {
  const trimmed = text(value).trim();
  return trimmed ? trimmed : null;
}

function flag(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function actor(context: AuthContext): Promise<{ userId: string; staffId: string | null; name: string }> {
  const { data, error } = await context.supabase
    .from("staff")
    .select("id, full_name")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  throwDb(error);
  return {
    userId: context.userId,
    staffId: data?.id ? String(data.id) : null,
    name: textOrNull(data?.full_name) ?? "HR",
  };
}

async function staffNameMap(context: AuthContext, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (!unique.length) return names;
  const { data, error } = await context.supabase.from("staff").select("id, full_name").in("id", unique);
  throwDb(error);
  for (const row of data ?? []) names.set(String(row.id), text(row.full_name));
  return names;
}

async function recordEvent(
  context: AuthContext,
  checklistId: string,
  eventType: string,
  who: { userId: string; name: string },
  reason: string | null,
) {
  const { error } = await context.supabase.from("hr_journey_events").insert({
    checklist_id: checklistId,
    event_type: eventType,
    actor_user_id: who.userId,
    actor_name: who.name,
    reason,
  });
  throwDb(error);
}

function mapTask(row: Record<string, unknown>): JourneyTask {
  const review = text(row.review_status);
  const status = text(row.status);
  return {
    id: text(row.id),
    title: text(row.title),
    section: asSection(row.section),
    required: flag(row.required, true),
    status: (TASK_STATUSES as readonly string[]).includes(status) ? (status as TaskStatus) : "pending",
    ownerRole: asRole(row.owner_role),
    ownerStaffId: textOrNull(row.owner_staff_id),
    dueOn: textOrNull(row.due_on),
    evidence: textOrNull(row.evidence_note),
    needsReview: flag(row.needs_review),
    reviewStatus: review === "awaiting" || review === "cleared" ? (review as ReviewStatus) : "not_required",
    reviewerStaffId: textOrNull(row.reviewer_staff_id),
  };
}

type CaseTask = JourneyTask & { ownerName: string | null };
type CaseTraining = {
  id: string;
  title: string;
  required: boolean;
  status: TrainingStatus;
  dueOn: string | null;
  courseId: string | null;
  enrollmentStatus: string | null;
};

async function loadCase(context: AuthContext, id: string, today: string) {
  const { data, error } = await context.supabase
    .from("hr_staff_checklists")
    .select(
      "id, staff_id, kind, status, started_at, completed_at, reference_code, anchor_date, template_title, role_title, department_name, owner_staff_id, manager_staff_id, exit_cause, notice_days, reason_note, payroll_reviewed_at, eligibility_checked_at, staff!hr_staff_checklists_staff_id_fkey(full_name, employee_code), hr_staff_checklist_items(id, title, status, sort_order, section, required, owner_role, owner_staff_id, due_on, evidence_note, needs_review, review_status, reviewer_staff_id)",
    )
    .eq("id", id)
    .maybeSingle();
  throwDb(error);
  if (!data) fail("not_found");

  const row = data as Record<string, unknown>;
  const staff = one(row.staff as { full_name?: string; employee_code?: string } | { full_name?: string; employee_code?: string }[] | null);
  const rawItems = Array.isArray(row.hr_staff_checklist_items) ? (row.hr_staff_checklist_items as Record<string, unknown>[]) : [];
  const tasks = rawItems
    .slice()
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((item) => mapTask(item));
  const staffId = text(row.staff_id);

  const [acksRes, trainingRes, historyRes, compRes, docsRes, eventsRes, coursesRes, enrollRes] = await Promise.all([
    context.supabase.from("hr_journey_acknowledgments").select("id, title, required, status, sort_order").eq("checklist_id", id).order("sort_order"),
    context.supabase.from("hr_journey_training").select("id, title, required, status, due_on, course_id, sort_order").eq("checklist_id", id).order("sort_order"),
    context.supabase
      .from("staff_salary_history")
      .select("id, effective_on, created_at, basic_qar, allowances, monthly_total_qar, currency, reason")
      .eq("staff_id", staffId)
      .order("effective_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12),
    context.supabase.from("staff_compensation").select("monthly_salary_qar, currency, updated_at").eq("staff_id", staffId).maybeSingle(),
    context.supabase.from("hr_employee_documents").select("id, title, doc_type, expiry_date, deleted_at").eq("staff_id", staffId).is("deleted_at", null),
    context.supabase.from("hr_journey_events").select("id, event_type, actor_name, reason, created_at").eq("checklist_id", id).order("created_at", { ascending: false }).limit(40),
    context.supabase.from("training_courses").select("id, title, published_version_id, status").eq("status", "PUBLISHED").not("published_version_id", "is", null).order("title").limit(40),
    context.supabase.from("training_course_enrollments").select("course_id, status").eq("staff_id", staffId),
  ]);
  throwDb(acksRes.error);
  throwDb(trainingRes.error);
  throwDb(eventsRes.error);
  if (historyRes.error && !migrationNeeded(historyRes.error.message)) throw new Error(historyRes.error.message);
  if (compRes.error && !migrationNeeded(compRes.error.message)) throw new Error(compRes.error.message);
  if (docsRes.error && !migrationNeeded(docsRes.error.message)) throw new Error(docsRes.error.message);

  const enrollmentByCourse = new Map<string, string>();
  if (!enrollRes.error) {
    for (const enrollment of enrollRes.data ?? []) {
      const courseId = text(enrollment.course_id);
      const status = text(enrollment.status).toUpperCase();
      const current = enrollmentByCourse.get(courseId);
      const rank = (value: string) => (value === "COMPLETED" || value === "WAIVED" ? 2 : value === "IN_PROGRESS" ? 1 : 0);
      if (!current || rank(status) > rank(current)) enrollmentByCourse.set(courseId, status);
    }
  }

  const packages: SalaryPackage[] = (historyRes.data ?? []).map((entry) => {
    const allowances = readAllowances(entry.allowances);
    const basicQar = allowanceAmount(entry.basic_qar);
    const storedTotal = allowanceAmount(entry.monthly_total_qar);
    return {
      id: text(entry.id),
      effectiveOn: text(entry.effective_on).slice(0, 10),
      createdAt: text(entry.created_at),
      basicQar,
      ...allowances,
      monthlyTotalQar: storedTotal || monthlyTotal({ basicQar, ...allowances }),
      currency: text(entry.currency) || "QAR",
      reason: textOrNull(entry.reason),
      source: "history" as const,
    };
  });
  if (!packages.length && compRes.data && allowanceAmount(compRes.data.monthly_salary_qar) > 0) {
    const basicQar = allowanceAmount(compRes.data.monthly_salary_qar);
    packages.push({
      id: "compensation",
      effectiveOn: text(compRes.data.updated_at).slice(0, 10) || today,
      createdAt: text(compRes.data.updated_at) || today,
      basicQar,
      housingQar: 0,
      transportationQar: 0,
      foodQar: 0,
      otherQar: 0,
      monthlyTotalQar: basicQar,
      currency: text(compRes.data.currency) || "QAR",
      reason: null,
      source: "compensation",
    });
  }

  const names = await staffNameMap(context, [textOrNull(row.owner_staff_id), textOrNull(row.manager_staff_id), ...tasks.map((task) => task.ownerStaffId)]);
  const kind: JourneyKind = text(row.kind) === "offboarding" ? "offboarding" : "onboarding";
  const acknowledgments: JourneyAck[] = (acksRes.data ?? []).map((ack) => ({
    id: text(ack.id),
    title: text(ack.title),
    required: flag(ack.required, true),
    status: text(ack.status) === "acknowledged" ? "acknowledged" : "pending",
  }));
  const training: CaseTraining[] = (trainingRes.data ?? []).map((entry) => ({
    id: text(entry.id),
    title: text(entry.title),
    required: flag(entry.required, true),
    status: (text(entry.status) === "completed" || text(entry.status) === "waived" ? text(entry.status) : "assigned") as TrainingStatus,
    dueOn: textOrNull(entry.due_on),
    courseId: textOrNull(entry.course_id),
    enrollmentStatus: textOrNull(entry.course_id) ? (enrollmentByCourse.get(text(entry.course_id)) ?? null) : null,
  }));
  const caseTasks: CaseTask[] = tasks.map((task) => ({
    ...task,
    ownerName: task.ownerStaffId ? (names.get(task.ownerStaffId) ?? null) : null,
  }));

  return {
    id: text(row.id),
    referenceCode: textOrNull(row.reference_code),
    kind,
    status: text(row.status),
    staffId,
    staffName: text(staff?.full_name),
    employeeCode: textOrNull(staff?.employee_code),
    templateTitle: textOrNull(row.template_title),
    anchorDate: textOrNull(row.anchor_date),
    roleTitle: textOrNull(row.role_title),
    departmentName: textOrNull(row.department_name),
    managerName: names.get(text(row.manager_staff_id)) ?? null,
    ownerName: names.get(text(row.owner_staff_id)) ?? null,
    exitCause: textOrNull(row.exit_cause),
    noticeDays: row.notice_days == null ? null : Number(row.notice_days),
    reasonNote: textOrNull(row.reason_note),
    startedAt: text(row.started_at),
    completedAt: textOrNull(row.completed_at),
    payrollReviewedAt: textOrNull(row.payroll_reviewed_at),
    eligibilityCheckedAt: textOrNull(row.eligibility_checked_at),
    tasks: caseTasks,
    acknowledgments,
    training,
    packages,
    expiredDocuments: (docsRes.data ?? [])
      .filter((doc) => textOrNull(doc.expiry_date) && text(doc.expiry_date).slice(0, 10) < today)
      .map((doc) => ({
        id: text(doc.id),
        title: textOrNull(doc.title) ?? text(doc.doc_type),
        docType: text(doc.doc_type),
        expiryDate: text(doc.expiry_date).slice(0, 10),
      })),
    courses: coursesRes.error
      ? []
      : (coursesRes.data ?? [])
          .filter((course) => course.published_version_id)
          .map((course) => ({ id: text(course.id), title: text(course.title), versionId: text(course.published_version_id) })),
    events: (eventsRes.data ?? []).map((event) => ({
      id: text(event.id),
      type: text(event.event_type),
      actorName: textOrNull(event.actor_name) ?? "HR",
      reason: textOrNull(event.reason),
      at: text(event.created_at),
    })),
  };
}

function presentCase(loaded: Awaited<ReturnType<typeof loadCase>>, today: string) {
  const progress = journeyGates({
    tasks: loaded.tasks,
    acknowledgments: loaded.acknowledgments,
    training: loaded.training,
    packages: loaded.packages,
    payrollReviewedAt: loaded.payrollReviewedAt,
    expiredDocuments: loaded.expiredDocuments,
  });
  return {
    ...loaded,
    tasks: loaded.tasks.map((task) => ({
      ...task,
      displayStatus:
        task.status === "pending" && task.dueOn && task.dueOn < today
          ? "overdue"
          : task.status === "skipped"
            ? "waived"
            : task.status === "done" && task.needsReview && task.reviewStatus !== "cleared"
              ? "review_due"
              : task.status === "done"
                ? "completed"
                : "awaiting",
    })),
    gates: progress.gates,
    canComplete: loaded.status === "open" && progress.canComplete,
    requiredDone: progress.requiredDone,
    requiredTotal: progress.requiredTotal,
    percent: progress.percent,
    today,
  };
}

async function requireOpen(context: AuthContext, id: string) {
  const { data, error } = await context.supabase.from("hr_staff_checklists").select("id, status, staff_id, kind").eq("id", id).maybeSingle();
  throwDb(error);
  if (!data) fail("not_found");
  if (text(data.status) !== "open") fail("closed");
  return data;
}

export const listJourneyHub = createAuthenticatedAction(
  z
    .object({
      kind: z.enum(["onboarding", "offboarding", "all"]).optional(),
      status: z.enum(["open", "completed", "cancelled", "all"]).optional(),
      queue: z.enum(["mine", "open"]).optional(),
    })
    .strict(),
  async (input, context) => {
    const today = todayInQatar();
    const who = await actor(context);
    let journeysQuery = context.supabase
      .from("hr_staff_checklists")
      .select(
        "id, staff_id, kind, status, started_at, reference_code, anchor_date, template_title, role_title, department_name, exit_cause, owner_staff_id, manager_staff_id, staff!hr_staff_checklists_staff_id_fkey(full_name, employee_code), hr_staff_checklist_items(id, title, status, required, due_on, owner_staff_id, owner_role, section)",
      )
      .order("started_at", { ascending: false })
      .limit(80);
    if (input.kind && input.kind !== "all") journeysQuery = journeysQuery.eq("kind", input.kind);
    if (input.status && input.status !== "all") journeysQuery = journeysQuery.eq("status", input.status);

    const [journeysRes, templatesRes, rulesRes, staffRes, tasksRes] = await Promise.all([
      journeysQuery,
      context.supabase
        .from("hr_checklist_templates")
        .select(
          "id, kind, title, description, active, sort_order, hr_checklist_template_items(id, title, sort_order, section, required, owner_role, due_offset_days, needs_review)",
        )
        .order("sort_order", { ascending: false }),
      context.supabase.from("hr_approval_rules").select("id, kind, title, approver_role, required, active, sort_order").order("sort_order"),
      context.supabase
        .from("staff")
        .select(
          "id, full_name, employee_code, job_title, hire_date, status, employment_type, department, staff_profile_ext!staff_profile_ext_staff_id_fkey(reporting_manager_staff_id), staff_departments(master_departments(name))",
        )
        .is("deleted_at", null)
        .order("full_name")
        .limit(2000),
      context.supabase
        .from("hr_staff_checklist_items")
        .select(
          "id, title, status, due_on, owner_staff_id, owner_role, required, checklist_id, hr_staff_checklists!inner(id, kind, status, reference_code, staff_id, staff!hr_staff_checklists_staff_id_fkey(full_name))",
        )
        .eq("status", "pending")
        .limit(200),
    ]);
    throwDb(journeysRes.error);
    throwDb(templatesRes.error);
    throwDb(rulesRes.error);
    throwDb(staffRes.error);
    throwDb(tasksRes.error);

    const nameById = new Map<string, string>();
    for (const row of staffRes.data ?? []) {
      const id = text(row.id);
      const name = text(row.full_name).trim();
      if (id && name) nameById.set(id, name);
    }

    const journeys = (journeysRes.data ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      const person = one(record.staff as { full_name?: string; employee_code?: string } | Array<{ full_name?: string; employee_code?: string }> | null);
      const items = Array.isArray(record.hr_staff_checklist_items) ? (record.hr_staff_checklist_items as Record<string, unknown>[]) : [];
      const required = items.filter((item) => flag(item.required, true));
      const requiredDone = required.filter((item) => text(item.status) === "done").length;
      const staffId = text(record.staff_id);
      const managerStaffId = textOrNull(record.manager_staff_id);
      const ownerStaffId = textOrNull(record.owner_staff_id);
      return {
        id: text(record.id),
        staffName: text(person?.full_name).trim() || nameById.get(staffId) || "",
        employeeCode: textOrNull(person?.employee_code),
        kind: text(record.kind) === "offboarding" ? ("offboarding" as const) : ("onboarding" as const),
        status: text(record.status),
        referenceCode: textOrNull(record.reference_code),
        anchorDate: textOrNull(record.anchor_date),
        templateTitle: textOrNull(record.template_title),
        roleTitle: textOrNull(record.role_title),
        departmentName: textOrNull(record.department_name),
        managerName: managerStaffId ? (nameById.get(managerStaffId) ?? null) : null,
        ownerName: ownerStaffId ? (nameById.get(ownerStaffId) ?? null) : null,
        exitCause: textOrNull(record.exit_cause),
        startedAt: text(record.started_at),
        requiredDone,
        requiredTotal: required.length,
        percent: required.length === 0 ? 0 : Math.round((requiredDone / required.length) * 100),
      };
    });

    const queue = input.queue ?? "mine";
    const tasks = (tasksRes.data ?? [])
      .map((row) => {
        const record = row as Record<string, unknown>;
        const journey = one(record.hr_staff_checklists as Record<string, unknown> | Record<string, unknown>[] | null);
        const person = one(journey?.staff as { full_name?: string } | Array<{ full_name?: string }> | null);
        const dueOn = textOrNull(record.due_on);
        return {
          id: text(record.id),
          checklistId: text(record.checklist_id),
          title: text(record.title),
          ownerStaffId: textOrNull(record.owner_staff_id),
          ownerName: textOrNull(record.owner_staff_id) ? (nameById.get(text(record.owner_staff_id)) ?? null) : null,
          ownerRole: asRole(record.owner_role),
          dueOn,
          overdue: Boolean(dueOn && dueOn < today),
          staffName: text(person?.full_name).trim() || nameById.get(text(journey?.staff_id)) || "",
          kind: text(journey?.kind) === "offboarding" ? ("offboarding" as const) : ("onboarding" as const),
          referenceCode: textOrNull(journey?.reference_code),
          journeyStatus: text(journey?.status),
        };
      })
      .filter((task) => task.journeyStatus === "open")
      .filter((task) => (queue === "mine" ? Boolean(who.staffId) && task.ownerStaffId === who.staffId : true));

    const people = (staffRes.data ?? [])
      .filter((person) => !isJokerStaff({ status: text(person.status), employment_type: textOrNull(person.employment_type) }))
      .map((person) => {
        const record = person as Record<string, unknown>;
        const ext = one(
          record.staff_profile_ext as
            | { reporting_manager_staff_id?: string | null }
            | Array<{ reporting_manager_staff_id?: string | null }>
            | null,
        );
        const firstDepartment = one(
          record.staff_departments as
            | { master_departments?: { name?: string } | Array<{ name?: string }> }
            | Array<{ master_departments?: { name?: string } | Array<{ name?: string }> }>
            | null,
        );
        const master = one(firstDepartment?.master_departments ?? null);
        return {
          id: text(record.id),
          name: text(record.full_name).trim(),
          employeeCode: textOrNull(record.employee_code),
          jobTitle: textOrNull(record.job_title),
          hireDate: textOrNull(record.hire_date)?.slice(0, 10) ?? null,
          department: textOrNull(master?.name) ?? textOrNull(record.department),
          managerStaffId: textOrNull(ext?.reporting_manager_staff_id),
        };
      });

    return {
      today,
      currentStaffId: who.staffId,
      currentStaffName: who.staffId ? who.name : null,
      journeys,
      tasks,
      people,
      templates: (templatesRes.data ?? []).map((template) => {
        const record = template as Record<string, unknown>;
        const items = Array.isArray(record.hr_checklist_template_items) ? (record.hr_checklist_template_items as Record<string, unknown>[]) : [];
        return {
          id: text(record.id),
          kind: text(record.kind) === "offboarding" ? ("offboarding" as const) : ("onboarding" as const),
          title: text(record.title),
          description: textOrNull(record.description),
          active: flag(record.active, true),
          items: items
            .slice()
            .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
            .map((item) => ({
              id: text(item.id),
              title: text(item.title),
              section: asSection(item.section),
              required: flag(item.required, true),
              ownerRole: asRole(item.owner_role),
              dueOffsetDays: Number(item.due_offset_days ?? 0),
              needsReview: flag(item.needs_review),
            })),
        };
      }),
      rules: (rulesRes.data ?? []).map((rule) => ({
        id: text(rule.id),
        kind: text(rule.kind) === "offboarding" ? ("offboarding" as const) : ("onboarding" as const),
        title: text(rule.title),
        approverRole: asRole(rule.approver_role),
        required: flag(rule.required, true),
        active: flag(rule.active, true),
      })),
    };
  },
  { auth: { capability: "hr.manage" } },
);

export const getJourneyCase = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }).strict(),
  async ({ id }, context) => {
    const today = todayInQatar();
    return presentCase(await loadCase(context, id, today), today);
  },
  { auth: { capability: "hr.manage" } },
);

export const startJourney = createAuthenticatedAction(
  z
    .object({
      staffId: z.string().uuid(),
      templateId: z.string().uuid(),
      ownerStaffId: z.string().uuid(),
      managerStaffId: z.string().uuid(),
      anchorDate: isoDate,
      roleTitle: z.string().trim().max(120).optional().nullable(),
      departmentName: z.string().trim().max(120).optional().nullable(),
      exitCause: z.enum(EXIT_CAUSES).optional().nullable(),
      noticeDays: z.number().int().min(0).max(365).optional().nullable(),
      reasonNote: z.string().trim().max(500).optional().nullable(),
    })
    .strict(),
  async (input, context) => {
    const who = await actor(context);
    const { data: template, error: templateError } = await context.supabase
      .from("hr_checklist_templates")
      .select(
        "id, kind, title, active, hr_checklist_template_items(title, sort_order, section, required, owner_role, due_offset_days, needs_review), hr_checklist_template_acks(title, required, sort_order), hr_checklist_template_training(title, required, due_offset_days, sort_order)",
      )
      .eq("id", input.templateId)
      .maybeSingle();
    throwDb(templateError);
    if (!template || template.active === false) fail("template_inactive");
    const kind: JourneyKind = text(template.kind) === "offboarding" ? "offboarding" : "onboarding";
    if (kind === "offboarding") {
      if (!input.exitCause) fail("exit_cause_required");
      if (!input.reasonNote || input.reasonNote.trim().length < 3) fail("reason_required");
    }
    if (input.managerStaffId === input.staffId) fail("manager_is_employee");

    const { data: created, error } = await context.supabase
      .from("hr_staff_checklists")
      .insert({
        staff_id: input.staffId,
        template_id: template.id,
        kind,
        status: "open",
        created_by: context.userId,
        anchor_date: input.anchorDate,
        owner_staff_id: input.ownerStaffId,
        manager_staff_id: input.managerStaffId,
        role_title: textOrNull(input.roleTitle),
        department_name: textOrNull(input.departmentName),
        exit_cause: kind === "offboarding" ? input.exitCause : null,
        notice_days: kind === "offboarding" ? (input.noticeDays ?? null) : null,
        reason_note: textOrNull(input.reasonNote),
        template_title: text(template.title),
      })
      .select("id, reference_code")
      .single();
    throwDb(error);
    if (!created) fail("not_found");

    const templateItems = Array.isArray(template.hr_checklist_template_items)
      ? (template.hr_checklist_template_items as Record<string, unknown>[])
      : [];
    if (templateItems.length) {
      const { error: itemError } = await context.supabase.from("hr_staff_checklist_items").insert(
        templateItems.map((item) => {
          const role = asRole(item.owner_role);
          const ownerStaffId = role === "manager" ? input.managerStaffId : role === "employee" ? input.staffId : input.ownerStaffId;
          return {
            checklist_id: created.id,
            title: text(item.title),
            sort_order: Number(item.sort_order ?? 0),
            status: "pending",
            section: asSection(item.section),
            required: flag(item.required, true),
            owner_role: role,
            owner_staff_id: ownerStaffId,
            due_on: addDays(input.anchorDate, Number(item.due_offset_days ?? 0)),
            needs_review: flag(item.needs_review),
            review_status: "not_required",
          };
        }),
      );
      throwDb(itemError);
    }

    const acks = Array.isArray(template.hr_checklist_template_acks) ? (template.hr_checklist_template_acks as Record<string, unknown>[]) : [];
    if (acks.length) {
      const { error: ackError } = await context.supabase.from("hr_journey_acknowledgments").insert(
        acks.map((ack) => ({
          checklist_id: created.id,
          title: text(ack.title),
          required: flag(ack.required, true),
          status: "pending",
          sort_order: Number(ack.sort_order ?? 0),
        })),
      );
      throwDb(ackError);
    }

    const trainingRows = Array.isArray(template.hr_checklist_template_training)
      ? (template.hr_checklist_template_training as Record<string, unknown>[])
      : [];
    if (trainingRows.length) {
      const { error: trainingError } = await context.supabase.from("hr_journey_training").insert(
        trainingRows.map((entry) => ({
          checklist_id: created.id,
          title: text(entry.title),
          required: flag(entry.required, true),
          status: "assigned",
          due_on: addDays(input.anchorDate, Number(entry.due_offset_days ?? 30)),
          sort_order: Number(entry.sort_order ?? 0),
        })),
      );
      throwDb(trainingError);
    }

    await recordEvent(
      context,
      text(created.id),
      "started",
      who,
      kind === "offboarding" ? `${input.exitCause} · last day ${input.anchorDate} · ${input.reasonNote}` : `Start date ${input.anchorDate}`,
    );
    return { id: text(created.id), referenceCode: textOrNull(created.reference_code) };
  },
  { auth: { capability: "hr.manage" } },
);

export const updateJourneyTask = createAuthenticatedAction(
  z
    .object({
      itemId: z.string().uuid(),
      status: z.enum(TASK_STATUSES),
      evidence: z.string().trim().max(500).optional().nullable(),
      reason: reasonText,
    })
    .strict(),
  async (input, context) => {
    const who = await actor(context);
    const { data: item, error } = await context.supabase
      .from("hr_staff_checklist_items")
      .select("id, checklist_id, required, needs_review, title")
      .eq("id", input.itemId)
      .maybeSingle();
    throwDb(error);
    if (!item) fail("not_found");
    await requireOpen(context, text(item.checklist_id));
    if (input.status === "skipped" && flag(item.required, true)) fail("required_cannot_waive");
    if (input.status === "done" && flag(item.required, true) && (input.evidence ?? "").trim().length < 3) fail("evidence_required");
    const needsReview = flag(item.needs_review);
    const { error: updateError } = await context.supabase
      .from("hr_staff_checklist_items")
      .update({
        status: input.status,
        evidence_note: textOrNull(input.evidence),
        updated_reason: input.reason,
        completed_at: input.status === "done" ? new Date().toISOString() : null,
        completed_by: input.status === "done" ? context.userId : null,
        review_status: needsReview && input.status === "done" ? "awaiting" : "not_required",
        reviewer_staff_id: null,
        reviewed_at: null,
      })
      .eq("id", input.itemId);
    throwDb(updateError);
    await recordEvent(context, text(item.checklist_id), "task_updated", who, `${text(item.title)} → ${input.status}. ${input.reason}`);
    return { ok: true as const };
  },
  { auth: { capability: "hr.manage" } },
);

export const clearJourneyReview = createAuthenticatedAction(
  z.object({ itemId: z.string().uuid(), reason: reasonText }).strict(),
  async (input, context) => {
    const who = await actor(context);
    if (!who.staffId) fail("no_staff_profile");
    const { data: item, error } = await context.supabase
      .from("hr_staff_checklist_items")
      .select("id, checklist_id, title, status, needs_review, owner_staff_id")
      .eq("id", input.itemId)
      .maybeSingle();
    throwDb(error);
    if (!item) fail("not_found");
    await requireOpen(context, text(item.checklist_id));
    if (!flag(item.needs_review) || text(item.status) !== "done") fail("review_not_ready");
    if (text(item.owner_staff_id) === who.staffId) fail("reviewer_is_owner");
    const { error: updateError } = await context.supabase
      .from("hr_staff_checklist_items")
      .update({
        review_status: "cleared",
        reviewer_staff_id: who.staffId,
        reviewed_at: new Date().toISOString(),
        updated_reason: input.reason,
      })
      .eq("id", input.itemId);
    throwDb(updateError);
    await recordEvent(context, text(item.checklist_id), "review_cleared", who, `${text(item.title)}. ${input.reason}`);
    return { ok: true as const };
  },
  { auth: { capability: "hr.manage" } },
);

export const acknowledgeJourneyPolicy = createAuthenticatedAction(
  z.object({ acknowledgmentId: z.string().uuid(), reason: reasonText }).strict(),
  async (input, context) => {
    const who = await actor(context);
    const { data: ack, error } = await context.supabase
      .from("hr_journey_acknowledgments")
      .select("id, checklist_id, title")
      .eq("id", input.acknowledgmentId)
      .maybeSingle();
    throwDb(error);
    if (!ack) fail("not_found");
    await requireOpen(context, text(ack.checklist_id));
    const { error: updateError } = await context.supabase
      .from("hr_journey_acknowledgments")
      .update({ status: "acknowledged", acknowledged_at: new Date().toISOString(), acknowledged_by: context.userId })
      .eq("id", input.acknowledgmentId);
    throwDb(updateError);
    await recordEvent(context, text(ack.checklist_id), "acknowledgment", who, `${text(ack.title)}. ${input.reason}`);
    return { ok: true as const };
  },
  { auth: { capability: "hr.manage" } },
);

export const reviseJourneyPackage = createAuthenticatedAction(
  z
    .object({
      checklistId: z.string().uuid(),
      effectiveOn: isoDate,
      basicQar: money,
      housingQar: money,
      transportationQar: money,
      foodQar: money,
      otherQar: money,
      reason: reasonText,
    })
    .strict(),
  async (input, context) => {
    const who = await actor(context);
    const journey = await requireOpen(context, input.checklistId);
    const parts = {
      basicQar: input.basicQar,
      housingQar: input.housingQar,
      transportationQar: input.transportationQar,
      foodQar: input.foodQar,
      otherQar: input.otherQar,
    };
    const total = monthlyTotal(parts);
    if (total <= 0) fail("package_empty");
    const { error: historyError } = await context.supabase.from("staff_salary_history").insert({
      staff_id: journey.staff_id,
      effective_on: input.effectiveOn,
      basic_qar: input.basicQar,
      allowances: {
        housing: input.housingQar,
        transportation: input.transportationQar,
        food: input.foodQar,
        other: input.otherQar,
      },
      monthly_total_qar: total,
      currency: "QAR",
      reason: input.reason,
      created_by: context.userId,
    });
    throwDb(historyError);
    const { error: compError } = await context.supabase.from("staff_compensation").upsert(
      { staff_id: journey.staff_id, monthly_salary_qar: total, currency: "QAR", updated_by: context.userId },
      { onConflict: "staff_id" },
    );
    throwDb(compError);
    await recordEvent(context, input.checklistId, "package_revised", who, `QAR ${total.toFixed(2)} effective ${input.effectiveOn}. ${input.reason}`);
    return { ok: true as const, monthlyTotalQar: total };
  },
  { auth: { capability: "hr.manage" } },
);

export const reviewJourneyPayroll = createAuthenticatedAction(
  z.object({ checklistId: z.string().uuid(), reason: reasonText }).strict(),
  async (input, context) => {
    const who = await actor(context);
    await requireOpen(context, input.checklistId);
    const { error } = await context.supabase
      .from("hr_staff_checklists")
      .update({
        payroll_reviewed_at: new Date().toISOString(),
        payroll_reviewed_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.checklistId);
    throwDb(error);
    await recordEvent(context, input.checklistId, "payroll_reviewed", who, input.reason);
    return { ok: true as const };
  },
  { auth: { capability: "hr.manage" } },
);

export const assignJourneyTraining = createAuthenticatedAction(
  z
    .object({
      checklistId: z.string().uuid(),
      title: z.string().trim().min(3).max(160),
      courseId: z.string().uuid().optional().nullable(),
      reason: reasonText,
    })
    .strict(),
  async (input, context) => {
    const who = await actor(context);
    const journey = await requireOpen(context, input.checklistId);
    const today = todayInQatar();
    let assignmentId: string | null = null;
    let registerNote: string | null = null;
    if (input.courseId) {
      const { data: course, error: courseError } = await context.supabase
        .from("training_courses")
        .select("id, title, published_version_id, status")
        .eq("id", input.courseId)
        .maybeSingle();
      if (courseError) registerNote = courseError.message;
      else if (!course?.published_version_id || text(course.status) !== "PUBLISHED") registerNote = "Course is not published";
      else {
        assignmentId = crypto.randomUUID();
        const { error: assignError } = await context.supabase.from("training_assignments").insert({
          id: assignmentId,
          course_id: course.id,
          version_id: course.published_version_id,
          start_on: today,
          due_on: addDays(today, 30),
          required: true,
          priority: "NORMAL",
          reason: input.reason,
          reminder_offsets_days: [7, 1],
          created_by: context.userId,
        });
        if (assignError) {
          assignmentId = null;
          registerNote = assignError.message;
        } else {
          const { error: ruleError } = await context.supabase.from("training_assignment_rules").insert({
            assignment_id: assignmentId,
            target: "EMPLOYEE",
            staff_id: journey.staff_id,
          });
          if (ruleError) registerNote = ruleError.message;
          const { error: applyError } = await context.supabase.rpc("training_apply_assignment", { _assignment_id: assignmentId });
          if (applyError) registerNote = applyError.message;
        }
      }
    }
    const { error } = await context.supabase.from("hr_journey_training").insert({
      checklist_id: input.checklistId,
      title: input.title.trim(),
      required: true,
      status: "assigned",
      due_on: addDays(today, 30),
      course_id: input.courseId ?? null,
      assignment_id: assignmentId,
      reason: input.reason,
      sort_order: 50,
    });
    throwDb(error);
    await recordEvent(
      context,
      input.checklistId,
      "training_assigned",
      who,
      registerNote ? `${input.title}. ${input.reason} Training register: ${registerNote}` : `${input.title}. ${input.reason}`,
    );
    return { ok: true as const, registerNote };
  },
  { auth: { capability: "hr.manage" } },
);

export const waiveJourneyTraining = createAuthenticatedAction(
  z.object({ trainingId: z.string().uuid(), reason: reasonText }).strict(),
  async (input, context) => {
    const who = await actor(context);
    const { data: row, error } = await context.supabase.from("hr_journey_training").select("id, checklist_id, title").eq("id", input.trainingId).maybeSingle();
    throwDb(error);
    if (!row) fail("not_found");
    await requireOpen(context, text(row.checklist_id));
    const { error: updateError } = await context.supabase.from("hr_journey_training").update({ status: "waived", reason: input.reason }).eq("id", input.trainingId);
    throwDb(updateError);
    await recordEvent(context, text(row.checklist_id), "training_waived", who, `${text(row.title)}. ${input.reason}`);
    return { ok: true as const };
  },
  { auth: { capability: "hr.manage" } },
);

export const cancelJourney = createAuthenticatedAction(
  z.object({ checklistId: z.string().uuid(), reason: reasonText }).strict(),
  async (input, context) => {
    const who = await actor(context);
    await requireOpen(context, input.checklistId);
    const { error } = await context.supabase
      .from("hr_staff_checklists")
      .update({ status: "cancelled", cancelled_reason: input.reason, updated_at: new Date().toISOString() })
      .eq("id", input.checklistId);
    throwDb(error);
    await recordEvent(context, input.checklistId, "cancelled", who, input.reason);
    return { ok: true as const };
  },
  { auth: { capability: "hr.manage" } },
);

export const completeJourney = createAuthenticatedAction(
  z.object({ checklistId: z.string().uuid(), reason: reasonText }).strict(),
  async (input, context) => {
    const who = await actor(context);
    const today = todayInQatar();
    const loaded = await loadCase(context, input.checklistId, today);
    if (loaded.status !== "open") fail("closed");
    const progress = journeyGates({
      tasks: loaded.tasks,
      acknowledgments: loaded.acknowledgments,
      training: loaded.training,
      packages: loaded.packages,
      payrollReviewedAt: loaded.payrollReviewedAt,
      expiredDocuments: loaded.expiredDocuments,
    });
    if (!progress.canComplete) fail("gates_open");
    const checkedAt = new Date().toISOString();
    const { error } = await context.supabase
      .from("hr_staff_checklists")
      .update({ status: "completed", completed_at: checkedAt, eligibility_checked_at: checkedAt, updated_at: checkedAt })
      .eq("id", input.checklistId);
    throwDb(error);
    await recordEvent(context, input.checklistId, "eligibility_checked", who, "Document validity and final eligibility rechecked.");
    await recordEvent(context, input.checklistId, "completed", who, input.reason);
    return { ok: true as const };
  },
  { auth: { capability: "hr.manage" } },
);

export const saveJourneyTemplateItem = createAuthenticatedAction(
  z
    .object({
      templateId: z.string().uuid(),
      title: z.string().trim().min(3).max(160),
      section: z.enum(JOURNEY_SECTIONS),
      required: z.boolean(),
      ownerRole: z.enum(OWNER_ROLES),
      dueOffsetDays: z.number().int().min(-60).max(365),
      needsReview: z.boolean(),
    })
    .strict(),
  async (input, context) => {
    const { data: existing, error: readError } = await context.supabase
      .from("hr_checklist_template_items")
      .select("sort_order")
      .eq("template_id", input.templateId)
      .order("sort_order", { ascending: false })
      .limit(1);
    throwDb(readError);
    const { error } = await context.supabase.from("hr_checklist_template_items").insert({
      template_id: input.templateId,
      title: input.title,
      sort_order: Number(existing?.[0]?.sort_order ?? 0) + 1,
      section: input.section,
      required: input.required,
      owner_role: input.ownerRole,
      due_offset_days: input.dueOffsetDays,
      needs_review: input.needsReview,
    });
    throwDb(error);
    return { ok: true as const };
  },
  { auth: { capability: "hr.manage" } },
);

export const createJourneyTemplate = createAuthenticatedAction(
  z
    .object({
      kind: z.enum(JOURNEY_KINDS),
      title: z.string().trim().min(3).max(120),
      description: z.string().trim().max(280).optional().nullable(),
    })
    .strict(),
  async (input, context) => {
    const { data, error } = await context.supabase
      .from("hr_checklist_templates")
      .insert({
        kind: input.kind,
        title: input.title,
        description: textOrNull(input.description),
        active: true,
        sort_order: 20,
      })
      .select("id")
      .single();
    throwDb(error);
    return { id: text(data?.id) };
  },
  { auth: { capability: "hr.manage" } },
);

export const setJourneyTemplateActive = createAuthenticatedAction(
  z.object({ templateId: z.string().uuid(), active: z.boolean() }).strict(),
  async (input, context) => {
    const { error } = await context.supabase.from("hr_checklist_templates").update({ active: input.active }).eq("id", input.templateId);
    throwDb(error);
    return { ok: true as const };
  },
  { auth: { capability: "hr.manage" } },
);

export const saveApprovalRule = createAuthenticatedAction(
  z
    .object({
      kind: z.enum(JOURNEY_KINDS),
      title: z.string().trim().min(3).max(200),
      approverRole: z.enum(OWNER_ROLES),
      required: z.boolean(),
    })
    .strict(),
  async (input, context) => {
    const { error } = await context.supabase.from("hr_approval_rules").insert({
      kind: input.kind,
      title: input.title,
      approver_role: input.approverRole,
      required: input.required,
      active: true,
      sort_order: 20,
    });
    throwDb(error);
    return { ok: true as const };
  },
  { auth: { capability: "hr.manage" } },
);

export const setApprovalRuleActive = createAuthenticatedAction(
  z.object({ ruleId: z.string().uuid(), active: z.boolean() }).strict(),
  async (input, context) => {
    const { error } = await context.supabase.from("hr_approval_rules").update({ active: input.active }).eq("id", input.ruleId);
    throwDb(error);
    return { ok: true as const };
  },
  { auth: { capability: "hr.manage" } },
);
