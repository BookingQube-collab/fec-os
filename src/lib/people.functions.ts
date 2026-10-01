"use server";

import { z } from "zod";

import { parseCsv } from "@/lib/csv-parse";
import { canUserDo, type AppRole } from "@/lib/rbac";
import {
  expandWeeklyRoster,
  parseDatedRosterRows,
  parseStaffImportRows,
  toQatarIso,
} from "@/lib/staff-import";
import { departmentAudienceForLocationCode, type DepartmentAudience } from "@/lib/department-audience";
import {
  formatDepartmentDisplay,
  normalizeDepartmentName,
  splitDepartmentTokens,
} from "@/lib/staff-departments";
import {
  assertInternalEmployeeCode,
  generateEmployeeCode,
} from "@/lib/staff-employee-code";
import { fetchStaffIdsWorkingAtLocation } from "@/lib/staff-work-locations";
import { shiftUuid, staffUuid } from "@/lib/staff-import-ids";
import { createAuthenticatedAction, createSafeAuthenticatedAction } from "@/lib/server/create-action";
import type { AuthContext } from "@/lib/server/create-action";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncStaffIdentityProfile } from "@/lib/hr/sync-staff-identity";
import { validateBase64Size, validateUploadMime } from "@/lib/server/upload-validation";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { redactAuditPayload } from "@/lib/hr-sensitive-audit";
import { insertStatusHistory } from "@/lib/staff-history";
import { reconcileJokerStaffStatus } from "@/lib/staff-status";
import {
  decodeImageDataUrl,
} from "@/lib/staff-photo";
import {
  PEOPLE_MASTER_TABLE,
  masterInUseMessage,
  masterLabelKey,
  normalizeMasterLabel,
  type PeopleMasterKind,
  type PeopleMasterRow,
} from "@/lib/people-masters";

const MASTER_PAGE = 1000;

async function fetchAllRows<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += MASTER_PAGE) {
    const { data, error } = await load(from, from + MASTER_PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < MASTER_PAGE) return all;
  }
}

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

function oneJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function relabelDepartmentMembers(departmentId: string) {
  const links = await fetchAllRows<{ staff_id: string }>((from, to) =>
    supabaseAdmin
      .from("staff_departments")
      .select("staff_id")
      .eq("department_id", departmentId)
      .order("staff_id")
      .range(from, to),
  );
  const staffIds = [...new Set(links.map((link) => link.staff_id))];
  for (const chunk of chunkIds(staffIds, 80)) {
    const { data, error } = await supabaseAdmin
      .from("staff_departments")
      .select("staff_id, master_departments(name, sort_order)")
      .in("staff_id", chunk);
    if (error) throw error;
    const grouped = new Map<string, { name: string; sort_order: number }[]>();
    for (const row of data ?? []) {
      const dept = oneJoin(row.master_departments as { name: string; sort_order: number } | { name: string; sort_order: number }[] | null);
      if (!dept?.name) continue;
      const list = grouped.get(row.staff_id) ?? [];
      list.push(dept);
      grouped.set(row.staff_id, list);
    }
    await Promise.all(
      chunk.map(async (staffId) => {
        const names = (grouped.get(staffId) ?? [])
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
          .map((dept) => dept.name);
        const { error: updErr } = await supabaseAdmin
          .from("staff")
          .update({ department: formatDepartmentDisplay(names) || null })
          .eq("id", staffId);
        if (updErr) throw updErr;
      }),
    );
  }
}

async function countCurrentDepartmentStaff(departmentId: string): Promise<number> {
  const rows = await fetchAllRows<{
    staff_id: string;
    staff: { deleted_at: string | null } | { deleted_at: string | null }[] | null;
  }>((from, to) =>
    supabaseAdmin
      .from("staff_departments")
      .select("staff_id, staff!inner(deleted_at)")
      .eq("department_id", departmentId)
      .order("staff_id")
      .range(from, to),
  );
  const ids = new Set<string>();
  for (const row of rows) {
    const staff = oneJoin(row.staff);
    if (staff && staff.deleted_at == null) ids.add(row.staff_id);
  }
  return ids.size;
}

async function rewriteStaffText(
  column: "job_title" | "gender" | "nationality",
  fromName: string,
  toName: string,
) {
  const fromKey = masterLabelKey(fromName);
  const next = normalizeMasterLabel(toName);
  if (!fromKey || !next || fromName === next) return;

  if (column === "job_title") {
    const rows = await fetchAllRows<{ id: string; job_title: string | null }>((from, to) =>
      supabaseAdmin
        .from("staff")
        .select("id, job_title")
        .not("job_title", "is", null)
        .order("id")
        .range(from, to),
    );
    const ids = rows
      .filter((row) => row.job_title && masterLabelKey(row.job_title) === fromKey && row.job_title !== next)
      .map((row) => row.id);
    for (const chunk of chunkIds(ids, 100)) {
      const { error } = await supabaseAdmin.from("staff").update({ job_title: next }).in("id", chunk);
      if (error) throw error;
    }
    return;
  }

  const rows = await fetchAllRows<{ staff_id: string; gender: string | null; nationality: string | null }>(
    (from, to) =>
      supabaseAdmin
        .from("staff_profile_ext")
        .select("staff_id, gender, nationality")
        .order("staff_id")
        .range(from, to),
  );
  const ids = rows
    .filter((row) => {
      const current = row[column];
      return Boolean(current) && masterLabelKey(current) === fromKey && current !== next;
    })
    .map((row) => row.staff_id);
  for (const chunk of chunkIds(ids, 100)) {
    const patch = column === "gender" ? { gender: next } : { nationality: next };
    const { error } = await supabaseAdmin.from("staff_profile_ext").update(patch).in("staff_id", chunk);
    if (error) throw error;
  }
}

async function currentStaffMasterUsage(): Promise<{
  departments: Map<string, number>;
  positions: Map<string, number>;
  genders: Map<string, number>;
  nationalities: Map<string, number>;
}> {
  const departments = new Map<string, number>();
  const positions = new Map<string, number>();
  const genders = new Map<string, number>();
  const nationalities = new Map<string, number>();
  const rows = await fetchAllRows<{
    id: string;
    job_title: string | null;
    staff_profile_ext:
      | { gender: string | null; nationality: string | null }
      | { gender: string | null; nationality: string | null }[]
      | null;
    staff_departments: { department_id: string }[] | null;
  }>((from, to) =>
    supabaseAdmin
      .from("staff")
      .select("id, job_title, staff_profile_ext!staff_profile_ext_staff_id_fkey(gender, nationality), staff_departments(department_id)")
      .is("deleted_at", null)
      .order("id")
      .range(from, to),
  );
  for (const row of rows) {
    const titleKey = masterLabelKey(row.job_title);
    if (titleKey) positions.set(titleKey, (positions.get(titleKey) ?? 0) + 1);
    const ext = oneJoin(row.staff_profile_ext);
    const genderKey = masterLabelKey(ext?.gender);
    if (genderKey) genders.set(genderKey, (genders.get(genderKey) ?? 0) + 1);
    const nationalityKey = masterLabelKey(ext?.nationality);
    if (nationalityKey) nationalities.set(nationalityKey, (nationalities.get(nationalityKey) ?? 0) + 1);
    for (const link of row.staff_departments ?? []) {
      departments.set(link.department_id, (departments.get(link.department_id) ?? 0) + 1);
    }
  }
  return { departments, positions, genders, nationalities };
}

async function canonicalMasterName(
  kind: "gender" | "nationality",
  value: string | null | undefined,
): Promise<string | null> {
  const trimmed = normalizeMasterLabel(value);
  if (!trimmed) return null;
  const table = PEOPLE_MASTER_TABLE[kind];
  const { data, error } = await supabaseAdmin.from(table).select("name");
  if (error) throw error;
  const match = (data ?? []).find((row) => masterLabelKey(row.name) === masterLabelKey(trimmed));
  if (!match) throw new Error(`Choose a saved ${kind}`);
  return match.name;
}

async function saveStaffDemographics(
  staffId: string,
  input: { gender?: string | null; nationality?: string | null },
  userId: string,
) {
  const [gender, nationality] = await Promise.all([
    input.gender !== undefined ? canonicalMasterName("gender", input.gender) : Promise.resolve(undefined),
    input.nationality !== undefined
      ? canonicalMasterName("nationality", input.nationality)
      : Promise.resolve(undefined),
  ]);
  const patch: { gender?: string | null; nationality?: string | null; updated_by: string } = {
    updated_by: userId,
  };
  if (gender !== undefined) patch.gender = gender;
  if (nationality !== undefined) patch.nationality = nationality;
  if (patch.gender === undefined && patch.nationality === undefined) return;
  const { error } = await supabaseAdmin
    .from("staff_profile_ext")
    .upsert({ staff_id: staffId, ...patch }, { onConflict: "staff_id" });
  if (error) throw error;
}

async function requireRosterEdit(context: AuthContext) {
  const { data: roles, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw error;
  const roleList = (roles ?? []).map((r) => r.role as AppRole);
  if (!canUserDo(roleList, "people.edit_roster")) {
    throw new Error("Forbidden: manager access required to import staff or roster");
  }
}

async function assertLocationAccess(context: AuthContext, locationId: string) {
  const { data, error } = await context.supabase.rpc("user_can_access_location", {
    _location_id: locationId,
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: cannot access this branch");
}

type MasterDeptRow = { id: string; name: string; audience?: string | null };

async function loadMasterDepartments(context: AuthContext, activeOnly = false): Promise<MasterDeptRow[]> {
  let q = context.supabase.from("master_departments").select("id, name, audience");
  if (activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function departmentNamesForIds(
  context: AuthContext,
  ids: string[],
): Promise<string[]> {
  if (!ids.length) return [];
  const { data, error } = await context.supabase
    .from("master_departments")
    .select("id, name, sort_order")
    .in("id", ids);
  if (error) throw error;
  return (data ?? [])
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((d) => d.name);
}

function matchDepartmentId(
  name: string,
  catalog: MasterDeptRow[],
  audience?: DepartmentAudience | null,
): string | null {
  const target = normalizeDepartmentName(name);
  const pool = audience ? catalog.filter((row) => row.audience === audience) : catalog;
  const exact = pool.find((d) => normalizeDepartmentName(d.name) === target);
  if (exact) return exact.id;
  const compact = pool.find(
    (d) => normalizeDepartmentName(d.name).replace(/\s/g, "") === target.replace(/\s/g, ""),
  );
  return compact?.id ?? null;
}

async function resolveDepartmentIds(
  context: AuthContext,
  raw: string | null | undefined,
  catalog?: MasterDeptRow[],
  audience?: DepartmentAudience | null,
): Promise<{ ids: string[]; names: string[] }> {
  const tokens = splitDepartmentTokens(raw);
  if (!tokens.length) return { ids: [], names: [] };

  const list = catalog ?? (await loadMasterDepartments(context));
  const ids: string[] = [];
  const names: string[] = [];

  for (const token of tokens) {
    const id = matchDepartmentId(token, list, audience);
    if (!id) {
      names.push(token.trim());
      continue;
    }
    const row = list.find((d) => d.id === id);
    names.push(row?.name ?? token);
    if (!ids.includes(id)) ids.push(id);
  }

  return { ids, names };
}

async function syncStaffDepartments(
  context: AuthContext,
  staffId: string,
  departmentIds: string[],
  displayLabel?: string | null,
) {
  const { error: delErr } = await context.supabase
    .from("staff_departments")
    .delete()
    .eq("staff_id", staffId);
  if (delErr) throw delErr;

  if (departmentIds.length) {
    const { error: insErr } = await context.supabase.from("staff_departments").insert(
      departmentIds.map((department_id) => ({ staff_id: staffId, department_id })),
    );
    if (insErr) throw insErr;
  }

  let department: string | null;
  if (displayLabel !== undefined) {
    department = displayLabel;
  } else {
    const { data: links, error: linkErr } = await context.supabase
      .from("staff_departments")
      .select("master_departments(name, sort_order)")
      .eq("staff_id", staffId);
    if (linkErr) throw linkErr;
    const names = (links ?? [])
      .map((l) => l.master_departments as { name: string; sort_order: number } | null)
      .filter((d): d is { name: string; sort_order: number } => Boolean(d))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((d) => d.name);
    department = formatDepartmentDisplay(names) || null;
  }

  const { error: updErr } = await context.supabase
    .from("staff")
    .update({ department })
    .eq("id", staffId);
  if (updErr) throw updErr;
}

const LocFilter = z
  .object({ locationId: z.string().uuid().nullable().optional() })
  .default({});

export const listStaff = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("staff")
      .select(
        "id, employee_code, full_name, job_title, department, status, location_id, is_roaming, staff_departments(department_id)",
      )
      .is("deleted_at", null)
      .order("full_name");
    if (data.locationId) {
      const extraIds = await fetchStaffIdsWorkingAtLocation(context.supabase, data.locationId);
      q = extraIds.length
        ? q.or(`location_id.eq.${data.locationId},id.in.(${extraIds.join(",")})`)
        : q.eq("location_id", data.locationId);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []).map((row) => ({
      ...row,
      department_ids: (row.staff_departments ?? []).map(
        (d: { department_id: string }) => d.department_id,
      ),
    }));
  },
  { defaultInput: {}, auth: { capability: "people.view_roster" } },
);

export const listShifts = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    let q = context.supabase
      .from("shifts")
      .select("id, location_id, user_id, staff_id, role_label, starts_at, ends_at, status, clock_in_at, clock_out_at, notes")
      .gte("starts_at", since)
      .order("starts_at");
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "people.view_roster" } },
);

export const createShift = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    roleLabel: z.string().max(100).optional(),
    userId: z.string().uuid().optional(),
    staffId: z.string().uuid().optional(),
    notes: z.string().max(2000).optional(),
  }),
  async (data, context) => {
    let userId = data.userId ?? context.userId;
    if (data.staffId) {
      const { data: st, error: stErr } = await context.supabase
        .from("staff")
        .select("user_id, job_title")
        .eq("id", data.staffId)
        .single();
      if (stErr) throw stErr;
      if (st?.user_id) userId = st.user_id;
    }

    const { data: id, error } = await context.supabase.rpc("create_shift", {
      _location_id: data.locationId,
      _user_id: userId,
      _starts_at: data.startsAt,
      _ends_at: data.endsAt,
      _role_label: data.roleLabel ?? undefined,
      _notes: data.notes ?? undefined,
    });
    if (error) throw error;

    if (data.staffId) {
      const { error: linkErr } = await context.supabase
        .from("shifts")
        .update({ staff_id: data.staffId })
        .eq("id", id as string);
      if (linkErr) throw linkErr;
    }

    return { id: id as string };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const clockInShift = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("clock_in_shift", { _id: data.id });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const clockOutShift = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("clock_out_shift", { _id: data.id });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const cancelShift = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("cancel_shift", {
      _id: data.id,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const listTraining = createAuthenticatedAction(
  z
    .object({
      locationId: z.string().uuid().nullable().optional(),
      staffId: z.string().uuid().optional(),
    })
    .default({}),
  async (data, context) => {
    let q = context.supabase
      .from("training_enrollments")
      .select(
        "id, location_id, staff_id, course_name, required, status, due_on, completed_on, score, staff(full_name, employee_code)",
      )
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.staffId) q = q.eq("staff_id", data.staffId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "people.view_roster" } },
);

export const completeTraining = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), score: z.number().int().min(0).max(100).optional() }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("complete_training", {
      _id: data.id,
      _score: data.score ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const importStaffCsv = createAuthenticatedAction(
  z.object({ csv: z.string().max(500_000) }),
  async (data, context) => {
    await requireRosterEdit(context);
    const rows = parseStaffImportRows(parseCsv(data.csv));
    if (!rows.length) throw new Error("CSV has no data rows");

    const { data: locations, error: locErr } = await context.supabase
      .from("locations")
      .select("id, code")
      .eq("status", "active");
    if (locErr) throw locErr;
    const locByCode = new Map((locations ?? []).map((l) => [l.code, l.id]));

    const staffDb = [];
    const deptByStaffId = new Map<string, { ids: string[]; label: string | null }>();
    const catalog = await loadMasterDepartments(context, false);

    for (const s of rows) {
      const location_id = locByCode.get(s.location_code);
      if (!location_id) throw new Error(`Branch "${s.location_code}" not found`);
      await assertLocationAccess(context, location_id);
      const staffId = staffUuid(s.employee_code);
      const resolved = await resolveDepartmentIds(
        context,
        s.department,
        catalog,
        departmentAudienceForLocationCode(s.location_code),
      );
      deptByStaffId.set(staffId, {
        ids: resolved.ids,
        label: formatDepartmentDisplay(resolved.names) || null,
      });
      staffDb.push({
        id: staffId,
        location_id,
        user_id: null,
        employee_code: s.employee_code,
        full_name: s.full_name,
        job_title: s.job_title,
        department: formatDepartmentDisplay(resolved.names) || s.department,
        hire_date: s.hire_date,
        status: s.status,
        phone: s.phone,
        email: s.email,
        qid: s.qid,
        ...(s.expected_hours != null ? { expected_hours: s.expected_hours } : {}),
        ...(s.break_minutes != null ? { break_minutes: s.break_minutes } : {}),
        ...(s.weekly_off_weekday != null ? { weekly_off_weekday: s.weekly_off_weekday } : {}),
      });
    }

    const { error } = await context.supabase.from("staff").upsert(staffDb, { onConflict: "id" });
    if (error) throw error;

    for (const row of staffDb) {
      const link = deptByStaffId.get(row.id as string);
      await syncStaffDepartments(
        context,
        row.id as string,
        link?.ids ?? [],
        link?.label ?? null,
      );
    }
    return { imported: staffDb.length };
  },
  { auth: { capability: "people.edit_roster" } },
);

const STAFF_STATUSES = [
  "active",
  "probation",
  "secondment",
  "remote",
  "vacation",
  "sick_leave",
  "unpaid_leave",
  "on_leave",
  "resigned",
  "terminated",
  "released",
  "serving_notice",
  "joker",
] as const;
const TRAINING_STATUSES = ["enrolled", "in_progress", "completed", "overdue"] as const;

/** Safe so production toasts show DB/Zod text instead of Next RSC digests. */
export const createStaff = createSafeAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    employeeCode: z.string().max(50).optional().or(z.literal("")),
    fullName: z.string().min(1).max(200),
    jobTitle: z.string().max(200).optional(),
    departmentIds: z.array(z.string().uuid()).default([]),
    hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(STAFF_STATUSES).default("active"),
    phone: z.string().max(40).optional(),
    email: z.string().email().optional().or(z.literal("")),
    qid: z.string().max(32).optional(),
    e3Enrolled: z.boolean().nullable().optional(),
    employmentType: z.enum(["permanent", "temporary", "secondment", "joker"]).nullable().optional(),
    gender: z.union([z.string().max(80), z.literal(""), z.null()]).optional(),
    nationality: z.union([z.string().max(120), z.literal(""), z.null()]).optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);

    const { data: locRow, error: locErr } = await context.supabase
      .from("locations")
      .select("code")
      .eq("id", data.locationId)
      .single();
    if (locErr) throw locErr;
    const locationCode = String(locRow?.code ?? "").trim().toUpperCase();
    if (!locationCode) throw new Error("Branch code not found");

    // Service role for code scan + insert: avoids RLS INSERT…RETURNING edge cases and 1k row caps.
    const { data: codeRows, error: codesErr } = await supabaseAdmin
      .from("staff")
      .select("employee_code")
      .is("deleted_at", null);
    if (codesErr) throw codesErr;
    const usedCodes = new Set(
      (codeRows ?? []).map((r) => String(r.employee_code ?? "").trim().toUpperCase()).filter(Boolean),
    );

    const hint = { jobTitle: data.jobTitle };
    let employee_code: string;
    const preferred = data.employeeCode?.trim();
    if (preferred) {
      employee_code = assertInternalEmployeeCode(preferred, data.qid);
      if (usedCodes.has(employee_code)) {
        employee_code = generateEmployeeCode(locationCode, usedCodes, hint);
      }
    } else {
      employee_code = generateEmployeeCode(locationCode, usedCodes, hint);
    }

    const names = await departmentNamesForIds(context, data.departmentIds);
    const department = formatDepartmentDisplay(names) || null;

    const { data: row, error } = await supabaseAdmin
      .from("staff")
      .insert({
        location_id: data.locationId,
        employee_code,
        full_name: data.fullName,
        job_title: data.jobTitle ?? null,
        department,
        hire_date: data.hireDate ?? null,
        status: reconcileJokerStaffStatus(data.employmentType, data.status),
        phone: data.phone ?? null,
        email: data.email || null,
        qid: data.qid ?? null,
        e3_enrolled: data.e3Enrolled ?? null,
        employment_type: data.employmentType ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;

    await Promise.all([
      syncStaffDepartments(context, row.id as string, data.departmentIds, department),
      saveStaffDemographics(
        row.id as string,
        { gender: data.gender, nationality: data.nationality },
        context.userId,
      ),
    ]);
    await context.supabase.rpc("log_audit", {
      _action: "staff.created",
      _table_name: "staff",
      _row_id: row.id as string,
      _after: { employee_code, full_name: data.fullName },
      _location_id: data.locationId,
      _metadata: {},
    });
    return { id: row.id as string };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const updateStaff = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    fullName: z.string().min(1).max(200).optional(),
    jobTitle: z.string().max(200).nullable().optional(),
    departmentIds: z.array(z.string().uuid()).optional(),
    hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    status: z.enum(STAFF_STATUSES).optional(),
    phone: z.string().max(40).nullable().optional(),
    email: z.string().email().nullable().optional().or(z.literal("")),
    qid: z.string().max(32).nullable().optional(),
    e3Enrolled: z.boolean().nullable().optional(),
    employmentType: z.enum(["permanent", "temporary", "secondment", "joker"]).nullable().optional(),
    flexibleAttendance: z.boolean().optional(),
    reportingTimeMinutes: z.number().int().min(0).max(180).nullable().optional(),
    bufferMinutes: z.number().int().min(0).max(120).nullable().optional(),
    expectedHours: z.number().min(1).max(16).nullable().optional(),
    breakMinutes: z.number().int().min(0).max(240).nullable().optional(),
    weeklyOffWeekday: z.number().int().min(0).max(6).nullable().optional(),
    gender: z.union([z.string().max(80), z.literal(""), z.null()]).optional(),
    nationality: z.union([z.string().max(120), z.literal(""), z.null()]).optional(),
  }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("staff")
      .select("location_id, status, employment_type, qid")
      .eq("id", data.id)
      .is("deleted_at", null)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);

    const nextEmploymentType =
      data.employmentType !== undefined ? data.employmentType : existing.employment_type;
    const nextStatus = reconcileJokerStaffStatus(
      nextEmploymentType,
      data.status !== undefined ? data.status : existing.status,
    );

    const patch: TablesUpdate<"staff"> = {};
    if (data.fullName !== undefined) patch.full_name = data.fullName;
    if (data.jobTitle !== undefined) patch.job_title = data.jobTitle;
    if (data.hireDate !== undefined) patch.hire_date = data.hireDate;
    if (nextStatus !== existing.status) patch.status = nextStatus;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.email !== undefined) patch.email = data.email || null;
    if (data.qid !== undefined) patch.qid = data.qid;
    if (data.e3Enrolled !== undefined) patch.e3_enrolled = data.e3Enrolled;
    if (data.employmentType !== undefined) patch.employment_type = data.employmentType;
    if (data.flexibleAttendance !== undefined) patch.flexible_attendance = data.flexibleAttendance;
    if (data.reportingTimeMinutes !== undefined) patch.reporting_time_minutes = data.reportingTimeMinutes;
    if (data.bufferMinutes !== undefined) patch.buffer_minutes = data.bufferMinutes;
    if (data.expectedHours !== undefined) patch.expected_hours = data.expectedHours;
    if (data.breakMinutes !== undefined) patch.break_minutes = data.breakMinutes;
    if (data.weeklyOffWeekday !== undefined) patch.weekly_off_weekday = data.weeklyOffWeekday;

    const writes: Promise<unknown>[] = [
      saveStaffDemographics(
        data.id,
        { gender: data.gender, nationality: data.nationality },
        context.userId,
      ),
    ];

    if (nextStatus !== existing.status) {
      writes.push(
        insertStatusHistory(context, {
          staffId: data.id,
          fromStatus: existing.status,
          toStatus: nextStatus,
          reason: "profile_update",
          locationId: existing.location_id,
        }),
      );
    }

    if (Object.keys(patch).length) {
      writes.push(
        (async () => {
          const { error } = await context.supabase.from("staff").update(patch).eq("id", data.id);
          if (error) throw error;
        })(),
      );
    }

    if (data.departmentIds !== undefined) {
      const departmentIds = data.departmentIds;
      writes.push(
        (async () => {
          const names = await departmentNamesForIds(context, departmentIds);
          const department = formatDepartmentDisplay(names) || null;
          await syncStaffDepartments(context, data.id, departmentIds, department);
        })(),
      );
    }

    await Promise.all(writes);

    const audited = redactAuditPayload(patch as Record<string, unknown>);
    await context.supabase.rpc("log_audit", {
      _action: "staff.updated",
      _table_name: "staff",
      _row_id: data.id,
      _before: audited.fields.includes("qid") ? { qid: "[redacted]" } : undefined,
      _after: audited.payload,
      _location_id: existing.location_id,
      _metadata: audited.fields.length ? { redactedFields: audited.fields } : {},
    });
    return { ok: true as const };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const saveStaffPhoto = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    photoDataUrl: z.string().min(80).max(400_000),
  }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("staff")
      .select("location_id")
      .eq("id", data.id)
      .is("deleted_at", null)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);

    const { bytes, contentType } = decodeImageDataUrl(data.photoDataUrl);
    const { error } = await context.supabase.rpc("set_staff_photo_bytes", {
      _staff_id: data.id,
      _photo_base64: bytes.toString("base64"),
      _mime: contentType,
    });
    if (error) throw error;

    await context.supabase.rpc("log_audit", {
      _action: "staff.photo_saved",
      _table_name: "staff",
      _row_id: data.id,
      _after: { photo_mime: contentType, bytes: bytes.length },
      _location_id: existing.location_id,
      _metadata: {},
    });
    return { ok: true as const, bytes: bytes.length, mime: contentType };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const removeStaffPhoto = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("staff")
      .select("location_id")
      .eq("id", data.id)
      .is("deleted_at", null)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);

    const { error } = await context.supabase
      .from("staff")
      .update({
        photo_data: null,
        photo_mime: null,
        photo_updated_at: null,
      })
      .eq("id", data.id);
    if (error) throw error;

    await context.supabase.rpc("log_audit", {
      _action: "staff.photo_removed",
      _table_name: "staff",
      _row_id: data.id,
      _after: {},
      _location_id: existing.location_id,
      _metadata: {},
    });
    return { ok: true as const };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const deactivateStaff = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("staff")
      .select("location_id")
      .eq("id", data.id)
      .is("deleted_at", null)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);

    const { error } = await context.supabase
      .from("staff")
      .update({ status: "terminated", deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    await context.supabase.rpc("log_audit", {
      _action: "staff.archived",
      _table_name: "staff",
      _row_id: data.id,
      _after: { status: "terminated" },
      _location_id: existing.location_id,
      _metadata: {},
    });
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const listMasterDepartments = createAuthenticatedAction(
  z.object({}).default({}),
  async (_data, context) => {
    const { data, error } = await context.supabase
      .from("master_departments")
      .select("id, name, code, active, sort_order, parent_id, audience")
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...row,
      parent_id: (row.parent_id as string | null) ?? null,
    }));
  },
  { defaultInput: {}, auth: { capability: "people.view_roster" } },
);

async function assertDepartmentParent(
  context: AuthContext,
  parentId: string | null,
  selfId?: string,
  audience?: DepartmentAudience | null,
) {
  if (!parentId) return;
  if (selfId && parentId === selfId) throw new Error("A department cannot be its own parent");
  const { data: parent, error } = await context.supabase
    .from("master_departments")
    .select("id, parent_id, audience")
    .eq("id", parentId)
    .maybeSingle();
  if (error) throw error;
  if (!parent) throw new Error("Parent department not found");
  if (parent.parent_id) throw new Error("Sub-departments cannot have children — pick a top-level parent");
  let childAudience = audience ?? null;
  if (!childAudience && selfId) {
    const { data: self, error: selfErr } = await context.supabase
      .from("master_departments")
      .select("audience")
      .eq("id", selfId)
      .maybeSingle();
    if (selfErr) throw selfErr;
    childAudience = (self?.audience as DepartmentAudience | null) ?? null;
  }
  if (childAudience && parent.audience !== childAudience) {
    throw new Error("Parent department belongs to a different office");
  }
  if (selfId) {
    const { data: kids } = await context.supabase
      .from("master_departments")
      .select("id")
      .eq("parent_id", selfId)
      .limit(1);
    if (kids?.length) throw new Error("Move or remove sub-departments before nesting this department");
  }
}

export const createMasterDepartment = createAuthenticatedAction(
  z.object({
    name: z.string().min(1).max(120),
    code: z.string().max(40).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    parentId: z.string().uuid().nullable().optional(),
    audience: z.enum(["ho", "fec"]).optional(),
  }),
  async (data, context) => {
    const parentId = data.parentId ?? null;
    const audience = data.audience ?? "fec";
    await assertDepartmentParent(context, parentId, undefined, audience);
    const { data: row, error } = await context.supabase
      .from("master_departments")
      .insert({
        name: data.name.trim(),
        code: data.code?.trim().toUpperCase() || null,
        sort_order: data.sortOrder ?? 500,
        parent_id: parentId,
        audience,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const updateMasterDepartment = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    code: z.string().max(40).nullable().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    parentId: z.string().uuid().nullable().optional(),
  }),
  async (data, context) => {
    const patch: {
      name?: string;
      code?: string | null;
      active?: boolean;
      sort_order?: number;
      parent_id?: string | null;
    } = {};
    if (data.name !== undefined) {
      const next = normalizeMasterLabel(data.name);
      if (!next) throw new Error("Name is required");
      patch.name = next;
    }
    if (data.code !== undefined) patch.code = data.code?.trim().toUpperCase() || null;
    if (data.active !== undefined) patch.active = data.active;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;
    if (data.parentId !== undefined) {
      await assertDepartmentParent(context, data.parentId, data.id);
      patch.parent_id = data.parentId;
    }

    const { error } = await context.supabase
      .from("master_departments")
      .update(patch)
      .eq("id", data.id);
    if (error) throw error;
    if (data.name !== undefined) await relabelDepartmentMembers(data.id);
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const deleteMasterDepartment = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("master_departments")
      .select("id, name")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Department not found");

    const { count: childCount, error: childErr } = await context.supabase
      .from("master_departments")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", data.id);
    if (childErr) throw childErr;
    if ((childCount ?? 0) > 0) {
      throw new Error(
        `Remove or move ${childCount} sub-department${childCount === 1 ? "" : "s"} before deleting "${row.name}".`,
      );
    }

    const usage = await countCurrentDepartmentStaff(data.id);
    if (usage > 0) throw new Error(masterInUseMessage(row.name, usage));

    const { error: delErr } = await context.supabase.from("master_departments").delete().eq("id", data.id);
    if (delErr) throw delErr;
    return { ok: true as const };
  },
  { auth: { capability: "people.edit_roster" } },
);

const peopleMasterKind = z.enum(["position", "gender", "nationality"]);

function masterRows(
  rows: { id: string; name: string }[],
  usage: Map<string, number>,
): PeopleMasterRow[] {
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      usageCount: usage.get(masterLabelKey(row.name)) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const listPeopleMasters = createAuthenticatedAction(
  z.object({}).default({}),
  async () => {
    const [positions, genders, nationalities, usage] = await Promise.all([
      supabaseAdmin.from("master_positions").select("id, name"),
      supabaseAdmin.from("master_genders").select("id, name"),
      supabaseAdmin.from("master_nationalities").select("id, name"),
      currentStaffMasterUsage(),
    ]);
    if (positions.error) throw positions.error;
    if (genders.error) throw genders.error;
    if (nationalities.error) throw nationalities.error;
    const departmentUsage = [...usage.departments.entries()].map(([id, usageCount]) => ({
      id,
      usageCount,
    }));
    return {
      positions: masterRows(positions.data ?? [], usage.positions),
      genders: masterRows(genders.data ?? [], usage.genders),
      nationalities: masterRows(nationalities.data ?? [], usage.nationalities),
      departmentUsage,
    };
  },
  { defaultInput: {}, auth: { capability: "people.view_roster" } },
);

async function assertMasterNameAvailable(kind: PeopleMasterKind, name: string, exceptId?: string) {
  const table = PEOPLE_MASTER_TABLE[kind];
  const { data, error } = await supabaseAdmin.from(table).select("id, name");
  if (error) throw error;
  const key = masterLabelKey(name);
  const clash = (data ?? []).find((row) => row.id !== exceptId && masterLabelKey(row.name) === key);
  if (clash) throw new Error("That name already exists");
}

export const createPeopleMaster = createAuthenticatedAction(
  z.object({
    kind: peopleMasterKind,
    name: z.string().min(1).max(120),
  }),
  async (data, context) => {
    const name = normalizeMasterLabel(data.name);
    if (!name) throw new Error("Name is required");
    await assertMasterNameAvailable(data.kind, name);
    const { data: row, error } = await context.supabase
      .from(PEOPLE_MASTER_TABLE[data.kind])
      .insert({ name })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const renamePeopleMaster = createAuthenticatedAction(
  z.object({
    kind: peopleMasterKind,
    id: z.string().uuid(),
    name: z.string().min(1).max(120),
    previousName: z.string().max(120).optional(),
  }),
  async (data, context) => {
    const name = normalizeMasterLabel(data.name);
    if (!name) throw new Error("Name is required");
    const table = PEOPLE_MASTER_TABLE[data.kind];
    const { data: existing, error: readErr } = await context.supabase
      .from(table)
      .select("name")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) throw new Error("Value not found");
    await assertMasterNameAvailable(data.kind, name, data.id);
    const { error } = await context.supabase.from(table).update({ name }).eq("id", data.id);
    if (error) throw error;
    const column = data.kind === "position" ? "job_title" : data.kind;
    const sources = [existing.name, data.previousName].filter((value): value is string => Boolean(value?.trim()));
    try {
      for (const source of sources) {
        await rewriteStaffText(column, source, name);
      }
    } catch (err) {
      await context.supabase.from(table).update({ name: existing.name }).eq("id", data.id);
      throw err instanceof Error ? err : new Error("Could not update staff records");
    }
    return { ok: true as const };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const deletePeopleMaster = createAuthenticatedAction(
  z.object({
    kind: peopleMasterKind,
    id: z.string().uuid(),
  }),
  async (data, context) => {
    const table = PEOPLE_MASTER_TABLE[data.kind];
    const { data: existing, error: readErr } = await context.supabase
      .from(table)
      .select("name")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) throw new Error("Value not found");
    const usage = await currentStaffMasterUsage();
    const counts =
      data.kind === "position" ? usage.positions : data.kind === "gender" ? usage.genders : usage.nationalities;
    const count = counts.get(masterLabelKey(existing.name)) ?? 0;
    if (count > 0) throw new Error(masterInUseMessage(existing.name, count));
    const { error } = await context.supabase.from(table).delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const listDepartmentBudgets = createAuthenticatedAction(
  z.object({ year: z.number().int().min(2000).max(2100).optional() }).default({}),
  async (data, context) => {
    const year = data.year ?? new Date().getFullYear();
    const { data: rows, error } = await context.supabase
      .from("department_budgets")
      .select("department_id, year, amount")
      .eq("year", year);
    if (error) throw error;
    return (rows ?? []).map((row) => ({
      department_id: row.department_id as string,
      year: Number(row.year),
      amount: Number(row.amount),
    }));
  },
  { defaultInput: {}, auth: { capability: "people.view_roster" } },
);

export const upsertDepartmentBudget = createAuthenticatedAction(
  z.object({
    departmentId: z.string().uuid(),
    year: z.number().int().min(2000).max(2100),
    amount: z.number().min(0),
  }),
  async (data, context) => {
    const { data: existing, error: findErr } = await context.supabase
      .from("department_budgets")
      .select("id")
      .eq("department_id", data.departmentId)
      .eq("year", data.year)
      .maybeSingle();
    if (findErr) throw findErr;
    if (existing) {
      const { error } = await context.supabase
        .from("department_budgets")
        .update({ amount: data.amount, updated_by: context.userId })
        .eq("id", existing.id);
      if (error) throw error;
      return { id: existing.id as string };
    }
    const { data: created, error } = await context.supabase
      .from("department_budgets")
      .insert({
        department_id: data.departmentId,
        year: data.year,
        amount: data.amount,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: created.id as string };
  },
  { auth: { anyCapability: ["people.edit_roster", "procurement.configure"] } },
);

export const updateShift = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    roleLabel: z.string().max(100).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    staffId: z.string().uuid().nullable().optional(),
  }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("shifts")
      .select("location_id, status")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);
    if (existing.status === "completed" || existing.status === "cancelled") {
      throw new Error("Cannot edit a completed or cancelled shift");
    }

    const patch: {
      starts_at?: string;
      ends_at?: string;
      role_label?: string | null;
      notes?: string | null;
      staff_id?: string | null;
      user_id?: string | null;
    } = {};
    if (data.endsAt !== undefined) patch.ends_at = data.endsAt;
    if (data.roleLabel !== undefined) patch.role_label = data.roleLabel;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.staffId !== undefined) {
      patch.staff_id = data.staffId;
      if (data.staffId) {
        const { data: st } = await context.supabase
          .from("staff")
          .select("user_id")
          .eq("id", data.staffId)
          .single();
        patch.user_id = st?.user_id ?? null;
      } else {
        patch.user_id = null;
      }
    }

    const { error } = await context.supabase.from("shifts").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const deleteShift = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("shifts")
      .select("location_id, status")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);

    if (existing.status === "scheduled") {
      const { error } = await context.supabase.from("shifts").delete().eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase.rpc("cancel_shift", { _id: data.id });
      if (error) throw error;
    }
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const createTrainingEnrollment = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    staffId: z.string().uuid(),
    courseName: z.string().min(1).max(200),
    required: z.boolean().default(false),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    enrolledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const { data: row, error } = await context.supabase
      .from("training_enrollments")
      .insert({
        location_id: data.locationId,
        staff_id: data.staffId,
        course_name: data.courseName,
        required: data.required,
        due_on: data.dueOn ?? null,
        enrolled_on: data.enrolledOn ?? new Date().toISOString().slice(0, 10),
        status: "enrolled",
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const updateTrainingEnrollment = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    courseName: z.string().min(1).max(200).optional(),
    required: z.boolean().optional(),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    status: z.enum(TRAINING_STATUSES).optional(),
    score: z.number().int().min(0).max(100).nullable().optional(),
    completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("training_enrollments")
      .select("location_id")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);

    const patch: {
      course_name?: string;
      required?: boolean;
      due_on?: string | null;
      status?: (typeof TRAINING_STATUSES)[number];
      score?: number | null;
      completed_on?: string | null;
    } = {};
    if (data.required !== undefined) patch.required = data.required;
    if (data.dueOn !== undefined) patch.due_on = data.dueOn;
    if (data.status !== undefined) patch.status = data.status;
    if (data.score !== undefined) patch.score = data.score;
    if (data.completedOn !== undefined) patch.completed_on = data.completedOn;
    if (data.status === "completed" && data.completedOn === undefined) {
      patch.completed_on = new Date().toISOString().slice(0, 10);
    }

    const { error } = await context.supabase
      .from("training_enrollments")
      .update(patch)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const deleteTrainingEnrollment = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("training_enrollments")
      .select("location_id")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);

    const { error } = await context.supabase.from("training_enrollments").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const importRosterCsv = createAuthenticatedAction(
  z.object({
    csv: z.string().max(2_000_000),
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  }),
  async (data, context) => {
    await requireRosterEdit(context);
    const raw = parseCsv(data.csv);
    const hasWeekday = raw.some((r) => r.weekday);
    let rosterRows;
    if (hasWeekday) {
      if (!data.month) throw new Error("Weekly roster CSV requires month (YYYY-MM)");
      const [year, month] = data.month.split("-").map(Number);
      rosterRows = expandWeeklyRoster(raw, year, month);
    } else {
      rosterRows = parseDatedRosterRows(raw);
    }
    if (!rosterRows.length) throw new Error("No roster rows to import");

    const { data: locations, error: locErr } = await context.supabase
      .from("locations")
      .select("id, code")
      .eq("status", "active");
    if (locErr) throw locErr;
    const locByCode = new Map((locations ?? []).map((l) => [l.code, l.id]));

    const codes = [...new Set(rosterRows.map((r) => r.employee_code))];
    const { data: staffRows, error: stErr } = await context.supabase
      .from("staff")
      .select("id, employee_code, user_id, job_title, location_id")
      .in("employee_code", codes)
      .is("deleted_at", null);
    if (stErr) throw stErr;
    const staffByCode = new Map((staffRows ?? []).map((s) => [s.employee_code, s]));
    const missing = codes.filter((c) => !staffByCode.has(c));
    if (missing.length) {
      throw new Error(`Import staff first — unknown employee_code: ${missing.join(", ")}`);
    }

    const shifts = [];
    for (const r of rosterRows) {
      const location_id = locByCode.get(r.location_code);
      if (!location_id) throw new Error(`Branch "${r.location_code}" not found`);
      await assertLocationAccess(context, location_id);
      const st = staffByCode.get(r.employee_code)!;
      const starts_at = toQatarIso(r.date, r.start_time);
      const ends_at = toQatarIso(r.date, r.end_time);
      shifts.push({
        id: shiftUuid(r.employee_code, starts_at),
        location_id,
        staff_id: st.id,
        user_id: st.user_id,
        role_label: r.role_label || st.job_title,
        starts_at,
        ends_at,
        status: r.status,
      });
    }

    const { error } = await context.supabase.from("shifts").upsert(shifts, { onConflict: "id" });
    if (error) throw error;
    return { imported: shifts.length };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const updateStaffProfileNotes = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    notes: z.string().max(4000).nullable(),
  }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("staff")
      .select("location_id")
      .eq("id", data.staffId)
      .is("deleted_at", null)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);
    const { error } = await context.supabase.from("staff_profile_ext").upsert(
      {
        staff_id: data.staffId,
        notes: data.notes?.trim() ? data.notes.trim() : null,
        updated_by: context.userId,
      },
      { onConflict: "staff_id" },
    );
    if (error) throw error;
    const audited = redactAuditPayload({ notes: data.notes });
    await context.supabase.rpc("log_audit", {
      _action: "staff.notes_updated",
      _table_name: "staff_profile_ext",
      _row_id: data.staffId,
      _before: { notes: "[redacted]" },
      _after: audited.payload,
      _location_id: existing.location_id,
      _metadata: { redactedFields: audited.fields },
    });
    return { ok: true };
  },
  { auth: { anyCapability: ["people.edit_roster", "hr.manage", "hr.docs.manage"] } },
);

export const updateStaffSkills = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    skills: z.string().max(2000).nullable(),
  }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("staff")
      .select("location_id")
      .eq("id", data.staffId)
      .is("deleted_at", null)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);
    const skills = data.skills?.trim() ? data.skills.trim() : null;
    const { error } = await context.supabase.from("staff_profile_ext").upsert(
      {
        staff_id: data.staffId,
        skills,
        updated_by: context.userId,
      },
      { onConflict: "staff_id" },
    );
    if (error) throw error;
    await context.supabase.rpc("log_audit", {
      _action: "staff.skills_updated",
      _table_name: "staff_profile_ext",
      _row_id: data.staffId,
      _after: { skills },
      _location_id: existing.location_id,
      _metadata: {},
    });
    return { ok: true };
  },
  { auth: { capability: "hr.manage" } },
);

const identityDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const HR_DOC_BUCKET = "hr-employee-documents";

/** Store QID / passport / visa / contract files on hr_employee_documents and copy numbers/expiries onto the staff profile. */
export const attachStaffIdentityDocuments = createSafeAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    qidExpiry: identityDate.nullable().optional(),
    passportNumber: z.string().max(32).nullable().optional(),
    passportExpiry: identityDate.nullable().optional(),
    visaNumber: z.string().max(40).nullable().optional(),
    visaExpiry: identityDate.nullable().optional(),
    contractEnd: identityDate.nullable().optional(),
    qidIfEmpty: z.string().max(32).nullable().optional(),
    documents: z
      .array(
        z.object({
          docType: z.enum(["qid", "passport", "visa", "contract"]),
          filename: z.string().min(1).max(200),
          data_base64: z.string().min(10).max(14_000_000),
          content_type: z.string().max(100),
          documentNumber: z.string().max(40).nullable().optional(),
          expiryDate: identityDate.nullable().optional(),
        }),
      )
      .max(4),
  }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("staff")
      .select("location_id")
      .eq("id", data.staffId)
      .is("deleted_at", null)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);

    const stored: string[] = [];
    for (const doc of data.documents) {
      validateUploadMime(doc.content_type, "document");
      validateBase64Size(doc.data_base64, 10 * 1024 * 1024);
      const safeName = doc.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${data.staffId}/${doc.docType}-${Date.now()}-${safeName}`;
      const bytes = Uint8Array.from(Buffer.from(doc.data_base64, "base64"));
      const { error: upErr } = await supabaseAdmin.storage
        .from(HR_DOC_BUCKET)
        .upload(path, bytes, { contentType: doc.content_type, upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabaseAdmin.from("hr_employee_documents").insert({
        staff_id: data.staffId,
        doc_type: doc.docType,
        title: doc.filename,
        document_number: doc.documentNumber?.trim() || null,
        file_path: path,
        file_name: doc.filename,
        file_mime: doc.content_type,
        expiry_date: doc.expiryDate ?? null,
        uploaded_by: context.userId,
        status: "pending",
        verification_status: "unverified",
      });
      if (insErr) throw insErr;
      stored.push(doc.docType);
    }

    await syncStaffIdentityProfile({
      staffId: data.staffId,
      updatedBy: context.userId,
      qidExpiry: data.qidExpiry,
      passportNumber: data.passportNumber,
      passportExpiry: data.passportExpiry,
      visaNumber: data.visaNumber,
      visaExpiry: data.visaExpiry,
      contractEnd: data.contractEnd,
      qidIfEmpty: data.qidIfEmpty,
    });

    await context.supabase.rpc("log_audit", {
      _action: "staff.identity_documents",
      _table_name: "hr_employee_documents",
      _row_id: data.staffId,
      _after: { documents: stored },
      _location_id: existing.location_id,
      _metadata: {},
    });
    return { stored };
  },
  { auth: { anyCapability: ["people.edit_roster", "hr.manage", "hr.docs.manage"] } },
);
