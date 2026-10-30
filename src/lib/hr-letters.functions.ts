"use server";

import { z } from "zod";

import { callHrLetterAiDraft } from "@/lib/hr/ai-letter-draft";
import type { HrLetterStaffContext } from "@/lib/hr/hr-letter-fallback";
import { renderHrLetterPdf, uint8ToBase64 } from "@/lib/hr/hr-letter-pdf";

import {
  HrLetterDraftSchema,
  HrLetterFactsSchema,
  letterTypeLabelEn,
  type HrLetterDocType,
} from "@/lib/hr/hr-letter-types";
import { assertHrSensitiveDocAccess } from "@/lib/hr-advanced";
import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { canUserDo, type AppRole } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";
import { validateBase64Size, validateUploadMime } from "@/lib/server/upload-validation";

const DOC_BUCKET = "hr-employee-documents";

type DeptLink = {
  master_departments?: { name?: string | null } | { name?: string | null }[] | null;
};

function canManageDocs(roles: AppRole[] | undefined): boolean {
  return canUserDo(roles ?? [], "hr.docs.manage") || canUserDo(roles ?? [], "hr.manage");
}

function assertLetterManage(roles: AppRole[] | undefined, docType: HrLetterDocType) {
  if (!canManageDocs(roles)) {
    throw new ForbiddenError("Missing hr.docs.manage.");
  }
  try {
    assertHrSensitiveDocAccess({
      docType,
      isSelf: false,
      canManageDocs: true,
      canViewSensitive: canUserDo(roles ?? [], "hr.profile.view_sensitive"),
      canViewSalary: canUserDo(roles ?? [], "people.view_salary"),
    });
  } catch (e) {
    throw new ForbiddenError(e instanceof Error ? e.message : "Forbidden");
  }
}

async function loadStaffForLetter(
  context: AuthContext,
  staffId: string,
): Promise<HrLetterStaffContext & { id: string }> {
  const { data, error } = await context.supabase
    .from("staff")
    .select(
      "id, full_name, employee_code, job_title, department, locations!staff_location_id_fkey(code, name), staff_departments(master_departments(name))",
    )
    .eq("id", staffId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Staff not found.");

  const locRaw = data.locations as
    | { code?: string | null; name?: string | null }
    | { code?: string | null; name?: string | null }[]
    | null;
  const loc = Array.isArray(locRaw) ? locRaw[0] : locRaw;
  const links = (data.staff_departments ?? []) as DeptLink[];
  const deptNames = links
    .map((link) => {
      const dept = Array.isArray(link.master_departments) ? link.master_departments[0] : link.master_departments;
      const name = dept?.name?.trim();
      return name || null;
    })
    .filter((name): name is string => Boolean(name));
  const fallbackDept = (data.department as string | null)?.trim() || null;
  const locationLabel = loc ? formatLocationLabel(loc.code, loc.name) : null;

  return {
    id: String(data.id),
    fullName: String(data.full_name ?? ""),
    employeeCode: (data.employee_code as string | null) ?? null,
    jobTitle: (data.job_title as string | null) ?? null,
    department: deptNames.length > 0 ? deptNames.join(", ") : fallbackDept,
    locationLabel: locationLabel && locationLabel !== "—" ? locationLabel : null,
  };
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

/** Draft an HR letter body (AI with deterministic fallback). Does not file. */
export const aiDraftHrLetter = createAuthenticatedAction(
  HrLetterFactsSchema,
  async (data, context) => {
    assertLetterManage(context.roles, data.letterType);
    const staff = await loadStaffForLetter(context, data.staffId);
    const { draft, aiGenerated } = await callHrLetterAiDraft(data, staff);
    return {
      draft,
      aiGenerated,
      staff: {
        id: staff.id,
        fullName: staff.fullName,
        employeeCode: staff.employeeCode,
        jobTitle: staff.jobTitle,
        department: staff.department,
        locationLabel: staff.locationLabel,
      },
      letterType: data.letterType,
      letterDate: data.letterDate,
      locale: data.locale ?? "en",
    };
  },
  { auth: { anyCapability: ["hr.docs.manage", "hr.manage"] } },
);

const FileHrLetterSchema = z.object({
  staffId: z.string().uuid(),
  letterType: HrLetterFactsSchema.shape.letterType,
  letterDate: HrLetterFactsSchema.shape.letterDate,
  locale: z.enum(["en", "ar"]).default("en"),
  draft: HrLetterDraftSchema,
  title: z.string().max(200).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

/** Render letterhead PDF and file it on the employee record (hr_employee_documents). */
export const fileGeneratedHrLetter = createAuthenticatedAction(
  FileHrLetterSchema,
  async (data, context) => {
    assertLetterManage(context.roles, data.letterType);
    const staff = await loadStaffForLetter(context, data.staffId);
    const draft = HrLetterDraftSchema.parse(data.draft);

    const pdfBytes = await renderHrLetterPdf({
      draft,
      staff,
      letterDate: data.letterDate,
      letterTypeLabel: letterTypeLabelEn(data.letterType),
      locale: data.locale,
    });
    const data_base64 = uint8ToBase64(pdfBytes);
    const content_type = "application/pdf";
    validateUploadMime(content_type, "document");
    validateBase64Size(data_base64, 10 * 1024 * 1024);

    const safeName = `${data.letterType}-${data.letterDate}-${(staff.employeeCode || staff.id).replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;
    const path = `${staff.id}/${Date.now()}-${safeName}`;
    const bytes = Buffer.from(data_base64, "base64");
    const { error: upErr } = await context.supabase.storage
      .from(DOC_BUCKET)
      .upload(path, bytes, { contentType: content_type, upsert: false });
    if (upErr) throw upErr;

    const title =
      data.title?.trim() ||
      `${letterTypeLabelEn(data.letterType)} — ${staff.fullName} — ${data.letterDate}`;

    const { data: row, error } = await context.supabase
      .from("hr_employee_documents")
      .insert({
        staff_id: staff.id,
        doc_type: data.letterType,
        title,
        document_number: draft.reference?.trim() || null,
        file_path: path,
        file_name: safeName,
        file_mime: content_type,
        notes: data.notes ?? null,
        uploaded_by: context.userId,
        status: "pending",
        verification_status: "unverified",
      })
      .select("id")
      .single();
    if (error) throw error;

    await appendEmployeeEvent(context, {
      staffId: staff.id,
      eventType: "document_uploaded",
      payload: { doc_type: data.letterType, source: "hr_letter_ai" },
      documentId: String(row.id),
      sourceTable: "hr_employee_documents",
      sourceId: String(row.id),
    });
    await auditDoc(context, "hr_letter_generated", String(row.id), {
      letter_type: data.letterType,
      staff_id: staff.id,
    });

    return { id: row.id as string, fileName: safeName, title };
  },
  { auth: { anyCapability: ["hr.docs.manage", "hr.manage"] } },
);
