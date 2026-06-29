"use server";

import { z } from "zod";

import { createAuthenticatedAction } from "@/lib/server/create-action";

const BookingStatusEnum = z.enum([
  "quote",
  "deposit",
  "confirmed",
  "delivered",
  "cancelled",
  "no_show",
]);
const BookingKindEnum = z.enum(["party", "group", "corporate", "school"]);

const BookingFilter = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    status: BookingStatusEnum.nullable().optional(),
    kind: BookingKindEnum.nullable().optional(),
  })
  .default({});

export const listBookings = createAuthenticatedAction(
  BookingFilter,
  async (data, context) => {
    let q = context.supabase
      .from("bookings")
      .select(
        "id, reference, location_id, kind, status, contact_name, contact_email, contact_phone, party_size, starts_at, ends_at, quote_amount, deposit_amount, total_amount, created_at",
      )
      .order("starts_at", { ascending: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.status) q = q.eq("status", data.status);
    if (data.kind) q = q.eq("kind", data.kind);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "bookings.view" } },
);

export const createBooking = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    kind: BookingKindEnum,
    contact_name: z.string().min(2).max(200),
    contact_email: z.string().email().nullable().optional(),
    contact_phone: z.string().max(40).nullable().optional(),
    party_size: z.number().int().min(1).max(5000),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime().nullable().optional(),
    quote_amount: z.number().nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  }),
  async (data, context) => {
    const { data: id, error } = await context.supabase.rpc("create_booking", {
      _location_id: data.location_id,
      _kind: data.kind,
      _contact_name: data.contact_name,
      _party_size: data.party_size,
      _starts_at: data.starts_at,
      _contact_email: data.contact_email ?? undefined,
      _contact_phone: data.contact_phone ?? undefined,
      _ends_at: data.ends_at ?? undefined,
      _quote_amount: data.quote_amount ?? undefined,
      _notes: data.notes ?? undefined,
    });
    if (error) throw error;
    return { id: id as string };
  },
  { auth: { capability: "bookings.create" } },
);

export const updateBookingStatus = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    status: BookingStatusEnum,
    deposit_amount: z.number().optional(),
    total_amount: z.number().optional(),
    reason: z.string().max(500).optional(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("update_booking_status", {
      _id: data.id,
      _status: data.status,
      _deposit_amount: data.deposit_amount ?? undefined,
      _total_amount: data.total_amount ?? undefined,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "bookings.confirm" } },
);
