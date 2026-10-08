"use server";

import { z } from "zod";

import { createSafeAuthenticatedAction } from "@/lib/server/create-action";
import { requireCapability } from "@/lib/server/authorize";
import type { AuthContext } from "@/lib/server/auth";

type Db = AuthContext["supabase"];

import {
  COURSE_STATUSES,
  DIFFICULTY_LEVELS,
  LESSON_KINDS,
  TRAINING_TYPES,
} from "./engine";

const uuid = z.string().uuid();
const optionalUuid = uuid.nullable();
const optionalText = z.string().trim().max(2000).nullable();

const courseFields = z.object({
  title: z.string().trim().min(1).max(200),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Use letters, numbers, _ or -"),
  description: optionalText,
  category: z.string().trim().max(80).nullable(),
  trainingType: z.enum(TRAINING_TYPES).nullable(),
  difficulty: z.enum(DIFFICULTY_LEVELS).nullable(),
  estimatedMinutes: z.number().int().min(0).max(100000).nullable(),
  instructorStaffId: optionalUuid,
  departmentId: optionalUuid,
  locationId: optionalUuid,
  businessUnit: z.string().trim().max(80).nullable(),
  validityDays: z.number().int().positive().max(36500).nullable(),
  passingScore: z.number().min(0).max(100).nullable(),
  maxAttempts: z.number().int().positive().max(100).nullable(),
  certificateEnabled: z.boolean(),
  certificateValidityDays: z.number().int().positive().max(36500).nullable(),
  refresherCourseId: optionalUuid.default(null),
  retrainingLeadDays: z.number().int().min(1).max(365).default(30),
  competencyCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/)
    .nullable()
    .default(null),
  competencyName: z.string().trim().max(80).nullable().default(null),
  retrainOnPublish: z.boolean().default(false),
  required: z.boolean(),
  requiresSessionAttendance: z.boolean(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  prerequisiteIds: z.array(uuid).max(30),
});

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

/** Local learning artwork or an http(s) address. Anything else is rejected. */
function storedCover(value: string | null | undefined): string | null {
  const trimmed = blankToNull(value);
  if (!trimmed || trimmed.length > 500 || trimmed.includes("..")) return null;
  if (trimmed.startsWith("/learning-art/")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

function coursePayload(data: z.infer<typeof courseFields>) {
  const description = blankToNull(data.description);
  return {
    code: data.code.trim().toUpperCase(),
    title: data.title.trim(),
    description,
    summary: description ? description.slice(0, 280) : null,
    category: blankToNull(data.category),
    training_type: data.trainingType,
    difficulty: data.difficulty,
    estimated_minutes: data.estimatedMinutes,
    instructor_staff_id: data.instructorStaffId,
    department_id: data.departmentId,
    location_id: data.locationId,
    business_unit: blankToNull(data.businessUnit),
    validity_days: data.validityDays,
    passing_score: data.passingScore,
    max_attempts: data.maxAttempts,
    certificate_enabled: data.certificateEnabled,
    certificate_validity_days: data.certificateEnabled ? data.certificateValidityDays : null,
    refresher_course_id: data.refresherCourseId,
    retraining_lead_days: data.retrainingLeadDays,
    competency_code: data.competencyCode ? data.competencyCode.trim().toUpperCase() : null,
    competency_name: blankToNull(data.competencyName),
    retrain_on_publish: data.retrainOnPublish,
    required: data.required,
    requires_session_attendance: data.requiresSessionAttendance,
    tags: data.tags,
  };
}

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const FILE_RULES: Record<string, { mimes: string[]; max: number }> = {
  thumbnail: { mimes: ["image/jpeg", "image/png", "image/webp"], max: 5 * 1024 * 1024 },
  IMAGE: { mimes: ["image/jpeg", "image/png", "image/webp"], max: 8 * 1024 * 1024 },
  PDF: { mimes: ["application/pdf"], max: 20 * 1024 * 1024 },
  VIDEO: { mimes: ["video/mp4"], max: 50 * 1024 * 1024 },
  DOCUMENT: {
    mimes: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    max: 20 * 1024 * 1024,
  },
  PRESENTATION: {
    mimes: ["application/pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    max: 30 * 1024 * 1024,
  },
  AUDIO: { mimes: ["audio/mpeg", "audio/mp4"], max: 20 * 1024 * 1024 },
};

async function assertDraftVersion(supabase: Db, versionId: string) {
  const { data, error } = await supabase
    .from("training_course_versions")
    .select("id, course_id, status, version_no")
    .eq("id", versionId)
    .maybeSingle();
  throwIf(error);
  if (!data) throw new Error("Version not found");
  if (data.status === "PUBLISHED" || data.status === "ARCHIVED") {
    throw new Error("This version is locked. Start a new draft version before changing sections or lessons.");
  }
  return data;
}

async function replacePrerequisites(supabase: Db, courseId: string, prerequisiteIds: string[]) {
  const unique = [...new Set(prerequisiteIds)].filter((id) => id !== courseId);
  const { error: deleteError } = await supabase
    .from("training_course_prerequisites")
    .delete()
    .eq("course_id", courseId);
  throwIf(deleteError);
  if (unique.length === 0) return;
  const { error } = await supabase.from("training_course_prerequisites").insert(
    unique.map((prerequisite_course_id) => ({ course_id: courseId, prerequisite_course_id })),
  );
  throwIf(error);
}

export const listTrainingCourses = createSafeAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    const { data, error } = await context.supabase
      .from("training_courses")
      .select(
        "id, code, title, status, category, training_type, required, updated_at, estimated_minutes, summary, description, requires_session_attendance, thumbnail_path",
      )
      .order("updated_at", { ascending: false });
    throwIf(error);
    const courses = data ?? [];
    const courseIds = courses.map((row) => row.id);
    const versions = courseIds.length
      ? await context.supabase.from("training_course_versions").select("id, course_id, version_no").in("course_id", courseIds)
      : { data: [], error: null };
    throwIf(versions.error);
    const latest = new Map<string, string>();
    const latestNo = new Map<string, number>();
    for (const version of versions.data ?? []) {
      const current = latestNo.get(version.course_id) ?? -1;
      if (version.version_no >= current) {
        latestNo.set(version.course_id, version.version_no);
        latest.set(version.course_id, version.id);
      }
    }
    const versionIds = [...latest.values()];
    const sections = versionIds.length
      ? await context.supabase.from("training_sections").select("id, version_id").in("version_id", versionIds)
      : { data: [], error: null };
    throwIf(sections.error);
    const sectionIds = (sections.data ?? []).map((section) => section.id);
    const lessons = sectionIds.length
      ? await context.supabase.from("training_lessons").select("id, section_id").in("section_id", sectionIds)
      : { data: [], error: null };
    throwIf(lessons.error);
    const sectionVersion = new Map((sections.data ?? []).map((section) => [section.id, section.version_id]));
    const versionCourse = new Map([...latest.entries()].map(([courseId, versionId]) => [versionId, courseId]));
    const lessonCount = new Map<string, number>();
    for (const lesson of lessons.data ?? []) {
      const versionId = sectionVersion.get(lesson.section_id);
      const courseId = versionId ? versionCourse.get(versionId) : undefined;
      if (!courseId) continue;
      lessonCount.set(courseId, (lessonCount.get(courseId) ?? 0) + 1);
    }
    return courses.map((course) => ({
      ...course,
      lesson_count: lessonCount.get(course.id) ?? 0,
    }));
  },
  { defaultInput: {}, auth: { capability: "training.view" } },
);

export const listTrainingCourseLookups = createSafeAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    const [locations, departments, staff, courses] = await Promise.all([
      context.supabase.from("locations").select("id, name, code").order("name"),
      context.supabase.from("master_departments").select("id, name").eq("active", true).order("sort_order"),
      context.supabase
        .from("staff")
        .select("id, full_name, employee_code")
        .is("deleted_at", null)
        .order("full_name")
        .limit(500),
      context.supabase.from("training_courses").select("id, code, title").order("title"),
    ]);
    throwIf(locations.error);
    throwIf(departments.error);
    throwIf(staff.error);
    throwIf(courses.error);
    return {
      locations: locations.data ?? [],
      departments: departments.data ?? [],
      staff: staff.data ?? [],
      courses: courses.data ?? [],
    };
  },
  { defaultInput: {}, auth: { capability: "training.view" } },
);

export const getTrainingCourse = createSafeAuthenticatedAction(
  z.object({ courseId: uuid }),
  async ({ courseId }, context) => {
    const { data: course, error } = await context.supabase
      .from("training_courses")
      .select(
        "id, code, title, description, summary, category, training_type, difficulty, estimated_minutes, thumbnail_path, instructor_staff_id, department_id, location_id, business_unit, validity_days, passing_score, max_attempts, certificate_enabled, certificate_validity_days, refresher_course_id, retraining_lead_days, competency_code, competency_name, retrain_on_publish, required, requires_session_attendance, tags, status, published_version_id, created_by, updated_at",
      )
      .eq("id", courseId)
      .maybeSingle();
    throwIf(error);
    if (!course) throw new Error("Course not found");

    const [versions, prerequisites] = await Promise.all([
      context.supabase
        .from("training_course_versions")
        .select("id, version_no, status, title")
        .eq("course_id", courseId)
        .order("version_no", { ascending: false }),
      context.supabase
        .from("training_course_prerequisites")
        .select("prerequisite_course_id")
        .eq("course_id", courseId),
    ]);
    throwIf(versions.error);
    throwIf(prerequisites.error);
    const working = versions.data?.[0];
    const sections = working
      ? await context.supabase
          .from("training_sections")
          .select("id, title, sort_order")
          .eq("version_id", working.id)
          .order("sort_order")
      : { data: [], error: null };
    throwIf(sections.error);
    const sectionIds = (sections.data ?? []).map((section) => section.id);
    const lessons = sectionIds.length
      ? await context.supabase
          .from("training_lessons")
          .select("id, section_id, title, kind, body, storage_path, external_url, sort_order, required")
          .in("section_id", sectionIds)
          .order("sort_order")
      : { data: [], error: null };
    throwIf(lessons.error);
    return {
      course,
      version: working ?? null,
      versions: versions.data ?? [],
      sections: sections.data ?? [],
      lessons: lessons.data ?? [],
      prerequisiteIds: (prerequisites.data ?? []).map((row) => row.prerequisite_course_id),
    };
  },
  { auth: { capability: "training.view" } },
);

export const createTrainingCourse = createSafeAuthenticatedAction(
  courseFields.extend({
    thumbnailPath: z.string().trim().max(500).nullable().optional(),
    changeSummary: z.string().trim().max(2000).nullable().optional(),
  }),
  async (data, context) => {
    const thumbnail = storedCover(data.thumbnailPath);
    if (blankToNull(data.thumbnailPath) && !thumbnail) {
      throw new Error("Cover address must be an http(s) URL or a learning artwork path");
    }
    const { data: course, error } = await context.supabase
      .from("training_courses")
      .insert({
        ...coursePayload(data),
        thumbnail_path: thumbnail,
        status: "DRAFT",
        created_by: context.userId,
      })
      .select("id")
      .single();
    throwIf(error);
    if (!course) throw new Error("Could not create the course");
    const { error: versionError } = await context.supabase.from("training_course_versions").insert({
      course_id: course.id,
      version_no: 1,
      status: "DRAFT",
      title: data.title.trim(),
      change_summary: blankToNull(data.changeSummary),
    });
    throwIf(versionError);
    await replacePrerequisites(context.supabase, course.id, data.prerequisiteIds);
    return { id: course.id };
  },
  { auth: { capability: "training.create" } },
);

export const updateTrainingCourse = createSafeAuthenticatedAction(
  courseFields.extend({ courseId: uuid, versionId: uuid }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("training_courses")
      .update(coursePayload(data))
      .eq("id", data.courseId);
    throwIf(error);
    const { error: versionError } = await context.supabase
      .from("training_course_versions")
      .update({ title: data.title.trim() })
      .eq("id", data.versionId);
    throwIf(versionError);
    await replacePrerequisites(context.supabase, data.courseId, data.prerequisiteIds);
    return { ok: true };
  },
  { auth: { capability: "training.edit" } },
);

export const setTrainingCourseStatus = createSafeAuthenticatedAction(
  z.object({ courseId: uuid, versionId: uuid, status: z.enum(COURSE_STATUSES) }),
  async ({ courseId, versionId, status }, context) => {
    if (status === "PUBLISHED") await requireCapability(context, "training.publish");
    if (status === "ARCHIVED") await requireCapability(context, "training.archive");
    const patch: { status: string; published_version_id?: string } = { status };
    if (status === "PUBLISHED") patch.published_version_id = versionId;
    const { error } = await context.supabase.from("training_courses").update(patch).eq("id", courseId);
    throwIf(error);
    const versionPatch: { status: string; published_at?: string; published_by?: string } = { status };
    if (status === "PUBLISHED") {
      versionPatch.published_at = new Date().toISOString();
      versionPatch.published_by = context.userId;
    }
    const { error: versionError } = await context.supabase
      .from("training_course_versions")
      .update(versionPatch)
      .eq("id", versionId);
    throwIf(versionError);
    return { ok: true };
  },
  { auth: { capability: "training.edit" } },
);

export const createTrainingDraftVersion = createSafeAuthenticatedAction(
  z.object({ courseId: uuid, sourceVersionId: uuid }),
  async ({ courseId, sourceVersionId }, context) => {
    const { data: versions, error: versionError } = await context.supabase
      .from("training_course_versions")
      .select("version_no, title")
      .eq("course_id", courseId)
      .order("version_no", { ascending: false })
      .limit(1);
    throwIf(versionError);
    const latest = versions?.[0];
    if (!latest) throw new Error("Course has no version");
    const { data: created, error } = await context.supabase
      .from("training_course_versions")
      .insert({
        course_id: courseId,
        version_no: latest.version_no + 1,
        status: "DRAFT",
        title: latest.title,
      })
      .select("id")
      .single();
    throwIf(error);
    if (!created) throw new Error("Could not create the draft version");

    const { data: sections, error: sectionError } = await context.supabase
      .from("training_sections")
      .select("id, title, sort_order")
      .eq("version_id", sourceVersionId)
      .order("sort_order");
    throwIf(sectionError);
    const sectionMap = new Map<string, string>();
    for (const section of sections ?? []) {
      const { data: inserted, error: insertError } = await context.supabase
        .from("training_sections")
        .insert({ version_id: created.id, title: section.title, sort_order: section.sort_order })
        .select("id")
        .single();
      throwIf(insertError);
      if (!inserted) throw new Error("Could not copy a section");
      sectionMap.set(section.id, inserted.id);
    }
    const sourceIds = [...sectionMap.keys()];
    if (sourceIds.length) {
      const { data: lessons, error: lessonError } = await context.supabase
        .from("training_lessons")
        .select("section_id, title, kind, body, storage_path, external_url, sort_order, required, duration_seconds")
        .in("section_id", sourceIds);
      throwIf(lessonError);
      if (lessons?.length) {
        const { error: copyError } = await context.supabase.from("training_lessons").insert(
          lessons.map((lesson) => ({
            section_id: sectionMap.get(lesson.section_id)!,
            title: lesson.title,
            kind: lesson.kind,
            body: lesson.body,
            storage_path: lesson.storage_path,
            external_url: lesson.external_url,
            sort_order: lesson.sort_order,
            required: lesson.required,
            duration_seconds: lesson.duration_seconds,
          })),
        );
        throwIf(copyError);
      }
    }
    return { versionId: created.id };
  },
  { auth: { capability: "training.edit" } },
);

export const addTrainingSection = createSafeAuthenticatedAction(
  z.object({ versionId: uuid, title: z.string().trim().min(1).max(200) }),
  async ({ versionId, title }, context) => {
    await assertDraftVersion(context.supabase, versionId);
    const { data: existing, error: readError } = await context.supabase
      .from("training_sections")
      .select("sort_order")
      .eq("version_id", versionId)
      .order("sort_order", { ascending: false })
      .limit(1);
    throwIf(readError);
    const sortOrder = (existing?.[0]?.sort_order ?? 0) + 10;
    const { data, error } = await context.supabase
      .from("training_sections")
      .insert({ version_id: versionId, title, sort_order: sortOrder })
      .select("id")
      .single();
    throwIf(error);
    if (!data) throw new Error("Could not add the section");
    return { id: data.id };
  },
  { auth: { capability: "training.edit" } },
);

export const updateTrainingSection = createSafeAuthenticatedAction(
  z.object({ versionId: uuid, sectionId: uuid, title: z.string().trim().min(1).max(200) }),
  async ({ versionId, sectionId, title }, context) => {
    await assertDraftVersion(context.supabase, versionId);
    const { error } = await context.supabase.from("training_sections").update({ title }).eq("id", sectionId);
    throwIf(error);
    return { ok: true };
  },
  { auth: { capability: "training.edit" } },
);

export const moveTrainingSection = createSafeAuthenticatedAction(
  z.object({ versionId: uuid, sectionId: uuid, direction: z.enum(["up", "down"]) }),
  async ({ versionId, sectionId, direction }, context) => {
    await assertDraftVersion(context.supabase, versionId);
    const { data: sections, error } = await context.supabase
      .from("training_sections")
      .select("id, sort_order")
      .eq("version_id", versionId)
      .order("sort_order");
    throwIf(error);
    const index = (sections ?? []).findIndex((section) => section.id === sectionId);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= (sections ?? []).length) return { ok: true };
    const current = sections![index];
    const neighbor = sections![swapWith];
    const { error: first } = await context.supabase
      .from("training_sections")
      .update({ sort_order: neighbor.sort_order })
      .eq("id", current.id);
    throwIf(first);
    const { error: second } = await context.supabase
      .from("training_sections")
      .update({ sort_order: current.sort_order })
      .eq("id", neighbor.id);
    throwIf(second);
    return { ok: true };
  },
  { auth: { capability: "training.edit" } },
);

export const deleteTrainingSection = createSafeAuthenticatedAction(
  z.object({ versionId: uuid, sectionId: uuid }),
  async ({ versionId, sectionId }, context) => {
    await assertDraftVersion(context.supabase, versionId);
    const { error } = await context.supabase.from("training_sections").delete().eq("id", sectionId);
    throwIf(error);
    return { ok: true };
  },
  { auth: { capability: "training.edit" } },
);

export const addTrainingLesson = createSafeAuthenticatedAction(
  z.object({
    versionId: uuid,
    sectionId: uuid,
    title: z.string().trim().min(1).max(200),
    kind: z.enum(LESSON_KINDS),
  }),
  async ({ versionId, sectionId, title, kind }, context) => {
    await assertDraftVersion(context.supabase, versionId);
    const { data: existing, error: readError } = await context.supabase
      .from("training_lessons")
      .select("sort_order")
      .eq("section_id", sectionId)
      .order("sort_order", { ascending: false })
      .limit(1);
    throwIf(readError);
    const { data, error } = await context.supabase
      .from("training_lessons")
      .insert({
        section_id: sectionId,
        title,
        kind,
        sort_order: (existing?.[0]?.sort_order ?? 0) + 10,
      })
      .select("id")
      .single();
    throwIf(error);
    if (!data) throw new Error("Could not add the lesson");
    return { id: data.id };
  },
  { auth: { capability: "training.edit" } },
);

export const updateTrainingLesson = createSafeAuthenticatedAction(
  z.object({
    versionId: uuid,
    lessonId: uuid,
    title: z.string().trim().min(1).max(200),
    kind: z.enum(LESSON_KINDS),
    body: z.string().max(20000).nullable(),
    externalUrl: z.string().trim().max(500).nullable(),
    required: z.boolean(),
  }),
  async (data, context) => {
    await assertDraftVersion(context.supabase, data.versionId);
    let externalUrl: string | null = null;
    if (data.kind === "EXTERNAL_LINK") {
      const value = blankToNull(data.externalUrl);
      if (value && !/^https:\/\//i.test(value)) throw new Error("External links must start with https://");
      externalUrl = value;
    }
    const { error } = await context.supabase
      .from("training_lessons")
      .update({
        title: data.title.trim(),
        kind: data.kind,
        body: blankToNull(data.body),
        external_url: externalUrl,
        required: data.required,
      })
      .eq("id", data.lessonId);
    throwIf(error);
    return { ok: true };
  },
  { auth: { capability: "training.edit" } },
);

export const moveTrainingLesson = createSafeAuthenticatedAction(
  z.object({ versionId: uuid, sectionId: uuid, lessonId: uuid, direction: z.enum(["up", "down"]) }),
  async ({ versionId, sectionId, lessonId, direction }, context) => {
    await assertDraftVersion(context.supabase, versionId);
    const { data: lessons, error } = await context.supabase
      .from("training_lessons")
      .select("id, sort_order")
      .eq("section_id", sectionId)
      .order("sort_order");
    throwIf(error);
    const index = (lessons ?? []).findIndex((lesson) => lesson.id === lessonId);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= (lessons ?? []).length) return { ok: true };
    const current = lessons![index];
    const neighbor = lessons![swapWith];
    const { error: first } = await context.supabase
      .from("training_lessons")
      .update({ sort_order: neighbor.sort_order })
      .eq("id", current.id);
    throwIf(first);
    const { error: second } = await context.supabase
      .from("training_lessons")
      .update({ sort_order: current.sort_order })
      .eq("id", neighbor.id);
    throwIf(second);
    return { ok: true };
  },
  { auth: { capability: "training.edit" } },
);

export const deleteTrainingLesson = createSafeAuthenticatedAction(
  z.object({ versionId: uuid, lessonId: uuid }),
  async ({ versionId, lessonId }, context) => {
    await assertDraftVersion(context.supabase, versionId);
    const { error } = await context.supabase.from("training_lessons").delete().eq("id", lessonId);
    throwIf(error);
    return { ok: true };
  },
  { auth: { capability: "training.edit" } },
);

export const uploadTrainingMaterial = createSafeAuthenticatedAction(
  z.object({
    courseId: uuid,
    versionId: uuid.nullable(),
    lessonId: uuid.nullable(),
    purpose: z.enum(["thumbnail", "IMAGE", "PDF", "VIDEO", "DOCUMENT", "PRESENTATION", "AUDIO"]),
    filename: z.string().trim().min(1).max(180),
    contentType: z.string().trim().min(1).max(160),
    dataBase64: z.string().min(1),
  }),
  async (data, context) => {
    const rule = FILE_RULES[data.purpose];
    if (!rule.mimes.includes(data.contentType)) throw new Error("This file type is not allowed");
    const bytes = Buffer.from(data.dataBase64, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > rule.max) throw new Error("File is empty or too large");
    if (data.purpose !== "thumbnail") {
      if (!data.versionId || !data.lessonId) throw new Error("Lesson upload needs a draft version");
      await assertDraftVersion(context.supabase, data.versionId);
    }
    const safeName = data.filename.replace(/[^\w.\-]+/g, "_").slice(0, 80);
    const path = `courses/${data.courseId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await context.supabase.storage.from("training-materials").upload(path, bytes, {
      contentType: data.contentType,
      upsert: false,
    });
    throwIf(uploadError);
    if (data.purpose === "thumbnail") {
      const { error } = await context.supabase
        .from("training_courses")
        .update({ thumbnail_path: path })
        .eq("id", data.courseId);
      throwIf(error);
    } else if (data.lessonId) {
      const { error } = await context.supabase
        .from("training_lessons")
        .update({ storage_path: path })
        .eq("id", data.lessonId);
      throwIf(error);
    }
    return { path };
  },
  { auth: { capability: "training.edit" } },
);

export const assignPublishedRetraining = createSafeAuthenticatedAction(
  z.object({ courseId: uuid }).strict(),
  async (data, context) => {
    const { data: count, error } = await context.supabase.rpc("training_assign_published_retraining", {
      _course_id: data.courseId,
    });
    throwIf(error);
    return { enrolled: Number(count ?? 0) };
  },
  { auth: { capability: "training.assign" } },
);
