"use server";

import { z } from "zod";

import { createSafeAuthenticatedAction } from "@/lib/server/create-action";
import { requireCapability } from "@/lib/server/authorize";
import type { AuthContext } from "@/lib/server/auth";

import { parseChecklist } from "./engine";

const uuid = z.string().uuid();
const pageSize = 20;

const queueInput = z.object({ page: z.number().int().min(1).max(10000) }).strict();

const detailInput = z.object({ enrollmentId: uuid, lessonId: uuid }).strict();

const gradeInput = z
  .object({
    enrollmentId: uuid,
    lessonId: uuid,
    items: z.array(z.object({ id: z.string().trim().min(1).max(200), met: z.boolean() }).strict()).max(100),
    result: z.enum(["PASS", "FAIL"]),
    notes: z.string().trim().max(4000).nullable(),
    confirmationName: z.string().trim().max(200).nullable(),
    confirmed: z.boolean(),
  })
  .strict();

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function gradeCapability(context: AuthContext) {
  await requireCapability(context, "training.assessment.grade");
}

export const listPracticalQueue = createSafeAuthenticatedAction(queueInput, async (data, context) => {
  await gradeCapability(context);
  const { data: payload, error } = await context.supabase.rpc("training_practical_queue", {
    _limit: pageSize,
    _offset: (data.page - 1) * pageSize,
  });
  throwIf(error);
  const record = (payload ?? {}) as { total?: number; rows?: unknown };
  const rows = Array.isArray(record.rows) ? record.rows : [];
  return {
    page: data.page,
    pageSize,
    total: Number(record.total ?? 0),
    rows: rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      return [{
        enrollmentId: String(item.enrollmentId ?? ""),
        lessonId: String(item.lessonId ?? ""),
        staffName: String(item.staffName ?? ""),
        employeeCode: String(item.employeeCode ?? ""),
        courseTitle: String(item.courseTitle ?? ""),
        lessonTitle: String(item.lessonTitle ?? ""),
        dueOn: item.dueOn == null ? null : String(item.dueOn),
      }];
    }),
  };
});

export const getPracticalAssessment = createSafeAuthenticatedAction(detailInput, async (data, context) => {
  await gradeCapability(context);
  const { data: enrollment, error } = await context.supabase
    .from("training_course_enrollments")
    .select("id, staff_id, version_id")
    .eq("id", data.enrollmentId)
    .maybeSingle();
  throwIf(error);
  if (!enrollment) throw new Error("grader is outside staff scope");

  const { data: lesson, error: lessonError } = await context.supabase
    .from("training_lessons")
    .select("id, title, kind, body, section_id")
    .eq("id", data.lessonId)
    .maybeSingle();
  throwIf(lessonError);
  if (!lesson || lesson.kind !== "PRACTICAL_ASSESSMENT") throw new Error("lesson is not a practical assessment");

  const { data: section, error: sectionError } = await context.supabase
    .from("training_sections")
    .select("id, version_id")
    .eq("id", lesson.section_id)
    .maybeSingle();
  throwIf(sectionError);
  if (!section || section.version_id !== enrollment.version_id) throw new Error("lesson not in enrollment");

  const { data: attempts, error: attemptError } = await context.supabase
    .from("training_practical_assessments")
    .select("id, passed, notes, assessed_at, confirmation_name, rubric")
    .eq("enrollment_id", data.enrollmentId)
    .eq("lesson_id", data.lessonId)
    .order("created_at", { ascending: true });
  throwIf(attemptError);

  return {
    lessonTitle: lesson.title,
    checklist: parseChecklist(lesson.body),
    attempts: (attempts ?? []).map((attempt) => ({
      id: attempt.id,
      passed: attempt.passed,
      notes: attempt.notes,
      assessedAt: attempt.assessed_at,
      confirmationName: attempt.confirmation_name,
    })),
  };
});

export const gradePracticalAssessment = createSafeAuthenticatedAction(gradeInput, async (data, context) => {
  await gradeCapability(context);
  const { data: payload, error } = await context.supabase.rpc("training_practical_grade", {
    _enrollment_id: data.enrollmentId,
    _lesson_id: data.lessonId,
    _items: data.items,
    _result: data.result,
    _notes: data.notes,
    _confirmation_name: data.confirmationName,
    _confirmed: data.confirmed,
  });
  throwIf(error);
  const record = (payload ?? {}) as Record<string, unknown>;
  return {
    attemptId: String(record.attemptId ?? ""),
    passed: record.passed === true,
    lessonCompleted: record.lessonCompleted === true,
    courseCompleted: record.courseCompleted === true,
  };
});
