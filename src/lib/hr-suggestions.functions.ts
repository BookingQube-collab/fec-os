"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import { findUsersWithCapability, notifyUsers } from "@/lib/notifications/action-notify";
import {
  canReviewStaffSuggestions,
  SUGGESTION_CATEGORIES,
  SUGGESTION_STATUSES,
  type SuggestionCategory,
  type SuggestionStatus,
} from "@/lib/hr-suggestions";
import { ForbiddenError } from "@/lib/server/authorize";
import { createAuthenticatedAction } from "@/lib/server/create-action";

const categorySchema = z.enum(SUGGESTION_CATEGORIES).nullable().optional();
const statusSchema = z.enum(SUGGESTION_STATUSES);

type SuggestionLocation = { code?: string | null; name?: string | null };

type SuggestionStaff = {
  full_name?: string | null;
  employee_code?: string | null;
  job_title?: string | null;
  location_id?: string | null;
  locations?: SuggestionLocation | SuggestionLocation[] | null;
};

type SuggestionRow = {
  id: string;
  staff_id: string;
  user_id: string;
  title: string;
  body: string;
  category: string | null;
  status: string;
  admin_note: string | null;
  seen_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  staff?: SuggestionStaff | SuggestionStaff[] | null;
};

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

function pickStaff(staff: SuggestionRow["staff"]): SuggestionStaff | null {
  if (!staff) return null;
  return Array.isArray(staff) ? (staff[0] ?? null) : staff;
}

function pickLocation(locations: SuggestionStaff["locations"]): SuggestionLocation | null {
  if (!locations) return null;
  return Array.isArray(locations) ? (locations[0] ?? null) : locations;
}

function mapSuggestion(row: SuggestionRow) {
  const staff = pickStaff(row.staff);
  const location = pickLocation(staff?.locations);
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    userId: String(row.user_id),
    title: String(row.title),
    body: String(row.body),
    category: (row.category as SuggestionCategory | null) ?? null,
    status: row.status as SuggestionStatus,
    adminNote: row.admin_note ? String(row.admin_note) : null,
    seenAt: row.seen_at ? String(row.seen_at) : null,
    closedAt: row.closed_at ? String(row.closed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    staffName: staff?.full_name ? String(staff.full_name) : null,
    employeeCode: staff?.employee_code ? String(staff.employee_code) : null,
    jobTitle: staff?.job_title ? String(staff.job_title) : null,
    locationId: staff?.location_id ? String(staff.location_id) : null,
    locationCode: location?.code ? String(location.code) : null,
    locationName: location?.name ? String(location.name) : null,
  };
}

async function requireSuggestionInbox(context: {
  roles?: string[];
  access?: {
    jobTitle?: string | null;
    staffRole?: string | null;
    department?: string | null;
    staffId?: string | null;
    employeeCode?: string | null;
    email?: string | null;
    fullName?: string | null;
  };
}) {
  if (!canReviewStaffSuggestions(context.roles ?? [], context.access ?? null)) {
    throw new ForbiddenError("Only Admin and Head of Operations can review suggestions.");
  }
}

async function loadSuggestionNotifyUserIds(excludeUserId?: string | null): Promise<string[]> {
  const ids = new Set<string>();
  for (const userId of await findUsersWithCapability("admin.view")) {
    if (userId && userId !== excludeUserId) ids.add(userId);
  }
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("user_id, job_title")
    .is("deleted_at", null)
    .not("user_id", "is", null)
    .ilike("job_title", "%head of operations%");
  if (error) {
    console.warn("[suggestions] HOO notify lookup failed", error.message);
  } else {
    for (const row of data ?? []) {
      const userId = row.user_id as string | null;
      if (!userId || userId === excludeUserId) continue;
      if (isHeadOfOperationsTitle(row.job_title as string | null)) ids.add(userId);
    }
  }
  return [...ids];
}

export const listMySuggestions = createAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    const { data: rows, error } = await context.supabase
      .from("hr_suggestions")
      .select(
        "id, staff_id, user_id, title, body, category, status, admin_note, seen_at, closed_at, created_at, updated_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((row) => mapSuggestion(row as SuggestionRow));
  },
  { auth: { capability: "hr.employee_app" } },
);

export const submitSuggestion = createAuthenticatedAction(
  z.object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(4000),
    category: categorySchema,
  }),
  async (data, context) => {
    const linked = await loadLinkedStaffRecord(context.userId);
    if (!linked?.id) {
      throw new ForbiddenError("Your login is not linked to a staff record.");
    }

    const { data: row, error } = await context.supabase
      .from("hr_suggestions")
      .insert({
        staff_id: linked.id,
        user_id: context.userId,
        title: data.title,
        body: data.body,
        category: data.category ?? null,
        status: "new",
      })
      .select("id")
      .single();
    if (error) throw error;

    try {
      const notifyIds = await loadSuggestionNotifyUserIds(context.userId);
      await notifyUsers({
        userIds: notifyIds,
        excludeUserId: context.userId,
        category: "hr_suggestions",
        title: "New staff suggestion",
        body: data.title,
        actionUrl: "/people/suggestions",
        sourceType: "hr_suggestion",
        sourceId: String(row.id),
        severity: "info",
      });
    } catch (err) {
      console.warn("[suggestions] notify failed", err instanceof Error ? err.message : err);
    }

    return { id: String(row.id) };
  },
  { auth: { capability: "hr.employee_app" } },
);

const INBOX_STAFF_SELECT =
  "staff(full_name, employee_code, job_title, location_id, locations!staff_location_id_fkey(code, name))";

export const listSuggestionInbox = createAuthenticatedAction(
  z.object({
    status: statusSchema.optional(),
    category: z.enum(SUGGESTION_CATEGORIES).optional(),
    locationId: z.string().uuid().optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  async (data, context) => {
    await requireSuggestionInbox(context);

    let q = context.supabase
      .from("hr_suggestions")
      .select(
        `id, staff_id, user_id, title, body, category, status, admin_note, seen_at, closed_at, created_at, updated_at, ${INBOX_STAFF_SELECT}`,
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.category) q = q.eq("category", data.category);
    if (data.dateFrom) q = q.gte("created_at", `${data.dateFrom}T00:00:00.000Z`);
    if (data.dateTo) q = q.lte("created_at", `${data.dateTo}T23:59:59.999Z`);

    const { data: rows, error } = await q;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }

    let mapped = (rows ?? []).map((row) => mapSuggestion(row as SuggestionRow));
    if (data.locationId) {
      mapped = mapped.filter((row) => row.locationId === data.locationId);
    }
    return mapped;
  },
  { auth: { capability: "admin.view" } },
);

export const updateSuggestionStatus = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    status: statusSchema,
    adminNote: z.string().trim().min(1).max(2000).nullable().optional(),
  }),
  async (data, context) => {
    await requireSuggestionInbox(context);

    const { data: existing, error: loadError } = await context.supabase
      .from("hr_suggestions")
      .select("id, user_id, title, status, admin_note")
      .eq("id", data.id)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!existing) {
      throw new ForbiddenError("Suggestion not found.");
    }

    const prevStatus = String(existing.status) as SuggestionStatus;
    const prevNote = existing.admin_note ? String(existing.admin_note) : null;
    const nextNote = data.adminNote !== undefined ? data.adminNote : prevNote;
    const statusChanged = prevStatus !== data.status;
    const noteChanged = data.adminNote !== undefined && (data.adminNote ?? null) !== prevNote;

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: data.status,
      updated_at: now,
    };
    if (data.adminNote !== undefined) {
      patch.admin_note = data.adminNote;
    }
    if (data.status === "seen") {
      patch.seen_at = now;
      patch.seen_by = context.userId;
      patch.closed_at = null;
      patch.closed_by = null;
    }
    if (data.status === "closed") {
      patch.closed_at = now;
      patch.closed_by = context.userId;
    }
    if (data.status === "new") {
      patch.seen_at = null;
      patch.seen_by = null;
      patch.closed_at = null;
      patch.closed_by = null;
    }

    const { error } = await context.supabase.from("hr_suggestions").update(patch).eq("id", data.id);
    if (error) throw error;

    const submitterId = existing.user_id ? String(existing.user_id) : null;
    const shouldNotify =
      Boolean(submitterId) &&
      ((statusChanged && (data.status === "seen" || data.status === "closed")) || noteChanged);

    if (shouldNotify && submitterId) {
      try {
        const suggestionTitle = String(existing.title);
        let title = "Update on your suggestion";
        let body = suggestionTitle;
        if (statusChanged && data.status === "seen") {
          title = "Your suggestion was seen";
          body = nextNote ? `${suggestionTitle} — ${nextNote}` : suggestionTitle;
        } else if (statusChanged && data.status === "closed") {
          title = "Your suggestion was closed";
          body = nextNote ? `${suggestionTitle} — ${nextNote}` : suggestionTitle;
        } else if (noteChanged) {
          title = "New reply on your suggestion";
          body = nextNote ? `${suggestionTitle} — ${nextNote}` : suggestionTitle;
        }
        await notifyUsers({
          userIds: [submitterId],
          excludeUserId: context.userId,
          category: "hr_suggestions",
          title,
          body,
          actionUrl: "/hr/me#me-suggestions",
          sourceType: "hr_suggestion",
          sourceId: String(existing.id),
          severity: "info",
        });
      } catch (err) {
        console.warn("[suggestions] staff notify failed", err instanceof Error ? err.message : err);
      }
    }

    return { ok: true as const };
  },
  { auth: { capability: "admin.view" } },
);
