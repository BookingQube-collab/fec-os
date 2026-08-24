import type { Json } from "@/integrations/supabase/types";
import { canUserDo, type AppRole } from "@/lib/rbac";
import type { AuthContext } from "@/lib/server/create-action";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import { staffUuid } from "@/lib/staff-import-ids";

import { diffStaffFields, matchRosterRow, proposeStaffValues, resolveRowAction, salaryWouldWipe } from "./match";
import type {
  ExistingStaffForMatch,
  ParsedRosterRow,
  PreviewLine,
  ProposedStaffValues,
  RosterImportMode,
  RosterPreview,
  RosterRowAction,
} from "./types";
import { STAFF_REFERENCE_TABLES } from "./types";
import { generateEmployeeCode, isQidShapedCode } from "./values";

function venueOnly(roles: AppRole[]): boolean {
  const elevated = roles.some((r) => ["ceo", "coo", "cfo", "regional_ops", "hr"].includes(r));
  return !elevated && roles.some((r) => ["branch_gm", "duty_manager"].includes(r));
}

function canViewSalary(roles: AppRole[]): boolean {
  return canUserDo(roles, "people.view_salary");
}

function canEditSalary(roles: AppRole[]): boolean {
  return canUserDo(roles, "people.edit_salary");
}

function canAuthoritative(roles: AppRole[]): boolean {
  return !venueOnly(roles);
}

export function assertRosterImportMode(roles: AppRole[], mode: RosterImportMode, confirmHardDelete: boolean) {
  if (mode === "authoritative_replace" && !canAuthoritative(roles)) {
    throw new ForbiddenError("Venue roles may only use Safe Sync.");
  }
  if (confirmHardDelete && !canAuthoritative(roles)) {
    throw new ForbiddenError("Permanent delete is restricted.");
  }
}

async function loadLocations(context: AuthContext) {
  const { data, error } = await context.supabase
    .from("locations")
    .select("id, code, name, region")
    .in("status", ["active", "maintenance", "pre_launch"]);
  if (error) throw error;
  return data ?? [];
}

async function loadStaffForMatch(context: AuthContext, includeSalary: boolean): Promise<ExistingStaffForMatch[]> {
  const { data, error } = await context.supabase
    .from("staff")
    .select(
      "id, employee_code, full_name, qid, phone, location_id, status, deleted_at, job_title, department, hire_date, e3_enrolled, employment_type, staff_role, is_roaming, locations!staff_location_id_fkey(code)",
    );
  if (error) throw error;
  const rows = (data ?? []) as Array<
    ExistingStaffForMatch & { locations?: { code: string } | null }
  >;

  let salaryByStaff = new Map<string, number | null>();
  if (includeSalary) {
    const { data: comps, error: cErr } = await context.supabase
      .from("staff_compensation")
      .select("staff_id, monthly_salary_qar");
    if (cErr) throw cErr;
    salaryByStaff = new Map(
      (comps ?? []).map((c) => [c.staff_id, c.monthly_salary_qar == null ? null : Number(c.monthly_salary_qar)]),
    );
  }

  return rows.map((r) => ({
    ...r,
    location_code: r.locations?.code ?? null,
    monthly_salary_qar: includeSalary ? (salaryByStaff.get(r.id) ?? null) : null,
  }));
}

async function staffIsReferenced(context: AuthContext, staffId: string): Promise<boolean> {
  for (const table of STAFF_REFERENCE_TABLES) {
    const { count, error } = await context.supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("staff_id", staffId);
    if (error) continue;
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

function publicNewValues(proposed: ProposedStaffValues, includeSalary: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = {
    employee_code: proposed.employee_code,
    full_name: proposed.full_name,
    qid: proposed.qid,
    phone: proposed.phone,
    location_code: proposed.location_code,
    location_id: proposed.location_id,
    job_title: proposed.job_title,
    department: proposed.department,
    hire_date: proposed.hire_date,
    status: proposed.status,
    e3_enrolled: proposed.e3_enrolled,
    employment_type: proposed.employment_type,
    staff_role: proposed.staff_role,
    source_row_no: proposed.source_row_no,
  };
  if (includeSalary) base.monthly_salary_qar = proposed.monthly_salary_qar;
  return base;
}

export async function buildRosterPreview(
  context: AuthContext,
  parsedRows: ParsedRosterRow[],
  extras: {
    mode: RosterImportMode;
    confirmHardDelete: boolean;
    skippedEmpty: number;
    mapping: Record<string, string>;
    worksheetName: string | null;
    errors: Array<{ rowNumber: number; code: string; message: string }>;
  },
): Promise<RosterPreview> {
  const roles = context.roles ?? [];
  assertRosterImportMode(roles, extras.mode, extras.confirmHardDelete);
  const includeSalary = canViewSalary(roles);
  const locations = await loadLocations(context);
  const locByCode = new Map(locations.map((l) => [l.code, l]));

  const scopedLocationIds = new Set<string>();
  for (const loc of locations) {
    try {
      await assertLocationAccess(context, loc.id);
      scopedLocationIds.add(loc.id);
    } catch {
      /* venue users skip out-of-scope branches */
    }
  }

  const staff = await loadStaffForMatch(context, includeSalary);
  const usedCodes = new Set(staff.map((s) => s.employee_code));
  const matchedIds = new Set<string>();
  const uploadedLocationIds = new Set<string>();
  const lines: PreviewLine[] = [];

  for (const row of parsedRows) {
    const loc = row.locationCode ? locByCode.get(row.locationCode) : undefined;
    if (loc && !scopedLocationIds.has(loc.id)) {
      lines.push({
        rowNumber: row.rowNumber,
        action: "review",
        matchRule: "unmapped_location",
        matchStaffId: null,
        fullName: row.fullName,
        locationCode: row.locationCode,
        warnings: ["Location is outside your access"],
        oldValues: {},
        newValues: {},
        fieldDiffs: [],
      });
      continue;
    }
    if (loc) uploadedLocationIds.add(loc.id);

    const match = matchRosterRow(row, staff, loc?.id ?? null);
    const existing = match.staffId ? staff.find((s) => s.id === match.staffId) ?? null : null;
    const proposed = proposeStaffValues(row, existing, loc?.id ?? null, usedCodes);
    if (isQidShapedCode(proposed.employee_code) || (proposed.qid && proposed.employee_code === proposed.qid)) {
      proposed.employee_code = generateEmployeeCode(row.locationCode ?? "UNK", usedCodes, {
        staffRole: proposed.staff_role,
        jobTitle: proposed.job_title,
      });
    }

    const salaryKept = existing && salaryWouldWipe(existing.monthly_salary_qar, proposed.monthly_salary_qar)
      ? existing.monthly_salary_qar ?? null
      : proposed.monthly_salary_qar;
    const proposedSafe = { ...proposed, monthly_salary_qar: salaryKept };
    const diffs = existing
      ? diffStaffFields(existing, proposedSafe, includeSalary)
      : [];
    const resolved = resolveRowAction(match, diffs);
    if (resolved.staffId) matchedIds.add(resolved.staffId);

    lines.push({
      rowNumber: row.rowNumber,
      action: resolved.action,
      matchRule: resolved.matchRule,
      matchStaffId: resolved.staffId,
      fullName: row.fullName,
      locationCode: row.locationCode,
      warnings: resolved.warnings,
      oldValues: existing
        ? publicNewValues(
            {
              employee_code: existing.employee_code,
              full_name: existing.full_name,
              qid: existing.qid,
              phone: existing.phone,
              location_code: existing.location_code ?? null,
              location_id: existing.location_id,
              job_title: existing.job_title,
              department: existing.department,
              hire_date: existing.hire_date,
              status: existing.status,
              e3_enrolled: existing.e3_enrolled,
              employment_type: existing.employment_type as ProposedStaffValues["employment_type"],
              staff_role: existing.staff_role as ProposedStaffValues["staff_role"],
              source_row_no: null,
              monthly_salary_qar: existing.monthly_salary_qar ?? null,
            },
            includeSalary,
          )
        : {},
      newValues: publicNewValues(proposedSafe, includeSalary),
      fieldDiffs: diffs,
    });
  }

  const missing: PreviewLine[] = [];
  const inScopeMissing = staff.filter((s) => {
    if (s.deleted_at) return false;
    if (s.is_roaming) return false;
    if (!uploadedLocationIds.has(s.location_id)) return false;
    if (matchedIds.has(s.id)) return false;
    return scopedLocationIds.has(s.location_id);
  });

  for (const s of inScopeMissing) {
    const referenced = extras.mode === "authoritative_replace" ? await staffIsReferenced(context, s.id) : true;
    const hard = extras.mode === "authoritative_replace" && extras.confirmHardDelete && !referenced;
    missing.push({
      rowNumber: 0,
      action: hard ? "delete" : "archive",
      matchRule: "missing_from_sheet",
      matchStaffId: s.id,
      fullName: s.full_name,
      locationCode: s.location_code ?? null,
      warnings: hard
        ? ["Unreferenced — will be permanently deleted after confirmation"]
        : ["Present in directory for an uploaded location but missing from the sheet"],
      oldValues: { status: s.status, employee_code: s.employee_code },
      newValues: hard ? { deleted: true } : { status: "terminated", archived: true },
      fieldDiffs: [],
      referenced,
    });
  }

  const all = [...lines, ...missing];
  const count = (action: RosterRowAction) => all.filter((r) => r.action === action).length;
  return {
    mode: extras.mode,
    canHardDelete: extras.mode === "authoritative_replace" && canAuthoritative(roles),
    counts: {
      create: count("create"),
      update: count("update"),
      unchanged: count("unchanged"),
      archive: count("archive"),
      delete: count("delete"),
      review: count("review"),
      skippedEmpty: extras.skippedEmpty,
    },
    rows: lines,
    missing,
    mapping: extras.mapping,
    worksheetName: extras.worksheetName,
    errors: extras.errors,
  };
}

async function snapshotStaff(context: AuthContext, batchId: string, staffId: string) {
  const { data: row, error } = await context.supabase.from("staff").select("*").eq("id", staffId).maybeSingle();
  if (error) throw error;
  let compensation = null;
  if (canViewSalary(context.roles ?? [])) {
    const { data: comp } = await context.supabase
      .from("staff_compensation")
      .select("*")
      .eq("staff_id", staffId)
      .maybeSingle();
    compensation = comp ?? null;
  }
  const { error: snapErr } = await context.supabase.from("staff_import_snapshots").upsert(
    {
      batch_id: batchId,
      staff_id: staffId,
      before: { staff: row, compensation } as unknown as Json,
    },
    { onConflict: "batch_id,staff_id" },
  );
  if (snapErr) throw snapErr;
}

async function writeSalary(
  context: AuthContext,
  staffId: string,
  monthly: number | null,
) {
  if (!canEditSalary(context.roles ?? [])) return;
  if (monthly == null) return;
  const { error } = await context.supabase.from("staff_compensation").upsert({
    staff_id: staffId,
    monthly_salary_qar: monthly,
    updated_by: context.userId,
  });
  if (error) throw error;
}

async function audit(
  context: AuthContext,
  action: string,
  rowId: string,
  after: Record<string, unknown>,
  locationId?: string | null,
) {
  await context.supabase.rpc("log_audit", {
    _action: action,
    _table_name: "staff",
    _row_id: rowId,
    _after: after as unknown as Json,
    _metadata: {},
    _location_id: locationId ?? undefined,
  });
}

export async function applyRosterPreview(
  context: AuthContext,
  batchId: string,
  preview: RosterPreview,
): Promise<{ applied: boolean; counts: RosterPreview["counts"] }> {
  const roles = context.roles ?? [];
  assertRosterImportMode(roles, preview.mode, preview.canHardDelete && preview.counts.delete > 0);

  await context.supabase
    .from("staff_import_batches")
    .update({ status: "queued", started_at: new Date().toISOString() })
    .eq("id", batchId);

  const applyable = [...preview.rows, ...preview.missing].filter((r) => r.action !== "review" && r.action !== "unchanged");

  try {
    for (const line of applyable) {
      if (line.action === "create") {
        const next = line.newValues;
        const locationId = String(next.location_id ?? "");
        if (!locationId) throw new Error(`Row ${line.rowNumber}: missing location`);
        const employeeCode = String(next.employee_code ?? "");
        if (!employeeCode || isQidShapedCode(employeeCode) || employeeCode === String(next.qid ?? "")) {
          throw new Error(`Row ${line.rowNumber}: employee_code must be an internal staff code, not a QID`);
        }
        const id = staffUuid(employeeCode);
        const { error } = await context.supabase.from("staff").insert({
          id,
          location_id: locationId,
          employee_code: employeeCode,
          full_name: String(next.full_name ?? line.fullName),
          qid: (next.qid as string | null) ?? null,
          phone: (next.phone as string | null) ?? null,
          job_title: (next.job_title as string | null) ?? null,
          department: (next.department as string | null) ?? null,
          hire_date: (next.hire_date as string | null) ?? null,
          status: String(next.status ?? "active"),
          e3_enrolled: (next.e3_enrolled as boolean | null) ?? null,
          employment_type: (next.employment_type as string | null) ?? null,
          staff_role: (next.staff_role as ProposedStaffValues["staff_role"]) ?? null,
          source_row_no: (next.source_row_no as number | null) ?? null,
        });
        if (error) throw error;
        const { error: snapErr } = await context.supabase.from("staff_import_snapshots").upsert(
          {
            batch_id: batchId,
            staff_id: id,
            before: { staff: null, created: true } as unknown as Json,
          },
          { onConflict: "batch_id,staff_id" },
        );
        if (snapErr) throw snapErr;
        await writeSalary(context, id, (next.monthly_salary_qar as number | null) ?? null);
        await audit(context, "staff.created", id, next, locationId);
      } else if (line.action === "update" && line.matchStaffId) {
        await snapshotStaff(context, batchId, line.matchStaffId);
        const next = line.newValues;
        const nextCode = String(next.employee_code ?? "");
        const oldCode = String(line.oldValues.employee_code ?? "");
        const rewriteCode =
          nextCode &&
          nextCode !== oldCode &&
          !isQidShapedCode(nextCode) &&
          nextCode !== String(next.qid ?? "");
        const { error } = await context.supabase
          .from("staff")
          .update({
            full_name: String(next.full_name ?? line.fullName),
            qid: (next.qid as string | null) ?? undefined,
            phone: (next.phone as string | null) ?? undefined,
            job_title: (next.job_title as string | null) ?? undefined,
            department: (next.department as string | null) ?? undefined,
            hire_date: (next.hire_date as string | null) ?? undefined,
            status: String(next.status ?? "active"),
            e3_enrolled: (next.e3_enrolled as boolean | null) ?? undefined,
            employment_type: (next.employment_type as string | null) ?? undefined,
            staff_role: (next.staff_role as ProposedStaffValues["staff_role"]) ?? undefined,
            source_row_no: (next.source_row_no as number | null) ?? undefined,
            location_id: (next.location_id as string | null) ?? undefined,
            ...(rewriteCode ? { employee_code: nextCode } : {}),
          })
          .eq("id", line.matchStaffId);
        if (error) throw error;
        await writeSalary(context, line.matchStaffId, (next.monthly_salary_qar as number | null) ?? null);
        await audit(context, "staff.updated", line.matchStaffId, next, next.location_id as string | undefined);
      } else if (line.action === "archive" && line.matchStaffId) {
        await snapshotStaff(context, batchId, line.matchStaffId);
        const { error } = await context.supabase
          .from("staff")
          .update({ status: "terminated", deleted_at: new Date().toISOString() })
          .eq("id", line.matchStaffId);
        if (error) throw error;
        await audit(context, "staff.archived", line.matchStaffId, { status: "terminated" });
      } else if (line.action === "delete" && line.matchStaffId) {
        if (!preview.canHardDelete) {
          throw new ForbiddenError("Hard delete was not confirmed.");
        }
        const referenced = await staffIsReferenced(context, line.matchStaffId);
        if (referenced) {
          await snapshotStaff(context, batchId, line.matchStaffId);
          const { error } = await context.supabase
            .from("staff")
            .update({ status: "terminated", deleted_at: new Date().toISOString() })
            .eq("id", line.matchStaffId);
          if (error) throw error;
          await audit(context, "staff.archived", line.matchStaffId, { status: "terminated", reason: "referenced" });
        } else {
          await snapshotStaff(context, batchId, line.matchStaffId);
          const { error } = await context.supabase.from("staff").delete().eq("id", line.matchStaffId);
          if (error) throw error;
          await audit(context, "staff.deleted", line.matchStaffId, { deleted: true });
        }
      }
    }

    await context.supabase
      .from("staff_import_batches")
      .update({
        status: "applied",
        completed_at: new Date().toISOString(),
        create_count: preview.counts.create,
        update_count: preview.counts.update,
        unchanged_count: preview.counts.unchanged,
        archive_count: preview.counts.archive,
        delete_count: preview.counts.delete,
        review_count: preview.counts.review,
        row_count: preview.rows.length + preview.missing.length,
        summary: {
          worksheetName: preview.worksheetName,
          mapping: preview.mapping,
          mode: preview.mode,
        } as unknown as Json,
      })
      .eq("id", batchId);

    await audit(context, "staff.import_executed", batchId, {
      mode: preview.mode,
      counts: preview.counts,
    });

    return { applied: true, counts: preview.counts };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    await rollbackRosterBatch(context, batchId, { silent: true });
    await context.supabase
      .from("staff_import_batches")
      .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", batchId);
    throw e;
  }
}

export async function rollbackRosterBatch(
  context: AuthContext,
  batchId: string,
  opts?: { silent?: boolean },
): Promise<{ ok: true }> {
  const { data: snaps, error } = await context.supabase
    .from("staff_import_snapshots")
    .select("staff_id, before")
    .eq("batch_id", batchId);
  if (error) throw error;

  for (const snap of snaps ?? []) {
    const before = snap.before as {
      staff?: Record<string, unknown> | null;
      compensation?: Record<string, unknown> | null;
      created?: boolean;
    };
    if (!before.staff || before.created) {
      await context.supabase.from("staff").delete().eq("id", snap.staff_id);
      continue;
    }
    const { error: upErr } = await context.supabase.from("staff").upsert(before.staff as never);
    if (upErr) throw upErr;
    if (before.compensation && canEditSalary(context.roles ?? [])) {
      await context.supabase.from("staff_compensation").upsert(before.compensation as never);
    }
  }

  if (!opts?.silent) {
    await context.supabase
      .from("staff_import_batches")
      .update({ status: "rolled_back", rolled_back_at: new Date().toISOString() })
      .eq("id", batchId);
    await audit(context, "staff.import_rollback", batchId, {});
  }
  return { ok: true };
}
