"use server";

import { z } from "zod";

import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction } from "@/lib/server/create-action";

const VENDOR_CATEGORIES = [
  "maintenance", "cleaning", "pest_control", "fire_safety", "it", "pos",
  "mall_contractor", "branding", "games_supplier", "insurance", "legal_compliance", "other",
] as const;

const LocFilter = z
  .object({ locationId: z.string().uuid().nullable().optional(), category: z.string().nullable().optional() })
  .default({});

export const listVendors = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("vendors")
      .select("id, name, category, contact_person, phone, email, branch_coverage, amc_status, active")
      .eq("active", true)
      .order("name");
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw error;

    if (data.locationId) {
      return (rows ?? []).filter(
        (v) => !v.branch_coverage?.length || v.branch_coverage.includes(data.locationId!),
      );
    }
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "vendors.view" } },
);

export const getVendor = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: vendor, error } = await context.supabase
      .from("vendors")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    const [{ data: contacts }, { data: contracts }, { data: followups }] = await Promise.all([
      context.supabase.from("vendor_contacts").select("*").eq("vendor_id", data.id),
      context.supabase.from("vendor_contracts").select("*").eq("vendor_id", data.id).order("end_date"),
      context.supabase
        .from("vendor_followups")
        .select("*")
        .eq("vendor_id", data.id)
        .eq("status", "pending")
        .order("due_date"),
    ]);

    return { ...vendor, contacts: contacts ?? [], contracts: contracts ?? [], followups: followups ?? [] };
  },
  { auth: { capability: "vendors.view" } },
);

export const createVendor = createAuthenticatedAction(
  z.object({
    name: z.string().min(1).max(200),
    category: z.enum(VENDOR_CATEGORIES).default("other"),
    contactPerson: z.string().max(200).optional(),
    phone: z.string().max(50).optional(),
    email: z.string().email().optional(),
    branchCoverage: z.array(z.string().uuid()).default([]),
    amcStatus: z.string().max(50).optional(),
    paymentTerms: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("vendors")
      .insert({
        name: data.name,
        category: data.category,
        contact_person: data.contactPerson ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        branch_coverage: data.branchCoverage,
        amc_status: data.amcStatus ?? null,
        payment_terms: data.paymentTerms ?? null,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "vendors.manage" } },
);

export const createVendorFollowup = createAuthenticatedAction(
  z.object({
    vendorId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    relatedType: z.string().max(50).optional(),
    relatedId: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
  }),
  async (data, context) => {
    if (data.locationId) await assertLocationAccess(context, data.locationId);
    const { data: row, error } = await context.supabase
      .from("vendor_followups")
      .insert({
        vendor_id: data.vendorId,
        location_id: data.locationId ?? null,
        title: data.title,
        due_date: data.dueDate,
        related_type: data.relatedType ?? null,
        related_id: data.relatedId ?? null,
        notes: data.notes ?? null,
        owner_id: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "vendors.manage" } },
);

export const completeVendorFollowup = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), notes: z.string().max(500).optional() }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("vendor_followups")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        notes: data.notes ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "vendors.manage" } },
);

export const getVendorDashboard = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    const { fetchVendorDashboard } = await import("@/lib/queries/vendors-api.core");
    return fetchVendorDashboard(context, data.locationId ?? null);
  },
  { defaultInput: {}, auth: { capability: "vendors.view" } },
);
