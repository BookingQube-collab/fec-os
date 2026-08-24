"use server";

import { z } from "zod";

import type { AuthContext } from "@/lib/server/auth";
import { createAuthenticatedAction } from "@/lib/server/create-action";
import { assertLocationAccess } from "@/lib/server/authorize";
import { isMaintenanceOtherOption } from "@/lib/maintenance/request-options";

/** Resolve area name for a branch; inserts when new (case-insensitive de-dupe). */
export async function resolveLocationAreaName(
  context: AuthContext,
  locationId: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Area name is required");
  if (isMaintenanceOtherOption(trimmed)) {
    throw new Error("Enter a custom area name instead of Other");
  }
  const { data, error } = await context.supabase.rpc("ensure_location_area", {
    p_location_id: locationId,
    p_name: trimmed,
  });
  if (error) throw error;
  const resolved = typeof data === "string" ? data.trim() : "";
  if (!resolved) throw new Error("Failed to save area");
  return resolved;
}

export const createLocationArea = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    name: z.string().min(1).max(120),
    code: z.string().max(40).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    const name = data.name.trim().replace(/\s+/g, " ");
    if (isMaintenanceOtherOption(name)) {
      throw new Error("Enter a custom area name instead of Other");
    }
    const { data: existing } = await context.supabase
      .from("location_areas")
      .select("id, name")
      .eq("location_id", data.location_id)
      .ilike("name", name)
      .maybeSingle();
    if (existing) {
      throw new Error(`Area "${existing.name}" already exists for this branch`);
    }
    const { data: row, error } = await context.supabase
      .from("location_areas")
      .insert({
        location_id: data.location_id,
        name,
        code: data.code?.trim().toUpperCase() || null,
        sort_order: data.sortOrder ?? 500,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  },
  { auth: { capability: "maintenance.manage" } },
);

export const updateLocationArea = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    code: z.string().max(40).nullable().optional(),
    is_active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("location_areas")
      .select("location_id")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id as string);

    const patch: {
      name?: string;
      code?: string | null;
      is_active?: boolean;
      sort_order?: number;
    } = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.code !== undefined) patch.code = data.code?.trim().toUpperCase() || null;
    if (data.is_active !== undefined) patch.is_active = data.is_active;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;

    const { error } = await context.supabase.from("location_areas").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "maintenance.manage" } },
);
