"use server";

import { z } from "zod";

import { createSafeAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

import { enrollmentOwnedByStaff, learnerPayloadHasAnswerKey, toLearnerQuestion } from "./engine";

const uuid = z.string().uuid();

const startInput = z.object({ enrollmentId: uuid, lessonId: uuid }).strict();

const answerInput = z
  .object({
    questionId: uuid,
    value: z.union([z.string().max(2000), z.boolean(), z.array(z.string().max(80)).max(30)]).nullable(),
    order: z.array(z.string().max(80)).max(30).nullable(),
    pairs: z.array(z.object({ left: z.string().max(80), right: z.string().max(80) }).strict()).max(30).nullable(),
  })
  .strict();

const submitInput = z
  .object({
    attemptId: uuid,
    answers: z.array(answerInput).max(100),
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

function learnerQuestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    if (!row || typeof row !== "object") return { id: null, prompt: "", kind: "", scenarioPrompt: null, innerKind: null, options: [] };
    const source = row as Record<string, unknown>;
    return toLearnerQuestion({
      id: String(source.id ?? ""),
      prompt: String(source.prompt ?? ""),
      kind: String(source.kind ?? ""),
      scenarioPrompt: typeof source.scenarioPrompt === "string" ? source.scenarioPrompt : null,
      innerKind: typeof source.innerKind === "string" ? source.innerKind : null,
      options: source.options,
    });
  });
}

export const startTrainingQuiz = createSafeAuthenticatedAction(startInput, async (data, context) => {
  const staffId = await actorStaffId(context);
  if (!staffId) throw new Error("no staff profile");

  const { data: enrollment, error } = await context.supabase
    .from("training_course_enrollments")
    .select("id, staff_id")
    .eq("id", data.enrollmentId)
    .eq("staff_id", staffId)
    .maybeSingle();
  throwIf(error);
  if (!enrollment || !enrollmentOwnedByStaff(staffId, enrollment.staff_id)) {
    throw new Error("attempt belongs to another employee");
  }

  const { data: payload, error: startError } = await context.supabase.rpc("training_quiz_start", {
    _enrollment_id: data.enrollmentId,
    _lesson_id: data.lessonId,
  });
  throwIf(startError);
  const record = (payload ?? {}) as Record<string, unknown>;
  if (learnerPayloadHasAnswerKey(record)) {
    throw new Error("answer key was returned before submit");
  }
  const questions = learnerQuestions(record.questions);
  if (questions.some((question) => learnerPayloadHasAnswerKey(question))) {
    throw new Error("answer key was returned before submit");
  }
  return {
    attemptId: String(record.attemptId ?? ""),
    questions,
    attemptsRemaining: Number(record.attemptsRemaining ?? 0),
    submitted: false,
  };
});

export const submitTrainingQuiz = createSafeAuthenticatedAction(submitInput, async (data, context) => {
  const staffId = await actorStaffId(context);
  if (!staffId) throw new Error("no staff profile");

  const { data: attempt, error } = await context.supabase
    .from("training_quiz_attempts")
    .select("id, staff_id")
    .eq("id", data.attemptId)
    .eq("staff_id", staffId)
    .maybeSingle();
  throwIf(error);
  if (!attempt || !enrollmentOwnedByStaff(staffId, attempt.staff_id)) {
    throw new Error("attempt belongs to another employee");
  }

  const { data: payload, error: submitError } = await context.supabase.rpc("training_quiz_submit", {
    _attempt_id: data.attemptId,
    _answers: data.answers,
  });
  throwIf(submitError);
  const record = (payload ?? {}) as Record<string, unknown>;
  const explanations = Array.isArray(record.explanations)
    ? record.explanations.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        return [{
          questionId: String(row.questionId ?? ""),
          explanation: typeof row.explanation === "string" ? row.explanation : null,
          wasCorrect: row.wasCorrect === true,
        }];
      })
    : [];
  return {
    score: typeof record.score === "number" ? record.score : Number(record.score ?? 0),
    passed: record.passed === true,
    attemptsRemaining: Number(record.attemptsRemaining ?? 0),
    lessonCompleted: record.lessonCompleted === true,
    courseCompleted: record.courseCompleted === true,
    explanations,
  };
});
