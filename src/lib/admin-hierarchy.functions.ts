"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  planRemoveFromOrgChart,
  wouldCreateReportingCycle,
  type OrgChartPerson,
  type OrgChartSnapshot,
  type OrgDepartment,
} from "@/lib/org-hierarchy";
import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";

/** CEO and COO. Regional operations can see Administration, not this chart. */
const HIERARCHY_AUTH = { capability: "admin.view" as const, minRoleLevel: 95 };

type DeptEmbed = {
  id?: string | null;
  name?: string | null;
  sort_order?: number | null;
};

type DeptLink = {
  department_id?: string | null;
  master_departments?: DeptEmbed | DeptEmbed[] | null;
};

type StaffJoin = {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  job_title: string | null;
  department: string | null;
  photo_updated_at: string | null;
  staff_departments?: DeptLink[] | DeptLink | null;
};

type ExtRow = {
  staff_id: string;
  reporting_manager_staff_id: string | null;
  org_chart_placed: boolean | null;
};

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function fetchPages<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await load(from, from + size - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < size) break;
  }
  return rows;
}

async function loadOrgChart(): Promise<OrgChartSnapshot> {
  const [staffRows, extRows, departmentRows] = await Promise.all([
    fetchPages<StaffJoin>((from, to) =>
      supabaseAdmin
        .from("staff")
        .select(
          "id, full_name, employee_code, job_title, department, photo_updated_at, staff_departments(department_id, master_departments(id, name, sort_order))",
        )
        .eq("status", "active")
        .is("deleted_at", null)
        .order("id")
        .range(from, to) as PromiseLike<{ data: StaffJoin[] | null; error: { message: string } | null }>,
    ),
    fetchPages<ExtRow>((from, to) =>
      supabaseAdmin
        .from("staff_profile_ext")
        .select("staff_id, reporting_manager_staff_id, org_chart_placed")
        .order("staff_id")
        .range(from, to) as PromiseLike<{ data: ExtRow[] | null; error: { message: string } | null }>,
    ),
    supabaseAdmin.from("master_departments").select("id, name, parent_id, sort_order, active").eq("active", true).order("sort_order"),
  ]);

  if (departmentRows.error) throw new Error(departmentRows.error.message);

  const departments: OrgDepartment[] = (departmentRows.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    sortOrder: row.sort_order ?? 0,
  }));

  const departmentByName = new Map<string, OrgDepartment>();
  for (const department of departments) {
    const key = department.name.trim().toLowerCase();
    if (!departmentByName.has(key)) departmentByName.set(key, department);
  }

  const extByStaff = new Map(extRows.map((row) => [row.staff_id, row]));

  const people: OrgChartPerson[] = staffRows.map((row) => {
    const links = asArray(row.staff_departments)
      .map((link) => {
        const embedded = asArray(link.master_departments)[0];
        const id = embedded?.id ?? link.department_id ?? null;
        const name = embedded?.name?.trim() || null;
        if (!id || !name) return null;
        return { id, name, sortOrder: embedded?.sort_order ?? 0 };
      })
      .filter((link): link is { id: string; name: string; sortOrder: number } => Boolean(link))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    const uniqueIds = [...new Set(links.map((link) => link.id))];
    let departmentId = links[0]?.id ?? null;
    let departmentName = links[0]?.name ?? null;
    if (!departmentId) {
      const matched = departmentByName.get(row.department?.trim().toLowerCase() ?? "");
      if (matched) {
        departmentId = matched.id;
        departmentName = matched.name;
        uniqueIds.push(matched.id);
      } else if (row.department?.trim()) {
        departmentName = row.department.trim();
      }
    }

    const ext = extByStaff.get(row.id);
    const managerId = ext?.reporting_manager_staff_id ?? null;
    return {
      staffId: row.id,
      fullName: row.full_name?.trim() || "Staff",
      employeeCode: row.employee_code,
      jobTitle: row.job_title,
      departmentIds: uniqueIds,
      departmentId,
      departmentName,
      hasPhoto: Boolean(row.photo_updated_at),
      photoUpdatedAt: row.photo_updated_at,
      reportingManagerStaffId: managerId,
      orgChartPlaced: Boolean(ext?.org_chart_placed),
    };
  });

  return { departments, people };
}

function managerMap(people: OrgChartPerson[]): Map<string, string | null> {
  return new Map(people.map((person) => [person.staffId, person.reportingManagerStaffId]));
}

async function writeReporting(
  staffId: string,
  managerStaffId: string | null,
  orgChartPlaced: boolean,
  updatedBy: string,
) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("staff_profile_ext")
    .select("staff_id")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing) {
    const { error } = await supabaseAdmin
      .from("staff_profile_ext")
      .update({
        reporting_manager_staff_id: managerStaffId,
        org_chart_placed: orgChartPlaced,
        updated_by: updatedBy,
      })
      .eq("staff_id", staffId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabaseAdmin.from("staff_profile_ext").insert({
    staff_id: staffId,
    reporting_manager_staff_id: managerStaffId,
    org_chart_placed: orgChartPlaced,
    updated_by: updatedBy,
  });
  if (error) throw new Error(error.message);
}

export const getOrgChart = createAuthenticatedActionNoInput(async () => loadOrgChart(), { auth: HIERARCHY_AUTH });

export const placeOrgChartPerson = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    managerStaffId: z.string().uuid().nullable(),
  }),
  async (data, context) => {
    if (data.managerStaffId === data.staffId) {
      throw new Error("A person cannot report to themselves.");
    }
    const chart = await loadOrgChart();
    const peopleById = new Map(chart.people.map((person) => [person.staffId, person]));
    const person = peopleById.get(data.staffId);
    if (!person) throw new Error("Choose someone on the active roster.");
    if (data.managerStaffId && !peopleById.has(data.managerStaffId)) {
      throw new Error("Choose someone on the active roster.");
    }
    if (wouldCreateReportingCycle(managerMap(chart.people), data.staffId, data.managerStaffId)) {
      throw new Error("That assignment would create a reporting loop.");
    }

    const alreadyThere =
      person.reportingManagerStaffId === data.managerStaffId &&
      (data.managerStaffId !== null || person.orgChartPlaced || chart.people.some((row) => row.reportingManagerStaffId === person.staffId));
    if (alreadyThere) return chart;

    await writeReporting(data.staffId, data.managerStaffId, true, context.userId);
    return loadOrgChart();
  },
  { auth: HIERARCHY_AUTH },
);

export const removeOrgChartPerson = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
  }),
  async (data, context) => {
    const chart = await loadOrgChart();
    const person = chart.people.find((row) => row.staffId === data.staffId);
    if (!person) throw new Error("Choose someone on the active roster.");

    const plan = planRemoveFromOrgChart(chart.people, data.staffId);
    if (plan.childIds.length) {
      const { error } = await supabaseAdmin
        .from("staff_profile_ext")
        .update({
          reporting_manager_staff_id: plan.childManagerId,
          org_chart_placed: true,
          updated_by: context.userId,
        })
        .in("staff_id", plan.childIds);
      if (error) throw new Error(error.message);
    }

    await writeReporting(data.staffId, null, false, context.userId);
    return loadOrgChart();
  },
  { auth: HIERARCHY_AUTH },
);
