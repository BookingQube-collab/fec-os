"use server";

import { z } from "zod";

import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

import { pathProgress } from "./engine";

const uuid = z.string().uuid();

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const listTrainingPaths = createSafeAuthenticatedAction(
  z.object({}).strict(),
  async (_data, context) => {
    const { data, error } = await context.supabase
      .from("training_paths")
      .select("id, code, title, summary, status, certificate_enabled")
      .order("title")
      .limit(100);
    throwIf(error);
    return data ?? [];
  },
  { defaultInput: {}, auth: { anyCapability: ["training.view", "training.learn", "training.create"] } },
);

export const getTrainingPath = createSafeAuthenticatedAction(
  z.object({ pathId: uuid }).strict(),
  async (data, context) => {
    const { data: path, error } = await context.supabase
      .from("training_paths")
      .select("id, code, title, summary, status, certificate_enabled")
      .eq("id", data.pathId)
      .maybeSingle();
    throwIf(error);
    if (!path) throw new Error("Learning path not found");
    const { data: items, error: itemError } = await context.supabase
      .from("training_path_items")
      .select("course_id, sort_order")
      .eq("path_id", data.pathId)
      .order("sort_order");
    throwIf(itemError);
    const courseIds = (items ?? []).map((item) => item.course_id);
    const { data: courseRows, error: courseError } = courseIds.length
      ? await context.supabase.from("training_courses").select("id, code, title, status").in("id", courseIds)
      : { data: [], error: null };
    throwIf(courseError);
    const byId = new Map((courseRows ?? []).map((course) => [course.id, course]));
    const courses = (items ?? []).map((item) => {
      const course = byId.get(item.course_id);
      return {
        courseId: item.course_id,
        sortOrder: item.sort_order,
        code: course?.code ?? "",
        title: course?.title ?? "",
        status: course?.status ?? "",
      };
    });
    return { path, courses, progress: pathProgress(0, courses.length) };
  },
  { auth: { anyCapability: ["training.view", "training.learn", "training.edit"] } },
);

export const saveTrainingPath = createSafeAuthenticatedAction(
  z
    .object({
      pathId: uuid.nullable(),
      code: z.string().trim().min(2).max(40),
      title: z.string().trim().min(1).max(200),
      summary: z.string().trim().max(500).nullable(),
      certificateEnabled: z.boolean(),
      courseIds: z.array(uuid).max(30),
    })
    .strict(),
  async (data, context) => {
    const code = data.code.trim().toUpperCase();
    const courseIds = [...new Set(data.courseIds)];
    let pathId = data.pathId;
    if (!pathId) {
      const { data: created, error } = await context.supabase
        .from("training_paths")
        .insert({
          code,
          title: data.title.trim(),
          summary: data.summary,
          certificate_enabled: data.certificateEnabled,
          created_by: context.userId,
        })
        .select("id")
        .single();
      throwIf(error);
      if (!created) throw new Error("Learning path was not saved");
      pathId = created.id;
    } else {
      const { error } = await context.supabase
        .from("training_paths")
        .update({
          title: data.title.trim(),
          summary: data.summary,
          certificate_enabled: data.certificateEnabled,
        })
        .eq("id", pathId);
      throwIf(error);
      const { error: clearError } = await context.supabase.from("training_path_items").delete().eq("path_id", pathId);
      throwIf(clearError);
    }
    if (courseIds.length > 0) {
      const { error } = await context.supabase.from("training_path_items").insert(
        courseIds.map((courseId, index) => ({ path_id: pathId as string, course_id: courseId, sort_order: index })),
      );
      throwIf(error);
    }
    if (!pathId) throw new Error("Learning path was not saved");
    return { id: pathId };
  },
  { auth: { anyCapability: ["training.create", "training.edit"] } },
);

export const publishTrainingPath = createSafeAuthenticatedAction(
  z.object({ pathId: uuid }).strict(),
  async (data, context) => {
    const { error } = await context.supabase
      .from("training_paths")
      .update({ status: "PUBLISHED" })
      .eq("id", data.pathId);
    throwIf(error);
    return { id: data.pathId };
  },
  { auth: { capability: "training.publish" } },
);

export const issuePathCertificate = createSafeAuthenticatedAction(
  z.object({ pathId: uuid, staffId: uuid }).strict(),
  async (data, context) => {
    const { data: id, error } = await context.supabase.rpc("training_issue_path_certificate", {
      _path_id: data.pathId,
      _staff_id: data.staffId,
    });
    throwIf(error);
    if (!id) throw new Error("learning path is not complete");
    return { id };
  },
  { auth: { capability: "training.certificate.issue" } },
);
