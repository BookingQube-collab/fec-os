"use server";

import { z } from "zod";

import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

import { TRAINING_ENTITY_TYPES, trainingShareCard } from "./engine";

const uuid = z.string().uuid();

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export const listTrainingLinks = createSafeAuthenticatedAction(
  z.object({ courseId: uuid.nullable() }).strict(),
  async (data, context) => {
    let query = context.supabase
      .from("training_entity_links")
      .select("id, course_id, entity_type, entity_id, requirement_type, enforce_mode, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.courseId) query = query.eq("course_id", data.courseId);
    const { data: rows, error } = await query;
    throwIf(error);
    return rows ?? [];
  },
  { auth: { capability: "training.view" } },
);

export const saveTrainingLink = createSafeAuthenticatedAction(
  z
    .object({
      courseId: uuid,
      entityType: z.enum(TRAINING_ENTITY_TYPES),
      entityId: uuid,
      requirementType: z.enum(["REQUIRED", "RECOMMENDED"]),
      enforceMode: z.enum(["WARN", "BLOCK"]),
    })
    .strict(),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("training_entity_links")
      .insert({
        course_id: data.courseId,
        entity_type: data.entityType,
        entity_id: data.entityId,
        requirement_type: data.requirementType,
        enforce_mode: data.enforceMode,
        created_by: context.userId,
      })
      .select("id")
      .single();
    throwIf(error);
    if (!row) throw new Error("Link was not saved");
    return { id: row.id };
  },
  { auth: { capability: "training.edit" } },
);

export const readTrainingRequirement = createSafeAuthenticatedAction(
  z.object({ entityType: z.enum(TRAINING_ENTITY_TYPES), entityId: uuid, staffId: uuid }).strict(),
  async (data, context) => {
    const { data: payload, error } = await context.supabase.rpc("training_requirement_status", {
      _entity_type: data.entityType,
      _entity_id: data.entityId,
      _staff_id: data.staffId,
    });
    throwIf(error);
    const record = asRecord(payload);
    const requirements = Array.isArray(record.requirements) ? record.requirements : [];
    return requirements.map((row) => {
      const item = asRecord(row);
      return {
        courseId: String(item.courseId ?? ""),
        courseCode: String(item.courseCode ?? ""),
        courseTitle: String(item.courseTitle ?? ""),
        requirementType: String(item.requirementType ?? "REQUIRED"),
        enforceMode: String(item.enforceMode ?? "WARN"),
        status: String(item.status ?? "NOT_TRAINED"),
      };
    });
  },
  { auth: { anyCapability: ["training.view", "training.learn"] } },
);

export const trainingCourseShareCard = createSafeAuthenticatedAction(
  z.object({ courseId: uuid, dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }).strict(),
  async (data, context) => {
    const { data: course, error } = await context.supabase
      .from("training_courses")
      .select("id, title, required, estimated_minutes, status")
      .eq("id", data.courseId)
      .maybeSingle();
    throwIf(error);
    if (!course || course.status !== "PUBLISHED") throw new Error("Course is not available to share");
    const card = trainingShareCard({
      title: course.title,
      mandatory: course.required,
      durationMinutes: course.estimated_minutes,
      dueOn: data.dueOn,
      href: `/training/learning`,
    });
    if (!card) throw new Error("Course is not available to share");
    return card;
  },
  { auth: { anyCapability: ["training.view", "training.assign"] } },
);
