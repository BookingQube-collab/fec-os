import { CLOSED_TASK_STATUSES } from "@/lib/events/constants";
import {
  inboxUnreadCount,
  mergeInboxItems,
  type ActionInboxPayload,
  type InboxItem,
  type InboxItemKind,
  type InboxSeverity,
} from "@/lib/notifications/inbox";
import { resolvePrActions } from "@/lib/procurement/actions";
import { reviseRequisitionPath } from "@/lib/procurement/display";
import { PENDING_STATUSES } from "@/lib/procurement/dashboard";
import { canUserDo, type AppRole } from "@/lib/rbac";
import type { AuthContext } from "@/lib/server/auth";

const OPEN_MAINT = ["submitted", "accepted", "in_progress"] as const;
const OPEN_WO = ["planned", "in_progress", "on_hold"] as const;
const OPEN_SNAG = new Set(["open", "assigned", "in_progress", "waiting_vendor", "waiting_approval", "reopened"]);
const CLOSED_SNAG = new Set(["resolved", "verified", "closed"]);

function asIso(value: unknown, fallback = new Date().toISOString()): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function item(partial: Omit<InboxItem, "titleParams"> & { titleParams?: Record<string, string> }): InboxItem {
  return { titleParams: {}, ...partial };
}

async function settled<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

async function currentStaffId(context: AuthContext): Promise<string | null> {
  const { data } = await context.supabase
    .from("staff")
    .select("id")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.id ?? null;
}

async function fetchPersisted(context: AuthContext): Promise<InboxItem[]> {
  const { data, error } = await context.supabase
    .from("notifications")
    .select("id, category, title, body, severity, action_url, read_at, created_at, source_type, source_id")
    .eq("user_id", context.userId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data ?? []).map((row) =>
    item({
      id: `notif:${row.id}`,
      kind: "notification",
      category: row.category,
      title: row.title,
      titleKey: null,
      body: row.body,
      severity: (row.severity as InboxSeverity) || "info",
      actionUrl: row.action_url || "/notifications",
      readAt: row.read_at,
      createdAt: row.created_at,
      sourceType: (row.source_type as string | null) ?? null,
      sourceId: (row.source_id as string | null) ?? null,
      persisted: true,
    }),
  );
}

async function fetchPrItems(context: AuthContext, roles: AppRole[]): Promise<InboxItem[]> {
  if (!canUserDo(roles, "procurement.view")) return [];
  const { data, error } = await context.supabase
    .from("purchase_requisitions")
    .select("id, pr_number, requested_by, justification, status, current_step_role, priority, created_at, updated_at")
    .in("status", [...PENDING_STATUSES, "returned", "rejected", "on_hold"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const items: InboxItem[] = [];
  for (const row of data ?? []) {
    const flags = resolvePrActions({
      status: row.status,
      currentStepRole: row.current_step_role,
      requestedBy: row.requested_by,
      userId: context.userId,
      roles,
    });
    const number = row.pr_number?.trim() || "PR";
    const purpose = (row.justification ?? "").slice(0, 80);
    const createdAt = (row.updated_at as string | undefined) || row.created_at;
    const base = {
      id: `pr:${row.id}`,
      kind: "procurement" as const,
      category: "procurement",
      body: purpose || null,
      actionUrl: flags.canEdit ? reviseRequisitionPath(row.id) : `/procurement/requisitions/${row.id}`,
      readAt: null,
      createdAt,
      sourceType: "purchase_requisitions",
      sourceId: row.id,
      persisted: false,
      titleParams: { number },
    };

    if (flags.canAct) {
      items.push(
        item({
          ...base,
          title: `Purchase request ${number} needs your approval`,
          titleKey: "inbox.prApprove",
          severity: row.priority === "emergency" || row.priority === "high" ? "critical" : "warning",
        }),
      );
      continue;
    }
    if (flags.canReissue || (flags.isOwner && (row.status === "returned" || row.status === "rejected"))) {
      const returned = row.status === "returned";
      items.push(
        item({
          ...base,
          title: returned
            ? `Purchase request ${number} was returned to you`
            : `Purchase request ${number} was rejected`,
          titleKey: returned ? "inbox.prReturned" : "inbox.prRejected",
          severity: "warning",
        }),
      );
    }
  }
  return items.slice(0, 20);
}

async function fetchMaintenanceItems(context: AuthContext, roles: AppRole[]): Promise<InboxItem[]> {
  if (!canUserDo(roles, "maintenance.view") && !canUserDo(roles, "maintenance.request_submit")) return [];
  const canTriage = canUserDo(roles, "maintenance.manage");
  const { data, error } = await context.supabase
    .from("maintenance_requests")
    .select("id, request_number, description, assigned_technician_id, status, created_at, priority")
    .is("deleted_at", null)
    .in("status", OPEN_MAINT)
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;

  const items: InboxItem[] = [];
  for (const row of data ?? []) {
    const assignedToMe = row.assigned_technician_id === context.userId;
    const pendingTriage = canTriage && row.status === "submitted";
    if (!assignedToMe && !pendingTriage) continue;
    const number = row.request_number?.trim() || "MR";
    items.push(
      item({
        id: `maint:${row.id}`,
        kind: "maintenance",
        category: "maintenance",
        title: assignedToMe
          ? `Maintenance request ${number} assigned to you`
          : `New maintenance request ${number} needs review`,
        titleKey: assignedToMe ? "inbox.maintAssigned" : "inbox.maintPending",
        titleParams: { number },
        body: (row.description ?? "").slice(0, 120) || null,
        severity: row.priority === "urgent" ? "critical" : "warning",
        actionUrl: `/maintenance/requests?id=${row.id}`,
        readAt: null,
        createdAt: row.created_at,
        sourceType: "maintenance_requests",
        sourceId: row.id,
        persisted: false,
      }),
    );
  }
  return items.slice(0, 15);
}

async function fetchWorkOrderItems(context: AuthContext, roles: AppRole[]): Promise<InboxItem[]> {
  if (!canUserDo(roles, "maintenance.view")) return [];
  const { data, error } = await context.supabase
    .from("work_orders")
    .select("id, title, job_order_number, status, created_at, priority")
    .is("deleted_at", null)
    .eq("assigned_to", context.userId)
    .in("status", OPEN_WO)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data ?? []).slice(0, 12).map((row) => {
    const number = row.job_order_number?.trim() || row.title || "WO";
    return item({
      id: `wo:${row.id}`,
      kind: "work_order",
      category: "maintenance",
      title: `Work order ${number} assigned to you`,
      titleKey: "inbox.woAssigned",
      titleParams: { number },
      body: row.title,
      severity: ["urgent", "high"].includes(String(row.priority)) ? "critical" : "warning",
      actionUrl: "/maintenance",
      readAt: null,
      createdAt: row.created_at,
      sourceType: "work_orders",
      sourceId: row.id,
      persisted: false,
    });
  });
}

async function fetchEventTaskItems(context: AuthContext, roles: AppRole[], staffId: string | null): Promise<InboxItem[]> {
  if (!staffId || !canUserDo(roles, "events.view")) return [];
  const { data, error } = await context.supabase
    .from("event_tasks")
    .select("id, event_id, title, status, priority, due_date, start_date")
    .is("deleted_at", null)
    .or(`owner_staff_id.eq.${staffId},assignee_staff_id.eq.${staffId}`)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(80);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => !CLOSED_TASK_STATUSES.has(row.status))
    .slice(0, 12)
    .map((row) =>
      item({
        id: `event-task:${row.id}`,
        kind: "event_task",
        category: "events",
        title: `Event task: ${row.title}`,
        titleKey: "inbox.eventTask",
        titleParams: { title: row.title },
        body: row.due_date ? `Due ${row.due_date}` : null,
        severity: row.priority === "critical" || row.priority === "urgent" ? "critical" : "warning",
        actionUrl: `/events/${row.event_id}/plan`,
        readAt: null,
        createdAt: row.due_date ?? row.start_date ?? new Date().toISOString(),
        sourceType: "event_tasks",
        sourceId: row.id,
        persisted: false,
      }),
    );
}

async function fetchSnagItems(context: AuthContext, roles: AppRole[]): Promise<InboxItem[]> {
  if (!canUserDo(roles, "snags.view")) return [];
  const canVerify = canUserDo(roles, "snags.verify");
  const { data, error } = await context.supabase
    .from("snag_items")
    .select("id, snag_number, description, status, assigned_to, created_at, severity")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => {
      if (CLOSED_SNAG.has(row.status)) return false;
      if (row.assigned_to === context.userId && OPEN_SNAG.has(row.status)) return true;
      if (canVerify && row.status === "waiting_approval") return true;
      return false;
    })
    .slice(0, 10)
    .map((row) => {
      const number = row.snag_number?.trim() || "SNAG";
      const waiting = row.status === "waiting_approval";
      return item({
        id: `snag:${row.id}`,
        kind: "snag",
        category: "snag",
        title: waiting ? `Snag ${number} waiting for verification` : `Snag ${number} assigned to you`,
        titleKey: waiting ? "inbox.snagApproval" : "inbox.snagAssigned",
        titleParams: { number },
        body: (row.description ?? "").slice(0, 120) || null,
        severity: row.severity === "critical" || row.severity === "high" ? "critical" : "warning",
        actionUrl: `/snags/${row.id}`,
        readAt: null,
        createdAt: asIso(row.created_at),
        sourceType: "snag_items",
        sourceId: row.id,
        persisted: false,
      });
    });
}

async function fetchWeeklyReportItems(context: AuthContext, roles: AppRole[]): Promise<InboxItem[]> {
  if (!canUserDo(roles, "weekly_reports.review")) return [];
  const { data, error } = await context.supabase
    .from("weekly_reports")
    .select("id, reporting_week_start, status, submitted_by_name, submitted_at, created_at")
    .in("status", ["submitted", "under_review"])
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(12);
  if (error) throw error;
  return (data ?? []).map((row) =>
    item({
      id: `weekly:${row.id}`,
      kind: "weekly_report",
      category: "people",
      title: "Weekly report awaiting review",
      titleKey: "inbox.weeklyReport",
      body: [row.submitted_by_name, row.reporting_week_start].filter(Boolean).join(" · ") || null,
      severity: "warning",
      actionUrl: `/weekly-reports/${row.id}`,
      readAt: null,
      createdAt: asIso(row.submitted_at ?? row.created_at),
      sourceType: "weekly_reports",
      sourceId: row.id,
      persisted: false,
    }),
  );
}

function mapPunchInboxRow(
  row: {
    id: string;
    staff_id: string | null;
    work_date: string | null;
    current_step_role: string | null;
    requested_at: string | null;
    staffName?: string | null;
  },
  actionUrl: string,
): InboxItem {
  const ops = row.current_step_role === "ops";
  const who = (row.staffName ?? "").trim() || "Staff";
  const date = row.work_date ? String(row.work_date).slice(0, 10) : "";
  return item({
    id: `punch:${row.id}`,
    kind: "notification",
    category: "people",
    title: ops ? "Missed punch waiting for operations approval" : "Missed punch request",
    titleKey: null,
    body: ops
      ? `${who} submitted a missed punch${date ? ` for ${date}` : ""}. It is waiting for operations approval.`
      : `${who} submitted a missed punch${date ? ` for ${date}` : ""}. It is waiting for their line manager.`,
    severity: "warning",
    actionUrl,
    readAt: null,
    createdAt: asIso(row.requested_at),
    sourceType: "attendance_corrections",
    sourceId: row.id,
    persisted: false,
  });
}

async function fetchMissedPunchItems(context: AuthContext, roles: AppRole[]): Promise<InboxItem[]> {
  // Estate-wide copy for Admin/CEO observers.
  if (roles.includes("ceo")) {
    const { data, error } = await context.supabase
      .from("attendance_corrections")
      .select("id, staff_id, work_date, current_step_role, requested_at")
      .eq("status", "pending")
      .in("current_step_role", ["manager", "ops"])
      .order("requested_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    const rows = data ?? [];
    const staffIds = [...new Set(rows.map((row) => row.staff_id).filter((id): id is string => Boolean(id)))];
    const names = new Map<string, string>();
    if (staffIds.length) {
      const { data: staff } = await context.supabase.from("staff").select("id, full_name").in("id", staffIds);
      for (const person of staff ?? []) {
        if (person.full_name) names.set(person.id as string, String(person.full_name));
      }
    }
    return rows.slice(0, 12).map((row) =>
      mapPunchInboxRow(
        {
          ...row,
          staffName: (row.staff_id && names.get(row.staff_id)) || "Staff",
        },
        "/people/attendance/corrections",
      ),
    );
  }

  // Line managers / site supervisors / ops: only corrections they can act on.
  try {
    const { listMissedPunchCorrections } = await import(
      "@/lib/attendance-hr/missed-punch-approval.server"
    );
    const rows = await listMissedPunchCorrections({
      userId: context.userId,
      queue: "waiting",
      actionableOnly: true,
    });
    return rows
      .filter((row) => row.status === "pending")
      .slice(0, 12)
      .map((row) => {
        const ops = row.currentStepRole === "ops" || row.currentStepRole === "hr";
        return mapPunchInboxRow(
          {
            id: row.id,
            staff_id: row.staffId,
            work_date: row.workDate,
            current_step_role: row.currentStepRole,
            requested_at: row.requestedAt,
            staffName: row.staffName,
          },
          ops ? "/people/attendance/corrections" : "/hr/me#me-punch-approvals",
        );
      });
  } catch {
    return [];
  }
}

async function fetchLeaveApprovalItems(context: AuthContext, roles: AppRole[]): Promise<InboxItem[]> {
  const manage = canUserDo(roles, "hr.leave.manage");
  const managerCap = canUserDo(roles, "hr.leave.approve_manager");
  try {
    const { loadManagerTeamStaffIds } = await import("@/lib/reporting-manager-access.server");
    const { teamStaffIds } = await loadManagerTeamStaffIds(context.userId);
    if (!manage && !managerCap && teamStaffIds.length === 0) return [];

    let query = context.supabase
      .from("hr_leave_requests")
      .select("id, staff_id, leave_type, date_from, current_step_role, created_at, updated_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(40);
    if (!manage && !managerCap) {
      query = query.in("staff_id", teamStaffIds).eq("current_step_role", "manager");
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []).slice(0, 12);
    const staffIds = [...new Set(rows.map((row) => row.staff_id).filter((id): id is string => Boolean(id)))];
    const names = new Map<string, string>();
    if (staffIds.length) {
      const { data: staff } = await context.supabase.from("staff").select("id, full_name").in("id", staffIds);
      for (const person of staff ?? []) {
        if (person.full_name) names.set(person.id as string, String(person.full_name));
      }
    }
    return rows.map((row) => {
      const who = (row.staff_id && names.get(row.staff_id)) || "Staff";
      const date = row.date_from ? String(row.date_from).slice(0, 10) : "";
      const step = row.current_step_role ? String(row.current_step_role) : "manager";
      return item({
        id: `leave:${row.id}`,
        kind: "notification",
        category: "hr_leave",
        title: "Leave request needs your approval",
        titleKey: null,
        body: `${who} submitted a leave request${date ? ` from ${date}` : ""}. Waiting on ${step}.`,
        severity: "warning",
        actionUrl: "/hr/me#me-leave-approvals",
        readAt: null,
        createdAt: asIso(row.updated_at ?? row.created_at),
        sourceType: "hr_leave",
        sourceId: row.id,
        persisted: false,
      });
    });
  } catch {
    return [];
  }
}

async function fetchEvaluationItems(
  context: AuthContext,
  roles: AppRole[],
  staffId: string | null,
): Promise<InboxItem[]> {
  if (!canUserDo(roles, "performance.view") && !staffId) return [];
  const statuses = ["supervisor_review", "manager_review", "employee_ack"];
  const { data, error } = await context.supabase
    .from("employee_evaluations")
    .select("id, staff_id, status, updated_at, created_at")
    .in("status", statuses)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) throw error;

  const canReview = canUserDo(roles, "performance.view");
  return (data ?? [])
    .filter((row) => {
      if (row.status === "employee_ack") return Boolean(staffId) && row.staff_id === staffId;
      return canReview;
    })
    .slice(0, 8)
    .map((row) => {
      const ack = row.status === "employee_ack";
      return item({
        id: `eval:${row.id}`,
        kind: "evaluation",
        category: "people",
        title: ack ? "Please acknowledge your performance evaluation" : "Performance evaluation needs review",
        titleKey: ack ? "inbox.evalAck" : "inbox.evalReview",
        body: null,
        severity: "warning",
        actionUrl: `/people/performance/evaluations/${row.id}`,
        readAt: null,
        createdAt: row.updated_at ?? row.created_at,
        sourceType: "employee_evaluations",
        sourceId: row.id,
        persisted: false,
      });
    });
}

export async function fetchActionInbox(context: AuthContext): Promise<ActionInboxPayload> {
  const roles = (context.roles ?? []) as AppRole[];
  // Staff id is only needed for event tasks and evaluations. The other inbox
  // sources start immediately so that lookup is not a serial prefix.
  const staffPromise = settled(currentStaffId(context), null);

  const [persisted, prs, maint, wos, snags, weekly, punches, leaves, staffId] = await Promise.all([
    settled(fetchPersisted(context), []),
    settled(fetchPrItems(context, roles), []),
    settled(fetchMaintenanceItems(context, roles), []),
    settled(fetchWorkOrderItems(context, roles), []),
    settled(fetchSnagItems(context, roles), []),
    settled(fetchWeeklyReportItems(context, roles), []),
    settled(fetchMissedPunchItems(context, roles), []),
    settled(fetchLeaveApprovalItems(context, roles), []),
    staffPromise,
  ]);

  const [events, evals] = await Promise.all([
    settled(fetchEventTaskItems(context, roles, staffId), []),
    settled(fetchEvaluationItems(context, roles, staffId), []),
  ]);

  const items = mergeInboxItems(persisted, [
    ...prs,
    ...maint,
    ...wos,
    ...events,
    ...snags,
    ...weekly,
    ...evals,
    ...punches,
    ...leaves,
  ]);
  return {
    items,
    unreadCount: inboxUnreadCount(items),
    actionCount: items.filter((row) => !row.persisted).length,
  };
}

export type { ActionInboxPayload, InboxItem, InboxItemKind, InboxSeverity };
