"use server";

import { z } from "zod";

import { createSafeAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

import {
  courseProgressPercent,
  enrollmentOwnedByStaff,
  heartbeatAccepted,
  isGatedLesson,
  isReadLesson,
  openingLessonCompletes,
  parseChecklist,
  positionAdvanceAccepted,
  progressCarriesClientOutcome,
  readLessonCanComplete,
} from "./engine";

const uuid = z.string().uuid();

const loadInput = z.object({ enrollmentId: uuid }).strict();

const eventInput = z
  .object({
    enrollmentId: uuid,
    lessonId: uuid,
    event: z.enum(["VIEW", "HEARTBEAT", "MARK_READ", "POSITION", "CHECKLIST", "ACKNOWLEDGE"]),
    deltaSeconds: z.number().int().nullable(),
    positionSeconds: z.number().int().min(0).max(86_400).nullable(),
    itemId: z.string().trim().max(200).nullable(),
    itemChecked: z.boolean().nullable(),
  })
  .strict();

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function actorStaffId(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("training_actor_staff_id");
  throwIf(error);
  return data;
}

export const getTrainingPlayer = createSafeAuthenticatedAction(
  loadInput,
  async (data, context) => {
    const staffId = await actorStaffId(context);
    if (!staffId) return { staffId: null, player: null };

    const { data: enrollment, error } = await context.supabase
      .from("training_course_enrollments")
      .select("id, staff_id, course_id, version_id, status, due_on, completed_at, started_at, last_lesson_id")
      .eq("id", data.enrollmentId)
      .eq("staff_id", staffId)
      .maybeSingle();
    throwIf(error);
    if (!enrollment || !enrollmentOwnedByStaff(staffId, enrollment.staff_id)) {
      throw new Error("Enrollment not found");
    }

    const { data: course, error: courseError } = await context.supabase
      .from("training_courses")
      .select("id, title, code")
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
          .select("id, section_id, title, kind, body, external_url, duration_seconds, required, sort_order")
          .in("section_id", sectionIds)
          .order("sort_order")
      : { data: [], error: null };
    throwIf(lessonsResult.error);

    const { data: progressRows, error: progressError } = await context.supabase
      .from("training_progress")
      .select("lesson_id, position_seconds, completed_at, viewed_at, time_spent_seconds, checklist, acknowledged_at")
      .eq("enrollment_id", enrollment.id);
    throwIf(progressError);
    const progressByLesson = new Map((progressRows ?? []).map((row) => [row.lesson_id, row]));
    const lessons = lessonsResult.data ?? [];
    const progressPercent = courseProgressPercent(
      lessons.map((lesson) => ({
        kind: lesson.kind,
        required: lesson.required,
        completed: Boolean(progressByLesson.get(lesson.id)?.completed_at),
      })),
    );

    return {
      staffId,
      player: {
        enrollmentId: enrollment.id,
        title: course?.title ?? "",
        code: course?.code ?? "",
        status: enrollment.status,
        dueOn: enrollment.due_on,
        courseCompleted: enrollment.completed_at != null || enrollment.status === "COMPLETED",
        lastLessonId: enrollment.last_lesson_id,
        progressPercent,
        sections: (sections ?? []).map((section) => ({
          id: section.id,
          title: section.title,
          lessons: lessons
            .filter((lesson) => lesson.section_id === section.id)
            .map((lesson) => {
              const progress = progressByLesson.get(lesson.id);
              const checked = Array.isArray(progress?.checklist)
                ? progress.checklist.filter((item): item is string => typeof item === "string")
                : [];
              return {
                id: lesson.id,
                title: lesson.title,
                kind: lesson.kind,
                body: lesson.body,
                externalUrl: lesson.external_url,
                durationSeconds: lesson.duration_seconds,
                required: lesson.required,
                gated: isGatedLesson(lesson.kind),
                completed: Boolean(progress?.completed_at),
                viewed: Boolean(progress?.viewed_at),
                timeSpentSeconds: progress?.time_spent_seconds ?? 0,
                positionSeconds: progress?.position_seconds ?? 0,
                checklist: checked,
                acknowledged: Boolean(progress?.acknowledged_at),
              };
            }),
        })),
      },
    };
  },
  { auth: { capability: "training.learn" } },
);

export const recordTrainingPlayerEvent = createSafeAuthenticatedAction(
  eventInput,
  async (data, context) => {
    if (progressCarriesClientOutcome(data)) {
      throw new Error("progress cannot set completion or score");
    }
    if (data.event === "HEARTBEAT" && (data.deltaSeconds == null || !heartbeatAccepted(data.deltaSeconds))) {
      throw new Error("heartbeat rejected");
    }
    const staffId = await actorStaffId(context);
    if (!staffId) throw new Error("No staff profile");

    const { data: enrollment, error } = await context.supabase
      .from("training_course_enrollments")
      .select("id, staff_id, version_id")
      .eq("id", data.enrollmentId)
      .eq("staff_id", staffId)
      .maybeSingle();
    throwIf(error);
    if (!enrollment || !enrollmentOwnedByStaff(staffId, enrollment.staff_id)) {
      throw new Error("Enrollment not found");
    }

    const { data: lesson, error: lessonError } = await context.supabase
      .from("training_lessons")
      .select("id, section_id, kind, body, duration_seconds")
      .eq("id", data.lessonId)
      .maybeSingle();
    throwIf(lessonError);
    if (!lesson) throw new Error("lesson not in enrollment");
    const { data: section, error: sectionError } = await context.supabase
      .from("training_sections")
      .select("id, version_id")
      .eq("id", lesson.section_id)
      .maybeSingle();
    throwIf(sectionError);
    if (!section || section.version_id !== enrollment.version_id) throw new Error("lesson not in enrollment");

    if (openingLessonCompletes(lesson.kind) && data.event === "VIEW") {
      throw new Error("opening a lesson cannot complete it");
    }
    if (data.event === "MARK_READ") {
      const { data: spent, error: spentError } = await context.supabase
        .from("training_progress")
        .select("time_spent_seconds")
        .eq("enrollment_id", enrollment.id)
        .eq("lesson_id", lesson.id)
        .maybeSingle();
      throwIf(spentError);
      if (!isReadLesson(lesson.kind) || !readLessonCanComplete(spent?.time_spent_seconds ?? 0, true)) {
        throw new Error("minimum time not reached");
      }
    }
    if (data.event === "POSITION") {
      const { data: current, error: currentError } = await context.supabase
        .from("training_progress")
        .select("position_seconds")
        .eq("enrollment_id", enrollment.id)
        .eq("lesson_id", lesson.id)
        .maybeSingle();
      throwIf(currentError);
      const next = data.positionSeconds ?? 0;
      if (!positionAdvanceAccepted(current?.position_seconds ?? 0, next)) {
        throw new Error("position jump rejected");
      }
    }
    if (data.event === "CHECKLIST") {
      const items = parseChecklist(lesson.body);
      if (!data.itemId || !items.some((item) => item.id === data.itemId)) {
        throw new Error("checklist item not found");
      }
    }
    if (isGatedLesson(lesson.kind) && data.event !== "VIEW" && data.event !== "HEARTBEAT") {
      throw new Error("lesson is not finishable in this phase");
    }

    const { data: result, error: eventError } = await context.supabase.rpc("training_player_event", {
      _enrollment_id: enrollment.id,
      _lesson_id: lesson.id,
      _event: data.event,
      _delta_seconds: data.deltaSeconds,
      _position_seconds: data.positionSeconds,
      _item_id: data.itemId,
      _item_checked: data.itemChecked,
    });
    throwIf(eventError);
    const payload = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
    return {
      timeSpentSeconds: typeof payload.timeSpentSeconds === "number" ? payload.timeSpentSeconds : 0,
      positionSeconds: typeof payload.positionSeconds === "number" ? payload.positionSeconds : 0,
      lessonCompleted: payload.lessonCompleted === true,
      courseCompleted: payload.courseCompleted === true,
      checklist: Array.isArray(payload.checklist)
        ? payload.checklist.filter((item): item is string => typeof item === "string")
        : [],
      acknowledged: payload.acknowledged === true,
    };
  },
  { auth: { capability: "training.learn" } },
);
