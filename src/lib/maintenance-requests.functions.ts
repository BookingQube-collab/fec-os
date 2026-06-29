"use server";

import { z } from "zod";

import {
  getMaintenanceTeamEmails,
  notifyMaintenanceTeamInApp,
  sendMaintenanceRequestSubmittedEmail,
} from "@/lib/maintenance/email";
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

    return { ...row, attachments: attachmentsWithUrls };
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
    assigned_technician_id: z.string().uuid().nullable().optional(),
    reporter_name: z.string().max(200).nullable().optional(),
    reported_at: z.string().datetime().optional(),
  }),
  async (data, context) => {
    const { data: requestNumber, error: numErr } = await context.supabase.rpc(
      "generate_maintenance_request_number",
    );
    if (numErr) throw numErr;

    const { data: row, error } = await context.supabase
      .from("maintenance_requests")
      .insert({
        request_number: requestNumber as string,
        location_id: data.location_id,
        area: data.area ?? null,
        category: data.category,
        issue_type: data.issue_type ?? null,
        priority: data.priority,
        description: data.description,
        assigned_technician_id: data.assigned_technician_id ?? null,
        reporter_name: data.reporter_name ?? null,
        reported_at: data.reported_at ?? new Date().toISOString(),
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
    status: RequestStatusEnum.optional(),
    progress_notes: z.string().max(4000).nullable().optional(),
    remarks: z.string().max(4000).nullable().optional(),
    assigned_technician_id: z.string().uuid().nullable().optional(),
  }),
  async (data, context) => {
    const patch: {
      status?: z.infer<typeof RequestStatusEnum>;
      progress_notes?: string | null;
      remarks?: string | null;
      assigned_technician_id?: string | null;
      completed_at?: string;
    } = {};
    if (data.status) patch.status = data.status;
    if (data.progress_notes !== undefined) patch.progress_notes = data.progress_notes;
    if (data.remarks !== undefined) patch.remarks = data.remarks;
    if (data.assigned_technician_id !== undefined) {
      patch.assigned_technician_id = data.assigned_technician_id;
    }
    if (data.status === "in_progress") {
      patch.status = "in_progress";
    }
    if (data.status === "completed") {
      patch.completed_at = new Date().toISOString();
    }

    const { data: req, error } = await context.supabase
      .from("maintenance_requests")
      .update(patch)
      .eq("id", data.id)
      .select("work_order_id, status")
      .single();
    if (error) throw error;

    if (req.work_order_id) {
      const woPatch: {
        status?: "in_progress" | "completed";
        assigned_to?: string | null;
      } = {};
      if (data.status === "in_progress") woPatch.status = "in_progress";
      if (data.status === "completed") woPatch.status = "completed";
      if (data.assigned_technician_id) woPatch.assigned_to = data.assigned_technician_id;
      if (Object.keys(woPatch).length) {
        await context.supabase.from("work_orders").update(woPatch).eq("id", req.work_order_id);
      }
    }

    return { ok: true };
  },
  { auth: { capability: "maintenance.execute_wo" } },
);

export const addMaintenanceRequestAttachment = createAuthenticatedAction(
  z.object({
    request_id: z.string().uuid(),
    file_path: z.string().min(1).max(500),
    file_name: z.string().max(255).optional(),
    mime_type: z.string().max(100).optional(),
    kind: z.enum(["submission", "before", "after"]).default("submission"),
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
    kind: z.enum(["submission", "before", "after"]).default("submission"),
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

export const listMaintenanceTechnicians = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid() }),
  async (data, context) => {
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("user_id, role, location_ids")
      .in("role", ["technician", "tech_supervisor"]);
    if (error) throw error;

    const userIds = (roles ?? [])
      .filter((r) => {
        const locs = (r.location_ids as string[]) ?? [];
        return locs.length === 0 || locs.includes(data.locationId);
      })
      .map((r) => r.user_id);

    if (!userIds.length) return [];

    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    return profiles ?? [];
  },
  { auth: { capability: "maintenance.view" } },
);
