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
import {
  formatDepartmentDisplay,
  normalizeDepartmentName,
  splitDepartmentTokens,
} from "@/lib/staff-departments";
import { shiftUuid, staffUuid } from "@/lib/staff-import-ids";
import { createAuthenticatedAction } from "@/lib/server/create-action";
import type { AuthContext } from "@/lib/server/create-action";

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

type MasterDeptRow = { id: string; name: string };

async function loadMasterDepartments(context: AuthContext, activeOnly = false): Promise<MasterDeptRow[]> {
  let q = context.supabase.from("master_departments").select("id, name");
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

function matchDepartmentId(name: string, catalog: MasterDeptRow[]): string | null {
  const target = normalizeDepartmentName(name);
  const exact = catalog.find((d) => normalizeDepartmentName(d.name) === target);
  if (exact) return exact.id;
  const compact = catalog.find(
    (d) => normalizeDepartmentName(d.name).replace(/\s/g, "") === target.replace(/\s/g, ""),
  );
  return compact?.id ?? null;
}

async function resolveDepartmentIds(
  context: AuthContext,
  raw: string | null | undefined,
  catalog?: MasterDeptRow[],
): Promise<{ ids: string[]; names: string[] }> {
  const tokens = splitDepartmentTokens(raw);
  if (!tokens.length) return { ids: [], names: [] };

  const list = catalog ?? (await loadMasterDepartments(context));
  const ids: string[] = [];
  const names: string[] = [];

  for (const token of tokens) {
    let id = matchDepartmentId(token, list);
    if (!id) {
      const { data: created, error } = await context.supabase
        .from("master_departments")
        .insert({ name: token.trim(), sort_order: 900 })
        .select("id, name")
        .single();
      if (error) {
        const { data: existing } = await context.supabase
          .from("master_departments")
          .select("id, name")
          .ilike("name", token.trim())
          .maybeSingle();
        if (!existing) throw error;
        id = existing.id;
        list.push(existing);
        names.push(existing.name);
        ids.push(existing.id);
        continue;
      }
      id = created.id;
      list.push(created);
      names.push(created.name);
    } else {
      const row = list.find((d) => d.id === id);
      names.push(row?.name ?? token);
    }
    if (id && !ids.includes(id)) ids.push(id);
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
        "id, employee_code, full_name, job_title, department, status, location_id, staff_departments(department_id)",
      )
      .is("deleted_at", null)
      .order("full_name");
    if (data.locationId) q = q.eq("location_id", data.locationId);
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
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("training_enrollments")
      .select(
        "id, location_id, staff_id, course_name, required, status, due_on, completed_on, score, staff(full_name, employee_code)",
      )
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
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
      const resolved = await resolveDepartmentIds(context, s.department, catalog);
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

const STAFF_STATUSES = ["active", "on_leave", "terminated"] as const;
const TRAINING_STATUSES = ["enrolled", "in_progress", "completed", "overdue"] as const;

export const createStaff = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    employeeCode: z.string().min(1).max(50),
    fullName: z.string().min(1).max(200),
    jobTitle: z.string().max(200).optional(),
    departmentIds: z.array(z.string().uuid()).default([]),
    hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(STAFF_STATUSES).default("active"),
    phone: z.string().max(40).optional(),
    email: z.string().email().optional().or(z.literal("")),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const employee_code = data.employeeCode.toUpperCase();
    const { data: dup, error: dupErr } = await context.supabase
      .from("staff")
      .select("id")
      .eq("employee_code", employee_code)
      .is("deleted_at", null)
      .maybeSingle();
    if (dupErr) throw dupErr;
    if (dup) throw new Error(`Employee code "${employee_code}" already exists`);

    const names = await departmentNamesForIds(context, data.departmentIds);
    const department = formatDepartmentDisplay(names) || null;

    const { data: row, error } = await context.supabase
      .from("staff")
      .insert({
        location_id: data.locationId,
        employee_code,
        full_name: data.fullName,
        job_title: data.jobTitle ?? null,
        department,
        hire_date: data.hireDate ?? null,
        status: data.status,
        phone: data.phone ?? null,
        email: data.email || null,
      })
      .select("id")
      .single();
    if (error) throw error;

    await syncStaffDepartments(context, row.id as string, data.departmentIds, department);
    return { id: row.id as string };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const updateStaff = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    fullName: z.string().min(1).max(200).optional(),
    jobTitle: z.string().max(200).nullable().optional(),
    departmentIds: z.array(z.string().uuid()).optional(),
    hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    status: z.enum(STAFF_STATUSES).optional(),
    phone: z.string().max(40).nullable().optional(),
    email: z.string().email().nullable().optional().or(z.literal("")),
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

    const patch: {
      full_name?: string;
      job_title?: string | null;
      hire_date?: string | null;
      status?: (typeof STAFF_STATUSES)[number];
      phone?: string | null;
      email?: string | null;
    } = {};
    if (data.fullName !== undefined) patch.full_name = data.fullName;
    if (data.jobTitle !== undefined) patch.job_title = data.jobTitle;
    if (data.hireDate !== undefined) patch.hire_date = data.hireDate;
    if (data.status !== undefined) patch.status = data.status;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.email !== undefined) patch.email = data.email || null;

    if (Object.keys(patch).length) {
      const { error } = await context.supabase.from("staff").update(patch).eq("id", data.id);
      if (error) throw error;
    }

    if (data.departmentIds !== undefined) {
      const names = await departmentNamesForIds(context, data.departmentIds);
      const department = formatDepartmentDisplay(names) || null;
      await syncStaffDepartments(context, data.id, data.departmentIds, department);
    }

    return { ok: true };
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
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const listMasterDepartments = createAuthenticatedAction(
  z.object({}).default({}),
  async (_data, context) => {
    const { data, error } = await context.supabase
      .from("master_departments")
      .select("id, name, code, active, sort_order")
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return data ?? [];
  },
  { defaultInput: {}, auth: { capability: "people.view_roster" } },
);

export const createMasterDepartment = createAuthenticatedAction(
  z.object({
    name: z.string().min(1).max(120),
    code: z.string().max(40).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("master_departments")
      .insert({
        name: data.name.trim(),
        code: data.code?.trim().toUpperCase() || null,
        sort_order: data.sortOrder ?? 500,
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
  }),
  async (data, context) => {
    const patch: {
      name?: string;
      code?: string | null;
      active?: boolean;
      sort_order?: number;
    } = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.code !== undefined) patch.code = data.code?.trim().toUpperCase() || null;
    if (data.active !== undefined) patch.active = data.active;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;

    const { error } = await context.supabase
      .from("master_departments")
      .update(patch)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
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
