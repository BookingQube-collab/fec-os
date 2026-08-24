"use server";

import { z } from "zod";

import { canUserDo } from "@/lib/rbac";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { rollbackRosterBatch } from "@/lib/staff-roster/apply";

async function assertStaffLocation(context: AuthContext, staffId: string): Promise<{ location_id: string; status: string; deleted_at: string | null }> {
  const { data, error } = await context.supabase
    .from("staff")
    .select("location_id, status, deleted_at")
    .eq("id", staffId)
    .single();
  if (error) throw error;
  const { data: allowed, error: locErr } = await context.supabase.rpc("user_can_access_staff", {
    _staff_id: staffId,
  });
  if (locErr) {
    const { data: homeOk, error: homeErr } = await context.supabase.rpc("user_can_access_location", {
      _location_id: data.location_id,
    });
    if (homeErr) throw homeErr;
    if (!homeOk) throw new ForbiddenError("Forbidden: cannot access this branch");
  } else if (!allowed) {
    throw new ForbiddenError("Forbidden: cannot access this branch");
  }
  return data;
}

async function audit(
  context: AuthContext,
  action: string,
  rowId: string,
  after: Record<string, unknown>,
  locationId?: string,
) {
  await context.supabase.rpc("log_audit", {
    _action: action,
    _table_name: "staff",
    _row_id: rowId,
    _after: after as unknown as import("@/integrations/supabase/types").Json,
    _location_id: locationId,
    _metadata: {},
  });
}

export const archiveStaffMember = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const existing = await assertStaffLocation(context, data.id);
    const { error } = await context.supabase
      .from("staff")
      .update({ status: "terminated", deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    await audit(context, "staff.archived", data.id, { status: "terminated" }, existing.location_id);
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const restoreStaffMember = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("staff")
      .select("location_id")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;
    const { data: allowed, error: locErr } = await context.supabase.rpc("user_can_access_location", {
      _location_id: existing.location_id,
    });
    if (locErr) throw locErr;
    if (!allowed) throw new ForbiddenError("Forbidden: cannot access this branch");
    const { error } = await context.supabase
      .from("staff")
      .update({ status: "active", deleted_at: null })
      .eq("id", data.id);
    if (error) throw error;
    await audit(context, "staff.restored", data.id, { status: "active" }, existing.location_id);
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const transferStaffMember = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    toLocationId: z.string().uuid(),
    effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().max(500).optional(),
  }),
  async (data, context) => {
    const existing = await assertStaffLocation(context, data.id);
    const { data: destOk, error: destErr } = await context.supabase.rpc("user_can_access_location", {
      _location_id: data.toLocationId,
    });
    if (destErr) throw destErr;
    if (!destOk) throw new ForbiddenError("Forbidden: cannot transfer to this branch");

    const { error: trErr } = await context.supabase.from("staff_transfers").insert({
      staff_id: data.id,
      from_location_id: existing.location_id,
      to_location_id: data.toLocationId,
      effective_on: data.effectiveOn,
      reason: data.reason ?? null,
      created_by: context.userId,
    });
    if (trErr) throw trErr;

    const { error } = await context.supabase
      .from("staff")
      .update({ location_id: data.toLocationId })
      .eq("id", data.id);
    if (error) throw error;
    await audit(
      context,
      "staff.transferred",
      data.id,
      { from: existing.location_id, to: data.toLocationId, effectiveOn: data.effectiveOn },
      data.toLocationId,
    );
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const updateStaffSalary = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    monthlySalaryQar: z.number().min(0).max(1_000_000).nullable(),
    dailyRateQar: z.number().min(0).max(100_000).nullable().optional(),
  }),
  async (data, context) => {
    if (!canUserDo(context.roles ?? [], "people.edit_salary")) {
      throw new ForbiddenError("Forbidden: missing capability people.edit_salary");
    }
    await assertStaffLocation(context, data.id);
    const { error } = await context.supabase.from("staff_compensation").upsert({
      staff_id: data.id,
      monthly_salary_qar: data.monthlySalaryQar,
      daily_rate_qar: data.dailyRateQar ?? null,
      updated_by: context.userId,
    });
    if (error) throw error;
    await audit(context, "staff.salary_changed", data.id, {
      monthly_salary_qar: data.monthlySalaryQar,
    });
    return { ok: true };
  },
  { auth: { capability: "people.edit_salary" } },
);

export const rollbackStaffRosterImport = createAuthenticatedAction(
  z.object({ batchId: z.string().uuid() }),
  async (data, context) => {
    const { data: batch, error } = await context.supabase
      .from("staff_import_batches")
      .select("id, status")
      .eq("id", data.batchId)
      .single();
    if (error) throw error;
    if (batch.status !== "applied") throw new Error("Only applied imports can be rolled back");
    return rollbackRosterBatch(context, data.batchId);
  },
  { auth: { capability: "people.import_roster" } },
);

export const updateStaffRosterFields = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    qid: z.string().max(32).nullable().optional(),
    e3Enrolled: z.boolean().nullable().optional(),
    employmentType: z.enum(["permanent", "temporary"]).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    status: z.enum(["active", "on_leave", "terminated", "inactive"]).optional(),
  }),
  async (data, context) => {
    const existing = await assertStaffLocation(context, data.id);
    const status =
      data.status === "inactive" ? "terminated" : data.status;
    const { error } = await context.supabase
      .from("staff")
      .update({
        qid: data.qid === undefined ? undefined : data.qid,
        e3_enrolled: data.e3Enrolled === undefined ? undefined : data.e3Enrolled,
        employment_type: data.employmentType === undefined ? undefined : data.employmentType,
        phone: data.phone === undefined ? undefined : data.phone,
        status: status ?? undefined,
      })
      .eq("id", data.id);
    if (error) throw error;
    await audit(context, "staff.updated", data.id, { ...data }, existing.location_id);
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const updateStaffWorkLocations = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    locationIds: z.array(z.string().uuid()).max(20),
    isRoaming: z.boolean().optional(),
  }),
  async (data, context) => {
    const existing = await assertStaffLocation(context, data.id);
    const unique = [...new Set(data.locationIds.filter(Boolean))];
    if (!unique.includes(existing.location_id)) unique.unshift(existing.location_id);

    for (const locationId of unique) {
      const { data: allowed, error } = await context.supabase.rpc("user_can_access_location", {
        _location_id: locationId,
      });
      if (error) throw error;
      if (!allowed) throw new ForbiddenError("Forbidden: cannot attach this branch");
    }

    const { error: delErr } = await context.supabase.from("staff_work_locations").delete().eq("staff_id", data.id);
    if (delErr) throw delErr;
    if (unique.length) {
      const { error: insErr } = await context.supabase.from("staff_work_locations").insert(
        unique.map((location_id) => ({
          staff_id: data.id,
          location_id,
          created_by: context.userId,
        })),
      );
      if (insErr) throw insErr;
    }

    const extraSites = unique.filter((id) => id !== existing.location_id);
    const isRoaming = data.isRoaming ?? extraSites.length > 0;
    const { error: flagErr } = await context.supabase
      .from("staff")
      .update({ is_roaming: isRoaming })
      .eq("id", data.id);
    if (flagErr) throw flagErr;

    await audit(
      context,
      "staff.work_locations_updated",
      data.id,
      { location_ids: unique, is_roaming: isRoaming },
      existing.location_id,
    );
    return { ok: true, isRoaming, locationIds: unique };
  },
  { auth: { capability: "people.edit_roster" } },
);

