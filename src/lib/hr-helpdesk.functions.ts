"use server";

import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DEFAULT_HELPDESK_CATEGORIES,
  HELPDESK_ATTACHMENT_BUCKET,
  HELPDESK_ATTACHMENT_MAX_BYTES,
  HELPDESK_STORAGE_MISSING,
  helpdeskAttachmentMagicOk,
  helpdeskAttachmentMime,
  helpdeskStorageMissing,
  parseHelpdeskPayload,
} from "@/lib/hr-helpdesk.shared";
import { canUserDo } from "@/lib/rbac";
import { createAuthenticatedAction } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { validateBase64Size } from "@/lib/server/upload-validation";

const categorySchema = z.string().trim().min(1).max(80);

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(280),
  categories: z.array(categorySchema).min(1).max(24),
  firstResponseHours: z.number().int().min(1).max(720),
  resolutionHours: z.number().int().min(1).max(720),
  defaultAssigneeStaffId: z.string().uuid().nullable(),
  assignmentNotes: z.string().trim().max(500),
});

export type HelpdeskSettings = {
  available: boolean;
  stored: boolean;
  name: string | null;
  description: string | null;
  categories: string[];
  firstResponseHours: number;
  resolutionHours: number;
  defaultAssigneeStaffId: string | null;
  assignmentNotes: string;
};

export type HelpdeskArticle = {
  id: string;
  title: string;
  body: string;
  category: string;
  visibility: "all_employees" | "hr_only";
  published: boolean;
  updatedAt: string;
};

export type HelpdeskRule = {
  id: string;
  kind: "routing" | "escalation";
  category: string;
  condition: string;
  assigneeStaffId: string | null;
  active: boolean;
};

function defaultSettings(available: boolean): HelpdeskSettings {
  return {
    available,
    stored: false,
    name: null,
    description: null,
    categories: [...DEFAULT_HELPDESK_CATEGORIES],
    firstResponseHours: 24,
    resolutionHours: 72,
    defaultAssigneeStaffId: null,
    assignmentNotes: "",
  };
}

function asCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_HELPDESK_CATEGORIES];
  const next = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 80);
  return next.length > 0 ? [...new Set(next)] : [...DEFAULT_HELPDESK_CATEGORIES];
}

export const getHelpdeskSettings = createAuthenticatedAction(
  z.object({}).default({}),
  async (_data, context) => {
    const { data, error } = await context.supabase
      .from("hr_helpdesk_settings")
      .select(
        "name, description, categories, first_response_hours, resolution_hours, default_assignee_staff_id, assignment_notes",
      )
      .limit(1)
      .maybeSingle();
    if (error) {
      if (helpdeskStorageMissing(error.message)) return defaultSettings(false);
      throw error;
    }
    if (!data) return defaultSettings(true);
    const row = data as Record<string, unknown>;
    return {
      available: true,
      stored: true,
      name: typeof row.name === "string" && row.name.trim() ? row.name : null,
      description: typeof row.description === "string" ? row.description : null,
      categories: asCategories(row.categories),
      firstResponseHours: Number(row.first_response_hours ?? 24),
      resolutionHours: Number(row.resolution_hours ?? 72),
      defaultAssigneeStaffId:
        typeof row.default_assignee_staff_id === "string" ? row.default_assignee_staff_id : null,
      assignmentNotes: typeof row.assignment_notes === "string" ? row.assignment_notes : "",
    } satisfies HelpdeskSettings;
  },
  { defaultInput: {}, auth: { capability: "hr.manage" } },
);

export const saveHelpdeskSettings = createAuthenticatedAction(
  settingsSchema,
  async (data, context) => {
    const categories = [...new Set(data.categories.map((item) => item.trim()))];
    const payload = {
      name: data.name,
      description: data.description,
      categories: categories as unknown as Json,
      first_response_hours: data.firstResponseHours,
      resolution_hours: data.resolutionHours,
      default_assignee_staff_id: data.defaultAssigneeStaffId,
      assignment_notes: data.assignmentNotes,
      updated_by: context.userId,
    };
    const { data: existing, error: readError } = await context.supabase
      .from("hr_helpdesk_settings")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (readError) {
      if (helpdeskStorageMissing(readError.message)) throw new Error(HELPDESK_STORAGE_MISSING);
      throw readError;
    }
    if (existing?.id) {
      const { error } = await context.supabase
        .from("hr_helpdesk_settings")
        .update(payload)
        .eq("id", existing.id as string);
      if (error) throw error;
      return { id: existing.id as string };
    }
    const { data: inserted, error } = await context.supabase
      .from("hr_helpdesk_settings")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      if (helpdeskStorageMissing(error.message)) throw new Error(HELPDESK_STORAGE_MISSING);
      throw error;
    }
    return { id: inserted.id as string };
  },
  { auth: { capability: "hr.manage" } },
);

export const listHelpdeskArticles = createAuthenticatedAction(
  z.object({}).default({}),
  async (_data, context) => {
    const { data, error } = await context.supabase
      .from("hr_helpdesk_articles")
      .select("id, title, body, category, visibility, published, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) {
      if (helpdeskStorageMissing(error.message)) return { available: false, items: [] as HelpdeskArticle[] };
      throw error;
    }
    const items = (data ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      const visibility = record.visibility === "hr_only" ? "hr_only" : "all_employees";
      return {
        id: String(record.id),
        title: String(record.title),
        body: String(record.body),
        category: String(record.category),
        visibility,
        published: Boolean(record.published),
        updatedAt: String(record.updated_at),
      } satisfies HelpdeskArticle;
    });
    return { available: true, items };
  },
  { defaultInput: {}, auth: { capability: "hr.manage" } },
);

export const createHelpdeskArticle = createAuthenticatedAction(
  z.object({
    title: z.string().trim().min(2).max(160),
    body: z.string().trim().min(2).max(8000),
    category: categorySchema,
    visibility: z.enum(["all_employees", "hr_only"]),
    published: z.boolean(),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("hr_helpdesk_articles")
      .insert({
        title: data.title,
        body: data.body,
        category: data.category,
        visibility: data.visibility,
        published: data.published,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (helpdeskStorageMissing(error.message)) throw new Error(HELPDESK_STORAGE_MISSING);
      throw error;
    }
    return { id: row.id as string };
  },
  { auth: { capability: "hr.manage" } },
);

export const listHelpdeskRules = createAuthenticatedAction(
  z.object({}).default({}),
  async (_data, context) => {
    const { data, error } = await context.supabase
      .from("hr_helpdesk_rules")
      .select("id, kind, category, condition, assignee_staff_id, active")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      if (helpdeskStorageMissing(error.message)) return { available: false, items: [] as HelpdeskRule[] };
      throw error;
    }
    const items = (data ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: String(record.id),
        kind: record.kind === "escalation" ? "escalation" : "routing",
        category: String(record.category),
        condition: String(record.condition),
        assigneeStaffId: typeof record.assignee_staff_id === "string" ? record.assignee_staff_id : null,
        active: Boolean(record.active),
      } satisfies HelpdeskRule;
    });
    return { available: true, items };
  },
  { defaultInput: {}, auth: { capability: "hr.manage" } },
);

export const createHelpdeskRule = createAuthenticatedAction(
  z.object({
    kind: z.enum(["routing", "escalation"]),
    category: categorySchema,
    condition: z.string().trim().min(2).max(240),
    assigneeStaffId: z.string().uuid().nullable(),
    active: z.boolean(),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("hr_helpdesk_rules")
      .insert({
        kind: data.kind,
        category: data.category,
        condition: data.condition,
        assignee_staff_id: data.assigneeStaffId,
        active: data.active,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (helpdeskStorageMissing(error.message)) throw new Error(HELPDESK_STORAGE_MISSING);
      throw error;
    }
    return { id: row.id as string };
  },
  { auth: { capability: "hr.manage" } },
);

export const deleteHelpdeskRule = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase.from("hr_helpdesk_rules").delete().eq("id", data.id);
    if (error) {
      if (helpdeskStorageMissing(error.message)) throw new Error(HELPDESK_STORAGE_MISSING);
      throw error;
    }
    return { ok: true };
  },
  { auth: { capability: "hr.manage" } },
);

export const updateHelpdeskRequest = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    status: z.enum(["open", "waiting", "in_progress", "resolved"]),
    category: categorySchema,
    assigneeStaffId: z.string().uuid().nullable(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("hr_helpdesk_patch_request", {
      p_event_id: data.id,
      p_status: data.status,
      p_category: data.category,
      p_assignee: data.assigneeStaffId,
    });
    if (error) {
      if (helpdeskStorageMissing(error.message)) throw new Error(HELPDESK_STORAGE_MISSING);
      throw error;
    }
    return { ok: true };
  },
  { auth: { capability: "hr.manage" } },
);

const fileSchema = z
  .object({
    fileName: z.string().trim().min(1).max(180),
    mimeType: z.string().trim().min(1).max(120),
    dataBase64: z.string().min(1).max(16_000_000),
  })
  .nullable()
  .optional();

export type HelpdeskComposer = {
  staffId: string | null;
  staffName: string | null;
  canManage: boolean;
  categories: string[];
};

export type HelpdeskCaseAttachment = {
  fileName: string;
  mimeType: string;
  byteSize: number;
  url: string | null;
};

export type HelpdeskCaseMessage = {
  id: string;
  authorName: string;
  body: string;
  visibility: "public" | "internal";
  createdAt: string;
  attachment: HelpdeskCaseAttachment | null;
};

export type HelpdeskCaseHistory = {
  id: string;
  actorName: string;
  kind: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type HelpdeskCase = {
  id: string;
  ticketNo: number | null;
  title: string;
  question: string;
  status: string;
  category: string;
  confidential: boolean;
  staffId: string;
  staffName: string | null;
  employeeCode: string | null;
  handlerName: string | null;
  assigneeStaffId: string | null;
  createdAt: string;
  firstResponseHours: number | null;
  resolutionHours: number | null;
  resolutionAnchor: string | null;
  firstPublicReplyAt: string | null;
  canManage: boolean;
  messages: HelpdeskCaseMessage[];
  history: HelpdeskCaseHistory[];
};

function decodeAttachment(dataBase64: string): Uint8Array {
  const cleaned = dataBase64.replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) throw new Error("invalid attachment");
  const buffer = Buffer.from(cleaned, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

async function storeHelpdeskFile(
  userId: string,
  file: { fileName: string; mimeType: string; dataBase64: string } | null | undefined,
): Promise<Json | null> {
  if (!file) return null;
  const mime = helpdeskAttachmentMime(file.mimeType);
  if (!mime) throw new Error("invalid attachment");
  validateBase64Size(file.dataBase64, HELPDESK_ATTACHMENT_MAX_BYTES);
  const bytes = decodeAttachment(file.dataBase64);
  if (!helpdeskAttachmentMagicOk(mime, bytes)) throw new Error("invalid attachment");
  const safe = file.fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "file";
  const path = `${userId}/${crypto.randomUUID()}/${safe}`;
  const uploaded = await supabaseAdmin.storage.from(HELPDESK_ATTACHMENT_BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (uploaded.error) {
    if (helpdeskStorageMissing(uploaded.error.message)) throw new Error(HELPDESK_STORAGE_MISSING);
    throw uploaded.error;
  }
  return {
    bucket: HELPDESK_ATTACHMENT_BUCKET,
    path,
    fileName: file.fileName,
    mimeType: mime,
    byteSize: bytes.byteLength,
  } as Json;
}

async function removeHelpdeskFile(path: string | null) {
  if (!path) return;
  await supabaseAdmin.storage.from(HELPDESK_ATTACHMENT_BUCKET).remove([path]);
}

function attachmentPath(value: Json | null): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const path = (value as { path?: unknown }).path;
  return typeof path === "string" ? path : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

async function presentAttachment(value: unknown): Promise<HelpdeskCaseAttachment | null> {
  const record = asRecord(value);
  if (!record || typeof record.path !== "string" || typeof record.fileName !== "string") return null;
  const signed = await supabaseAdmin.storage.from(HELPDESK_ATTACHMENT_BUCKET).createSignedUrl(record.path, 600);
  return {
    fileName: record.fileName,
    mimeType: typeof record.mimeType === "string" ? record.mimeType : "application/octet-stream",
    byteSize: Number(record.byteSize ?? 0),
    url: signed.data?.signedUrl ?? null,
  };
}

export const getHelpdeskComposer = createAuthenticatedAction(
  z.object({}).default({}),
  async (_data, context) => {
    const staff = await context.supabase
      .from("staff")
      .select("id, full_name")
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .maybeSingle();
    let categories = [...DEFAULT_HELPDESK_CATEGORIES] as string[];
    const settings = await context.supabase.from("hr_helpdesk_settings").select("categories").limit(1).maybeSingle();
    if (!settings.error && settings.data) {
      categories = asCategories(settings.data.categories);
    } else if (settings.error && !helpdeskStorageMissing(settings.error.message)) {
      throw settings.error;
    } else {
      const admin = await supabaseAdmin.from("hr_helpdesk_settings").select("categories").limit(1).maybeSingle();
      if (!admin.error && admin.data) categories = asCategories(admin.data.categories);
    }
    return {
      staffId: staff.data?.id ?? null,
      staffName: staff.data?.full_name ?? null,
      canManage: canUserDo(context.roles ?? [], "hr.manage"),
      categories,
    } satisfies HelpdeskComposer;
  },
  { defaultInput: {} },
);

export const createHelpdeskRequest = createAuthenticatedAction(
  z.object({
    subject: z.string().trim().min(2).max(160),
    category: categorySchema,
    staffId: z.string().uuid().nullable().optional(),
    attachment: fileSchema,
  }),
  async (data, context) => {
    const mine = await context.supabase
      .from("staff")
      .select("id")
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (mine.error && !helpdeskStorageMissing(mine.error.message)) throw mine.error;
    const canManage = canUserDo(context.roles ?? [], "hr.manage");
    const staffId = data.staffId || mine.data?.id || null;
    if (!staffId) throw new Error("NO_EMPLOYEE");
    if (staffId !== mine.data?.id && !canManage) throw new ForbiddenError("Forbidden");
    const stored = await storeHelpdeskFile(context.userId, data.attachment);
    const { data: id, error } = await context.supabase.rpc("hr_helpdesk_create_request", {
      p_staff_id: staffId,
      p_subject: data.subject,
      p_category: data.category,
      p_attachment: stored,
    });
    if (error) {
      await removeHelpdeskFile(attachmentPath(stored));
      if (helpdeskStorageMissing(error.message)) throw new Error(HELPDESK_STORAGE_MISSING);
      throw error;
    }
    return { id: String(id) };
  },
);

export const getHelpdeskCase = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: raw, error } = await context.supabase.rpc("hr_helpdesk_read_case", { p_event_id: data.id });
    if (error) {
      if (helpdeskStorageMissing(error.message)) throw new Error(HELPDESK_STORAGE_MISSING);
      if (/not found/i.test(error.message)) return null;
      throw error;
    }
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    const row = asRecord(parsed);
    if (!row) return null;
    const payload = parseHelpdeskPayload(asRecord(row.payload) ?? {});
    const settingsFirst = typeof row.settingsFirstResponseHours === "number" ? row.settingsFirstResponseHours : null;
    const settingsResolution = typeof row.settingsResolutionHours === "number" ? row.settingsResolutionHours : null;
    const messages = await Promise.all(
      asList(row.messages).map(async (message) => ({
        id: String(message.id),
        authorName: String(message.authorName ?? ""),
        body: String(message.body ?? ""),
        visibility: message.visibility === "internal" ? ("internal" as const) : ("public" as const),
        createdAt: String(message.createdAt),
        attachment: await presentAttachment(message.attachment),
      })),
    );
    if (messages.length === 0) {
      const opening = payload.question || payload.title;
      if (opening) {
        messages.push({
          id: `opening-${data.id}`,
          authorName: typeof row.staffName === "string" && row.staffName ? row.staffName : "HR",
          body: opening,
          visibility: "public",
          createdAt: String(row.createdAt),
          attachment: null,
        });
      }
    }
    const history = asList(row.history).map((item) => ({
      id: String(item.id),
      actorName: String(item.actorName ?? ""),
      kind: String(item.kind ?? ""),
      detail: asRecord(item.detail) ?? {},
      createdAt: String(item.createdAt),
    }));
    if (history.length === 0) {
      history.push({
        id: `opened-${data.id}`,
        actorName: typeof row.staffName === "string" && row.staffName ? row.staffName : "HR",
        kind: "created",
        detail: {},
        createdAt: String(row.createdAt),
      });
    }
    return {
      id: String(row.id),
      ticketNo: payload.ticketNo,
      title: payload.title,
      question: payload.question,
      status: payload.status,
      category: payload.category,
      confidential: payload.confidential,
      staffId: String(row.staffId),
      staffName: typeof row.staffName === "string" ? row.staffName : null,
      employeeCode: typeof row.employeeCode === "string" ? row.employeeCode : null,
      handlerName: typeof row.handlerName === "string" && row.handlerName ? row.handlerName : null,
      assigneeStaffId: payload.assigneeStaffId,
      createdAt: String(row.createdAt),
      firstResponseHours: payload.firstResponseHours ?? settingsFirst,
      resolutionHours: payload.resolutionHours ?? settingsResolution,
      resolutionAnchor: payload.resolutionAnchor,
      firstPublicReplyAt: payload.firstPublicReplyAt,
      canManage: row.canManage === true,
      messages,
      history,
    } satisfies HelpdeskCase;
  },
);

export const replyHelpdeskCase = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
    visibility: z.enum(["public", "internal"]),
    attachment: fileSchema,
  }),
  async (data, context) => {
    if (data.visibility === "internal" && !canUserDo(context.roles ?? [], "hr.manage")) {
      throw new ForbiddenError("Forbidden");
    }
    const stored = await storeHelpdeskFile(context.userId, data.attachment);
    const { error } = await context.supabase.rpc("hr_helpdesk_reply", {
      p_event_id: data.id,
      p_body: data.body,
      p_visibility: data.visibility,
      p_attachment: stored,
    });
    if (error) {
      await removeHelpdeskFile(attachmentPath(stored));
      if (helpdeskStorageMissing(error.message)) throw new Error(HELPDESK_STORAGE_MISSING);
      throw error;
    }
    return { ok: true };
  },
);

export const setHelpdeskStatus = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    status: z.enum(["open", "waiting", "in_progress", "resolved"]),
    reason: z.string().trim().max(1000),
  }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("hr_helpdesk_set_status", {
      p_event_id: data.id,
      p_status: data.status,
      p_reason: data.reason,
    });
    if (error) {
      if (helpdeskStorageMissing(error.message)) throw new Error(HELPDESK_STORAGE_MISSING);
      throw error;
    }
    return { ok: true };
  },
  { auth: { capability: "hr.manage" } },
);

export const setHelpdeskAssignee = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    assigneeStaffId: z.string().uuid().nullable(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("hr_helpdesk_set_assignee", {
      p_event_id: data.id,
      p_assignee: data.assigneeStaffId,
    });
    if (error) {
      if (helpdeskStorageMissing(error.message)) throw new Error(HELPDESK_STORAGE_MISSING);
      throw error;
    }
    return { ok: true };
  },
  { auth: { capability: "hr.manage" } },
);

export const setHelpdeskConfidential = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    confidential: z.boolean(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("hr_helpdesk_set_confidential", {
      p_event_id: data.id,
      p_confidential: data.confidential,
    });
    if (error) {
      if (helpdeskStorageMissing(error.message)) throw new Error(HELPDESK_STORAGE_MISSING);
      throw error;
    }
    return { ok: true };
  },
  { auth: { capability: "hr.manage" } },
);

