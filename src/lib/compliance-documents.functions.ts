"use server";

import { z } from "zod";

import {
  COMPLIANCE_DOCUMENT_TYPES,
  DOCUMENT_ATTACHMENT_TYPES,
  DOCUMENT_RENEWAL_STATUSES,
  derivePaymentStatus,
} from "@/lib/compliance/constants";
import { createAuthenticatedAction } from "@/lib/server/create-action";
import { validateBase64Size, validateUploadMime } from "@/lib/server/upload-validation";

const LocFilter = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    status: z.string().nullable().optional(),
    documentType: z.string().max(200).nullable().optional(),
  })
  .default({});

const StatusEnum = z.enum([
  "pending",
  "submitted",
  "expired",
  "under_renewal",
  "approved",
  "rejected",
]);

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

const DocumentFields = z.object({
  location_id: z.string().uuid(),
  document_type: z.enum(COMPLIANCE_DOCUMENT_TYPES).or(z.string().min(2).max(200)),
  document_name: z.string().max(200).nullable().optional(),
  certificate_number: z.string().max(200).nullable().optional(),
  issuing_authority: z.string().max(200).nullable().optional(),
  reference_number: z.string().max(200).nullable().optional(),
  notification_date: dateField,
  submission_deadline: dateField,
  issue_date: dateField,
  expiry_date: dateField,
  renewal_due_date: dateField,
  status: StatusEnum.default("pending"),
  renewal_status: z.enum(DOCUMENT_RENEWAL_STATUSES).default("active"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  responsible_person: z.string().max(200).nullable().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  contract_id: z.string().uuid().nullable().optional(),
  quotation_amount: z.number().min(0).default(0),
  paid_amount: z.number().min(0).default(0),
  contact_name: z.string().max(200).nullable().optional(),
  contact_email: z.string().email().max(200).nullable().optional().or(z.literal("")),
  contact_phone: z.string().max(50).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  remarks: z.string().max(4000).nullable().optional(),
});

const LIST_SELECT =
  "id, location_id, document_type, document_name, certificate_number, issuing_authority, reference_number, notification_date, submission_deadline, issue_date, expiry_date, renewal_due_date, status, renewal_status, priority, responsible_person, vendor_id, contract_id, quotation_amount, paid_amount, outstanding_amount, payment_status, file_path, file_name, submitted_at, created_at, updated_at";

export const listComplianceDocuments = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("compliance_documents")
      .select(LIST_SELECT)
      .order("submission_deadline", { ascending: true, nullsFirst: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.status) q = q.eq("status", data.status);
    if (data.documentType) q = q.ilike("document_type", `%${data.documentType}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const getComplianceDocument = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: doc, error } = await context.supabase
      .from("compliance_documents")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    const [{ data: location }, { data: vendor }, { data: contract }, { data: attachments }, { data: notifications }] =
      await Promise.all([
        context.supabase
          .from("locations")
          .select("id, code, name, city")
          .eq("id", doc.location_id)
          .maybeSingle(),
        doc.vendor_id
          ? context.supabase.from("vendors").select("id, name, phone, email").eq("id", doc.vendor_id).maybeSingle()
          : Promise.resolve({ data: null }),
        doc.contract_id
          ? context.supabase
              .from("amc_contracts")
              .select("id, contract_ref, category, vendor_name, contract_end_date")
              .eq("id", doc.contract_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        context.supabase
          .from("document_attachments")
          .select("id, attachment_type, file_name, file_path, uploaded_at")
          .eq("document_id", data.id)
          .order("uploaded_at", { ascending: false }),
        context.supabase
          .from("document_notifications")
          .select("id, notification_type, notification_date, status, sent_at")
          .eq("document_id", data.id)
          .order("notification_date", { ascending: false })
          .limit(20),
      ]);

    return {
      document: {
        ...doc,
        quotation_amount: Number(doc.quotation_amount ?? 0),
        paid_amount: Number(doc.paid_amount ?? 0),
        outstanding_amount: Number(doc.outstanding_amount ?? 0),
      },
      location,
      vendor,
      contract,
      attachments: attachments ?? [],
      notifications: notifications ?? [],
    };
  },
  { auth: { capability: "compliance.view" } },
);

export const createComplianceDocument = createAuthenticatedAction(
  DocumentFields,
  async (data, context) => {
    const paymentStatus = derivePaymentStatus(data.quotation_amount, data.paid_amount);
    const { data: row, error } = await context.supabase
      .from("compliance_documents")
      .insert({
        location_id: data.location_id,
        document_type: data.document_type,
        document_name: data.document_name ?? null,
        certificate_number: data.certificate_number ?? data.reference_number ?? null,
        issuing_authority: data.issuing_authority ?? null,
        reference_number: data.reference_number ?? data.certificate_number ?? null,
        notification_date: data.notification_date ?? null,
        submission_deadline: data.submission_deadline ?? null,
        issue_date: data.issue_date ?? null,
        expiry_date: data.expiry_date ?? null,
        renewal_due_date: data.renewal_due_date ?? null,
        status: data.status,
        renewal_status: data.renewal_status,
        priority: data.priority,
        responsible_person: data.responsible_person ?? null,
        vendor_id: data.vendor_id ?? null,
        contract_id: data.contract_id ?? null,
        quotation_amount: data.quotation_amount,
        paid_amount: data.paid_amount,
        payment_status: paymentStatus,
        contact_name: data.contact_name ?? null,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone ?? null,
        notes: data.notes ?? null,
        remarks: data.remarks ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  },
  { auth: { capability: "compliance.manage_documents" } },
);

export const updateComplianceDocument = createAuthenticatedAction(
  DocumentFields.extend({ id: z.string().uuid() }),
  async (data, context) => {
    const paymentStatus = derivePaymentStatus(data.quotation_amount, data.paid_amount);
    const { error } = await context.supabase
      .from("compliance_documents")
      .update({
        location_id: data.location_id,
        document_type: data.document_type,
        document_name: data.document_name ?? null,
        certificate_number: data.certificate_number ?? data.reference_number ?? null,
        issuing_authority: data.issuing_authority ?? null,
        reference_number: data.reference_number ?? data.certificate_number ?? null,
        notification_date: data.notification_date ?? null,
        submission_deadline: data.submission_deadline ?? null,
        issue_date: data.issue_date ?? null,
        expiry_date: data.expiry_date ?? null,
        renewal_due_date: data.renewal_due_date ?? null,
        status: data.status,
        renewal_status: data.renewal_status,
        priority: data.priority,
        responsible_person: data.responsible_person ?? null,
        vendor_id: data.vendor_id ?? null,
        contract_id: data.contract_id ?? null,
        quotation_amount: data.quotation_amount,
        paid_amount: data.paid_amount,
        payment_status: paymentStatus,
        contact_name: data.contact_name ?? null,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone ?? null,
        notes: data.notes ?? null,
        remarks: data.remarks ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "compliance.manage_documents" } },
);

export const updateComplianceDocumentStatus = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    status: StatusEnum,
    reason: z.string().max(500).optional(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("update_compliance_document_status", {
      _id: data.id,
      _status: data.status,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "compliance.run_audit" } },
);

export const deleteComplianceDocument = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: doc, error: fetchErr } = await context.supabase
      .from("compliance_documents")
      .select("file_path")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;

    if (doc.file_path) {
      await context.supabase.storage.from("compliance-documents").remove([doc.file_path]);
    }

    const { error } = await context.supabase
      .from("compliance_documents")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "compliance.manage_documents" } },
);

export const uploadComplianceDocumentFile = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    filename: z.string().min(1).max(200),
    data_base64: z.string().min(10).max(28_000_000),
    content_type: z.string().max(100).default("application/pdf"),
  }),
  async (data, context) => {
    validateUploadMime(data.content_type, "document");
    validateBase64Size(data.data_base64, 20 * 1024 * 1024);
    const { data: doc, error: fetchErr } = await context.supabase
      .from("compliance_documents")
      .select("location_id, file_path")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;

    if (doc.file_path) {
      await context.supabase.storage.from("compliance-documents").remove([doc.file_path]);
    }

    const path = `${doc.location_id}/${data.id}/${Date.now()}-${data.filename}`;
    const bytes = Uint8Array.from(atob(data.data_base64), (c) => c.charCodeAt(0));
    const { error: upErr } = await context.supabase.storage
      .from("compliance-documents")
      .upload(path, bytes, { contentType: data.content_type, upsert: false });
    if (upErr) throw upErr;

    const { error: updErr } = await context.supabase
      .from("compliance_documents")
      .update({
        file_path: path,
        file_name: data.filename,
        file_mime: data.content_type,
      })
      .eq("id", data.id);
    if (updErr) throw updErr;

    return { path };
  },
  { auth: { capability: "compliance.manage_documents" } },
);

export const uploadDocumentAttachment = createAuthenticatedAction(
  z.object({
    documentId: z.string().uuid(),
    attachmentType: z.enum(DOCUMENT_ATTACHMENT_TYPES),
    filename: z.string().min(1).max(200),
    data_base64: z.string().min(10).max(28_000_000),
    content_type: z.string().max(100).default("application/pdf"),
  }),
  async (data, context) => {
    validateUploadMime(data.content_type, "document");
    validateBase64Size(data.data_base64, 20 * 1024 * 1024);
    const { data: doc, error: fetchErr } = await context.supabase
      .from("compliance_documents")
      .select("location_id")
      .eq("id", data.documentId)
      .single();
    if (fetchErr) throw fetchErr;

    const path = `${doc.location_id}/${data.documentId}/attachments/${Date.now()}-${data.filename}`;
    const bytes = Uint8Array.from(atob(data.data_base64), (c) => c.charCodeAt(0));
    const { error: upErr } = await context.supabase.storage
      .from("compliance-documents")
      .upload(path, bytes, { contentType: data.content_type, upsert: false });
    if (upErr) throw upErr;

    const { data: row, error: insErr } = await context.supabase
      .from("document_attachments")
      .insert({
        document_id: data.documentId,
        attachment_type: data.attachmentType,
        file_name: data.filename,
        file_path: path,
        file_mime: data.content_type,
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    if (data.attachmentType === "certificate") {
      await context.supabase
        .from("compliance_documents")
        .update({ file_path: path, file_name: data.filename, file_mime: data.content_type })
        .eq("id", data.documentId);
    }

    return { id: row.id, path };
  },
  { auth: { capability: "compliance.manage_documents" } },
);

export const getDocumentAttachmentUrl = createAuthenticatedAction(
  z.object({ attachmentId: z.string().uuid() }),
  async (data, context) => {
    const { data: att, error } = await context.supabase
      .from("document_attachments")
      .select("file_path")
      .eq("id", data.attachmentId)
      .single();
    if (error) throw error;
    const { data: signed, error: signErr } = await context.supabase.storage
      .from("compliance-documents")
      .createSignedUrl(att.file_path, 600);
    if (signErr) throw signErr;
    return { url: signed.signedUrl };
  },
  { auth: { capability: "compliance.view" } },
);

export const getComplianceDocumentFileUrl = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: doc, error } = await context.supabase
      .from("compliance_documents")
      .select("file_path")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    if (!doc.file_path) return { url: null };

    const { data: signed, error: signErr } = await context.supabase.storage
      .from("compliance-documents")
      .createSignedUrl(doc.file_path, 600);
    if (signErr) throw signErr;
    return { url: signed.signedUrl };
  },
  { auth: { capability: "compliance.view" } },
);
