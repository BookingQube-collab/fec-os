"use server";

import { z } from "zod";

import { INCIDENT_TYPES, SHIFT_PERIODS, STAFF_ROLES } from "@/lib/daily-ops/constants";
import { generateLocationRosterWithAi } from "@/lib/daily-ops/ai-roster-generate";
import { importRosterRows, parseRosterCsvRows } from "@/lib/daily-ops/roster-import";
import { toQatarIso } from "@/lib/staff-import";
import { shiftUuid } from "@/lib/staff-import-ids";
import { createAuthenticatedAction } from "@/lib/server/create-action";
import { assertLocationAccess } from "@/lib/server/authorize";

const LocFilter = z
  .object({ locationId: z.string().uuid().nullable().optional() })
  .default({});

export const upsertShiftBriefing = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    briefing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    location_id: z.string().uuid(),
    shift: z.enum(SHIFT_PERIODS),
    supervisor_name: z.string().min(1).max(200),
    staff_scheduled: z.number().int().min(0),
    staff_present: z.number().int().min(0),
    key_notes: z.string().max(4000).nullable().optional(),
    handover_items: z.string().max(4000).nullable().optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    const row = {
      briefing_date: data.briefing_date,
      location_id: data.location_id,
      shift: data.shift,
      supervisor_name: data.supervisor_name,
      staff_scheduled: data.staff_scheduled,
      staff_present: data.staff_present,
      key_notes: data.key_notes ?? null,
      handover_items: data.handover_items ?? null,
      filled_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("shift_briefings").update(row).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("shift_briefings")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return { id: inserted.id as string };
  },
  { auth: { capability: "daily_ops.manage" } },
);

export const createDailyOpsIncident = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    occurred_at: z.string().datetime(),
    category: z.enum(INCIDENT_TYPES),
    severity: z.string().min(1).max(20),
    summary: z.string().min(3).max(2000),
    detail: z.string().max(4000).nullable().optional(),
    action_taken: z.string().max(4000).nullable().optional(),
  }),
  async (data, context) => {
    const { data: id, error } = await context.supabase.rpc("create_incident", {
      _location_id: data.location_id,
      _occurred_at: data.occurred_at,
      _category: data.category,
      _severity: data.severity,
      _summary: data.summary,
      _detail: data.detail ?? undefined,
      _action_taken: data.action_taken ?? undefined,
    });
    if (error) throw error;
    return { id: String(id) };
  },
  { auth: { capability: "daily_ops.manage" } },
);

export const upsertMaintenanceIssue = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    location_id: z.string().uuid(),
    log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    category: z.string().min(1).max(100),
    zone: z.string().max(100).nullable().optional(),
    description: z.string().min(3).max(4000),
    priority: z.string().min(1).max(20),
    status: z.string().min(1).max(40).optional(),
    assigned_to: z.string().max(200).nullable().optional(),
    date_resolved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    const row = {
      location_id: data.location_id,
      log_date: data.log_date ?? new Date().toISOString().slice(0, 10),
      category: data.category,
      zone: data.zone ?? null,
      description: data.description,
      priority: data.priority,
      status: data.status ?? "Open",
      assigned_to: data.assigned_to ?? null,
      date_resolved: data.date_resolved ?? null,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("supervisor_issues").update(row).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("supervisor_issues")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return { id: inserted.id as string };
  },
  { auth: { capability: "daily_ops.manage" } },
);

export const updateStaffRoster = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    staff_role: z.enum(STAFF_ROLES).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    status: z.enum(["active", "on_leave", "terminated"]).optional(),
    job_title: z.string().max(200).nullable().optional(),
  }),
  async (data, context) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("staff")
      .select("location_id")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, existing.location_id);

    const patch: {
      staff_role?: (typeof STAFF_ROLES)[number] | null;
      phone?: string | null;
      status?: "active" | "on_leave" | "terminated";
      job_title?: string | null;
    } = {};
    if (data.staff_role !== undefined) patch.staff_role = data.staff_role;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.status !== undefined) patch.status = data.status;
    if (data.job_title !== undefined) patch.job_title = data.job_title;

    const { error } = await context.supabase.from("staff").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const uploadDailyOpsRosterCsv = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    csv: z.string().max(2_000_000),
    file_name: z.string().min(1).max(255),
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    file_base64: z.string().max(7_000_000).optional(),
    content_type: z.string().max(100).optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    const rosterRows = parseRosterCsvRows(data.csv, data.month);
    const fileType = data.file_name.split(".").pop()?.toLowerCase() ?? "csv";

    let filePath: string | null = null;
    if (data.file_base64) {
      const ext = fileType === "xlsx" ? "xlsx" : fileType === "pdf" ? "pdf" : "csv";
      filePath = `${data.location_id}/${Date.now()}-${data.file_name.replace(/[^\w.-]/g, "_")}.${ext}`;
      const buffer = Buffer.from(data.file_base64, "base64");
      const { error: upErr } = await context.supabase.storage
        .from("daily-ops-rosters")
        .upload(filePath, buffer, {
          contentType: data.content_type ?? "text/csv",
          upsert: false,
        });
      if (upErr) throw upErr;
    }

    const { data: uploadRow, error: uploadErr } = await context.supabase
      .from("daily_ops_roster_uploads")
      .insert({
        location_id: data.location_id,
        file_name: data.file_name,
        file_path: filePath,
        file_type: fileType,
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (uploadErr) throw uploadErr;

    const result = await importRosterRows(context.supabase, context, rosterRows, {
      locationId: data.location_id,
      rosterUploadId: uploadRow.id as string,
      assertAccess: (locId) => assertLocationAccess(context, locId),
    });

    const { error: patchErr } = await context.supabase
      .from("daily_ops_roster_uploads")
      .update({
        rows_imported: result.imported,
        period_start: result.periodStart,
        period_end: result.periodEnd,
      })
      .eq("id", uploadRow.id);
    if (patchErr) throw patchErr;

    return { imported: result.imported, uploadId: uploadRow.id as string };
  },
  { auth: { capability: "daily_ops.roster.upload" } },
);

export const generateDailyOpsRoster = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    entries: z
      .array(
        z.object({
          staff_id: z.string().uuid(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          start_time: z.string().regex(/^\d{2}:\d{2}$/),
          end_time: z.string().regex(/^\d{2}:\d{2}$/),
          role_label: z.string().max(100).nullable().optional(),
        }),
      )
      .min(1)
      .max(500),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    const staffIds = [...new Set(data.entries.map((e) => e.staff_id))];
    const { data: staffRows, error: stErr } = await context.supabase
      .from("staff")
      .select("id, employee_code, user_id, job_title, location_id")
      .in("id", staffIds)
      .is("deleted_at", null);
    if (stErr) throw stErr;
    const staffMap = new Map((staffRows ?? []).map((s) => [s.id, s]));

    const shifts = [];
    for (const entry of data.entries) {
      const st = staffMap.get(entry.staff_id);
      if (!st) throw new Error(`Unknown staff member: ${entry.staff_id}`);
      if (st.location_id !== data.location_id) {
        throw new Error(`${st.employee_code} is not assigned to this location`);
      }
      const starts_at = toQatarIso(entry.date, entry.start_time);
      const ends_at = toQatarIso(entry.date, entry.end_time);
      shifts.push({
        id: shiftUuid(st.employee_code, starts_at),
        location_id: data.location_id,
        staff_id: st.id,
        user_id: st.user_id,
        role_label: entry.role_label ?? st.job_title,
        starts_at,
        ends_at,
        status: "scheduled",
      });
    }

    const { error } = await context.supabase.from("shifts").upsert(shifts, { onConflict: "id" });
    if (error) throw error;
    return { generated: shifts.length };
  },
  { auth: { capability: "daily_ops.roster.generate" } },
);

export const aiGenerateLocationRoster = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    week_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    if (data.week_start > data.week_end) {
      throw new Error("Week start must be on or before week end");
    }

    const [{ data: location, error: locErr }, { data: staffRows, error: stErr }, { data: deptRows }] =
      await Promise.all([
        context.supabase
          .from("locations")
          .select("id, code, name")
          .eq("id", data.location_id)
          .single(),
        context.supabase
          .from("staff")
          .select(
            "id, employee_code, full_name, staff_role, job_title, department, status, staff_departments(master_departments(name))",
          )
          .eq("location_id", data.location_id)
          .eq("status", "active")
          .is("deleted_at", null)
          .order("full_name"),
        context.supabase
          .from("master_departments")
          .select("name")
          .eq("active", true)
          .order("sort_order"),
      ]);
    if (locErr) throw locErr;
    if (stErr) throw stErr;

    const staff = (staffRows ?? []).map((row) => {
      const deptLinks = (row.staff_departments ?? []) as Array<{
        master_departments: { name: string } | null;
      }>;
      const departments = deptLinks
        .map((l) => l.master_departments?.name)
        .filter((n): n is string => Boolean(n));
      return {
        id: row.id as string,
        full_name: row.full_name as string,
        employee_code: row.employee_code as string,
        staff_role: (row.staff_role as string | null) ?? null,
        job_title: (row.job_title as string | null) ?? null,
        department: (row.department as string | null) ?? null,
        departments,
      };
    });

    const { data: shiftRows, error: shErr } = await context.supabase
      .from("shifts")
      .select("staff_id, starts_at, ends_at")
      .eq("location_id", data.location_id)
      .gte("starts_at", `${data.week_start}T00:00:00+03:00`)
      .lte("starts_at", `${data.week_end}T23:59:59+03:00`)
      .not("staff_id", "is", null);
    if (shErr) throw shErr;

    const existing_shifts = (shiftRows ?? [])
      .filter((s) => s.staff_id)
      .map((s) => ({
        staff_id: s.staff_id as string,
        date: String(s.starts_at).slice(0, 10),
        start_time: String(s.starts_at).slice(11, 16),
        end_time: String(s.ends_at).slice(11, 16),
      }));

    const master_departments = (deptRows ?? []).map((d) => d.name as string);

    const result = await generateLocationRosterWithAi({
      location_code: location.code,
      location_name: location.name,
      week_start: data.week_start,
      week_end: data.week_end,
      staff,
      master_departments,
      existing_shifts,
    });

    return {
      entries: result.entries,
      ai_generated: result.ai_generated,
      location_code: location.code,
      location_name: location.name,
    };
  },
  { auth: { capability: "daily_ops.roster.generate" } },
);

export const updateComplaintHandler = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    handled_by: z.string().min(1).max(200),
  }),
  async (data, context) => {
    const { data: row, error: fetchErr } = await context.supabase
      .from("complaints")
      .select("location_id")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;
    await assertLocationAccess(context, row.location_id);

    const { error } = await context.supabase
      .from("complaints")
      .update({ handled_by: data.handled_by })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "customer.resolve_complaint" } },
);
