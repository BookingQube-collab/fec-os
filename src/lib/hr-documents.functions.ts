"use server";

import { z } from "zod";

import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { canUserDo } from "@/lib/rbac";
import { validateBase64Size, validateUploadMime } from "@/lib/server/upload-validation";
import { HR_DOC_TYPES } from "@/lib/hr-advanced";

const DOC_BUCKET = "hr-employee-documents";

async function myStaff(context: AuthContext) {
  const { data } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

function mapDoc(row: Record<string, unknown>) {
  const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
    employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
    docType: String(row.doc_type),
    title: (row.title as string | null) ?? null,
    fileName: (row.file_name as string | null) ?? null,
    filePath: (row.file_path as string | null) ?? null,
    expiryDate: row.expiry_date ? String(row.expiry_date).slice(0, 10) : null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

export const listEmployeeDocuments = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid().optional(),
    mineOnly: z.boolean().optional(),
  }),
  async (data, context) => {
    const manage = canUserDo(context.roles ?? [], "hr.manage");
    const mine = await myStaff(context);
    const scopedSelf = !manage || data.mineOnly;
    const staffId = scopedSelf ? mine?.id : data.staffId;
    if (scopedSelf && !staffId) return [];

    let q = context.supabase
      .from("hr_employee_documents")
      .select("id, staff_id, doc_type, title, file_name, file_path, expiry_date, notes, created_at, staff(full_name, employee_code)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (staffId) q = q.eq("staff_id", staffId);
    const { data: rows, error } = await q;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => mapDoc(r as Record<string, unknown>));
  },
  { auth: { anyCapability: ["hr.manage", "hr.employee_app"] } },
);

export const uploadEmployeeDocument = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid().optional(),
    docType: z.enum(HR_DOC_TYPES),
    title: z.string().max(200).optional().nullable(),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    filename: z.string().min(1).max(200),
    data_base64: z.string().min(10).max(14_000_000),
    content_type: z.string().max(100).default("application/pdf"),
  }),
  async (data, context) => {
    validateUploadMime(data.content_type, "document");
    validateBase64Size(data.data_base64, 10 * 1024 * 1024);
    const manage = canUserDo(context.roles ?? [], "hr.manage");
    const mine = await myStaff(context);
    const staffId = manage && data.staffId ? data.staffId : mine?.id;
    if (!staffId) throw new ForbiddenError("No staff record linked for document upload.");
    if (!manage && staffId !== mine?.id) {
      throw new ForbiddenError("You can only upload documents for yourself.");
    }
    const path = `${staffId}/${Date.now()}-${data.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const bytes = Uint8Array.from(atob(data.data_base64), (c) => c.charCodeAt(0));
    const { error: upErr } = await context.supabase.storage
      .from(DOC_BUCKET)
      .upload(path, bytes, { contentType: data.content_type, upsert: false });
    if (upErr) throw upErr;

    const { data: row, error } = await context.supabase
      .from("hr_employee_documents")
      .insert({
        staff_id: staffId,
        doc_type: data.docType,
        title: data.title ?? data.filename,
        file_path: path,
        file_name: data.filename,
        file_mime: data.content_type,
        expiry_date: data.expiryDate ?? null,
        notes: data.notes ?? null,
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  },
  { auth: { anyCapability: ["hr.manage", "hr.employee_app"] } },
);

export const getEmployeeDocumentUrl = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: doc, error } = await context.supabase
      .from("hr_employee_documents")
      .select("id, staff_id, file_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!doc?.file_path) throw new Error("Document not found.");
    const manage = canUserDo(context.roles ?? [], "hr.manage");
    if (!manage) {
      const mine = await myStaff(context);
      if (!mine || mine.id !== doc.staff_id) throw new ForbiddenError("You can only view your own documents.");
    }
    const { data: signed, error: signErr } = await context.supabase.storage
      .from(DOC_BUCKET)
      .createSignedUrl(doc.file_path, 600);
    if (signErr) throw signErr;
    return { url: signed.signedUrl };
  },
  { auth: { anyCapability: ["hr.manage", "hr.employee_app"] } },
);

export const deleteEmployeeDocument = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: doc, error } = await context.supabase
      .from("hr_employee_documents")
      .select("id, file_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!doc) throw new Error("Document not found.");
    if (doc.file_path) {
      await context.supabase.storage.from(DOC_BUCKET).remove([doc.file_path]);
    }
    const { error: delErr } = await context.supabase.from("hr_employee_documents").delete().eq("id", data.id);
    if (delErr) throw delErr;
    return { ok: true };
  },
  { auth: { capability: "hr.manage" } },
);
