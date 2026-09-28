"use server";

import { z } from "zod";

import { classifyOperationsHierarchy, type HierarchyStaffRow } from "@/lib/admin-hierarchy";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";

export type OperationsHierarchyPerson = {
  staffId: string;
  fullName: string;
  employeeCode: string | null;
  jobTitle: string | null;
  locationName: string | null;
  hasLogin: boolean;
  reportingManagerStaffId: string | null;
  reportingManagerName: string | null;
};

export type OperationsHierarchy = {
  head: OperationsHierarchyPerson | null;
  supervisors: OperationsHierarchyPerson[];
};

type StaffQueryRow = {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  job_title: string | null;
  staff_role: string | null;
  user_id: string | null;
  locations: { name: string | null } | { name: string | null }[] | null;
};

function locationName(row: StaffQueryRow): string | null {
  const loc = row.locations;
  if (!loc) return null;
  if (Array.isArray(loc)) return loc[0]?.name ?? null;
  return loc.name ?? null;
}

async function loadOperationsHierarchy(): Promise<OperationsHierarchy> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, full_name, employee_code, job_title, staff_role, user_id, locations!staff_location_id_fkey(name)")
    .eq("status", "active")
    .is("deleted_at", null);
  if (error) throw error;

  const rows: HierarchyStaffRow[] = ((data ?? []) as StaffQueryRow[]).map((row) => ({
    id: row.id,
    fullName: row.full_name?.trim() || "Staff",
    employeeCode: row.employee_code,
    jobTitle: row.job_title,
    staffRole: row.staff_role,
    userId: row.user_id,
    locationName: locationName(row),
  }));
  const { head, supervisors } = classifyOperationsHierarchy(rows);
  const supervisorIds = supervisors.map((row) => row.id);
  const reporting = new Map<string, string | null>();
  if (supervisorIds.length) {
    const { data: ext, error: extError } = await supabaseAdmin
      .from("staff_profile_ext")
      .select("staff_id, reporting_manager_staff_id")
      .in("staff_id", supervisorIds);
    if (extError) throw extError;
    for (const row of ext ?? []) {
      reporting.set(row.staff_id, row.reporting_manager_staff_id);
    }
  }

  const toPerson = (row: HierarchyStaffRow, managerId: string | null): OperationsHierarchyPerson => ({
    staffId: row.id,
    fullName: row.fullName,
    employeeCode: row.employeeCode,
    jobTitle: row.jobTitle,
    locationName: row.locationName,
    hasLogin: Boolean(row.userId),
    reportingManagerStaffId: managerId,
    reportingManagerName: managerId && head && managerId === head.id ? head.fullName : null,
  });

  return {
    head: head ? toPerson(head, null) : null,
    supervisors: supervisors.map((row) => toPerson(row, reporting.get(row.id) ?? null)),
  };
}

/** CEO and COO. Regional operations can see Administration, not this chart. */
const HIERARCHY_AUTH = { capability: "admin.view" as const, minRoleLevel: 95 };

export const getOperationsHierarchy = createAuthenticatedActionNoInput(
  async () => loadOperationsHierarchy(),
  { auth: HIERARCHY_AUTH },
);

export const assignOperationsReports = createAuthenticatedAction(
  z.object({
    managerStaffId: z.string().uuid(),
    staffIds: z.array(z.string().uuid()).min(1).max(40),
  }),
  async (data) => {
    const tree = await loadOperationsHierarchy();
    if (!tree.head || tree.head.staffId !== data.managerStaffId) {
      throw new ForbiddenError("Site supervisors report to the Head of Operations.");
    }
    const allowed = new Set(tree.supervisors.map((row) => row.staffId));
    const staffIds = [...new Set(data.staffIds)];
    for (const staffId of staffIds) {
      if (staffId === data.managerStaffId || !allowed.has(staffId)) {
        throw new ForbiddenError("Only site supervisors can be placed under the Head of Operations.");
      }
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("staff_profile_ext")
      .select("staff_id")
      .in("staff_id", staffIds);
    if (existingError) throw existingError;
    const existingIds = new Set((existing ?? []).map((row) => row.staff_id as string));
    const toInsert = staffIds.filter((id) => !existingIds.has(id));
    const toUpdate = staffIds.filter((id) => existingIds.has(id));

    if (toInsert.length) {
      const { error } = await supabaseAdmin.from("staff_profile_ext").insert(
        toInsert.map((staffId) => ({
          staff_id: staffId,
          reporting_manager_staff_id: data.managerStaffId,
        })),
      );
      if (error) throw error;
    }
    if (toUpdate.length) {
      const { error } = await supabaseAdmin
        .from("staff_profile_ext")
        .update({ reporting_manager_staff_id: data.managerStaffId })
        .in("staff_id", toUpdate);
      if (error) throw error;
    }

    return loadOperationsHierarchy();
  },
  { auth: HIERARCHY_AUTH },
);
