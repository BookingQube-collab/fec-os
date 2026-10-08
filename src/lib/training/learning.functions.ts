"use server";

import { z } from "zod";

import { createSafeAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

import {
  enrollmentOwnedByStaff,
  learningCarriesClientOutcome,
  courseProgressPercent,
} from "./engine";

const uuid = z.string().uuid();

const listInput = z.object({}).strict();
const outlineInput = z.object({ enrollmentId: uuid }).strict();

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function actorStaffId(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("training_actor_staff_id");
  throwIf(error);
  return data;
}

export const listMyLearning = createSafeAuthenticatedAction(
  listInput,
  async (_data, context) => {
    const staffId = await actorStaffId(context);
    if (!staffId) {
      return { staffId: null, courses: [], certificates: [], paths: [] };
    }

    const { data: enrollments, error } = await context.supabase
      .from("training_course_enrollments")
      .select("id, staff_id, course_id, version_id, path_id, assignment_id, status, due_on, completed_at, started_at")
      .eq("staff_id", staffId)
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(100);
    throwIf(error);
    const rows = (enrollments ?? []).filter((row) => enrollmentOwnedByStaff(staffId, row.staff_id));

    const courseIds = [...new Set(rows.map((row) => row.course_id))];
    const versionIds = [...new Set(rows.map((row) => row.version_id))];
    const pathIds = [...new Set(rows.map((row) => row.path_id).filter((id): id is string => Boolean(id)))];
    const enrollmentIds = rows.map((row) => row.id);

    const [coursesResult, flagsResult, certificatesResult, pathsResult, sectionsResult, progressResult] = await Promise.all([
      courseIds.length
        ? context.supabase.from("training_courses").select("id, code, title").in("id", courseIds)
        : Promise.resolve({ data: [], error: null }),
      context.supabase.rpc("training_my_required_flags"),
      context.supabase
        .from("training_certificates")
        .select("id, course_title, status, issued_at, valid_until")
        .eq("staff_id", staffId)
        .limit(50),
      pathIds.length
        ? context.supabase.from("training_paths").select("id, title, status").in("id", pathIds)
        : Promise.resolve({ data: [], error: null }),
      versionIds.length
        ? context.supabase.from("training_sections").select("id, version_id").in("version_id", versionIds)
        : Promise.resolve({ data: [], error: null }),
      enrollmentIds.length
        ? context.supabase
            .from("training_progress")
            .select("enrollment_id, lesson_id, completed_at")
            .in("enrollment_id", enrollmentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    throwIf(coursesResult.error);
    throwIf(flagsResult.error);
    throwIf(certificatesResult.error);
    throwIf(pathsResult.error);
    throwIf(sectionsResult.error);
    throwIf(progressResult.error);

    const sectionIds = (sectionsResult.data ?? []).map((section) => section.id);
    const lessonsResult = sectionIds.length
      ? await context.supabase.from("training_lessons").select("id, section_id, kind, required").in("section_id", sectionIds)
      : { data: [], error: null };
    throwIf(lessonsResult.error);

    const lessonsByVersion = new Map<string, { id: string; kind: string; required: boolean }[]>();
    const sectionVersion = new Map((sectionsResult.data ?? []).map((section) => [section.id, section.version_id]));
    for (const lesson of lessonsResult.data ?? []) {
      const versionId = sectionVersion.get(lesson.section_id);
      if (!versionId) continue;
      const list = lessonsByVersion.get(versionId) ?? [];
      list.push({ id: lesson.id, kind: lesson.kind, required: lesson.required });
      lessonsByVersion.set(versionId, list);
    }
    const completedLessons = new Set(
      (progressResult.data ?? []).filter((row) => row.completed_at).map((row) => `${row.enrollment_id}:${row.lesson_id}`),
    );
    const requiredByEnrollment = new Map((flagsResult.data ?? []).map((flag) => [flag.enrollment_id, flag.required]));
    const courseById = new Map((coursesResult.data ?? []).map((course) => [course.id, course]));

    const courses = rows.flatMap((row) => {
      const course = courseById.get(row.course_id);
      if (!course) return [];
      return [
        {
          id: row.id,
          title: course.title,
          code: course.code,
          status: row.status,
          dueOn: row.due_on,
          completedAt: row.completed_at,
          startedAt: row.started_at,
          required: requiredByEnrollment.get(row.id) ?? false,
          pathId: row.path_id,
          progressPercent: courseProgressPercent(
            (lessonsByVersion.get(row.version_id) ?? []).map((lesson) => ({
              kind: lesson.kind,
              required: lesson.required,
              completed: completedLessons.has(`${row.id}:${lesson.id}`),
            })),
          ),
        },
      ];
    });

    return {
      staffId,
      courses,
      certificates: (certificatesResult.data ?? []).map((certificate) => ({
        id: certificate.id,
        courseTitle: certificate.course_title,
        status: certificate.status,
        issuedAt: certificate.issued_at,
        validUntil: certificate.valid_until,
      })),
      paths: (pathsResult.data ?? []).map((path) => ({
        id: path.id,
        title: path.title,
        status: path.status,
      })),
    };
  },
  { auth: { capability: "training.learn" } },
);

export const getMyLearningOutline = createSafeAuthenticatedAction(
  outlineInput,
  async (data, context) => {
    if (learningCarriesClientOutcome(data)) {
      throw new Error("learning cannot set completion or score");
    }
    const staffId = await actorStaffId(context);
    if (!staffId) throw new Error("No staff profile");

    const { data: enrollment, error } = await context.supabase
      .from("training_course_enrollments")
      .select("id, staff_id, course_id, version_id, status, due_on, completed_at, started_at")
      .eq("id", data.enrollmentId)
      .eq("staff_id", staffId)
      .maybeSingle();
    throwIf(error);
    if (!enrollment || !enrollmentOwnedByStaff(staffId, enrollment.staff_id)) {
      throw new Error("Enrollment not found");
    }

    const { data: course, error: courseError } = await context.supabase
      .from("training_courses")
      .select("id, title, code, status")
      .eq("id", enrollment.course_id)
      .maybeSingle();
    throwIf(courseError);

    const { data: sections, error: sectionError } = await context.supabase
      .from("training_sections")
      .select("id, title, sort_order")
      .eq("version_id", enrollment.version_id)
      .order("sort_order");
    throwIf(sectionError);
    const sectionIds = (sections ?? []).map((section) => section.id);
    const lessonsResult = sectionIds.length
      ? await context.supabase
          .from("training_lessons")
          .select("id, section_id, title, kind, sort_order")
          .in("section_id", sectionIds)
          .order("sort_order")
      : { data: [], error: null };
    throwIf(lessonsResult.error);

    const { error: startedError } = await context.supabase.rpc("training_mark_started", {
      _enrollment_id: enrollment.id,
    });
    throwIf(startedError);

    return {
      enrollmentId: enrollment.id,
      title: course?.title ?? "",
      code: course?.code ?? "",
      status: enrollment.status,
      dueOn: enrollment.due_on,
      completedAt: enrollment.completed_at,
      sections: (sections ?? []).map((section) => ({
        id: section.id,
        title: section.title,
        lessons: (lessonsResult.data ?? [])
          .filter((lesson) => lesson.section_id === section.id)
          .map((lesson) => ({ id: lesson.id, title: lesson.title, kind: lesson.kind })),
      })),
    };
  },
  { auth: { capability: "training.learn" } },
);
