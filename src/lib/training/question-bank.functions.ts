"use server";

import { z } from "zod";

import { createSafeAuthenticatedAction } from "@/lib/server/create-action";
import { requireCapability } from "@/lib/server/authorize";
import type { Json } from "@/integrations/supabase/types";
import type { AuthContext } from "@/lib/server/auth";

import { QUESTION_DIFFICULTIES, QUESTION_KINDS, questionKeyIsUsable } from "./engine";

const uuid = z.string().uuid();
const pageSize = 20;
const OBJECTIVE_KINDS = [
  "MULTIPLE_CHOICE",
  "MULTIPLE_SELECT",
  "TRUE_FALSE",
  "YES_NO",
  "SHORT_ANSWER",
  "ORDERING",
  "MATCHING",
] as const;

const bankInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    category: z.string().trim().max(80).nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
  })
  .strict();

const listInput = z
  .object({
    bankId: uuid,
    page: z.number().int().min(1).max(10000),
  })
  .strict();

const optionInput = z
  .object({
    id: z.string().uuid(),
    label: z.string().trim().min(1).max(500),
    side: z.enum(["left", "right"]).nullable(),
  })
  .strict();

const questionInput = z
  .object({
    bankId: uuid,
    kind: z.enum(QUESTION_KINDS),
    prompt: z.string().trim().min(1).max(4000),
    difficulty: z.enum(QUESTION_DIFFICULTIES).nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    topic: z.string().trim().max(120).nullable(),
    courseId: uuid.nullable(),
    points: z.number().int().min(1).max(100),
    explanation: z.string().trim().max(4000).nullable(),
    scenarioPrompt: z.string().trim().max(4000).nullable(),
    innerKind: z.enum(OBJECTIVE_KINDS).nullable(),
    options: z.array(optionInput).max(20),
    correct: z.custom<Record<string, unknown>>((value) => Boolean(value) && typeof value === "object" && !Array.isArray(value)),
  })
  .strict();

const quizSettingsInput = z
  .object({
    lessonId: uuid,
    bankId: uuid,
    drawCount: z.number().int().min(1).max(100),
    passingScore: z.number().min(0).max(100),
    maxAttempts: z.number().int().min(1).max(20),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
  })
  .strict();

const lessonInput = z.object({ lessonId: uuid }).strict();

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function manage(context: AuthContext) {
  await requireCapability(context, "training.assessment.manage");
}

function publicOptions(options: { id: string; label: string; side: "left" | "right" | null }[]) {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    side: option.side,
  }));
}

export const listTrainingQuestionBanks = createSafeAuthenticatedAction(z.object({}).strict(), async (_data, context) => {
  await manage(context);
  const { data, error } = await context.supabase
    .from("training_question_banks")
    .select("id, name, category, tags, created_at")
    .order("created_at", { ascending: false });
  throwIf(error);
  return data ?? [];
});

export const createTrainingQuestionBank = createSafeAuthenticatedAction(bankInput, async (data, context) => {
  await manage(context);
  const id = crypto.randomUUID();
  const { error } = await context.supabase.from("training_question_banks").insert({
    id,
    name: data.name,
    category: data.category,
    tags: data.tags,
    created_by: context.userId,
  });
  throwIf(error);
  return { id, name: data.name, category: data.category, tags: data.tags };
});

export const listTrainingBankQuestions = createSafeAuthenticatedAction(listInput, async (data, context) => {
  await manage(context);
  const from = (data.page - 1) * pageSize;
  const { data: rows, error, count } = await context.supabase
    .from("training_bank_questions")
    .select("id, bank_id, kind, prompt, difficulty, tags, topic, course_id, points, options, scenario_prompt, inner_kind, created_at", { count: "exact" })
    .eq("bank_id", data.bankId)
    .order("created_at", { ascending: true })
    .range(from, from + pageSize - 1);
  throwIf(error);
  const ids = (rows ?? []).map((row) => row.id);
  const keys = ids.length
    ? await context.supabase
        .from("training_bank_question_keys")
        .select("question_id, correct, explanation")
        .in("question_id", ids)
    : { data: [], error: null };
  throwIf(keys.error);
  const byId = new Map((keys.data ?? []).map((key) => [key.question_id, key]));
  return {
    page: data.page,
    pageSize,
    total: count ?? 0,
    questions: (rows ?? []).map((row) => {
      const key = byId.get(row.id);
      return {
        id: row.id,
        kind: row.kind,
        prompt: row.prompt,
        difficulty: row.difficulty,
        tags: row.tags,
        topic: row.topic,
        courseId: row.course_id,
        points: row.points,
        options: row.options,
        scenarioPrompt: row.scenario_prompt,
        innerKind: row.inner_kind,
        correct: key?.correct ?? null,
        explanation: key?.explanation ?? null,
      };
    }),
  };
});

export const createTrainingBankQuestion = createSafeAuthenticatedAction(questionInput, async (data, context) => {
  await manage(context);
  const gradedKind = data.kind === "SCENARIO" ? data.innerKind : data.kind;
  if (!gradedKind || !questionKeyIsUsable(data.kind, data.correct, data.innerKind)) {
    throw new Error("question cannot be graded");
  }
  const id = crypto.randomUUID();
  const { error } = await context.supabase.from("training_bank_questions").insert({
    id,
    bank_id: data.bankId,
    kind: data.kind,
    prompt: data.prompt,
    difficulty: data.difficulty,
    tags: data.tags,
    topic: data.topic,
    course_id: data.courseId,
    points: data.points,
    options: publicOptions(data.options),
    scenario_prompt: data.kind === "SCENARIO" ? data.scenarioPrompt : null,
    inner_kind: data.kind === "SCENARIO" ? data.innerKind : null,
  });
  throwIf(error);
  const { error: keyError } = await context.supabase.from("training_bank_question_keys").insert({
    question_id: id,
    correct: data.correct as Json,
    explanation: data.explanation,
  });
  throwIf(keyError);
  return { id };
});

export const getTrainingLessonQuiz = createSafeAuthenticatedAction(lessonInput, async (data, context) => {
  await manage(context);
  const { data: row, error } = await context.supabase
    .from("training_lesson_quizzes")
    .select("lesson_id, bank_id, draw_count, passing_score, max_attempts, shuffle_questions, shuffle_options")
    .eq("lesson_id", data.lessonId)
    .maybeSingle();
  throwIf(error);
  return row;
});

export const saveTrainingLessonQuiz = createSafeAuthenticatedAction(quizSettingsInput, async (data, context) => {
  await manage(context);
  const { data: lesson, error } = await context.supabase
    .from("training_lessons")
    .select("id, kind")
    .eq("id", data.lessonId)
    .maybeSingle();
  throwIf(error);
  if (!lesson || lesson.kind !== "QUIZ") throw new Error("lesson is not a quiz");
  const { error: saveError } = await context.supabase.from("training_lesson_quizzes").upsert(
    {
      lesson_id: data.lessonId,
      bank_id: data.bankId,
      draw_count: data.drawCount,
      passing_score: data.passingScore,
      max_attempts: data.maxAttempts,
      shuffle_questions: data.shuffleQuestions,
      shuffle_options: data.shuffleOptions,
    },
    { onConflict: "lesson_id" },
  );
  throwIf(saveError);
  return { saved: true };
});
