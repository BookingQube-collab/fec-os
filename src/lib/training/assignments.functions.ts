"use server";

import { z } from "zod";

import { notifyUsers } from "@/lib/notifications/action-notify";
import { requireCapability } from "@/lib/server/authorize";
import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

import {
  ASSIGNMENT_PRIORITIES,
  ASSIGNMENT_REMINDER_DAYS,
  ASSIGNMENT_TARGETS,
  SAVED_RULE_TRIGGERS,
  STORED_ONLY_ASSIGNMENT_TARGETS,
  assignmentCarriesClientOutcome,
  capabilityForAssignmentTarget,
  publishedVersionIsAssignable,
} from "./engine";

const uuid = z.string().uuid();
const dateOrNull = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const assignmentInput = z
  .object({
    courseId: uuid,
    versionId: uuid,
    startOn: dateOrNull,
    dueOn: dateOrNull,
    required: z.boolean(),
    priority: z.enum(ASSIGNMENT_PRIORITIES),
    reason: z.string().trim().max(2000).nullable(),
    reminderOffsetsDays: z
      .array(z.number().int())
      .max(8)
      .refine((days) => days.every((day) => (ASSIGNMENT_REMINDER_DAYS as readonly number[]).includes(day))),
    target: z.enum(ASSIGNMENT_TARGETS),
    staffIds: z.array(uuid).max(25),
    departmentId: uuid.nullable(),
    locationId: uuid.nullable(),
    roleCode: z.string().trim().max(40).nullable(),
    businessUnit: z.string().trim().max(80).nullable(),
    teamLabel: z.string().trim().max(80).nullable(),
    employmentType: z.string().trim().max(40).nullable(),
    customLabel: z.string().trim().max(80).nullable(),
    confirmCompany: z.boolean(),
  })
  .strict();

const savedRuleInput = z
  .object({
    courseId: uuid,
    versionId: uuid,
    triggerKind: z.enum(SAVED_RULE_TRIGGERS),
    target: z.enum(ASSIGNMENT_TARGETS),
    staffId: uuid.nullable(),
    departmentId: uuid.nullable(),
    locationId: uuid.nullable(),
    roleCode: z.string().trim().max(40).nullable(),
    businessUnit: z.string().trim().max(80).nullable(),
    teamLabel: z.string().trim().max(80).nullable(),
    employmentType: z.string().trim().max(40).nullable(),
    customLabel: z.string().trim().max(80).nullable(),
    required: z.boolean(),
    priority: z.enum(ASSIGNMENT_PRIORITIES),
    dueOffsetDays: z.number().int().min(0).max(3650).nullable(),
    reminderOffsetsDays: z
      .array(z.number().int())
      .max(8)
      .refine((days) => days.every((day) => (ASSIGNMENT_REMINDER_DAYS as readonly number[]).includes(day))),
    reason: z.string().trim().max(2000).nullable(),
  })
  .strict();

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export const listTrainingAssignments = createSafeAuthenticatedAction(
  z.object({}).strict(),
  async (_data, context) => {
    const { data: assignments, error } = await context.supabase
      .from("training_assignments")
      .select(
        "id, course_id, version_id, start_on, due_on, required, priority, reason, reminder_offsets_days, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(40);
    throwIf(error);
    const rows = assignments ?? [];
    const ids = rows.map((row) => row.id);
    const courseIds = [...new Set(rows.map((row) => row.course_id).filter((id): id is string => Boolean(id)))];
    const [rules, courses, saved] = await Promise.all([
      ids.length
        ? context.supabase
            .from("training_assignment_rules")
            .select("assignment_id, target, staff_id, department_id, location_id, role_code, business_unit, team_label, employment_type, custom_label")
            .in("assignment_id", ids)
        : Promise.resolve({ data: [], error: null }),
      courseIds.length
        ? context.supabase.from("training_courses").select("id, code, title").in("id", courseIds)
        : Promise.resolve({ data: [], error: null }),
      context.supabase
        .from("training_saved_rules")
        .select("id, course_id, version_id, trigger_kind, target, required, priority, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    throwIf(rules.error);
    throwIf(courses.error);
    throwIf(saved.error);
    return {
      assignments: rows,
      rules: rules.data ?? [],
      courses: courses.data ?? [],
      savedRules: saved.data ?? [],
    };
  },
  { defaultInput: {}, auth: { capability: "training.view" } },
);

export const listAssignableCourses = createSafeAuthenticatedAction(
  z.object({}).strict(),
  async (_data, context) => {
    const [courses, departments, locations] = await Promise.all([
      context.supabase
        .from("training_courses")
        .select("id, code, title, published_version_id, status")
        .eq("status", "PUBLISHED")
        .not("published_version_id", "is", null)
        .order("title"),
      context.supabase.from("master_departments").select("id, name").eq("active", true).order("name"),
      context.supabase.from("locations").select("id, name, code").order("name"),
    ]);
    throwIf(courses.error);
    throwIf(departments.error);
    throwIf(locations.error);
    return {
      courses: (courses.data ?? []).filter((course) => course.published_version_id),
      departments: departments.data ?? [],
      locations: locations.data ?? [],
    };
  },
  { defaultInput: {}, auth: { capability: "training.view" } },
);

export const searchTrainingStaff = createSafeAuthenticatedAction(
  z.object({ query: z.string().trim().max(80), page: z.number().int().min(0).max(20) }).strict(),
  async ({ query, page }, context) => {
    const pageSize = 20;
    let request = context.supabase
      .from("staff")
      .select("id, full_name, employee_code")
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name")
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (query) {
      const safe = query.replace(/[%_,]/g, "");
      request = request.or(`full_name.ilike.%${safe}%,employee_code.ilike.%${safe}%`);
    }
    const { data, error } = await request;
    throwIf(error);
    return { staff: data ?? [], pageSize };
  },
  { auth: { capability: "training.assign" } },
);

export const createTrainingAssignment = createSafeAuthenticatedAction(
  assignmentInput,
  async (data, context) => {
    if (assignmentCarriesClientOutcome(data)) {
      throw new Error("assignment cannot set completion or score");
    }
    await requireCapability(context, capabilityForAssignmentTarget(data.target));
    if (data.target === "COMPANY" && !data.confirmCompany) {
      throw new Error("Confirm company-wide assignment before it enrolls every active employee");
    }
    if (data.target === "EMPLOYEE" && data.staffIds.length < 1) {
      throw new Error("Choose at least one employee");
    }
    if (data.target === "DEPARTMENT" && !data.departmentId) throw new Error("Choose a department");
    if (data.target === "SITE" && !data.locationId) throw new Error("Choose a site");
    if (data.target === "ROLE" && !blankToNull(data.roleCode)) throw new Error("Choose a role");
    if (data.target === "BUSINESS_UNIT" && !blankToNull(data.businessUnit)) throw new Error("Enter a business unit");
    if (data.target === "TEAM" && !blankToNull(data.teamLabel)) throw new Error("Enter a team");
    if (data.target === "EMPLOYEE_TYPE" && !blankToNull(data.employmentType)) throw new Error("Enter an employee type");
    if (data.target === "CUSTOM" && !blankToNull(data.customLabel)) throw new Error("Enter a name for this selection");

    const { data: version, error: versionError } = await context.supabase
      .from("training_course_versions")
      .select("id, course_id, status")
      .eq("id", data.versionId)
      .maybeSingle();
    throwIf(versionError);
    const { data: course, error: courseError } = await context.supabase
      .from("training_courses")
      .select("id, title, status, published_version_id")
      .eq("id", data.courseId)
      .maybeSingle();
    throwIf(courseError);
    if (
      !version ||
      !course ||
      version.course_id !== course.id ||
      course.published_version_id !== version.id ||
      !publishedVersionIsAssignable(course.status, version.status)
    ) {
      throw new Error("Only a published course version can be assigned");
    }

    if (data.target === "SITE" && data.locationId) {
      const { data: allowed, error } = await context.supabase.rpc("user_can_access_location", {
        _location_id: data.locationId,
      });
      throwIf(error);
      if (!allowed) throw new Error("Site is outside your scope");
    }
    if (data.target === "EMPLOYEE") {
      for (const staffId of data.staffIds) {
        const { data: allowed, error } = await context.supabase.rpc("user_can_access_staff", {
          _staff_id: staffId,
        });
        throwIf(error);
        if (!allowed) throw new Error("Employee is outside your scope");
      }
    }

    // The select policy re-reads the row and cannot see it inside INSERT ... RETURNING.
    const assignmentId = crypto.randomUUID();
    const { error } = await context.supabase.from("training_assignments").insert({
      id: assignmentId,
      course_id: course.id,
      version_id: version.id,
      start_on: data.startOn,
      due_on: data.dueOn,
      required: data.required,
      priority: data.priority,
      reason: blankToNull(data.reason),
      reminder_offsets_days: data.reminderOffsetsDays,
      created_by: context.userId,
    });
    throwIf(error);

    const rules: {
      assignment_id: string;
      target: string;
      staff_id: string | null;
      department_id: string | null;
      location_id: string | null;
      role_code: string | null;
      business_unit: string | null;
      team_label: string | null;
      employment_type: string | null;
      custom_label: string | null;
    }[] =
      data.target === "EMPLOYEE"
        ? data.staffIds.map((staffId) => ({
            assignment_id: assignmentId,
            target: "EMPLOYEE",
            staff_id: staffId,
            department_id: null,
            location_id: null,
            role_code: null,
            business_unit: null,
            team_label: null,
            employment_type: null,
            custom_label: null,
          }))
        : [
            {
              assignment_id: assignmentId,
              target: data.target,
              staff_id: null,
              department_id: data.target === "DEPARTMENT" ? data.departmentId : null,
              location_id: data.target === "SITE" ? data.locationId : null,
              role_code: data.target === "ROLE" ? blankToNull(data.roleCode) : null,
              business_unit: data.target === "BUSINESS_UNIT" ? blankToNull(data.businessUnit) : null,
              team_label: data.target === "TEAM" ? blankToNull(data.teamLabel) : null,
              employment_type: data.target === "EMPLOYEE_TYPE" ? blankToNull(data.employmentType) : null,
              custom_label: data.target === "CUSTOM" ? blankToNull(data.customLabel) : null,
            },
          ];
    const { error: ruleError } = await context.supabase.from("training_assignment_rules").insert(rules);
    throwIf(ruleError);

    const { data: enrolled, error: enrollError } = await context.supabase.rpc("training_apply_assignment", {
      _assignment_id: assignmentId,
    });
    throwIf(enrollError);

    if (data.target === "EMPLOYEE" && data.staffIds.length > 0) {
      const { data: people, error: peopleError } = await context.supabase
        .from("staff")
        .select("user_id")
        .in("id", data.staffIds);
      throwIf(peopleError);
      const userIds = (people ?? []).map((person) => person.user_id).filter((id): id is string => Boolean(id));
      if (userIds.length > 0) {
        await notifyUsers({
          userIds,
          category: "training",
          title: "Training assigned",
          body: course.title,
          sourceType: "training_assignment",
          sourceId: assignmentId,
        });
      }
    }

    const storedOnly = (STORED_ONLY_ASSIGNMENT_TARGETS as readonly string[]).includes(data.target);
    return { id: assignmentId, enrolled: enrolled ?? 0, storedOnly };
  },
  { auth: { capability: "training.assign" } },
);

export const saveTrainingRule = createSafeAuthenticatedAction(
  savedRuleInput,
  async (data, context) => {
    if (assignmentCarriesClientOutcome(data)) {
      throw new Error("assignment cannot set completion or score");
    }
    await requireCapability(context, capabilityForAssignmentTarget(data.target));
    const { data: version, error: versionError } = await context.supabase
      .from("training_course_versions")
      .select("id, course_id, status")
      .eq("id", data.versionId)
      .maybeSingle();
    throwIf(versionError);
    const { data: course, error: courseError } = await context.supabase
      .from("training_courses")
      .select("id, status, published_version_id")
      .eq("id", data.courseId)
      .maybeSingle();
    throwIf(courseError);
    if (
      !version ||
      !course ||
      version.course_id !== course.id ||
      course.published_version_id !== version.id ||
      !publishedVersionIsAssignable(course.status, version.status)
    ) {
      throw new Error("Only a published course version can be assigned");
    }
    if (data.target === "SITE" && data.locationId) {
      const { data: allowed, error } = await context.supabase.rpc("user_can_access_location", {
        _location_id: data.locationId,
      });
      throwIf(error);
      if (!allowed) throw new Error("Site is outside your scope");
    }
    if (data.target === "EMPLOYEE" && data.staffId) {
      const { data: allowed, error } = await context.supabase.rpc("user_can_access_staff", {
        _staff_id: data.staffId,
      });
      throwIf(error);
      if (!allowed) throw new Error("Employee is outside your scope");
    }
    const { data: saved, error } = await context.supabase
      .from("training_saved_rules")
      .insert({
        course_id: course.id,
        version_id: version.id,
        trigger_kind: data.triggerKind,
        target: data.target,
        staff_id: data.target === "EMPLOYEE" ? data.staffId : null,
        department_id: data.target === "DEPARTMENT" ? data.departmentId : null,
        location_id: data.target === "SITE" ? data.locationId : null,
        role_code: data.target === "ROLE" ? blankToNull(data.roleCode) : null,
        business_unit: data.target === "BUSINESS_UNIT" ? blankToNull(data.businessUnit) : null,
        team_label: data.target === "TEAM" ? blankToNull(data.teamLabel) : null,
        employment_type: data.target === "EMPLOYEE_TYPE" ? blankToNull(data.employmentType) : null,
        custom_label: data.target === "CUSTOM" ? blankToNull(data.customLabel) : null,
        required: data.required,
        priority: data.priority,
        due_offset_days: data.dueOffsetDays,
        reminder_offsets_days: data.reminderOffsetsDays,
        reason: blankToNull(data.reason),
        created_by: context.userId,
      })
      .select("id")
      .single();
    throwIf(error);
    if (!saved) throw new Error("Could not save the rule");
    return { id: saved.id, executed: false as const };
  },
  { auth: { capability: "training.assign" } },
);
