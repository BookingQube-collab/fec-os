"use server";

import { z } from "zod";

import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

import { courseProgressPercent } from "./engine";

const listInput = z.object({}).strict();

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const RECORD_LIMIT = 400;

export const listTrainingDeskRecords = createSafeAuthenticatedAction(
  listInput,
  async (_data, context) => {
    const { data, error, count } = await context.supabase
      .from("training_course_enrollments")
      .select("id, staff_id, course_id, version_id, status, due_on, completed_at, score", { count: "exact" })
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(RECORD_LIMIT);
    throwIf(error);
    const enrollments = data ?? [];
    const staffIds = [...new Set(enrollments.map((row) => row.staff_id))];
    const courseIds = [...new Set(enrollments.map((row) => row.course_id))];
    const versionIds = [...new Set(enrollments.map((row) => row.version_id))];
    const enrollmentIds = enrollments.map((row) => row.id);

    const [staffResult, courseResult, versionResult, sectionResult, progressResult, attemptResult] = await Promise.all([
      staffIds.length
        ? context.supabase.from("staff").select("id, full_name, employee_code").in("id", staffIds)
        : Promise.resolve({ data: [], error: null }),
      courseIds.length
        ? context.supabase
            .from("training_courses")
            .select("id, code, title, required, requires_session_attendance")
            .in("id", courseIds)
        : Promise.resolve({ data: [], error: null }),
      versionIds.length
        ? context.supabase.from("training_course_versions").select("id, version_no").in("id", versionIds)
        : Promise.resolve({ data: [], error: null }),
      versionIds.length
        ? context.supabase.from("training_sections").select("id, version_id").in("version_id", versionIds)
        : Promise.resolve({ data: [], error: null }),
      enrollmentIds.length
        ? context.supabase.from("training_progress").select("enrollment_id, lesson_id, completed_at").in("enrollment_id", enrollmentIds)
        : Promise.resolve({ data: [], error: null }),
      enrollmentIds.length
        ? context.supabase.from("training_attempts").select("enrollment_id, passed").in("enrollment_id", enrollmentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    throwIf(staffResult.error);
    throwIf(courseResult.error);
    throwIf(versionResult.error);
    throwIf(sectionResult.error);
    throwIf(progressResult.error);
    throwIf(attemptResult.error);

    const sectionIds = (sectionResult.data ?? []).map((section) => section.id);
    const lessonsResult = sectionIds.length
      ? await context.supabase.from("training_lessons").select("id, section_id, kind, required").in("section_id", sectionIds)
      : { data: [], error: null };
    throwIf(lessonsResult.error);

    const staffById = new Map((staffResult.data ?? []).map((person) => [person.id, person]));
    const courseById = new Map((courseResult.data ?? []).map((course) => [course.id, course]));
    const versionById = new Map((versionResult.data ?? []).map((version) => [version.id, version]));
    const sectionVersion = new Map((sectionResult.data ?? []).map((section) => [section.id, section.version_id]));
    const lessonsByVersion = new Map<string, { id: string; kind: string; required: boolean }[]>();
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
    const attemptsByEnrollment = new Map<string, { count: number; failed: boolean }>();
    for (const attempt of attemptResult.data ?? []) {
      const current = attemptsByEnrollment.get(attempt.enrollment_id) ?? { count: 0, failed: false };
      current.count += 1;
      if (attempt.passed === false) current.failed = true;
      attemptsByEnrollment.set(attempt.enrollment_id, current);
    }

    return {
      truncated: (count ?? enrollments.length) > RECORD_LIMIT,
      rows: enrollments.flatMap((row) => {
        const person = staffById.get(row.staff_id);
        const course = courseById.get(row.course_id);
        if (!course) return [];
        const version = versionById.get(row.version_id);
        const attempts = attemptsByEnrollment.get(row.id) ?? { count: 0, failed: false };
        const lessons = lessonsByVersion.get(row.version_id) ?? [];
        return [
          {
            id: row.id,
            staffName: person?.full_name ?? "",
            employeeCode: person?.employee_code ?? "",
            courseId: course.id,
            courseTitle: course.title,
            courseCode: course.code,
            required: course.required,
            requiresSession: course.requires_session_attendance,
            versionNo: version?.version_no ?? null,
            status: row.status,
            dueOn: row.due_on,
            completedAt: row.completed_at,
            score: row.score == null ? null : Number(row.score),
            progressPercent: courseProgressPercent(
              lessons.map((lesson) => ({
                kind: lesson.kind,
                required: lesson.required,
                completed: completedLessons.has(`${row.id}:${lesson.id}`),
              })),
            ),
            lessonCount: lessons.length,
            attemptCount: attempts.count,
            failedAttempt: attempts.failed,
            demo: null,
          },
        ];
      }),
    };
  },
  { defaultInput: {}, auth: { anyCapability: ["training.view", "training.analytics.view"] } },
);
