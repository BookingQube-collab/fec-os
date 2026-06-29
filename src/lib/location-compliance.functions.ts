"use server";

import { z } from "zod";

import { LOCATION_TYPE_BY_CODE } from "@/lib/compliance/location-compliance-derive";
import {
  fetchLocationTrackerAlerts,
  fetchLocationTrackerItems,
  fetchLocationTrackerKpis,
  type LocationTrackerFilters,
} from "@/lib/queries/location-compliance.core";
import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction } from "@/lib/server/create-action";
import { validateBase64Size, validateUploadMime } from "@/lib/server/upload-validation";

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

const TrackerFilter = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    category: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    vendor: z.string().nullable().optional(),
    expiryBucket: z.string().nullable().optional(),
    missingDocs: z.boolean().optional(),
    outstandingPayment: z.boolean().optional(),
    highRisk: z.boolean().optional(),
    requiredOnly: z.boolean().optional(),
  })
  .default({});

const ItemFields = z.object({
  location_id: z.string().uuid(),
  requirement_id: z.string().uuid().nullable().optional(),
  area_sub_area: z.string().max(200).nullable().optional(),
  category: z.string().min(1).max(100),
  requirement_name: z.string().min(1).max(300),
  document_contract_type: z.string().max(100).nullable().optional(),
  is_required: z.boolean().default(true),
  vendor_id: z.string().uuid().nullable().optional(),
  vendor_name: z.string().max(200).nullable().optional(),
  issuing_authority: z.string().max(200).nullable().optional(),
  cert_contract_number: z.string().max(200).nullable().optional(),
  start_date: dateField,
  issue_date: dateField,
  expiry_date: dateField,
  renewal_due_date: dateField,
  service_frequency: z.string().max(50).nullable().optional(),
  last_service_date: dateField,
  next_service_date: dateField,
  manual_status: z.string().max(50).nullable().optional(),
  risk_level: z.string().max(20).default("Medium"),
  owner: z.string().max(100).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  quotation_amount: z.number().min(0).default(0),
  paid_amount: z.number().min(0).default(0),
  payment_status: z.string().max(30).default("unpaid"),
  attachment_status: z.string().max(30).default("none"),
  remarks: z.string().max(4000).nullable().optional(),
  compliance_document_id: z.string().uuid().nullable().optional(),
  amc_contract_id: z.string().uuid().nullable().optional(),
  vendor_contract_id: z.string().uuid().nullable().optional(),
});

const ATTACHMENT_TYPES = ["certificate", "quotation", "invoice", "payment_proof", "service_report"] as const;

function toFilters(data: z.infer<typeof TrackerFilter>): LocationTrackerFilters {
  return {
    locationId: data.locationId,
    category: data.category,
    status: data.status,
    vendor: data.vendor,
    expiryBucket: data.expiryBucket,
    missingDocs: data.missingDocs,
    outstandingPayment: data.outstandingPayment,
    highRisk: data.highRisk,
    requiredOnly: data.requiredOnly,
  };
}

export const listLocationComplianceItems = createAuthenticatedAction(
  TrackerFilter,
  async (data, context) => fetchLocationTrackerItems(context, toFilters(data)),
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const getLocationComplianceKpis = createAuthenticatedAction(
  TrackerFilter,
  async (data, context) => fetchLocationTrackerKpis(context, toFilters(data)),
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const getLocationComplianceAlerts = createAuthenticatedAction(
  TrackerFilter,
  async (data, context) => fetchLocationTrackerAlerts(context, toFilters(data)),
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const getLocationComplianceItem = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: item, error } = await context.supabase
      .from("location_compliance_items_enriched")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    await assertLocationAccess(context, item.location_id);

    const { data: attachments } = await context.supabase
      .from("location_compliance_attachments")
      .select("*")
      .eq("item_id", data.id)
      .order("uploaded_at", { ascending: false });

    let linkedAmc = null;
    if (item.amc_contract_id) {
      const { data: amc } = await context.supabase
        .from("amc_contracts")
        .select("id, contract_ref, vendor_name, contract_end_date, next_service_date, outstanding_amount, payment_status")
        .eq("id", item.amc_contract_id)
        .maybeSingle();
      linkedAmc = amc;
    }

    let linkedDoc = null;
    if (item.compliance_document_id) {
      const { data: doc } = await context.supabase
        .from("compliance_documents")
        .select("id, document_type, expiry_date, status, file_name")
        .eq("id", item.compliance_document_id)
        .maybeSingle();
      linkedDoc = doc;
    }

    const { data: schedules } = item.amc_contract_id
      ? await context.supabase
          .from("amc_service_schedules")
          .select("id, service_number, visit_label, planned_date, status, actual_service_date")
          .eq("contract_id", item.amc_contract_id)
          .order("planned_date")
          .limit(12)
      : { data: [] };

    return { item, attachments: attachments ?? [], linkedAmc, linkedDoc, schedules: schedules ?? [] };
  },
  { auth: { capability: "compliance.view" } },
);

export const upsertLocationComplianceItem = createAuthenticatedAction(
  ItemFields.extend({ id: z.string().uuid().optional() }),
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    const { id, ...fields } = data;
    const payload = { ...fields, updated_by: context.userId };

    if (id) {
      const { data: row, error } = await context.supabase
        .from("location_compliance_items")
        .update(payload)
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      return row;
    }

    const { data: row, error } = await context.supabase
      .from("location_compliance_items")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return row;
  },
  { auth: { minRoleLevel: 50 } },
);

export const deleteLocationComplianceItem = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: item } = await context.supabase
      .from("location_compliance_items")
      .select("location_id")
      .eq("id", data.id)
      .single();
    if (!item) throw new Error("Not found");
    await assertLocationAccess(context, item.location_id);
    const { error } = await context.supabase.from("location_compliance_items").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { minRoleLevel: 80 } },
);

export const listComplianceRequirementTemplates = createAuthenticatedAction(
  z.object({ locationType: z.string().nullable().optional(), locationCode: z.string().nullable().optional() }).default({}),
  async (data, context) => {
    const locationType =
      data.locationType ??
      (data.locationCode ? LOCATION_TYPE_BY_CODE[data.locationCode] : null);
    let q = context.supabase.from("compliance_requirements").select("*").order("sort_order");
    if (locationType) q = q.eq("location_type", locationType);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const applyComplianceTemplate = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid(), locationCode: z.string() }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const locationType = LOCATION_TYPE_BY_CODE[data.locationCode];
    if (!locationType) throw new Error("Unknown location type for template");

    const { data: templates, error: tErr } = await context.supabase
      .from("compliance_requirements")
      .select("*")
      .eq("location_type", locationType)
      .order("sort_order");
    if (tErr) throw tErr;
    if (!templates?.length) throw new Error("No template found");

    const { data: existing } = await context.supabase
      .from("location_compliance_items")
      .select("requirement_id")
      .eq("location_id", data.locationId);

    const have = new Set((existing ?? []).map((e) => e.requirement_id).filter(Boolean));
    const toInsert = templates
      .filter((t) => !have.has(t.id))
      .map((t) => ({
        location_id: data.locationId,
        requirement_id: t.id,
        area_sub_area: t.area_sub_area,
        category: t.category,
        requirement_name: t.requirement_name,
        document_contract_type: t.document_contract_type,
        is_required: t.is_required,
        service_frequency: t.default_frequency,
        owner: t.default_owner,
        department: t.default_department,
        risk_level: t.default_risk_level,
        updated_by: context.userId,
      }));

    if (!toInsert.length) return { inserted: 0 };
    const { error } = await context.supabase.from("location_compliance_items").insert(toInsert);
    if (error) throw error;
    return { inserted: toInsert.length };
  },
  { auth: { minRoleLevel: 80 } },
);

export const uploadLocationComplianceAttachment = createAuthenticatedAction(
  z.object({
    itemId: z.string().uuid(),
    attachmentType: z.enum(ATTACHMENT_TYPES),
    fileName: z.string().min(1).max(255),
    fileMime: z.string().max(100),
    fileBase64: z.string().min(1),
  }),
  async (data, context) => {
    validateUploadMime(data.fileMime, "document");
    validateBase64Size(data.fileBase64, 20 * 1024 * 1024);

    const { data: item } = await context.supabase
      .from("location_compliance_items")
      .select("location_id")
      .eq("id", data.itemId)
      .single();
    if (!item) throw new Error("Item not found");
    await assertLocationAccess(context, item.location_id);

    const path = `location-tracker/${data.itemId}/${data.attachmentType}-${Date.now()}-${data.fileName}`;
    const buffer = Buffer.from(data.fileBase64, "base64");
    const { error: upErr } = await context.supabase.storage
      .from("compliance-documents")
      .upload(path, buffer, { contentType: data.fileMime, upsert: false });
    if (upErr) throw upErr;

    const { data: row, error } = await context.supabase
      .from("location_compliance_attachments")
      .insert({
        item_id: data.itemId,
        attachment_type: data.attachmentType,
        file_name: data.fileName,
        file_path: path,
        file_mime: data.fileMime,
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    await context.supabase
      .from("location_compliance_items")
      .update({ attachment_status: "partial", updated_by: context.userId })
      .eq("id", data.itemId);

    return row;
  },
  { auth: { minRoleLevel: 50 } },
);

/** In-app notifications for expiry / service / payment rules (idempotent per day). */
export const syncLocationComplianceNotifications = createAuthenticatedAction(
  TrackerFilter,
  async (data, context) => {
    const items = await fetchLocationTrackerItems(context, toFilters(data));
    const today = new Date().toISOString().slice(0, 10);
    let created = 0;

    for (const item of items) {
      const rules: { type: string; title: string; body: string; severity: string }[] = [];
      const days = item.days_remaining as number | null;

      if (item.computed_status === "Expired") {
        rules.push({
          type: "expired",
          title: `Expired: ${item.requirement_name}`,
          body: `${item.location_code} — ${item.category} expired. Renew immediately.`,
          severity: "critical",
        });
      } else if (days != null) {
        for (const [threshold, ruleType] of [
          [60, "expiry_60"],
          [30, "expiry_30"],
          [15, "expiry_15"],
          [7, "expiry_7"],
        ] as const) {
          if (days === threshold) {
            rules.push({
              type: ruleType,
              title: `${threshold}d to expiry: ${item.requirement_name}`,
              body: `${item.location_code} — renew by ${item.governing_date ?? "—"}.`,
              severity: threshold <= 15 ? "warning" : "info",
            });
          }
        }
      }

      if (item.computed_status === "Service Overdue") {
        rules.push({
          type: "service_overdue",
          title: `Service overdue: ${item.requirement_name}`,
          body: `${item.location_code} — next service was ${item.next_service_date}.`,
          severity: "warning",
        });
      }
      if (item.computed_status === "Missing") {
        rules.push({
          type: "missing_doc",
          title: `Missing document: ${item.requirement_name}`,
          body: `${item.location_code} — required compliance item has no certificate on file.`,
          severity: "warning",
        });
      }
      if (Number(item.outstanding_amount) > 0) {
        rules.push({
          type: "payment_outstanding",
          title: `Outstanding payment: ${item.requirement_name}`,
          body: `${item.location_code} — QAR ${Number(item.outstanding_amount).toLocaleString()} outstanding.`,
          severity: "info",
        });
      }

      for (const rule of rules) {
        const { error: logErr } = await context.supabase.from("compliance_notification_log").insert({
          item_id: item.id,
          rule_type: rule.type,
          user_id: context.userId,
          fired_on: today,
        });
        if (logErr?.code === "23505") continue;
        if (logErr) throw logErr;

        const { error: nErr } = await context.supabase.from("notifications").insert({
          user_id: context.userId,
          location_id: item.location_id,
          category: "compliance_tracker",
          title: rule.title,
          body: rule.body,
          severity: rule.severity,
          source_type: "location_compliance_item",
          source_id: item.id,
          action_url: "/compliance/location-tracker",
          metadata: { rule_type: rule.type, item_id: item.id },
        });
        if (!nErr) created += 1;
      }
    }

    return { created };
  },
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);
