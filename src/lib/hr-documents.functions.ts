"use server";

import { z } from "zod";

import {
  assertHrSensitiveDocAccess,
  HR_DOC_TYPES,
} from "@/lib/hr-advanced";
import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { canUserDo, type AppRole } from "@/lib/rbac";
import { validateBase64Size, validateUploadMime } from "@/lib/server/upload-validation";

const DOC_BUCKET = "hr-employee-documents";

const MOFA_STATUS = ["yes", "no", "not_required"] as const;
const VERIFICATION_STATUS = ["unverified", "verified", "rejected"] as const;

async function myStaff(context: AuthContext) {
  const { data } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code, user_id")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

function canManageDocs(roles: AppRole[] | undefined): boolean {
  return canUserDo(roles ?? [], "hr.docs.manage") || canUserDo(roles ?? [], "hr.manage");
}

function canVerifyDocs(roles: AppRole[] | undefined): boolean {
  return canUserDo(roles ?? [], "hr.docs.verify") || canManageDocs(roles);
}

function assertSensitiveAccess(roles: AppRole[] | undefined, docType: string, isSelf: boolean) {
  try {
    assertHrSensitiveDocAccess({
      docType,
      isSelf,
      canManageDocs: canManageDocs(roles),
      canViewSensitive: canUserDo(roles ?? [], "hr.profile.view_sensitive"),
      canViewSalary: canUserDo(roles ?? [], "people.view_salary"),
    });
  } catch (e) {
    throw new ForbiddenError(e instanceof Error ? e.message : "Forbidden");
  }
}

async function auditDoc(
  context: AuthContext,
  action: string,
  rowId: string,
  metadata?: Record<string, unknown>,
) {
  try {
    await context.supabase.from("audit_log").insert({
      actor_id: context.userId,
      action,
      table_name: "hr_employee_documents",
      row_id: rowId,
      metadata: (metadata ?? null) as never,
    });
  } catch {
    /* audit must not block */
  }
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
    status: String(row.status ?? "pending"),
    verificationStatus: String(row.verification_status ?? "unverified"),
    verificationRemarks: (row.verification_remarks as string | null) ?? null,
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
    qualification: (row.qualification as string | null) ?? null,
    institution: (row.institution as string | null) ?? null,
    graduationYear: row.graduation_year != null ? Number(row.graduation_year) : null,
    mofaStatus: (row.mofa_status as string | null) ?? null,
    supersedesId: row.supersedes_id ? String(row.supersedes_id) : null,
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  };
}

const educationFields = {
  qualification: z.string().max(200).optional().nullable(),
  institution: z.string().max(200).optional().nullable(),
  graduationYear: z.number().int().min(1950).max(2100).optional().nullable(),
  mofaStatus: z.enum(MOFA_STATUS).optional().nullable(),
};

const DOC_SELECT =
  "id, staff_id, doc_type, title, file_name, file_path, expiry_date, notes, created_at, status, verification_status, verification_remarks, verified_at, qualification, institution, graduation_year, mofa_status, supersedes_id, deleted_at, staff(full_name, employee_code)";

export const listEmployeeDocuments = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid().optional(),
    mineOnly: z.boolean().optional(),
    includeDeleted: z.boolean().optional(),
  }),
  async (data, context) => {
    const manage = canManageDocs(context.roles);
    const mine = await myStaff(context);
    const scopedSelf = !manage || data.mineOnly;
    const staffId = scopedSelf ? mine?.id : data.staffId;
    if (scopedSelf && !staffId) return [];

    let q = context.supabase
      .from("hr_employee_documents")
      .select(DOC_SELECT)
      .order("created_at", { ascending: false })
      .limit(200);
    if (staffId) q = q.eq("staff_id", staffId);
    if (!data.includeDeleted) q = q.is("deleted_at", null);
    const { data: rows, error } = await q;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? [])
      .map((r) => mapDoc(r as Record<string, unknown>))
      .filter((doc) => {
        try {
          assertSensitiveAccess(context.roles, doc.docType, Boolean(mine && doc.staffId === mine.id));
          return true;
        } catch {
          return false;
        }
      });
  },
  { auth: { anyCapability: ["hr.docs.manage", "hr.manage", "hr.employee_app"] } },
);

async function uploadBytes(
  context: AuthContext,
  staffId: string,
  filename: string,
  data_base64: string,
  content_type: string,
) {
  validateUploadMime(content_type, "document");
  validateBase64Size(data_base64, 10 * 1024 * 1024);
  const path = `${staffId}/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const bytes = Uint8Array.from(atob(data_base64), (c) => c.charCodeAt(0));
  const { error: upErr } = await context.supabase.storage
    .from(DOC_BUCKET)
    .upload(path, bytes, { contentType: content_type, upsert: false });
  if (upErr) throw upErr;
  return path;
}

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
    ...educationFields,
  }),
  async (data, context) => {
    const manage = canManageDocs(context.roles);
    const mine = await myStaff(context);
    const staffId = manage && data.staffId ? data.staffId : mine?.id;
    if (!staffId) throw new ForbiddenError("No staff record linked for document upload.");
    if (!manage && staffId !== mine?.id) {
      throw new ForbiddenError("You can only upload documents for yourself.");
    }
    if (manage && data.staffId && data.staffId !== mine?.id) {
      assertSensitiveAccess(context.roles, data.docType, false);
    }
    const path = await uploadBytes(context, staffId, data.filename, data.data_base64, data.content_type);

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
        qualification: data.qualification ?? null,
        institution: data.institution ?? null,
        graduation_year: data.graduationYear ?? null,
        mofa_status: data.mofaStatus ?? null,
        status: "pending",
        verification_status: "unverified",
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  },
  { auth: { anyCapability: ["hr.docs.manage", "hr.manage", "hr.employee_app"] } },
);

/** Replace = new row + supersedes_id; never overwrite existing file_path. */
export const replaceEmployeeDocument = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    filename: z.string().min(1).max(200),
    data_base64: z.string().min(10).max(14_000_000),
    content_type: z.string().max(100).default("application/pdf"),
    title: z.string().max(200).optional().nullable(),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    ...educationFields,
  }),
  async (data, context) => {
    const manage = canManageDocs(context.roles);
    const mine = await myStaff(context);
    const { data: old, error } = await context.supabase
      .from("hr_employee_documents")
      .select("id, staff_id, doc_type, title, notes, qualification, institution, graduation_year, mofa_status")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!old) throw new Error("Document not found.");
    const isSelf = Boolean(mine && mine.id === old.staff_id);
    if (!manage && !isSelf) throw new ForbiddenError("You can only replace your own documents.");
    assertSensitiveAccess(context.roles, String(old.doc_type), isSelf);

    const path = await uploadBytes(
      context,
      String(old.staff_id),
      data.filename,
      data.data_base64,
      data.content_type,
    );

    const { data: row, error: insErr } = await context.supabase
      .from("hr_employee_documents")
      .insert({
        staff_id: old.staff_id,
        doc_type: old.doc_type,
        title: data.title ?? old.title ?? data.filename,
        file_path: path,
        file_name: data.filename,
        file_mime: data.content_type,
        expiry_date: data.expiryDate ?? null,
        notes: data.notes ?? old.notes ?? null,
        uploaded_by: context.userId,
        supersedes_id: old.id,
        qualification: data.qualification ?? old.qualification ?? null,
        institution: data.institution ?? old.institution ?? null,
        graduation_year: data.graduationYear ?? old.graduation_year ?? null,
        mofa_status: data.mofaStatus ?? old.mofa_status ?? null,
        status: "pending",
        verification_status: "unverified",
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    await context.supabase
      .from("hr_employee_documents")
      .update({
        status: "superseded",
        deleted_at: new Date().toISOString(),
        status_by: context.userId,
        status_at: new Date().toISOString(),
      })
      .eq("id", old.id);

    await auditDoc(context, "hr_document.replace", String(row.id), {
      supersedes_id: old.id,
    });
    await appendEmployeeEvent(context, {
      staffId: String(old.staff_id),
      eventType: "document_replaced",
      payload: { doc_type: old.doc_type, supersedes_id: old.id },
      documentId: String(row.id),
      sourceTable: "hr_employee_documents",
      sourceId: String(row.id),
    });
    return { id: row.id as string };
  },
  { auth: { anyCapability: ["hr.docs.manage", "hr.manage", "hr.employee_app"] } },
);

export const getEmployeeDocumentUrl = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    purpose: z.enum(["preview", "download"]).optional().default("preview"),
  }),
  async (data, context) => {
    const { data: doc, error } = await context.supabase
      .from("hr_employee_documents")
      .select("id, staff_id, file_path, doc_type, deleted_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!doc?.file_path || doc.deleted_at) throw new Error("Document not found.");
    const manage = canManageDocs(context.roles);
    const mine = await myStaff(context);
    const isSelf = Boolean(mine && mine.id === doc.staff_id);
    if (!manage && !isSelf) {
      throw new ForbiddenError("You can only view your own documents.");
    }
    assertSensitiveAccess(context.roles, String(doc.doc_type), isSelf);

    const { data: signed, error: signErr } = await context.supabase.storage
      .from(DOC_BUCKET)
      .createSignedUrl(doc.file_path, 600);
    if (signErr) throw signErr;

    await auditDoc(context, `hr_document.${data.purpose}`, data.id, {
      doc_type: doc.doc_type,
    });
    return { url: signed.signedUrl };
  },
  { auth: { anyCapability: ["hr.docs.manage", "hr.manage", "hr.employee_app"] } },
);

export const verifyEmployeeDocument = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    verificationStatus: z.enum(["verified", "rejected"]),
    remarks: z.string().max(500).optional().nullable(),
  }),
  async (data, context) => {
    if (!canVerifyDocs(context.roles)) {
      throw new ForbiddenError("Document verification requires hr.docs.verify.");
    }
    const now = new Date().toISOString();
    const { data: doc, error } = await context.supabase
      .from("hr_employee_documents")
      .update({
        verification_status: data.verificationStatus,
        verification_remarks: data.remarks ?? null,
        verified_by: context.userId,
        verified_at: now,
      })
      .eq("id", data.id)
      .is("deleted_at", null)
      .select("id, doc_type, staff_id")
      .maybeSingle();
    if (error) throw error;
    if (!doc) throw new Error("Document not found.");
    await auditDoc(context, "hr_document.verify", data.id, {
      verification_status: data.verificationStatus,
    });
    await appendEmployeeEvent(context, {
      staffId: String(doc.staff_id),
      eventType: "document_verified",
      payload: {
        doc_type: doc.doc_type,
        verification_status: data.verificationStatus,
      },
      documentId: data.id,
      sourceTable: "hr_employee_documents",
      sourceId: data.id,
    });
    return { ok: true };
  },
  { auth: { anyCapability: ["hr.docs.verify", "hr.docs.manage", "hr.manage"] } },
);

export const approveEmployeeDocument = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    remarks: z.string().max(500).optional().nullable(),
  }),
  async (data, context) => {
    const now = new Date().toISOString();
    const { data: doc, error } = await context.supabase
      .from("hr_employee_documents")
      .update({
        status: "approved",
        status_by: context.userId,
        status_at: now,
        status_remarks: data.remarks ?? null,
      })
      .eq("id", data.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!doc) throw new Error("Document not found.");
    await auditDoc(context, "hr_document.approve", data.id);
    return { ok: true };
  },
  { auth: { anyCapability: ["hr.docs.manage", "hr.manage"] } },
);

export const rejectEmployeeDocument = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    remarks: z.string().max(500).optional().nullable(),
  }),
  async (data, context) => {
    const now = new Date().toISOString();
    const { data: doc, error } = await context.supabase
      .from("hr_employee_documents")
      .update({
        status: "rejected",
        status_by: context.userId,
        status_at: now,
        status_remarks: data.remarks ?? null,
      })
      .eq("id", data.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!doc) throw new Error("Document not found.");
    await auditDoc(context, "hr_document.reject", data.id);
    return { ok: true };
  },
  { auth: { anyCapability: ["hr.docs.manage", "hr.manage"] } },
);

export const expireEmployeeDocument = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const now = new Date().toISOString();
    const { data: doc, error } = await context.supabase
      .from("hr_employee_documents")
      .update({
        status: "expired",
        status_by: context.userId,
        status_at: now,
      })
      .eq("id", data.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!doc) throw new Error("Document not found.");
    await auditDoc(context, "hr_document.expire", data.id);
    return { ok: true };
  },
  { auth: { anyCapability: ["hr.docs.manage", "hr.manage"] } },
);

/** Soft-delete — never hard-delete the row; storage path retained for audit. */
export const deleteEmployeeDocument = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const now = new Date().toISOString();
    const { data: doc, error } = await context.supabase
      .from("hr_employee_documents")
      .update({ deleted_at: now })
      .eq("id", data.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!doc) throw new Error("Document not found.");
    await auditDoc(context, "hr_document.soft_delete", data.id);
    return { ok: true };
  },
  { auth: { anyCapability: ["hr.docs.manage", "hr.manage"] } },
);

/** Acknowledge expiry reminders for a document — stops reminder cadence (AT#19). */
export const acknowledgeDocumentExpiryReminder = createAuthenticatedAction(
  z.object({ documentId: z.string().uuid() }),
  async (data, context) => {
    const manage = canManageDocs(context.roles);
    const mine = await myStaff(context);
    const { data: doc, error } = await context.supabase
      .from("hr_employee_documents")
      .select("id, staff_id")
      .eq("id", data.documentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!doc) throw new Error("Document not found.");
    if (!manage && (!mine || mine.id !== doc.staff_id)) {
      throw new ForbiddenError("You can only acknowledge reminders for your own documents.");
    }
    const now = new Date().toISOString();
    const reminders = context.supabase.from("hr_document_expiry_reminders") as unknown as {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: string) => {
          is: (c: string, v: null) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const { error: updErr } = await reminders
      .update({ acknowledged_at: now, acknowledged_by: context.userId })
      .eq("document_id", data.documentId)
      .is("acknowledged_at", null);
    if (updErr) {
      if (tableMissing(updErr.message)) throw new Error("Expiry reminders not available yet.");
      throw updErr;
    }
    return { ok: true };
  },
  { auth: { anyCapability: ["hr.docs.manage", "hr.manage", "hr.employee_app"] } },
);
