"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { planStaffDuplicateMerges, type StaffIdentityRow } from "@/lib/staff-mapped-duplicates";
import { createAuthenticatedAction } from "@/lib/server/create-action";

const PAGE = 1000;

async function loadLiveStaff(): Promise<StaffIdentityRow[]> {
  const rows: StaffIdentityRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, full_name, employee_code, location_id, phone, user_id")
      .is("deleted_at", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      rows.push({
        id: row.id,
        full_name: row.full_name,
        employee_code: row.employee_code,
        location_id: row.location_id,
        phone: row.phone,
        user_id: row.user_id,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function loadAttendanceMappedIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("attendance_biometric_users")
      .select("id, staff_id")
      .not("staff_id", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.staff_id) ids.add(row.staff_id);
    }
    if (!data || data.length < PAGE) break;
  }
  return ids;
}

/** Merge generated staff stubs into the kept employee and delete the stub. Idempotent. */
export const mergeUnmappedStaffDuplicates = createAuthenticatedAction(
  z.object({
    dryRun: z.boolean().optional(),
  }),
  async (data) => {
    const attendanceMapped = await loadAttendanceMappedIds();
    const staff = (await loadLiveStaff()).map((row) => ({
      ...row,
      attendance_mapped: attendanceMapped.has(row.id),
    }));
    const plans = planStaffDuplicateMerges(staff);
    const byId = new Map(staff.map((row) => [row.id, row]));
    const pairs = plans.map((plan) => {
      const keep = byId.get(plan.keepId);
      const remove = byId.get(plan.removeId);
      return {
        keepId: plan.keepId,
        removeId: plan.removeId,
        keepCode: keep?.employee_code ?? "",
        removeCode: remove?.employee_code ?? "",
        name: keep?.full_name ?? remove?.full_name ?? "",
      };
    });

    if (data.dryRun) return { dryRun: true, merged: 0, pairs };

    for (const plan of plans) {
      const { error } = await supabaseAdmin.rpc("merge_staff_into", {
        keep_id: plan.keepId,
        drop_id: plan.removeId,
      });
      if (error) throw error;
    }

    return { dryRun: false, merged: plans.length, pairs };
  },
  { auth: { capability: "hr.manage" }, defaultInput: { dryRun: false } },
);
