"use server";

import { z } from "zod";

import { qatarTodayYmd } from "@/lib/hr-expiry-bands";
import { formatLocationLabel } from "@/lib/locations/normalize";
import {
  closeTemporaryMove,
  temporaryMovePhase,
  type TemporaryMovePhase,
  type TemporarySiteMoveListRow,
} from "@/lib/staff-temporary-moves";
import {
  createAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";

const dateYmd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const moveObject = z.object({
  staffId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  startsOn: dateYmd,
  endsOn: dateYmd,
  note: z.string().max(500).optional().nullable(),
});

function withDateOrder<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value, ctx) => {
    const row = value as { startsOn?: string; endsOn?: string };
    if (row.startsOn && row.endsOn && row.startsOn > row.endsOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start date must be on or before the end date.",
        path: ["endsOn"],
      });
    }
  });
}

const moveFields = withDateOrder(moveObject);
const updateFields = withDateOrder(moveObject.extend({ id: z.string().uuid() }));

async function assertStaffHome(context: AuthContext, staffId: string): Promise<string> {
  const { data, error } = await context.supabase
    .from("staff")
    .select("location_id")
    .eq("id", staffId)
    .single();
  if (error) throw error;
  const { data: allowed, error: accessErr } = await context.supabase.rpc("user_can_access_staff", {
    _staff_id: staffId,
  });
  if (accessErr) throw accessErr;
  if (!allowed) throw new ForbiddenError("Forbidden: cannot access this employee");
  return data.location_id;
}

async function assertLocation(context: AuthContext, locationId: string) {
  const { data: allowed, error } = await context.supabase.rpc("user_can_access_location", {
    _location_id: locationId,
  });
  if (error) throw error;
  if (!allowed) throw new ForbiddenError("Forbidden: cannot access this branch");
}

function assertDifferentSite(homeId: string, toLocationId: string) {
  if (homeId === toLocationId) {
    throw new Error("Temporary site must be different from the home location.");
  }
}

export const listTemporarySiteMoves = createAuthenticatedAction(
  z.object({}).default({}),
  async (_data, context): Promise<TemporarySiteMoveListRow[]> => {
    const { data, error } = await context.supabase
      .from("staff_temporary_site_moves")
      .select("id, staff_id, from_location_id, to_location_id, starts_on, ends_on, note")
      .order("starts_on", { ascending: false })
      .limit(500);
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) return [];

    const staffIds = [...new Set(rows.map((row) => row.staff_id))];
    const { data: staffRows, error: staffErr } = await context.supabase
      .from("staff")
      .select("id, full_name, employee_code, location_id")
      .in("id", staffIds);
    if (staffErr) throw staffErr;
    const staffById = new Map((staffRows ?? []).map((row) => [row.id, row]));

    const locationIds = [
      ...new Set(
        rows.flatMap((row) => {
          const home = staffById.get(row.staff_id)?.location_id ?? row.from_location_id;
          return [home, row.to_location_id].filter((id): id is string => Boolean(id));
        }),
      ),
    ];
    const locById = new Map<string, { code: string; name: string }>();
    if (locationIds.length) {
      const { data: locs, error: locErr } = await context.supabase
        .from("locations")
        .select("id, code, name")
        .in("id", locationIds);
      if (locErr) throw locErr;
      for (const loc of locs ?? []) locById.set(loc.id, { code: loc.code, name: loc.name });
    }

    const today = qatarTodayYmd();
    const phaseRank: Record<TemporaryMovePhase, number> = { active: 0, scheduled: 1, ended: 2 };
    const listed = rows.map((row) => {
      const staff = staffById.get(row.staff_id);
      const homeId = staff?.location_id ?? row.from_location_id;
      const home = homeId ? locById.get(homeId) : undefined;
      const dest = locById.get(row.to_location_id);
      return {
        id: row.id,
        staff_id: row.staff_id,
        staff_name: staff?.full_name ?? "—",
        employee_code: staff?.employee_code ?? "",
        home_location_id: homeId ?? null,
        home_label: formatLocationLabel(home?.code, home?.name),
        to_location_id: row.to_location_id,
        to_label: formatLocationLabel(dest?.code, dest?.name),
        starts_on: row.starts_on,
        ends_on: row.ends_on,
        note: row.note,
        phase: temporaryMovePhase(row, today),
      };
    });
    listed.sort((a, b) => phaseRank[a.phase] - phaseRank[b.phase] || b.starts_on.localeCompare(a.starts_on));
    return listed;
  },
  { defaultInput: {}, auth: { capability: "people.view_roster" } },
);

export const createTemporarySiteMove = createAuthenticatedAction(
  moveFields,
  async (data, context) => {
    const homeId = await assertStaffHome(context, data.staffId);
    await assertLocation(context, data.toLocationId);
    assertDifferentSite(homeId, data.toLocationId);
    const { error } = await context.supabase.from("staff_temporary_site_moves").insert({
      staff_id: data.staffId,
      from_location_id: homeId,
      to_location_id: data.toLocationId,
      starts_on: data.startsOn,
      ends_on: data.endsOn,
      note: data.note?.trim() || null,
      created_by: context.userId,
    });
    if (error) throw error;
    return { ok: true as const };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const updateTemporarySiteMove = createAuthenticatedAction(
  updateFields,
  async (data, context) => {
    const homeId = await assertStaffHome(context, data.staffId);
    await assertLocation(context, data.toLocationId);
    assertDifferentSite(homeId, data.toLocationId);
    const { error } = await context.supabase
      .from("staff_temporary_site_moves")
      .update({
        staff_id: data.staffId,
        from_location_id: homeId,
        to_location_id: data.toLocationId,
        starts_on: data.startsOn,
        ends_on: data.endsOn,
        note: data.note?.trim() || null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const deleteTemporarySiteMove = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase.from("staff_temporary_site_moves").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const endTemporarySiteMove = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("staff_temporary_site_moves")
      .select("id, starts_on, ends_on")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const close = closeTemporaryMove(row, qatarTodayYmd());
    if (close.action === "noop") return { ok: true as const, removed: false };
    if (close.action === "delete") {
      const { error: delErr } = await context.supabase
        .from("staff_temporary_site_moves")
        .delete()
        .eq("id", data.id);
      if (delErr) throw delErr;
      return { ok: true as const, removed: true };
    }
    const { error: updErr } = await context.supabase
      .from("staff_temporary_site_moves")
      .update({ ends_on: close.ends_on })
      .eq("id", data.id);
    if (updErr) throw updErr;
    return { ok: true as const, removed: false };
  },
  { auth: { capability: "people.edit_roster" } },
);
