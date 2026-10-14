"use server";

import { z } from "zod";

import { loadLinkedStaffJobTitle } from "@/lib/linked-staff-job-title.server";
import { peopleDirectoryShowsSalary } from "@/lib/people-directory-access";
import { canUserDo } from "@/lib/rbac";
import {
  createAuthenticatedAction,
  createSafeAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { rollbackRosterBatch } from "@/lib/staff-roster/apply";
import { insertSalaryHistoryAndSync, insertStatusHistory } from "@/lib/staff-history";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { employeeCodeAfterHomeLocationChange, employeeCodeHasLocationPrefix } from "@/lib/staff-employee-code";
import { staffHomeWorkSiteIds } from "@/lib/staff-work-locations";

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

const EMPLOYEE_CODE_PAGE = 1000;

async function pageEmployeeCodes(
  load: (from: number, to: number) => PromiseLike<{
    data: Array<{ employee_code?: string | null }> | null;
    error: { message: string } | null;
  }>,
): Promise<string[]> {
  const codes: string[] = [];
  for (let from = 0; ; from += EMPLOYEE_CODE_PAGE) {
    const { data, error } = await load(from, from + EMPLOYEE_CODE_PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      const code = String(row.employee_code ?? "").trim().toUpperCase();
      if (code) codes.push(code);
    }
    if (rows.length < EMPLOYEE_CODE_PAGE) return codes;
  }
}

/** Staff, login profiles, and device copies. Soft-deleted staff codes stay reserved. */
async function loadReservedEmployeeCodes(): Promise<string[]> {
  const [staffCodes, profileCodes, biometricCodes] = await Promise.all([
    pageEmployeeCodes((from, to) =>
      supabaseAdmin.from("staff").select("employee_code").order("id", { ascending: true }).range(from, to),
    ),
    pageEmployeeCodes((from, to) =>
      supabaseAdmin.from("profiles").select("employee_code").order("id", { ascending: true }).range(from, to),
    ),
    pageEmployeeCodes(async (from, to) => {
      const { data, error } = await supabaseAdmin
        .from("attendance_biometric_users")
        .select("employee_code")
        .order("id", { ascending: true })
        .range(from, to);
      if (error && /employee_code/i.test(error.message)) return { data: [], error: null };
      return {
        data: (data ?? []) as Array<{ employee_code?: string | null }>,
        error: error ? { message: error.message } : null,
      };
    }),
  ]);
  return [...staffCodes, ...profileCodes, ...biometricCodes];
}

async function locationCodeForId(supabase: AuthContext["supabase"], locationId: string): Promise<string> {
  const { data, error } = await supabase.from("locations").select("code").eq("id", locationId).maybeSingle();
  if (error) throw error;
  const code = String(data?.code ?? "").trim().toUpperCase();
  if (!code) throw new Error("Branch code not found");
  return code;
}

type HomeCodeAssignment = {
  employeeCode: string;
  previousCode: string;
  changed: boolean;
  userId: string | null;
};

async function codeForHomeLocationChange(
  context: AuthContext,
  staffId: string,
  previousLocationId: string,
  nextLocationId: string,
  homeLocationSaved: boolean,
): Promise<HomeCodeAssignment> {
  const { data, error } = await context.supabase
    .from("staff")
    .select("employee_code, job_title, staff_role, user_id")
    .eq("id", staffId)
    .single();
  if (error) throw error;
  const previousCode = String(data.employee_code ?? "").trim().toUpperCase();
  if (!homeLocationSaved) {
    return { employeeCode: previousCode, previousCode, changed: false, userId: data.user_id };
  }
  const nextLocationCode = await locationCodeForId(context.supabase, nextLocationId);
  if (employeeCodeHasLocationPrefix(previousCode, nextLocationCode)) {
    return { employeeCode: previousCode, previousCode, changed: false, userId: data.user_id };
  }
  const previousLocationCode =
    previousLocationId === nextLocationId
      ? nextLocationCode
      : await locationCodeForId(context.supabase, previousLocationId);
  const employeeCode = employeeCodeAfterHomeLocationChange({
    employeeCode: previousCode,
    previousLocationCode,
    nextLocationCode,
    homeLocationSaved: true,
    usedCodes: await loadReservedEmployeeCodes(),
    hint: { jobTitle: data.job_title, staffRole: data.staff_role },
  });
  return {
    employeeCode,
    previousCode,
    changed: employeeCode !== previousCode,
    userId: data.user_id,
  };
}

/** Keep login and device copies on the same person when `staff.employee_code` changes. */
async function syncEmployeeCodeCopies(input: {
  staffId: string;
  userId: string | null;
  previousCode: string;
  nextCode: string;
}) {
  const previous = input.previousCode.trim().toUpperCase();
  const next = input.nextCode.trim().toUpperCase();
  if (!previous || !next || previous === next) return;

  if (input.userId) {
    const { data: profile, error: readErr } = await supabaseAdmin
      .from("profiles")
      .select("id, employee_code")
      .eq("id", input.userId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (String(profile?.employee_code ?? "").trim().toUpperCase() === previous) {
      const { error } = await supabaseAdmin.from("profiles").update({ employee_code: next }).eq("id", input.userId);
      if (error) throw error;
    }
  }

  const { data: bios, error: bioErr } = await supabaseAdmin
    .from("attendance_biometric_users")
    .select("id, employee_code")
    .eq("staff_id", input.staffId);
  if (bioErr) {
    if (/employee_code/i.test(bioErr.message)) return;
    throw bioErr;
  }
  const ids = (bios ?? [])
    .filter((row) => String(row.employee_code ?? "").trim().toUpperCase() === previous)
    .map((row) => row.id);
  if (!ids.length) return;
  const { error: updErr } = await supabaseAdmin
    .from("attendance_biometric_users")
    .update({ employee_code: next })
    .in("id", ids);
  if (updErr) throw updErr;
}

async function writeHomeLocation(
  context: AuthContext,
  staffId: string,
  nextLocationId: string,
  assigned: HomeCodeAssignment,
) {
  if (assigned.changed) {
    await syncEmployeeCodeCopies({
      staffId,
      userId: assigned.userId,
      previousCode: assigned.previousCode,
      nextCode: assigned.employeeCode,
    });
  }
  const { error } = await context.supabase
    .from("staff")
    .update({
      location_id: nextLocationId,
      ...(assigned.changed ? { employee_code: assigned.employeeCode } : {}),
    })
    .eq("id", staffId);
  if (!error) return;
  if (assigned.changed) {
    try {
      await syncEmployeeCodeCopies({
        staffId,
        userId: assigned.userId,
        previousCode: assigned.employeeCode,
        nextCode: assigned.previousCode,
      });
    } catch {
      /* Surface the staff update error. */
    }
  }
  throw error;
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

    const assigned = await codeForHomeLocationChange(
      context,
      data.id,
      existing.location_id,
      data.toLocationId,
      true,
    );
    await writeHomeLocation(context, data.id, data.toLocationId, assigned);
    await audit(
      context,
      "staff.transferred",
      data.id,
      {
        from: existing.location_id,
        to: data.toLocationId,
        effectiveOn: data.effectiveOn,
        employee_code: assigned.employeeCode,
        previous_employee_code: assigned.changed ? assigned.previousCode : undefined,
      },
      data.toLocationId,
    );
    return { ok: true, employeeCode: assigned.employeeCode, employeeCodeChanged: assigned.changed };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const updateStaffSalary = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    monthlySalaryQar: z.number().min(0).max(1_000_000).nullable(),
    dailyRateQar: z.number().min(0).max(100_000).nullable().optional(),
  }),
  async (data, context) => {
    if (!canUserDo(context.roles ?? [], "people.edit_salary")) {
      throw new ForbiddenError("Forbidden: missing capability people.edit_salary");
    }
    const jobTitle = await loadLinkedStaffJobTitle(context.userId);
    if (!peopleDirectoryShowsSalary(context.roles ?? [], jobTitle)) {
      throw new ForbiddenError("Forbidden: salary is limited to HR and leadership");
    }
    const existing = await assertStaffLocation(context, data.id);
    await insertSalaryHistoryAndSync(context, {
      staffId: data.id,
      monthlyTotalQar: data.monthlySalaryQar,
      dailyRateQar: data.dailyRateQar ?? null,
      locationId: existing.location_id,
      reason: "manual_update",
    });
    return { ok: true as const };
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
    employmentType: z.enum(["permanent", "temporary", "secondment", "joker"]).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    status: z
      .enum([
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
        "contract_finished",
        "released",
        "serving_notice",
        "inactive",
      ])
      .optional(),
  }),
  async (data, context) => {
    const existing = await assertStaffLocation(context, data.id);
    const status =
      data.status === "inactive" ? "terminated" : data.status;
    if (status && status !== existing.status) {
      await insertStatusHistory(context, {
        staffId: data.id,
        fromStatus: existing.status,
        toStatus: status,
        reason: "roster_field_update",
        locationId: existing.location_id,
      });
    }
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

export const updateStaffWorkLocations = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    locationIds: z.array(z.string().uuid()).max(20),
    isRoaming: z.boolean().optional(),
    /** Directory home (`staff.location_id`). Omit to leave the current home unchanged. */
    homeLocationId: z.string().uuid().optional(),
  }),
  async (data, context) => {
    const existing = await assertStaffLocation(context, data.id);
    const resolved = staffHomeWorkSiteIds({
      previousHomeId: existing.location_id,
      homeLocationId: data.homeLocationId,
      locationIds: data.locationIds,
    });
    const unique = resolved.locationIds;

    await Promise.all(
      unique.map(async (locationId) => {
        const { data: allowed, error } = await context.supabase.rpc("user_can_access_location", {
          _location_id: locationId,
        });
        if (error) throw error;
        if (!allowed) throw new ForbiddenError("Forbidden: cannot attach this branch");
      }),
    );

    const extraSites = unique.filter((id) => id !== resolved.homeLocationId);
    const isRoaming = data.isRoaming ?? extraSites.length > 0;
    const homeLocationSaved = data.homeLocationId != null || resolved.homeLocationId !== existing.location_id;
    const assigned = await codeForHomeLocationChange(
      context,
      data.id,
      existing.location_id,
      resolved.homeLocationId,
      homeLocationSaved,
    );
    // Directory listing uses staff.location_id. Punches stay on staff_id.
    // A stale code is rewritten even when this save's home id matches the row,
    // because an earlier save may have moved the branch without the code.
    if (resolved.homeLocationId !== existing.location_id || assigned.changed) {
      await writeHomeLocation(context, data.id, resolved.homeLocationId, assigned);
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

    const { error: flagErr } = await context.supabase
      .from("staff")
      .update({ is_roaming: isRoaming })
      .eq("id", data.id);
    if (flagErr) throw flagErr;

    await audit(
      context,
      "staff.work_locations_updated",
      data.id,
      {
        location_ids: unique,
        is_roaming: isRoaming,
        home_location_id: resolved.homeLocationId,
        previous_home_location_id: existing.location_id,
        employee_code: assigned.employeeCode,
        previous_employee_code: assigned.changed ? assigned.previousCode : undefined,
      },
      resolved.homeLocationId,
    );
    return {
      ok: true as const,
      isRoaming,
      locationIds: unique,
      homeLocationId: resolved.homeLocationId,
      employeeCode: assigned.employeeCode,
      employeeCodeChanged: assigned.changed,
    };
  },
  { auth: { capability: "people.edit_roster" } },
);

