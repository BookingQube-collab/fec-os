"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  planOrgChartMove,
  planRemoveFromOrgChart,
  staffDepartmentPlacement,
  wouldCreateReportingCycle,
  type OrgChartMoveMode,
  type OrgChartPerson,
  type OrgChartSnapshot,
  type OrgDepartment,
} from "@/lib/org-hierarchy";
import {
  locationDepartmentHeads,
  reportingViewerView,
  type ChainStaff,
} from "@/lib/reporting-chain";
import {
  HIERARCHY_EDIT_ROLE_LEVEL,
  hierarchyAccessMode,
  teamHierarchyVisibleIds,
} from "@/lib/hierarchy-access";
import { canUserDo } from "@/lib/rbac";
import { loadDirectReportStaffIds } from "@/lib/reporting-manager-access.server";
import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { STAFF_NOT_JOKER_EMPLOYMENT_OR } from "@/lib/staff-status";

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
  location_id: string | null;
  staff_role: string | null;
  status: string | null;
  user_id: string | null;
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

async function authEmailsByUserId(userIds: ReadonlySet<string>): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  if (userIds.size === 0) return emails;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    for (const user of data.users) {
      if (!userIds.has(user.id)) continue;
      const email = user.email?.trim();
      if (email) emails.set(user.id, email);
    }
    if (emails.size >= userIds.size || data.users.length < 200) break;
  }
  return emails;
}

const CHAIN_STAFF_SELECT =
  "id, full_name, employee_code, job_title, department, location_id, staff_role, status, user_id, photo_updated_at, staff_departments(department_id, master_departments(id, name, sort_order))";

async function loadViewer(userId: string | null, roles: readonly string[] | undefined) {
  if (!userId) return { userId: null, employeeCode: null, displayName: null, seat: null as "ceo" | null };
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("display_name, employee_code")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    userId,
    employeeCode: data?.employee_code ?? null,
    displayName: data?.display_name ?? null,
    seat: roles?.includes("ceo") ? ("ceo" as const) : null,
  };
}

function toOrgChartPerson(
  row: StaffJoin,
  ext: ExtRow | undefined,
  departments: OrgDepartment[],
  loginEmails: Map<string, string>,
  viewerView: { viewerStaffId: string | null; viewerOperationsName: string | null },
): OrgChartPerson {
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

  const placed = staffDepartmentPlacement(departments, links, row.department);
  const operationsName =
    viewerView.viewerOperationsName && row.id === viewerView.viewerStaffId ? viewerView.viewerOperationsName : null;
  return {
    staffId: row.id,
    fullName: operationsName || row.full_name?.trim() || "Staff",
    employeeCode: row.employee_code,
    jobTitle: row.job_title,
    departmentIds: placed.departmentIds,
    departmentId: placed.departmentId,
    departmentName: placed.departmentName,
    hasPhoto: Boolean(row.photo_updated_at),
    photoUpdatedAt: row.photo_updated_at,
    reportingManagerStaffId: ext?.reporting_manager_staff_id ?? null,
    orgChartPlaced: Boolean(ext?.org_chart_placed),
    loginLinked: Boolean(row.user_id),
    loginEmail: row.user_id ? (loginEmails.get(row.user_id) ?? null) : null,
  };
}

function chainFromStaff(row: StaffJoin, ext: ExtRow | undefined): ChainStaff {
  return {
    staffId: row.id,
    fullName: row.full_name?.trim() || "Staff",
    employeeCode: row.employee_code,
    jobTitle: row.job_title,
    department: row.department,
    locationId: row.location_id,
    staffRole: row.staff_role,
    status: row.status,
    userId: row.user_id,
    reportingManagerStaffId: ext?.reporting_manager_staff_id ?? null,
    orgChartPlaced: Boolean(ext?.org_chart_placed),
  };
}

async function loadOrgChart(viewerUserId: string | null, roles: readonly string[] | undefined): Promise<OrgChartSnapshot> {
  const [staffRows, extRows, departmentRows, viewer] = await Promise.all([
    fetchPages<StaffJoin>((from, to) =>
      supabaseAdmin
        .from("staff")
        .select(CHAIN_STAFF_SELECT)
        .eq("status", "active")
        .or(STAFF_NOT_JOKER_EMPLOYMENT_OR)
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
    loadViewer(viewerUserId, roles),
  ]);

  if (departmentRows.error) throw new Error(departmentRows.error.message);

  const linkedUserIds = new Set(
    staffRows.map((row) => row.user_id).filter((id): id is string => Boolean(id)),
  );
  let loginEmails = new Map<string, string>();
  try {
    loginEmails = await authEmailsByUserId(linkedUserIds);
  } catch (error) {
    console.error("[org chart] login email lookup failed", error instanceof Error ? error.message : "unknown");
  }

  const departments: OrgDepartment[] = (departmentRows.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    sortOrder: row.sort_order ?? 0,
  }));

  const extByStaff = new Map(extRows.map((row) => [row.staff_id, row]));
  const chainRows = staffRows.map((row) => chainFromStaff(row, extByStaff.get(row.id)));
  const viewerView = reportingViewerView(chainRows, viewer);
  const people = staffRows.map((row) =>
    toOrgChartPerson(row, extByStaff.get(row.id), departments, loginEmails, viewerView),
  );

  return { departments, people };
}

const TEAM_CHAIN_STATUSES = ["active", "probation", "secondment", "remote", "serving_notice"] as const;

async function loadMissingOrgPeople(
  ids: readonly string[],
  departments: OrgDepartment[],
  viewerUserId: string | null,
  roles: readonly string[] | undefined,
): Promise<OrgChartPerson[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return [];
  const staffRows: StaffJoin[] = [];
  for (let index = 0; index < unique.length; index += 100) {
    const chunk = unique.slice(index, index + 100);
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select(CHAIN_STAFF_SELECT)
      .in("id", chunk)
      .in("status", [...TEAM_CHAIN_STATUSES])
      .or(STAFF_NOT_JOKER_EMPLOYMENT_OR)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    staffRows.push(...((data ?? []) as StaffJoin[]));
  }
  if (staffRows.length === 0) return [];

  const { data: extRows, error: extError } = await supabaseAdmin
    .from("staff_profile_ext")
    .select("staff_id, reporting_manager_staff_id, org_chart_placed")
    .in(
      "staff_id",
      staffRows.map((row) => row.id),
    );
  if (extError) throw new Error(extError.message);
  const extByStaff = new Map((extRows ?? []).map((row) => [row.staff_id, row as ExtRow]));
  const linkedUserIds = new Set(staffRows.map((row) => row.user_id).filter((id): id is string => Boolean(id)));
  let loginEmails = new Map<string, string>();
  try {
    loginEmails = await authEmailsByUserId(linkedUserIds);
  } catch (error) {
    console.error("[org chart] login email lookup failed", error instanceof Error ? error.message : "unknown");
  }
  const viewer = await loadViewer(viewerUserId, roles);
  const viewerView = reportingViewerView(
    staffRows.map((row) => chainFromStaff(row, extByStaff.get(row.id))),
    viewer,
  );
  return staffRows.map((row) => toOrgChartPerson(row, extByStaff.get(row.id), departments, loginEmails, viewerView));
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

export type OrgChartView = OrgChartSnapshot & {
  access: "edit" | "team";
  viewerStaffId: string | null;
  directReportStaffIds: string[];
};

const HIERARCHY_DENIED = "Only the CEO or COO can view the operations hierarchy.";

export const getOrgChart = createAuthenticatedActionNoInput(
  async (context): Promise<OrgChartView> => {
    const { data: levelData, error: levelError } = await context.supabase.rpc("current_user_role_level");
    if (levelError) throw new Error(levelError.message);
    const maxRoleLevel = typeof levelData === "number" ? levelData : 0;
    const teamAccess = maxRoleLevel >= HIERARCHY_EDIT_ROLE_LEVEL ? null : await loadDirectReportStaffIds(context.userId);
    const mode = hierarchyAccessMode({
      maxRoleLevel,
      directReportCount: teamAccess?.directReportStaffIds.length ?? 0,
    });
    if (mode === "none" || (mode === "team" && !teamAccess?.staffId)) {
      throw new ForbiddenError(HIERARCHY_DENIED);
    }

    const chart = await loadOrgChart(context.userId, context.roles);
    if (mode === "edit" || !teamAccess?.staffId) {
      return { ...chart, access: "edit", viewerStaffId: null, directReportStaffIds: [] };
    }

    const viewerStaffId = teamAccess.staffId;
    const missing = [viewerStaffId, ...teamAccess.directReportStaffIds].filter(
      (id) => !chart.people.some((person) => person.staffId === id),
    );
    const extra = await loadMissingOrgPeople(missing, chart.departments, context.userId, context.roles);
    const people = extra.length ? [...chart.people, ...extra] : chart.people;
    const visible = teamHierarchyVisibleIds(people, viewerStaffId);
    for (const id of teamAccess.directReportStaffIds) visible.add(id);
    return {
      departments: chart.departments,
      people: people.filter((person) => visible.has(person.staffId)),
      access: "team",
      viewerStaffId,
      directReportStaffIds: teamAccess.directReportStaffIds,
    };
  },
  { auth: { requireRole: true } },
);

export type TeamReportingSnapshot = {
  viewerStaffId: string | null;
  viewerOperationsName: string | null;
  departmentHeads: Array<{ staffId: string; fullName: string; locationId: string }>;
  people: ChainStaff[];
};

/** Saved reporting lines for Team overview. A drag on the org chart is not rewritten here. */
export const getTeamReporting = createAuthenticatedActionNoInput(
  async (context): Promise<TeamReportingSnapshot> => {
    const fullRoster = canUserDo(context.roles ?? [], "people.view_roster");
    const access = fullRoster ? null : await loadDirectReportStaffIds(context.userId);
    if (!fullRoster && (!access || access.directReportStaffIds.length === 0)) {
      throw new ForbiddenError("Team overview is limited to people who report to you.");
    }
    const [staffRows, extRows, viewer] = await Promise.all([
      fetchPages<StaffJoin>((from, to) =>
        supabaseAdmin
          .from("staff")
          .select(
            "id, full_name, employee_code, job_title, department, location_id, staff_role, status, user_id, photo_updated_at",
          )
          .in("status", [...TEAM_CHAIN_STATUSES])
          .or(STAFF_NOT_JOKER_EMPLOYMENT_OR)
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
      loadViewer(context.userId, context.roles),
    ]);
    const extByStaff = new Map(extRows.map((row) => [row.staff_id, row]));
    const people = staffRows.map((row) => chainFromStaff(row, extByStaff.get(row.id)));
    const viewerView = reportingViewerView(people, viewer);
    const keep = access
      ? new Set([access.staffId, ...access.directReportStaffIds].filter((id): id is string => Boolean(id)))
      : null;
    const visiblePeople = keep ? people.filter((row) => keep.has(row.staffId)) : people;
    return {
      viewerStaffId: viewerView.viewerStaffId,
      viewerOperationsName: viewerView.viewerOperationsName,
      departmentHeads: keep
        ? []
        : locationDepartmentHeads(people).flatMap((head) =>
            head.locationId ? [{ staffId: head.staffId, fullName: head.fullName, locationId: head.locationId }] : [],
          ),
      people: visiblePeople.map((row) => ({
        ...row,
        userId: null,
        fullName:
          viewerView.viewerOperationsName && row.staffId === viewerView.viewerStaffId
            ? viewerView.viewerOperationsName
            : row.fullName,
      })),
    };
  },
  { auth: { anyCapability: ["people.view_roster", "hr.employee_app"] } },
);

export const placeOrgChartPerson = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    managerStaffId: z.string().uuid().nullable(),
  }),
  async (data, context) => {
    if (data.managerStaffId === data.staffId) {
      throw new Error("A person cannot report to themselves.");
    }
    const chart = await loadOrgChart(context.userId, context.roles);
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
    return loadOrgChart(context.userId, context.roles);
  },
  { auth: HIERARCHY_AUTH },
);

export const applyOrgChartMove = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    targetStaffId: z.string().uuid(),
    mode: z.enum(["reports-to", "takes-reports", "insert-between", "same-manager"]),
    reportStaffIds: z.array(z.string().uuid()).max(200).optional(),
    jobTitle: z.string().trim().max(120).optional(),
  }),
  async (data, context) => {
    const chart = await loadOrgChart(context.userId, context.roles);
    const peopleById = new Map(chart.people.map((person) => [person.staffId, person]));
    const person = peopleById.get(data.staffId);
    const target = peopleById.get(data.targetStaffId);
    if (!person || !target) throw new Error("Choose someone on the active roster.");

    const plan = planOrgChartMove(managerMap(chart.people), {
      staffId: data.staffId,
      targetStaffId: data.targetStaffId,
      mode: data.mode as OrgChartMoveMode,
      reportStaffIds: data.reportStaffIds,
    });
    const nextTitle = data.jobTitle?.trim() ?? "";
    const titleChange = nextTitle.length > 0 && nextTitle !== (person.jobTitle ?? "").trim();
    if (!plan.ok && !(plan.reason === "none" && titleChange)) {
      if (plan.reason === "self") throw new Error("A person cannot report to themselves.");
      if (plan.reason === "cycle") throw new Error("That assignment would create a reporting loop.");
      throw new Error("Choose a reporting change or a new designation.");
    }
    const updates = plan.ok ? plan.updates : [];
    if (!updates.length && !titleChange) return chart;

    for (const update of updates) {
      if (!peopleById.has(update.staffId)) throw new Error("Choose someone on the active roster.");
      await writeReporting(update.staffId, update.managerStaffId, true, context.userId);
    }
    if (titleChange) {
      const { error } = await supabaseAdmin.from("staff").update({ job_title: nextTitle }).eq("id", data.staffId);
      if (error) throw new Error(error.message);
    }
    return loadOrgChart(context.userId, context.roles);
  },
  { auth: HIERARCHY_AUTH },
);

export const removeOrgChartPerson = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
  }),
  async (data, context) => {
    const chart = await loadOrgChart(context.userId, context.roles);
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
    return loadOrgChart(context.userId, context.roles);
  },
  { auth: HIERARCHY_AUTH },
);
