"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  bothStaffHavePunches,
  DUPLICATE_MERGE_FIELDS,
  duplicateDeleteDecision,
  fieldsCopiedOnMerge,
  suggestDuplicateKeepId,
} from "@/lib/staff-duplicate-action";
import { createAuthenticatedAction } from "@/lib/server/create-action";
import type { AuthContext } from "@/lib/server/create-action";

const pairSchema = z
  .object({
    leftId: z.string().uuid(),
    rightId: z.string().uuid(),
  })
  .refine((value) => value.leftId !== value.rightId, { message: "duplicate:same_person" });

const mergeSchema = z
  .object({
    keepId: z.string().uuid(),
    dropId: z.string().uuid(),
  })
  .refine((value) => value.keepId !== value.dropId, { message: "duplicate:same_person" });

const STAFF_COLUMNS =
  "id, full_name, employee_code, job_title, department, phone, email, qid, employment_type, hire_date, user_id, location_id, locations!staff_location_id_fkey(code, name)";

const PROFILE_COLUMNS =
  "staff_id, nationality, passport_number, gender, sponsorship_info, date_of_birth, ticket_eligibility, passport_expiry, qid_expiry";

type StaffPreviewRow = {
  id: string;
  full_name: string;
  employee_code: string;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  qid: string | null;
  employment_type: string | null;
  hire_date: string | null;
  user_id: string | null;
  location_id: string;
  locations: { code?: string | null; name?: string | null } | { code?: string | null; name?: string | null }[] | null;
};

export type StaffDuplicateCandidate = {
  id: string;
  fullName: string;
  employeeCode: string;
  jobTitle: string | null;
  locationLabel: string;
};

export type StaffDuplicatePerson = StaffDuplicateCandidate & {
  punchCount: number;
};

export type StaffDuplicatePreview = {
  left: StaffDuplicatePerson;
  right: StaffDuplicatePerson;
  suggestedKeepId: string;
  copiedFieldKeysByKeepId: Record<string, string[]>;
  bothHavePunches: boolean;
};

function duplicateError(code: string, detail?: string): Error {
  return new Error(detail ? `duplicate:${code}:${detail}` : `duplicate:${code}`);
}

function locationLabel(locations: StaffPreviewRow["locations"]): string {
  const row = Array.isArray(locations) ? locations[0] : locations;
  if (!row) return "";
  const code = typeof row.code === "string" ? row.code : "";
  const name = typeof row.name === "string" ? row.name : "";
  return [code, name].filter(Boolean).join(" · ");
}

function asStaffRow(value: unknown): StaffPreviewRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as StaffPreviewRow;
  if (!row.id || !row.employee_code || !row.full_name || !row.location_id) return null;
  return row;
}

async function requireVisibleStaff(context: AuthContext, id: string): Promise<StaffPreviewRow> {
  const { data, error } = await context.supabase
    .from("staff")
    .select(STAFF_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = asStaffRow(data);
  if (!row) throw duplicateError("not_found");
  return row;
}

async function countPunches(staffId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("attendance_logs")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", staffId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function loadProfiles(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const { data, error } = await supabaseAdmin.from("staff_profile_ext").select(PROFILE_COLUMNS).in("staff_id", ids);
  if (error) throw new Error(error.message);
  const byStaff = new Map<string, Record<string, unknown>>();
  for (const row of data ?? []) {
    const staffId = typeof row.staff_id === "string" ? row.staff_id : "";
    if (!staffId) continue;
    byStaff.set(staffId, row as Record<string, unknown>);
  }
  return byStaff;
}

function mergeFieldSource(staff: StaffPreviewRow, profile: Record<string, unknown> | undefined): Record<string, unknown> {
  return {
    qid: staff.qid,
    hire_date: staff.hire_date,
    job_title: staff.job_title,
    department: staff.department,
    phone: staff.phone,
    email: staff.email,
    employment_type: staff.employment_type,
    user_id: staff.user_id,
    nationality: profile?.nationality ?? null,
    passport_number: profile?.passport_number ?? null,
    gender: profile?.gender ?? null,
    sponsorship_info: profile?.sponsorship_info ?? null,
    date_of_birth: profile?.date_of_birth ?? null,
    ticket_eligibility: profile?.ticket_eligibility ?? null,
    passport_expiry: profile?.passport_expiry ?? null,
    qid_expiry: profile?.qid_expiry ?? null,
  };
}

function toPerson(staff: StaffPreviewRow, punchCount: number): StaffDuplicatePerson {
  return {
    id: staff.id,
    fullName: staff.full_name,
    employeeCode: staff.employee_code,
    jobTitle: staff.job_title,
    locationLabel: locationLabel(staff.locations),
    punchCount,
  };
}

async function loadPair(context: AuthContext, leftId: string, rightId: string) {
  const [left, right] = await Promise.all([
    requireVisibleStaff(context, leftId),
    requireVisibleStaff(context, rightId),
  ]);
  const [leftPunches, rightPunches, profiles] = await Promise.all([
    countPunches(left.id),
    countPunches(right.id),
    loadProfiles([left.id, right.id]),
  ]);
  return { left, right, leftPunches, rightPunches, profiles };
}

export const searchStaffDuplicateCandidates = createAuthenticatedAction(
  z.object({
    query: z.string().trim().min(2).max(80),
    excludeId: z.string().uuid().optional(),
  }),
  async ({ query, excludeId }, context) => {
    const safe = query.replace(/[%_,]/g, "").trim();
    if (safe.length < 2) return [] as StaffDuplicateCandidate[];
    let request = context.supabase
      .from("staff")
      .select("id, full_name, employee_code, job_title, locations!staff_location_id_fkey(code, name)")
      .is("deleted_at", null)
      .or(`full_name.ilike.%${safe}%,employee_code.ilike.%${safe}%`)
      .order("full_name")
      .limit(20);
    if (excludeId) request = request.neq("id", excludeId);
    const { data, error } = await request;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      employeeCode: row.employee_code,
      jobTitle: row.job_title,
      locationLabel: locationLabel(row.locations as StaffPreviewRow["locations"]),
    }));
  },
  { auth: { capability: "people.edit_roster" } },
);

export const previewStaffDuplicatePair = createAuthenticatedAction(
  pairSchema,
  async ({ leftId, rightId }, context): Promise<StaffDuplicatePreview> => {
    const pair = await loadPair(context, leftId, rightId);
    const leftFields = mergeFieldSource(pair.left, pair.profiles.get(pair.left.id));
    const rightFields = mergeFieldSource(pair.right, pair.profiles.get(pair.right.id));
    const suggestedKeepId = suggestDuplicateKeepId(
      { id: pair.left.id, employeeCode: pair.left.employee_code, punchCount: pair.leftPunches },
      { id: pair.right.id, employeeCode: pair.right.employee_code, punchCount: pair.rightPunches },
    );
    return {
      left: toPerson(pair.left, pair.leftPunches),
      right: toPerson(pair.right, pair.rightPunches),
      suggestedKeepId,
      copiedFieldKeysByKeepId: {
        [pair.left.id]: fieldsCopiedOnMerge(leftFields, rightFields, DUPLICATE_MERGE_FIELDS),
        [pair.right.id]: fieldsCopiedOnMerge(rightFields, leftFields, DUPLICATE_MERGE_FIELDS),
      },
      bothHavePunches: bothStaffHavePunches(pair.leftPunches, pair.rightPunches),
    };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const mergeStaffDuplicatePair = createAuthenticatedAction(
  mergeSchema,
  async ({ keepId, dropId }, context) => {
    const pair = await loadPair(context, keepId, dropId);
    const keep = pair.left.id === keepId ? pair.left : pair.right;
    const drop = pair.left.id === dropId ? pair.left : pair.right;
    const keepPunches = pair.left.id === keepId ? pair.leftPunches : pair.rightPunches;
    const dropPunches = pair.left.id === dropId ? pair.leftPunches : pair.rightPunches;

    const { error } = await supabaseAdmin.rpc("merge_staff_into", {
      keep_id: keep.id,
      drop_id: drop.id,
    });
    if (error) throw new Error(error.message);

    const { error: auditError } = await context.supabase.rpc("log_audit", {
      _action: "staff.duplicate_merged",
      _table_name: "staff",
      _row_id: keep.id,
      _before: { dropped_staff_id: drop.id, dropped_employee_code: drop.employee_code },
      _after: { kept_employee_code: keep.employee_code, punches_on_dropped: dropPunches },
      _location_id: keep.location_id,
      _metadata: { keep_punches: keepPunches, drop_punches: dropPunches },
    });
    if (auditError) throw new Error(auditError.message);
    return { ok: true as const };
  },
  { auth: { capability: "people.edit_roster" } },
);

export const deleteDuplicateStaff = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    confirmedPunchCount: z.number().int().min(0).max(1_000_000),
  }),
  async ({ id, confirmedPunchCount }, context) => {
    const staff = await requireVisibleStaff(context, id);
    const punchCount = await countPunches(staff.id);
    const decision = duplicateDeleteDecision({ punchCount, confirmedPunchCount });
    if (!decision.allow) {
      if (decision.code === "has_punches") throw duplicateError("has_punches", String(punchCount));
      throw duplicateError("punch_count_mismatch");
    }

    const { error } = await supabaseAdmin.from("staff").delete().eq("id", staff.id).is("deleted_at", null);
    if (error) {
      if (error.code === "23503") throw duplicateError("linked_records");
      throw new Error(error.message);
    }

    const { error: auditError } = await context.supabase.rpc("log_audit", {
      _action: "staff.duplicate_deleted",
      _table_name: "staff",
      _row_id: staff.id,
      _before: { employee_code: staff.employee_code, punch_count: punchCount },
      _after: {},
      _location_id: staff.location_id,
      _metadata: {},
    });
    if (auditError) throw new Error(auditError.message);
    return { ok: true as const };
  },
  { auth: { capability: "people.edit_roster" } },
);
