import "server-only";

import { callHrLetterAiDraft, type HrLetterStaffContext } from "@/lib/hr/ai-letter-draft";
import { renderHrLetterPdf, uint8ToBase64 } from "@/lib/hr/hr-letter-pdf";
import { letterTypeLabelEn } from "@/lib/hr/hr-letter-types";
import type { HrWarningLevel } from "@/lib/hr-warnings";
import { formatLocationLabel } from "@/lib/locations/normalize";
import type { AuthContext } from "@/lib/server/create-action";
import { validateBase64Size, validateUploadMime } from "@/lib/server/upload-validation";

const DOC_BUCKET = "hr-employee-documents";

type DeptLink = {
  master_departments?: { name?: string | null } | { name?: string | null }[] | null;
};

function mapWarningLevelForLetter(
  level: HrWarningLevel,
): "verbal" | "written" | "final" {
  if (level === "verbal" || level === "final") return level;
  return "written";
}

export async function loadStaffForWarningLetter(
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

/** Generate warning letter PDF on company letterhead and file on the employee record. */
export async function generateAndFileWarningLetter(
  context: AuthContext,
  input: {
    staffId: string;
    incidentOn: string;
    description: string;
    warningLevel: HrWarningLevel;
    locale?: "en" | "ar";
  },
): Promise<{ id: string; fileName: string; title: string }> {
  const staff = await loadStaffForWarningLetter(context, input.staffId);
  const locale = input.locale ?? "en";
  const { draft } = await callHrLetterAiDraft(
    {
      staffId: staff.id,
      letterType: "warning_letter",
      letterDate: input.incidentOn,
      effectiveDate: input.incidentOn,
      reason: input.description.trim(),
      warningLevel: mapWarningLevelForLetter(input.warningLevel),
      locale,
    },
    staff,
  );

  const pdfBytes = await renderHrLetterPdf({
    draft,
    staff,
    letterDate: input.incidentOn,
    letterTypeLabel: letterTypeLabelEn("warning_letter"),
    locale,
  });
  const data_base64 = uint8ToBase64(pdfBytes);
  const content_type = "application/pdf";
  validateUploadMime(content_type, "document");
  validateBase64Size(data_base64, 10 * 1024 * 1024);

  const safeName = `warning_letter-${input.incidentOn}-${(staff.employeeCode || staff.id).replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;
  const path = `${staff.id}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(data_base64, "base64");
  const { error: upErr } = await context.supabase.storage
    .from(DOC_BUCKET)
    .upload(path, bytes, { contentType: content_type, upsert: false });
  if (upErr) throw upErr;

  const title = `${letterTypeLabelEn("warning_letter")} — ${staff.fullName} — ${input.incidentOn}`;
  const { data: row, error } = await context.supabase
    .from("hr_employee_documents")
    .insert({
      staff_id: staff.id,
      doc_type: "warning_letter",
      title,
      document_number: draft.reference?.trim() || null,
      file_path: path,
      file_name: safeName,
      file_mime: content_type,
      notes: "Generated on company letterhead when warning was issued",
      uploaded_by: context.userId,
      status: "pending",
      verification_status: "unverified",
    })
    .select("id")
    .single();
  if (error) throw error;

  return { id: String(row.id), fileName: safeName, title };
}
