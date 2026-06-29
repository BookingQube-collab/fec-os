"use server";

import { z } from "zod";

import { createAuthenticatedAction } from "@/lib/server/create-action";
import { requireCapability } from "@/lib/server/authorize";
import type { Capability } from "@/lib/rbac";
import { validateBase64Size, validateUploadMimeList } from "@/lib/server/upload-validation";

const PriorityEnum = z.enum(["normal", "medium", "urgent"]);
const DeliveryStatusEnum = z.enum([
  "submitted",
  "approved",
  "rejected",
  "preparing",
  "dispatched",
  "verification_pending",
  "completed",
]);
const ItemCategoryEnum = z.enum([
  "spare_parts",
  "tools",
  "consumables",
  "cleaning_materials",
  "safety_equipment",
  "other",
]);

const DeliveryPhotoStageEnum = z.enum(["request", "dispatch", "verification"]);

const STAGE_CAPABILITY: Record<z.infer<typeof DeliveryPhotoStageEnum>, Capability> = {
  request: "maintenance.logistics_submit",
  dispatch: "maintenance.logistics_warehouse",
  verification: "maintenance.logistics_verify",
};

function parseDeliveryPhotoStage(filePath: string): z.infer<typeof DeliveryPhotoStageEnum> {
  const match = filePath.match(/\/(request|dispatch|verification)\//);
  return (match?.[1] as z.infer<typeof DeliveryPhotoStageEnum>) ?? "verification";
}

const DeliveryItemInput = z.object({
  category: ItemCategoryEnum,
  item_name: z.string().min(1).max(200),
  quantity_requested: z.number().positive(),
  unit: z.string().max(20).default("ea"),
  remarks: z.string().max(500).nullable().optional(),
});

export const listDeliveryRequests = createAuthenticatedAction(
  z
    .object({
      locationId: z.string().uuid().nullable().optional(),
      status: DeliveryStatusEnum.nullable().optional(),
    })
    .default({}),
  async (data, context) => {
    let q = context.supabase
      .from("delivery_requests")
      .select(
        "id, request_number, location_id, department, requested_by, request_date, priority, status, dispatched_at, created_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    const list = rows ?? [];
    if (!list.length) return list;

    const ids = list.map((r) => r.id);
    const { data: photoRows, error: photoErr } = await context.supabase
      .from("delivery_request_photos")
      .select("delivery_request_id")
      .in("delivery_request_id", ids);
    if (photoErr) throw photoErr;

    const photoCount = new Map<string, number>();
    for (const p of photoRows ?? []) {
      photoCount.set(p.delivery_request_id, (photoCount.get(p.delivery_request_id) ?? 0) + 1);
    }

    return list.map((r) => ({ ...r, photo_count: photoCount.get(r.id) ?? 0 }));
  },
  { defaultInput: {}, auth: { capability: "maintenance.logistics_view" } },
);

export const getDeliveryRequest = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("delivery_requests")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .single();
    if (error) throw error;

    const [{ data: items }, { data: signatures }, { data: photos }] = await Promise.all([
      context.supabase
        .from("delivery_request_items")
        .select("*")
        .eq("delivery_request_id", data.id)
        .order("created_at"),
      context.supabase
        .from("delivery_signatures")
        .select("*")
        .eq("delivery_request_id", data.id),
      context.supabase
        .from("delivery_request_photos")
        .select("id, file_path, created_at")
        .eq("delivery_request_id", data.id)
        .order("created_at"),
    ]);

    const photosWithUrls = await Promise.all(
      (photos ?? []).map(async (photo) => {
        const { data: signed } = await context.supabase.storage
          .from("maintenance-attachments")
          .createSignedUrl(photo.file_path, 3600);
        return {
          ...photo,
          stage: parseDeliveryPhotoStage(photo.file_path),
          url: signed?.signedUrl ?? null,
        };
      }),
    );

    return {
      ...row,
      items: items ?? [],
      signatures: signatures ?? [],
      photos: photosWithUrls,
    };
  },
  { auth: { capability: "maintenance.logistics_view" } },
);

export const createDeliveryRequest = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    department: z.string().max(100).nullable().optional(),
    requested_by: z.string().min(1).max(200),
    request_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    priority: PriorityEnum.default("normal"),
    remarks: z.string().max(2000).nullable().optional(),
    items: z.array(DeliveryItemInput).min(1),
  }),
  async (data, context) => {
    const { data: requestNumber, error: numErr } = await context.supabase.rpc(
      "generate_delivery_request_number",
    );
    if (numErr) throw numErr;

    const { data: row, error } = await context.supabase
      .from("delivery_requests")
      .insert({
        request_number: requestNumber as string,
        location_id: data.location_id,
        department: data.department ?? null,
        requested_by: data.requested_by,
        request_date: data.request_date ?? new Date().toISOString().slice(0, 10),
        priority: data.priority,
        remarks: data.remarks ?? null,
        status: "submitted",
        created_by: context.userId,
      })
      .select("id, request_number")
      .single();
    if (error) throw error;

    const itemRows = data.items.map((item) => ({
      delivery_request_id: row.id,
      category: item.category,
      item_name: item.item_name,
      quantity_requested: item.quantity_requested,
      unit: item.unit,
      remarks: item.remarks ?? null,
    }));

    const { error: itemsErr } = await context.supabase.from("delivery_request_items").insert(itemRows);
    if (itemsErr) throw itemsErr;

    return { id: row.id, request_number: row.request_number };
  },
  { auth: { capability: "maintenance.logistics_submit" } },
);

export const reviewDeliveryRequest = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    action: z.enum(["approve", "reject"]),
    review_notes: z.string().max(2000).nullable().optional(),
  }),
  async (data, context) => {
    const status = data.action === "approve" ? "approved" : "rejected";
    const { error } = await context.supabase
      .from("delivery_requests")
      .update({
        status,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_notes: data.review_notes ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true, status };
  },
  { auth: { capability: "maintenance.logistics_warehouse" } },
);

export const dispatchDeliveryRequest = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    dispatch_personnel_id: z.string().uuid().nullable().optional(),
    dispatch_notes: z.string().max(2000).nullable().optional(),
    items: z.array(
      z.object({
        id: z.string().uuid(),
        quantity_dispatched: z.number().min(0),
      }),
    ),
  }),
  async (data, context) => {
    for (const item of data.items) {
      const { error } = await context.supabase
        .from("delivery_request_items")
        .update({ quantity_dispatched: item.quantity_dispatched })
        .eq("id", item.id);
      if (error) throw error;
    }

    const { error } = await context.supabase
      .from("delivery_requests")
      .update({
        status: "dispatched",
        dispatch_personnel_id: data.dispatch_personnel_id ?? context.userId,
        dispatched_at: new Date().toISOString(),
        dispatch_notes: data.dispatch_notes ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;

    await context.supabase
      .from("delivery_requests")
      .update({ status: "verification_pending" })
      .eq("id", data.id);

    return { ok: true };
  },
  { auth: { capability: "maintenance.logistics_warehouse" } },
);

export const verifyDeliveryRequest = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    items: z.array(
      z.object({
        id: z.string().uuid(),
        quantity_received: z.number().min(0),
      }),
    ),
    verification_remarks: z.string().max(2000).nullable().optional(),
    shortage_notes: z.string().max(2000).nullable().optional(),
  }),
  async (data, context) => {
    for (const item of data.items) {
      const { error } = await context.supabase
        .from("delivery_request_items")
        .update({ quantity_received: item.quantity_received })
        .eq("id", item.id);
      if (error) throw error;
    }

    const { error } = await context.supabase
      .from("delivery_requests")
      .update({
        verification_remarks: data.verification_remarks ?? null,
        shortage_notes: data.shortage_notes ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;

    return { ok: true };
  },
  { auth: { capability: "maintenance.logistics_verify" } },
);

export const signDeliveryRequest = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    signer_role: z.enum(["supervisor", "warehouse"]),
    signer_name: z.string().min(1).max(200),
    signature_data: z.string().min(100).max(500_000),
  }),
  async (data, context) => {
    const { error } = await context.supabase.from("delivery_signatures").upsert(
      {
        delivery_request_id: data.id,
        signer_role: data.signer_role,
        signer_name: data.signer_name,
        signature_data: data.signature_data,
        signed_by: context.userId,
        signed_at: new Date().toISOString(),
      },
      { onConflict: "delivery_request_id,signer_role" },
    );
    if (error) throw error;

    const { data: sigs } = await context.supabase
      .from("delivery_signatures")
      .select("signer_role")
      .eq("delivery_request_id", data.id);

    const roles = new Set((sigs ?? []).map((s) => s.signer_role));
    if (roles.has("supervisor") && roles.has("warehouse")) {
      await context.supabase
        .from("delivery_requests")
        .update({ status: "completed" })
        .eq("id", data.id);
    }

    return { ok: true, completed: roles.has("supervisor") && roles.has("warehouse") };
  },
  { auth: { anyCapability: ["maintenance.logistics_verify", "maintenance.logistics_warehouse"] } },
);

export const uploadDeliveryPhoto = createAuthenticatedAction(
  z.object({
    delivery_request_id: z.string().uuid(),
    file_name: z.string().min(1).max(255),
    file_base64: z.string().min(1),
    mime_type: z.string().min(1).max(100),
    stage: DeliveryPhotoStageEnum.default("verification"),
  }),
  async (data, context) => {
    await requireCapability(context, STAGE_CAPABILITY[data.stage]);

    validateUploadMimeList(data.mime_type, ["image/jpeg", "image/png", "image/webp"]);
    validateBase64Size(data.file_base64, 10 * 1024 * 1024);

    const ext = data.file_name.split(".").pop() || "jpg";
    const path = `delivery/${data.delivery_request_id}/${data.stage}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(data.file_base64, "base64");

    const { error: upErr } = await context.supabase.storage
      .from("maintenance-attachments")
      .upload(path, buffer, { contentType: data.mime_type, upsert: false });
    if (upErr) throw upErr;

    const { data: row, error } = await context.supabase
      .from("delivery_request_photos")
      .insert({
        delivery_request_id: data.delivery_request_id,
        file_path: path,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id, file_path: path, stage: data.stage };
  },
  {
    auth: {
      anyCapability: [
        "maintenance.logistics_submit",
        "maintenance.logistics_warehouse",
        "maintenance.logistics_verify",
      ],
    },
  },
);
