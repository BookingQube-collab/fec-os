"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  LOCATION_DELETE_LINK_PROBES,
  foldLocationDeleteCounts,
  locationDeleteBlockedError,
  locationDeleteBlockers,
  locationDeleteForeignKeyError,
  locationDeleteVerifyError,
  type LocationDeleteLinkKind,
} from "@/lib/locations/delete-guard";
import { LOCATION_KINDS, normalizeLocationKind, type LocationKind } from "@/lib/locations/kind";
import { locationStatusForActiveFlag } from "@/lib/locations/status";
import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";
import { invalidateRouteCachePrefix } from "@/lib/server/route-cache";

const LOCATION_COLUMNS =
  "id, code, name, city, region, country, timezone, status, launched_on, gla_sqm, kind" as const;

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
  kind: LocationKind;
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
  kind: z.enum(LOCATION_KINDS).default("branch"),
});

function forgetOperationalSiteLists() {
  invalidateRouteCachePrefix("sites:");
}

function uniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" || (error.message ?? "").toLowerCase().includes("duplicate key");
}

export const listLocationMaster = createAuthenticatedActionNoInput(
  async (context) => {
    let data: Array<Record<string, unknown>> | null = null;
    const withKind = await context.supabase.from("locations").select(LOCATION_COLUMNS).order("code");
    if (withKind.error) {
      if (!/kind|schema cache|column/i.test(withKind.error.message ?? "")) throw withKind.error;
      const legacy = await context.supabase
        .from("locations")
        .select("id, code, name, city, region, country, timezone, status, launched_on, gla_sqm")
        .order("code");
      if (legacy.error) throw legacy.error;
      data = (legacy.data ?? []) as Array<Record<string, unknown>>;
    } else {
      data = (withKind.data ?? []) as Array<Record<string, unknown>>;
    }
    const rows = (data ?? []).map((row) => ({
      ...(row as Omit<LocationMasterRow, "kind">),
      kind: normalizeLocationKind((row as { kind?: string }).kind),
    }));
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
        kind: data.kind,
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
    return {
      ...(row as Omit<LocationMasterRow, "kind">),
      kind: normalizeLocationKind((row as { kind?: string }).kind),
    };
  },
  { auth: { capability: "branches.edit", minRoleLevel: 80 } },
);

type LocationLinkCountClient = {
  from: (table: string) => {
    select: (
      columns: string,
      options: { count: "exact"; head: true },
    ) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ count: number | null; error: { message?: string } | null }>;
    };
  };
};

async function countLinkedLocationRows(locationId: string) {
  const hits: { kind: LocationDeleteLinkKind; count: number }[] = [];
  const pending = [...LOCATION_DELETE_LINK_PROBES];
  const db = supabaseAdmin as unknown as LocationLinkCountClient;

  async function worker() {
    while (pending.length > 0) {
      const probe = pending.shift();
      if (!probe) return;
      const { count, error } = await db
        .from(probe.table)
        .select("*", { count: "exact", head: true })
        .eq(probe.column, locationId);
      if (error || count == null) throw new Error(locationDeleteVerifyError());
      hits.push({ kind: probe.kind, count });
    }
  }

  await Promise.all(Array.from({ length: Math.min(8, pending.length) }, () => worker()));
  return foldLocationDeleteCounts(hits);
}

function foreignKeyBlocksDelete(error: { code?: string; message?: string }): boolean {
  return error.code === "23503" || (error.message ?? "").toLowerCase().includes("foreign key");
}

export const deleteLocationMaster = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
  }),
  async (data, context) => {
    const { data: existing, error: readError } = await context.supabase
      .from("locations")
      .select("id, code, name")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) throw new Error("Location not found, or you cannot edit locations");

    const counts = await countLinkedLocationRows(data.id);
    const blockers = locationDeleteBlockers(counts);
    if (blockers.length > 0) throw new Error(locationDeleteBlockedError(blockers));

    const { data: removed, error } = await context.supabase
      .from("locations")
      .delete()
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) {
      if (foreignKeyBlocksDelete(error)) throw new Error(locationDeleteForeignKeyError());
      throw error;
    }
    if (!removed) throw new Error("Location not found, or you cannot edit locations");
    forgetOperationalSiteLists();
    return {
      id: existing.id as string,
      code: existing.code as string,
      name: existing.name as string,
    };
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
