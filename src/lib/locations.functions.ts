"use server";

import { z } from "zod";

import { locationStatusForActiveFlag } from "@/lib/locations/status";
import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";
import { invalidateRouteCachePrefix } from "@/lib/server/route-cache";

const LOCATION_COLUMNS =
  "id, code, name, city, region, country, timezone, status, launched_on, gla_sqm" as const;

export type LocationMasterRow = {
  id: string;
  code: string;
  name: string;
  city: string;
  region: string | null;
  country: string;
  timezone: string;
  status: string;
  launched_on: string | null;
  gla_sqm: number | null;
};

const optionalText = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed ? trimmed : null;
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(120),
  region: optionalText,
  country: z.string().trim().min(2).max(8),
  timezone: z.string().trim().min(1).max(64),
  launchedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  glaSqm: z.number().nonnegative().nullable().optional(),
  active: z.boolean(),
});

function forgetOperationalSiteLists() {
  invalidateRouteCachePrefix("sites:");
}

function uniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" || (error.message ?? "").toLowerCase().includes("duplicate key");
}

export const listLocationMaster = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("locations")
      .select(LOCATION_COLUMNS)
      .order("code");
    if (error) throw error;
    const rows = (data ?? []) as LocationMasterRow[];
    return rows.sort((a, b) => {
      const rank = (status: string) => (status === "active" ? 0 : 1);
      return rank(a.status) - rank(b.status) || a.code.localeCompare(b.code);
    });
  },
  { auth: { capability: "admin.view" } },
);

export const updateLocationMaster = createAuthenticatedAction(
  updateSchema,
  async (data, context) => {
    const status = locationStatusForActiveFlag(data.active);
    const { data: row, error } = await context.supabase
      .from("locations")
      .update({
        code: data.code.trim().toUpperCase(),
        name: data.name.trim(),
        city: data.city.trim(),
        region: data.region,
        country: data.country.trim().toUpperCase(),
        timezone: data.timezone.trim(),
        launched_on: data.launchedOn ?? null,
        gla_sqm: data.glaSqm ?? null,
        status,
      })
      .eq("id", data.id)
      .select(LOCATION_COLUMNS)
      .maybeSingle();
    if (error) {
      if (uniqueViolation(error)) throw new Error("A location with this code already exists");
      throw error;
    }
    if (!row) throw new Error("Location not found, or you cannot edit locations");
    forgetOperationalSiteLists();
    return row as LocationMasterRow;
  },
  { auth: { capability: "branches.edit", minRoleLevel: 80 } },
);

export const setLocationActive = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    active: z.boolean(),
  }),
  async (data, context) => {
    const status = locationStatusForActiveFlag(data.active);
    const { data: row, error } = await context.supabase
      .from("locations")
      .update({ status })
      .eq("id", data.id)
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Location not found, or you cannot edit locations");
    forgetOperationalSiteLists();
    return { id: row.id as string, status: row.status as string };
  },
  { auth: { capability: "branches.edit", minRoleLevel: 80 } },
);
