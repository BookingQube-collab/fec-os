"use server";

import { z } from "zod";

import { callMaintenanceRequestAiDraft, extractAssigneeNameHint, inferAssigneeFromNotes, matchLocationByCodeOrName, matchLocationFromNotes, matchTechnicianByName } from "@/lib/maintenance/ai-request-draft";
import {
  isRequestedTechnicianValue,
  loadAssignableTechnicians,
  nameFromRequestedTechnicianValue,
} from "@/lib/maintenance/assignable-technicians";
import {
  getMaintenanceTeamEmails,
  notifyMaintenanceTeamInApp,
  sendMaintenanceRequestSubmittedEmail,
} from "@/lib/maintenance/email";
import { matchLocationAreaName } from "@/lib/location-areas";
import { resolveLocationAreaName } from "@/lib/location-areas.functions";
import { isMaintenanceOtherOption, mergeLookupNames, MAINTENANCE_REQUEST_CATEGORIES, MAINTENANCE_REQUEST_ISSUE_TYPES } from "@/lib/maintenance/request-options";
import {
  resolveMaintenanceCategoryName,
  resolveMaintenanceIssueTypeName,
  fetchMaintenanceOptions,
} from "@/lib/queries/maintenance-options.core";
import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction } from "@/lib/server/create-action";
import { validateBase64Size, validateUploadMimeList } from "@/lib/server/upload-validation";

const PriorityEnum = z.enum(["normal", "medium", "urgent"]);
const RequestStatusEnum = z.enum(["submitted", "accepted", "in_progress", "completed", "cancelled"]);

export const listMaintenanceRequests = createAuthenticatedAction(
  z
    .object({
      locationId: z.string().uuid().nullable().optional(),
      status: RequestStatusEnum.nullable().optional(),
      mine: z.boolean().optional(),
    })
    .default({}),
  async (data, context) => {
    let q = context.supabase
      .from("maintenance_requests")
      .select(
        "id, request_number, location_id, area, category, issue_type, priority, description, assigned_technician_id, reporter_name, reported_at, status, work_order_id, remarks, progress_notes, created_at, accepted_at, completed_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.status) q = q.eq("status", data.status);
    if (data.mine) q = q.eq("created_by", context.userId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "maintenance.view" } },
);

export const getMaintenanceRequest = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("maintenance_requests")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .single();
    if (error) throw error;

    const { data: attachments } = await context.supabase
      .from("maintenance_request_attachments")
      .select("id, file_path, file_name, mime_type, kind, created_at")
      .eq("request_id", data.id)
      .order("created_at");

    const attachmentsWithUrls = await Promise.all(
      (attachments ?? []).map(async (att) => {
        const { data: signed } = await context.supabase.storage
          .from("maintenance-attachments")
          .createSignedUrl(att.file_path, 3600);
        return { ...att, url: signed?.signedUrl ?? null };
      }),
    );

    let completion_signature_url: string | null = null;
    if (row.completion_signature_path) {
      const { data: signed } = await context.supabase.storage
        .from("maintenance-attachments")
        .createSignedUrl(row.completion_signature_path, 3600);
      completion_signature_url = signed?.signedUrl ?? null;
    }

    const { data: location } = await context.supabase
      .from("locations")
      .select("id, code, name")
      .eq("id", row.location_id)
      .maybeSingle();

    let assigned_technician_name: string | null = null;
    if (row.assigned_technician_id) {
      const { data: tech } = await context.supabase
        .from("profiles")
        .select("display_name")
        .eq("id", row.assigned_technician_id)
        .maybeSingle();
      assigned_technician_name = tech?.display_name ?? null;
    }

    return {
      ...row,
      attachments: attachmentsWithUrls,
      completion_signature_url,
      location: location ?? null,
      assigned_technician_name,
    };
  },
  { auth: { capability: "maintenance.view" } },
);

export const createMaintenanceRequest = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    area: z.string().max(200).nullable().optional(),
    category: z.string().min(1).max(100),
    issue_type: z.string().max(100).nullable().optional(),
    priority: PriorityEnum.default("normal"),
    description: z.string().min(3).max(4000),
    assigned_technician_id: z.string().max(300).nullable().optional(),
    /** Free-text when a named person was requested but not linked to a login. */
    requested_technician_name: z.string().max(200).nullable().optional(),
    remarks: z.string().max(4000).nullable().optional(),
    reporter_name: z.string().max(200).nullable().optional(),
    reported_at: z.string().datetime().optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);

    if (isMaintenanceOtherOption(data.category)) {
      throw new Error("Enter a custom category name instead of Other");
    }
    if (data.issue_type && isMaintenanceOtherOption(data.issue_type)) {
      throw new Error("Enter a custom issue type name instead of Other");
    }
    if (data.area && isMaintenanceOtherOption(data.area)) {
      throw new Error("Enter a custom area name instead of Other");
    }

    const category = await resolveMaintenanceCategoryName(context, data.category);
    const issueType = data.issue_type?.trim()
      ? await resolveMaintenanceIssueTypeName(context, data.issue_type)
      : null;
    const area = data.area?.trim()
      ? await resolveLocationAreaName(context, data.location_id, data.area)
      : null;

    const { data: requestNumber, error: numErr } = await context.supabase.rpc(
      "generate_maintenance_request_number",
    );
    if (numErr) throw numErr;

    let assignedTechnicianId = data.assigned_technician_id?.trim() || null;
    let requestedName = data.requested_technician_name?.trim() || null;
    if (assignedTechnicianId && isRequestedTechnicianValue(assignedTechnicianId)) {
      requestedName = nameFromRequestedTechnicianValue(assignedTechnicianId) || requestedName;
      assignedTechnicianId = null;
    }
    if (assignedTechnicianId && !z.string().uuid().safeParse(assignedTechnicianId).success) {
      throw new Error("Invalid technician selection");
    }

    let remarks = data.remarks?.trim() || null;
    if (requestedName && !assignedTechnicianId) {
      const tag = `Requested technician: ${requestedName}`;
      remarks = remarks ? `${tag}\n${remarks}` : tag;
    }

    const { data: row, error } = await context.supabase
      .from("maintenance_requests")
      .insert({
        request_number: requestNumber as string,
        location_id: data.location_id,
        area,
        category,
        issue_type: issueType,
        priority: data.priority,
        description: data.description,
        assigned_technician_id: assignedTechnicianId,
        reporter_name: data.reporter_name ?? null,
        reported_at: data.reported_at ?? new Date().toISOString(),
        remarks,
        status: "submitted",
        created_by: context.userId,
      })
      .select("id, request_number, location_id")
      .single();
    if (error) throw error;

    const { data: loc } = await context.supabase
      .from("locations")
      .select("code")
      .eq("id", data.location_id)
      .single();

    await notifyMaintenanceTeamInApp(context.supabase, {
      locationId: data.location_id,
      title: `New request ${row.request_number}`,
      body: data.description.slice(0, 200),
      actionUrl: "/maintenance/requests",
      sourceType: "maintenance_requests",
      sourceId: row.id,
    });

    const teamEmails = await getMaintenanceTeamEmails(context.supabase, data.location_id);
    if (teamEmails.length) {
      await sendMaintenanceRequestSubmittedEmail(context.supabase, {
        toEmails: teamEmails,
        requestId: row.id,
        requestNumber: row.request_number,
        description: data.description,
        priority: data.priority,
        reporterName: data.reporter_name ?? null,
        locationCode: loc?.code ?? "—",
      });
    }

    return { id: row.id, request_number: row.request_number };
  },
  { auth: { capability: "maintenance.request_submit" } },
);

const EDITABLE_REQUEST_STATUSES = ["submitted", "accepted", "in_progress"] as const;

function stripRequestedTechnicianTag(remarks: string | null | undefined): string | null {
  if (!remarks?.trim()) return null;
  const cleaned = remarks
    .split("\n")
    .filter((line) => !/^Requested technician:\s*/i.test(line.trim()))
    .join("\n")
    .trim();
  return cleaned || null;
}

/** Update core fields on an open request (not completed/cancelled). */
export const updateMaintenanceRequest = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    location_id: z.string().uuid(),
    area: z.string().max(200).nullable().optional(),
    category: z.string().min(1).max(100),
    issue_type: z.string().max(100).nullable().optional(),
    priority: PriorityEnum.default("normal"),
    description: z.string().min(3).max(4000),
    assigned_technician_id: z.string().max(300).nullable().optional(),
    requested_technician_name: z.string().max(200).nullable().optional(),
    remarks: z.string().max(4000).nullable().optional(),
    reporter_name: z.string().max(200).nullable().optional(),
    reported_at: z.string().datetime().optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);

    const { data: existing, error: fetchErr } = await context.supabase
      .from("maintenance_requests")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .single();
    if (fetchErr) throw fetchErr;

    if (!(EDITABLE_REQUEST_STATUSES as readonly string[]).includes(existing.status)) {
      throw new Error("Request cannot be edited in its current status");
    }

    if (isMaintenanceOtherOption(data.category)) {
      throw new Error("Enter a custom category name instead of Other");
    }
    if (data.issue_type && isMaintenanceOtherOption(data.issue_type)) {
      throw new Error("Enter a custom issue type name instead of Other");
    }
    if (data.area && isMaintenanceOtherOption(data.area)) {
      throw new Error("Enter a custom area name instead of Other");
    }

    const category = await resolveMaintenanceCategoryName(context, data.category);
    const issueType = data.issue_type?.trim()
      ? await resolveMaintenanceIssueTypeName(context, data.issue_type)
      : null;
    const area = data.area?.trim()
      ? await resolveLocationAreaName(context, data.location_id, data.area)
      : null;

    let assignedTechnicianId = data.assigned_technician_id?.trim() || null;
    let requestedName = data.requested_technician_name?.trim() || null;
    if (assignedTechnicianId && isRequestedTechnicianValue(assignedTechnicianId)) {
      requestedName = nameFromRequestedTechnicianValue(assignedTechnicianId) || requestedName;
      assignedTechnicianId = null;
    }
    if (assignedTechnicianId && !z.string().uuid().safeParse(assignedTechnicianId).success) {
      throw new Error("Invalid technician selection");
    }

    const baseRemarks =
      data.remarks !== undefined
        ? stripRequestedTechnicianTag(data.remarks)
        : stripRequestedTechnicianTag(existing.remarks);
    let remarks = baseRemarks;
    if (requestedName && !assignedTechnicianId) {
      const tag = `Requested technician: ${requestedName}`;
      remarks = remarks ? `${tag}\n${remarks}` : tag;
    }

    const patch = {
      location_id: data.location_id,
      area,
      category,
      issue_type: issueType,
      priority: data.priority,
      description: data.description,
      assigned_technician_id: assignedTechnicianId,
      reporter_name: data.reporter_name ?? null,
      reported_at: data.reported_at ?? existing.reported_at,
      remarks,
    };

    const { data: row, error } = await context.supabase
      .from("maintenance_requests")
      .update(patch)
      .eq("id", data.id)
      .select("id, request_number, work_order_id, location_id, status")
      .single();
    if (error) throw error;

    if (row.work_order_id) {
      await context.supabase
        .from("work_orders")
        .update({
          location_id: data.location_id,
          title: `${category}: ${issueType ?? "Issue"}`,
          description: data.description,
          priority: data.priority,
          area,
          issue_category: category,
          issue_type: issueType,
          reporter_name: data.reporter_name ?? null,
          assigned_to: assignedTechnicianId,
        })
        .eq("id", row.work_order_id);
    }

    await context.supabase.rpc("log_audit", {
      _action: "maintenance_request.updated",
      _table_name: "maintenance_requests",
      _row_id: data.id,
      _location_id: data.location_id,
      _before: {
        location_id: existing.location_id,
        area: existing.area,
        category: existing.category,
        issue_type: existing.issue_type,
        priority: existing.priority,
        description: existing.description,
        assigned_technician_id: existing.assigned_technician_id,
        reporter_name: existing.reporter_name,
        reported_at: existing.reported_at,
        remarks: existing.remarks,
        status: existing.status,
      },
      _after: {
        ...patch,
        status: existing.status,
      },
      _metadata: {},
    });

    return { id: row.id, request_number: row.request_number };
  },
  { auth: { capability: "maintenance.manage" } },
);

export const acceptMaintenanceRequest = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: req, error: reqErr } = await context.supabase
      .from("maintenance_requests")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .single();
    if (reqErr) throw reqErr;
    if (req.status !== "submitted") throw new Error("Request is not in submitted status");

    const { data: wo, error: woErr } = await context.supabase
      .from("work_orders")
      .insert({
        location_id: req.location_id,
        title: `${req.category}: ${req.issue_type ?? "Issue"}`,
        description: req.description,
        kind: "corrective",
        status: "planned",
        priority: req.priority,
        job_order_number: req.request_number,
        area: req.area,
        issue_category: req.category,
        issue_type: req.issue_type,
        reporter_name: req.reporter_name,
        assigned_to: req.assigned_technician_id,
        request_id: req.id,
        planned_end: null,
      })
      .select("id")
      .single();
    if (woErr) throw woErr;

    const { error } = await context.supabase
      .from("maintenance_requests")
      .update({
        status: "accepted",
        work_order_id: wo.id,
        accepted_by: context.userId,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw error;

    return { work_order_id: wo.id };
  },
  { auth: { capability: "maintenance.manage" } },
);

export const updateMaintenanceRequestProgress = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    status: z.enum(["in_progress"]).optional(),
    progress_notes: z.string().max(4000).nullable().optional(),
    remarks: z.string().max(4000).nullable().optional(),
    assigned_technician_id: z.string().uuid().nullable().optional(),
  }),
  async (data, context) => {
    const patch: {
      status?: "in_progress";
      progress_notes?: string | null;
      remarks?: string | null;
      assigned_technician_id?: string | null;
    } = {};
    if (data.status) patch.status = data.status;
    if (data.progress_notes !== undefined) patch.progress_notes = data.progress_notes;
    if (data.remarks !== undefined) patch.remarks = data.remarks;
    if (data.assigned_technician_id !== undefined) {
      patch.assigned_technician_id = data.assigned_technician_id;
    }

    const { data: req, error } = await context.supabase
      .from("maintenance_requests")
      .update(patch)
      .eq("id", data.id)
      .select("work_order_id, status")
      .single();
    if (error) throw error;

    if (req.work_order_id && data.status === "in_progress") {
      const woPatch: {
        status?: "in_progress";
        assigned_to?: string | null;
      } = { status: "in_progress" };
      if (data.assigned_technician_id) woPatch.assigned_to = data.assigned_technician_id;
      await context.supabase.from("work_orders").update(woPatch).eq("id", req.work_order_id);
    }

    return { ok: true };
  },
  { auth: { capability: "maintenance.execute_wo" } },
);

const CompletionPhotoSchema = z.object({
  file_name: z.string().min(1).max(255),
  file_base64: z.string().min(1),
  mime_type: z.string().min(1).max(100),
});

/** Close a request with completion notes, proof photos, and signature. */
export const completeMaintenanceRequest = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    completed_by_name: z.string().min(1).max(200),
    progress_notes: z.string().max(4000).nullable().optional(),
    signature_data_url: z.string().min(100).max(500_000),
    photos: z.array(CompletionPhotoSchema).max(12).default([]),
  }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("maintenance_requests")
      .select("id, status, work_order_id")
      .eq("id", data.id)
      .is("deleted_at", null)
      .single();
    if (fetchErr) throw fetchErr;
    if (!["accepted", "in_progress"].includes(existing.status)) {
      throw new Error("Request cannot be closed from current status");
    }

    const dataUrlMatch = data.signature_data_url.match(
      /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/,
    );
    if (!dataUrlMatch) throw new Error("Invalid signature image");
    const sigMime = dataUrlMatch[1];
    const sigBase64 = dataUrlMatch[2];
    validateBase64Size(sigBase64, 2 * 1024 * 1024);

    const sigExt = sigMime === "image/jpeg" ? "jpg" : sigMime === "image/webp" ? "webp" : "png";
    const signaturePath = `${data.id}/completion-signature-${Date.now()}.${sigExt}`;
    const sigBuffer = Buffer.from(sigBase64, "base64");
    const { error: sigUpErr } = await context.supabase.storage
      .from("maintenance-attachments")
      .upload(signaturePath, sigBuffer, { contentType: sigMime, upsert: false });
    if (sigUpErr) throw sigUpErr;

    for (const photo of data.photos) {
      validateUploadMimeList(photo.mime_type, [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "video/mp4",
        "video/webm",
        "video/quicktime",
      ]);
      validateBase64Size(photo.file_base64, 50 * 1024 * 1024);
      const ext = photo.file_name.split(".").pop() || "bin";
      const path = `${data.id}/completion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const buffer = Buffer.from(photo.file_base64, "base64");
      const { error: upErr } = await context.supabase.storage
        .from("maintenance-attachments")
        .upload(path, buffer, { contentType: photo.mime_type, upsert: false });
      if (upErr) throw upErr;

      const { error: attErr } = await context.supabase.from("maintenance_request_attachments").insert({
        request_id: data.id,
        file_path: path,
        file_name: photo.file_name,
        mime_type: photo.mime_type,
        kind: "completion",
        created_by: context.userId,
      });
      if (attErr) throw attErr;
    }

    const completedAt = new Date().toISOString();
    const patch: {
      status: "completed";
      completed_at: string;
      completed_by: string;
      completed_by_name: string;
      completion_signature_path: string;
      progress_notes?: string | null;
    } = {
      status: "completed",
      completed_at: completedAt,
      completed_by: context.userId,
      completed_by_name: data.completed_by_name.trim(),
      completion_signature_path: signaturePath,
    };
    if (data.progress_notes !== undefined) patch.progress_notes = data.progress_notes;

    const { data: req, error } = await context.supabase
      .from("maintenance_requests")
      .update(patch)
      .eq("id", data.id)
      .select("work_order_id")
      .single();
    if (error) throw error;

    if (req.work_order_id) {
      await context.supabase
        .from("work_orders")
        .update({ status: "completed", actual_end: completedAt })
        .eq("id", req.work_order_id);
    }

    return { ok: true, completed_at: completedAt };
  },
  { auth: { capability: "maintenance.execute_wo" } },
);

export const addMaintenanceRequestAttachment = createAuthenticatedAction(
  z.object({
    request_id: z.string().uuid(),
    file_path: z.string().min(1).max(500),
    file_name: z.string().max(255).optional(),
    mime_type: z.string().max(100).optional(),
    kind: z.enum(["submission", "before", "after", "completion"]).default("submission"),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("maintenance_request_attachments")
      .insert({
        request_id: data.request_id,
        file_path: data.file_path,
        file_name: data.file_name ?? null,
        mime_type: data.mime_type ?? null,
        kind: data.kind,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  },
  { auth: { capability: "maintenance.request_submit" } },
);

export const uploadMaintenanceAttachment = createAuthenticatedAction(
  z.object({
    request_id: z.string().uuid(),
    file_name: z.string().min(1).max(255),
    file_base64: z.string().min(1),
    mime_type: z.string().min(1).max(100),
    kind: z.enum(["submission", "before", "after", "completion"]).default("submission"),
  }),
  async (data, context) => {
    validateUploadMimeList(data.mime_type, [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ]);
    validateBase64Size(data.file_base64, 50 * 1024 * 1024);

    const ext = data.file_name.split(".").pop() || "bin";
    const path = `${data.request_id}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(data.file_base64, "base64");

    const { error: upErr } = await context.supabase.storage
      .from("maintenance-attachments")
      .upload(path, buffer, { contentType: data.mime_type, upsert: false });
    if (upErr) throw upErr;

    return addMaintenanceRequestAttachment({
      request_id: data.request_id,
      file_path: path,
      file_name: data.file_name,
      mime_type: data.mime_type,
      kind: data.kind,
    });
  },
  { auth: { anyCapability: ["maintenance.request_submit", "maintenance.execute_wo"] } },
);

function resolveMatchPoolIds(
  result: {
    assignee_name: string | null;
    assigned_technician_id: string | null;
    assignee_ambiguous: boolean;
    requested_technician_name?: string | null;
  },
): {
  assignee_name: string | null;
  assigned_technician_id: string | null;
  assignee_ambiguous: boolean;
  requested_technician_name: string | null;
} {
  const rawId = result.assigned_technician_id?.trim() || null;
  if (rawId && isRequestedTechnicianValue(rawId)) {
    const name =
      nameFromRequestedTechnicianValue(rawId) ||
      result.assignee_name?.trim() ||
      result.requested_technician_name?.trim() ||
      null;
    return {
      assignee_name: name,
      assigned_technician_id: null,
      assignee_ambiguous: false,
      requested_technician_name: name,
    };
  }
  if (rawId) {
    return {
      assignee_name: result.assignee_name,
      assigned_technician_id: rawId,
      assignee_ambiguous: false,
      requested_technician_name: null,
    };
  }
  const name = result.assignee_name?.trim() || result.requested_technician_name?.trim() || null;
  return {
    assignee_name: name,
    assigned_technician_id: null,
    assignee_ambiguous: result.assignee_ambiguous,
    requested_technician_name: result.assignee_ambiguous ? null : name,
  };
}

export const listMaintenanceTechnicians = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid() }),
  async (data, context) => {
    const { assignable } = await loadAssignableTechnicians(context.supabase, data.locationId);
    return assignable.map((t) => ({
      id: t.id,
      display_name: t.requested_only ? `${t.name} (staff)` : t.display_name,
    }));
  },
  { auth: { capability: "maintenance.view" } },
);

export const aiDraftMaintenanceRequest = createAuthenticatedAction(
  z.object({
    /** Current branch-switcher / form venue — overridden when notes name a different site. */
    location_id: z.string().uuid().optional().nullable(),
    notes: z.string().min(3).max(4000),
  }),
  async (data, context) => {
    const { data: roles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role_level, location_ids")
      .eq("user_id", context.userId);
    if (roleErr) throw roleErr;

    const isPortfolio = (roles ?? []).some((r) => Number(r.role_level) >= 80);
    let accessibleIds: string[] | null = null;
    if (!isPortfolio) {
      const ids = new Set<string>();
      for (const r of roles ?? []) {
        for (const id of (r.location_ids as string[]) ?? []) ids.add(id);
      }
      accessibleIds = [...ids];
    }

    let locQuery = context.supabase
      .from("locations")
      .select("id, code, name, region")
      .eq("status", "active")
      .order("code");
    if (accessibleIds) {
      if (!accessibleIds.length) throw new Error("No accessible branches for AI Assist");
      locQuery = locQuery.in("id", accessibleIds);
    }
    const { data: locationRows, error: locsErr } = await locQuery;
    if (locsErr) throw locsErr;

    const available_locations = (locationRows ?? []).map((l) => ({
      id: l.id as string,
      code: l.code as string,
      name: l.name as string,
      region: (l.region as string | null) ?? null,
    }));

    // Prefer venue mentioned in notes over the global branch switcher
    const fromNotes = matchLocationFromNotes(data.notes, available_locations);
    let resolvedLocationId = fromNotes?.id ?? data.location_id ?? null;
    if (!resolvedLocationId) {
      throw new Error("Select a venue or mention one in the description (e.g. Urban Arena)");
    }
    await assertLocationAccess(context, resolvedLocationId);

    const loadVenueBundle = async (locationId: string) => {
      const [
        { data: location, error: locErr },
        { data: areas, error: areasErr },
        categoryRows,
        issueTypeRows,
        techBundle,
      ] = await Promise.all([
        context.supabase
          .from("locations")
          .select("id, code, name, region")
          .eq("id", locationId)
          .single(),
        context.supabase
          .from("location_areas")
          .select("name")
          .eq("location_id", locationId)
          .eq("is_active", true)
          .order("sort_order")
          .order("name"),
        fetchMaintenanceOptions(context, { kind: "category", activeOnly: true }).catch(() => []),
        fetchMaintenanceOptions(context, { kind: "issue_type", activeOnly: true }).catch(() => []),
        loadAssignableTechnicians(context.supabase, locationId),
      ]);
      if (locErr) throw locErr;
      if (areasErr) throw areasErr;

      // Prefer id-backed rows for AI prompt; include staff aliases (incl. requested:*) in match pool
      const byId = new Map<string, { id: string; name: string }>();
      for (const t of techBundle.matchPool) {
        if (!t.id) continue;
        if (isRequestedTechnicianValue(t.id)) {
          // Keep staff-only rows for matching + client select binding
          if (!byId.has(t.id)) byId.set(t.id, t);
          continue;
        }
        if (!byId.has(t.id)) byId.set(t.id, t);
      }
      const matchTechnicians: { id: string; name: string }[] = [...byId.values()];
      const assignableIds = new Set(
        [...byId.keys()].filter((id) => !isRequestedTechnicianValue(id)),
      );
      const selectableIds = new Set([...byId.keys()]);

      return {
        location: {
          id: location.id as string,
          code: location.code as string,
          name: location.name as string,
          region: (location.region as string | null) ?? null,
        },
        available_areas: (areas ?? []).map((a) => a.name as string),
        available_categories: mergeLookupNames(
          categoryRows.map((r) => r.name),
          MAINTENANCE_REQUEST_CATEGORIES,
        ),
        available_issue_types: mergeLookupNames(
          issueTypeRows.map((r) => r.name),
          MAINTENANCE_REQUEST_ISSUE_TYPES,
        ),
        available_technicians: matchTechnicians,
        assignable_ids: assignableIds,
        selectable_ids: selectableIds,
      };
    };

    let bundle = await loadVenueBundle(resolvedLocationId);

    const draft = await callMaintenanceRequestAiDraft({
      notes: data.notes,
      location_id: bundle.location.id,
      location_code: bundle.location.code,
      location_name: bundle.location.name,
      available_locations,
      available_areas: bundle.available_areas,
      available_categories: bundle.available_categories,
      available_issue_types: bundle.available_issue_types,
      // AI prompt: only real login techs (avoid requested: noise); matching uses full pool below
      available_technicians: bundle.available_technicians.filter((t) => !isRequestedTechnicianValue(t.id)),
    });

    const finalizeAssignee = (
      fields: typeof draft.fields,
      techs: { id: string; name: string }[],
      assignableIds: Set<string>,
      selectableIds: Set<string>,
    ) => {
      let assignee = {
        assignee_name: fields.assignee_name,
        assigned_technician_id: fields.assigned_technician_id,
        assignee_ambiguous: fields.assignee_ambiguous,
        requested_technician_name: fields.requested_technician_name ?? null,
      };

      // Drop ids that aren't in the selectable set
      if (assignee.assigned_technician_id && !selectableIds.has(assignee.assigned_technician_id)) {
        assignee = {
          ...assignee,
          assigned_technician_id: null,
          requested_technician_name:
            assignee.requested_technician_name || assignee.assignee_name,
        };
      }

      if (!assignee.assigned_technician_id) {
        if (assignee.assignee_name) {
          const rematch = matchTechnicianByName(assignee.assignee_name, techs);
          if (rematch.assigned_technician_id && selectableIds.has(rematch.assigned_technician_id)) {
            if (isRequestedTechnicianValue(rematch.assigned_technician_id)) {
              const name =
                rematch.assignee_name ||
                nameFromRequestedTechnicianValue(rematch.assigned_technician_id);
              assignee = {
                assignee_name: name,
                // Keep requested:* so the form Select can bind to the staff option
                assigned_technician_id: rematch.assigned_technician_id,
                assignee_ambiguous: false,
                requested_technician_name: name,
              };
            } else if (assignableIds.has(rematch.assigned_technician_id)) {
              assignee = {
                assignee_name: rematch.assignee_name,
                assigned_technician_id: rematch.assigned_technician_id,
                assignee_ambiguous: false,
                requested_technician_name: null,
              };
            }
          } else if (rematch.assignee_ambiguous) {
            assignee = {
              assignee_name: rematch.assignee_name,
              assigned_technician_id: null,
              assignee_ambiguous: true,
              requested_technician_name: null,
            };
          } else {
            const nice =
              rematch.assignee_name ||
              extractAssigneeNameHint(data.notes) ||
              assignee.assignee_name;
            // Prefer a selectable staff option if name matches
            const staffOpt = techs.find(
              (t) =>
                isRequestedTechnicianValue(t.id) &&
                t.name.toLowerCase() === (nice ?? "").toLowerCase(),
            );
            assignee = {
              assignee_name: nice,
              assigned_technician_id: staffOpt?.id ?? null,
              assignee_ambiguous: false,
              requested_technician_name: nice,
            };
          }
        }
        if (!assignee.assigned_technician_id && !assignee.assignee_name) {
          const fromNotes = inferAssigneeFromNotes(data.notes, techs);
          if (
            fromNotes.assigned_technician_id &&
            selectableIds.has(fromNotes.assigned_technician_id)
          ) {
            if (isRequestedTechnicianValue(fromNotes.assigned_technician_id)) {
              const name =
                fromNotes.assignee_name ||
                nameFromRequestedTechnicianValue(fromNotes.assigned_technician_id);
              assignee = {
                assignee_name: name,
                assigned_technician_id: fromNotes.assigned_technician_id,
                assignee_ambiguous: false,
                requested_technician_name: name,
              };
            } else {
              assignee = {
                assignee_name: fromNotes.assignee_name,
                assigned_technician_id: fromNotes.assigned_technician_id,
                assignee_ambiguous: false,
                requested_technician_name: null,
              };
            }
          } else {
            assignee = resolveMatchPoolIds(fromNotes);
          }
        }
      }

      // For real auth ids, clear requested name; for requested:* keep both for UI
      if (
        assignee.assigned_technician_id &&
        !isRequestedTechnicianValue(assignee.assigned_technician_id)
      ) {
        return {
          assignee_name: assignee.assignee_name,
          assigned_technician_id: assignee.assigned_technician_id,
          assignee_ambiguous: false,
          requested_technician_name: null,
        };
      }
      if (assignee.assigned_technician_id && isRequestedTechnicianValue(assignee.assigned_technician_id)) {
        const name =
          assignee.requested_technician_name ||
          assignee.assignee_name ||
          nameFromRequestedTechnicianValue(assignee.assigned_technician_id);
        return {
          assignee_name: name,
          assigned_technician_id: assignee.assigned_technician_id,
          assignee_ambiguous: false,
          requested_technician_name: name,
        };
      }
      return resolveMatchPoolIds(assignee);
    };

    // If AI resolved a different accessible venue, reload areas/techs and re-bind
    const resultLocId = draft.fields.location_id;
    if (resultLocId && resultLocId !== resolvedLocationId) {
      const aiLoc = matchLocationByCodeOrName(draft.fields.location_code, available_locations);
      const nextId = aiLoc?.id ?? resultLocId;
      await assertLocationAccess(context, nextId);
      bundle = await loadVenueBundle(nextId);

      const rematchedArea = matchLocationAreaName(
        draft.fields.area || data.notes,
        bundle.available_areas.map((name) => ({ name })),
      );
      const area = rematchedArea || draft.fields.area;
      const assignee = finalizeAssignee(
        draft.fields,
        bundle.available_technicians,
        bundle.assignable_ids,
        bundle.selectable_ids,
      );

      draft.fields = {
        ...draft.fields,
        location_id: bundle.location.id,
        location_code: bundle.location.code,
        location_name: bundle.location.name,
        area,
        assignee_name: assignee.assignee_name,
        assigned_technician_id: assignee.assigned_technician_id,
        assignee_ambiguous: assignee.assignee_ambiguous,
        requested_technician_name: assignee.requested_technician_name,
      };
    } else {
      const assignee = finalizeAssignee(
        draft.fields,
        bundle.available_technicians,
        bundle.assignable_ids,
        bundle.selectable_ids,
      );
      const rematchedArea = matchLocationAreaName(
        draft.fields.area || data.notes,
        bundle.available_areas.map((name) => ({ name })),
      );
      draft.fields = {
        ...draft.fields,
        location_id: bundle.location.id,
        location_code: bundle.location.code,
        location_name: bundle.location.name,
        area: rematchedArea || draft.fields.area,
        assignee_name: assignee.assignee_name,
        assigned_technician_id: assignee.assigned_technician_id,
        assignee_ambiguous: assignee.assignee_ambiguous,
        requested_technician_name: assignee.requested_technician_name,
      };
    }

    return draft;
  },
  { auth: { capability: "maintenance.request_submit" } },
);
