"use server";

import { z } from "zod";

import { createAuthenticatedAction } from "@/lib/server/create-action";

export interface PoRow {
  id: string;
  po_number: string;
  location_id: string;
  vendor_name: string;
  category: string | null;
  description: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  received_at: string | null;
}

const LocationOpt = z
  .object({ locationId: z.string().uuid().nullable().optional() })
  .default({});

export const listPurchaseOrders = createAuthenticatedAction(
  LocationOpt,
  async (data, context) => {
    let q = context.supabase
      .from("purchase_orders")
      .select(
        "id, po_number, location_id, vendor_name, category, description, amount, currency, status, created_at, approved_at, received_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as PoRow[];
  },
  { defaultInput: {}, auth: { capability: "bookings.view" } },
);

export const createPurchaseOrder = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    vendor_name: z.string().min(2).max(200),
    amount: z.number().positive(),
    category: z.string().max(100).optional(),
    description: z.string().max(2000).optional(),
    currency: z.string().max(10).default("QAR"),
  }),
  async (data, context) => {
    const { data: id, error } = await context.supabase.rpc("create_purchase_order", {
      _location_id: data.location_id,
      _vendor_name: data.vendor_name,
      _amount: data.amount,
      _category: data.category ?? undefined,
      _description: data.description ?? undefined,
      _currency: data.currency,
    });
    if (error) throw error;
    return { id: id as string };
  },
  { auth: { capability: "bookings.view" } },
);

const PoStatusEnum = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "received",
  "closed",
  "rejected",
]);

export const updatePoStatus = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    status: PoStatusEnum,
    reason: z.string().max(500).optional(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("update_po_status", {
      _id: data.id,
      _status: data.status,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "bookings.view" } },
);
