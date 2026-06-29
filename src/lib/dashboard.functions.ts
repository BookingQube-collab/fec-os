"use server";

import { z } from "zod";

import { monthStartInQatar, todayInQatar } from "@/lib/integrations/bookingqube";
import { dashboardViewForRoles } from "@/lib/rbac";
import {
  createAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";

export type RagStatus = "green" | "amber" | "red";
export type DashboardPeriod = "today" | "yesterday" | "week" | "month";

const DashboardFilter = z
  .object({
    period: z.enum(["today", "yesterday", "week", "month"]).default("today"),
    locationId: z.string().uuid().nullable().optional(),
    department: z.string().max(100).nullable().optional(),
    role: z.string().max(100).nullable().optional(),
    view: z.enum(["estate", "branch", "maintenance", "tasks", "hr", "customer"]).optional(),
  })
  .default({});

export interface BranchDashboardRow {
  location_id: string;
  code: string;
  name: string;
  status: string;
  is_open: boolean;
  opening_checklist_pct: number;
  closing_checklist_pct: number;
  staff_scheduled: number;
  staff_present: number;
  staff_late: number;
  staff_absent: number;
  revenue_today: number;
  revenue_target_pct: number;
  open_issues: number;
  critical_issues: number;
  machines_down: number;
  overdue_maintenance: number;
  pending_compliance: number;
  pending_snags: number;
  pending_vendor_actions: number;
  sop_ack_pct: number;
  kpi_score: number | null;
  health_score: number;
  rag: RagStatus;
}

export interface OperationsDashboard {
  period: DashboardPeriod;
  period_label: string;
  date_from: string;
  date_to: string;
  view: "estate" | "branch" | "maintenance" | "tasks" | "hr" | "customer";
  estate: {
    branches_open: number;
    branches_total: number;
    opening_checklist_pct: number;
    closing_checklist_pct: number;
    staff_present: number;
    staff_scheduled: number;
    staff_late: number;
    staff_absent: number;
    revenue_today: number;
    revenue_target_pct: number;
    open_issues: number;
    critical_issues: number;
    machines_down: number;
    overdue_maintenance: number;
    pending_snags: number;
    pending_compliance: number;
    pending_vendor_actions: number;
    sop_ack_pct: number;
    kpi_score_avg: number | null;
    health_score: number;
    rag: RagStatus;
    smartmaintain: {
      open_work_orders: number;
      overdue_work_orders: number;
      pm_due_this_week: number;
      amc_expiring_soon: number;
      legal_docs_expiring_soon: number;
      utility_cost_this_month: number;
      high_risk_items: number;
      downtime_hours: number;
      site_readiness_score: number;
      pending_inspections: number;
    };
  };
  branches: BranchDashboardRow[];
  assigned_tasks?: Array<{ id: string; title: string; status: string; due_at: string | null }>;
  open_complaints?: number;
}

function periodBounds(period: DashboardPeriod): { from: string; to: string; label: string } {
  const today = todayInQatar();
  const d = new Date(`${today}T12:00:00+03:00`);

  if (period === "yesterday") {
    d.setDate(d.getDate() - 1);
    const iso = d.toISOString().slice(0, 10);
    return { from: iso, to: iso, label: "Yesterday" };
  }
  if (period === "week") {
    const start = new Date(d);
    start.setDate(start.getDate() - 6);
    return { from: start.toISOString().slice(0, 10), to: today, label: "This week" };
  }
  if (period === "month") {
    return { from: monthStartInQatar(today), to: today, label: "This month" };
  }
  return { from: today, to: today, label: "Today" };
}

function ragFromHealth(score: number): RagStatus {
  if (score >= 80) return "green";
  if (score >= 60) return "amber";
  return "red";
}

function computeHealthScore(row: {
  opening_checklist_pct: number;
  closing_checklist_pct: number;
  staff_absent: number;
  staff_scheduled: number;
  critical_issues: number;
  overdue_maintenance: number;
  pending_compliance: number;
  revenue_target_pct: number;
  sop_ack_pct: number;
}): number {
  const attendance =
    row.staff_scheduled > 0
      ? ((row.staff_scheduled - row.staff_absent) / row.staff_scheduled) * 100
      : 100;
  const checklist = (row.opening_checklist_pct + row.closing_checklist_pct) / 2;
  const issuePenalty = Math.min(30, row.critical_issues * 10 + row.overdue_maintenance * 5);
  const compliancePenalty = Math.min(20, row.pending_compliance * 4);
  const revenueBonus = Math.min(10, row.revenue_target_pct / 10);

  const raw =
    attendance * 0.2 +
    checklist * 0.2 +
    row.sop_ack_pct * 0.15 +
    Math.min(100, row.revenue_target_pct) * 0.15 +
    (100 - issuePenalty) * 0.2 +
    (100 - compliancePenalty) * 0.1 +
    revenueBonus;

  return Math.round(Math.max(0, Math.min(100, raw)));
}

async function fetchChecklistCompletion(
  context: AuthContext,
  locationIds: string[],
  kind: "opening" | "closing",
  dateFrom: string,
  dateTo: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (locationIds.length === 0) return result;

  const { data: templates } = await context.supabase
    .from("task_templates")
    .select("id, location_id")
    .in("location_id", locationIds)
    .eq("kind", kind)
    .eq("active", true);

  const templateIds = (templates ?? []).map((t) => t.id);
  if (templateIds.length === 0) {
    for (const id of locationIds) result.set(id, 0);
    return result;
  }

  const { data: instances } = await context.supabase
    .from("task_instances")
    .select("id, location_id, status, template_id, created_at")
    .in("template_id", templateIds)
    .gte("created_at", `${dateFrom}T00:00:00+03:00`)
    .lte("created_at", `${dateTo}T23:59:59+03:00`);

  for (const locId of locationIds) {
    const locTemplates = (templates ?? []).filter((t) => t.location_id === locId).map((t) => t.id);
    const locInstances = (instances ?? []).filter((i) => locTemplates.includes(i.template_id));
    if (locInstances.length === 0) {
      result.set(locId, 0);
      continue;
    }
    const completed = locInstances.filter((i) =>
      ["submitted", "verified", "completed"].includes(i.status),
    ).length;
    result.set(locId, Math.round((completed / locInstances.length) * 100));
  }
  return result;
}

async function fetchAttendanceSummary(
  context: AuthContext,
  locationIds: string[],
  dateFrom: string,
  dateTo: string,
): Promise<Map<string, { scheduled: number; present: number; late: number; absent: number }>> {
  const result = new Map<string, { scheduled: number; present: number; late: number; absent: number }>();
  for (const id of locationIds) {
    result.set(id, { scheduled: 0, present: 0, late: 0, absent: 0 });
  }
  if (locationIds.length === 0) return result;

  const { data: shifts } = await context.supabase
    .from("shifts")
    .select("location_id, starts_at, clock_in_at, status")
    .in("location_id", locationIds)
    .gte("starts_at", `${dateFrom}T00:00:00+03:00`)
    .lte("starts_at", `${dateTo}T23:59:59+03:00`);

  const now = new Date();
  const graceMs = 10 * 60 * 1000;

  for (const shift of shifts ?? []) {
    const bucket = result.get(shift.location_id)!;
    bucket.scheduled += 1;
    if (shift.clock_in_at) {
      bucket.present += 1;
      const start = new Date(shift.starts_at).getTime();
      const clockIn = new Date(shift.clock_in_at).getTime();
      if (clockIn > start + graceMs) bucket.late += 1;
    } else if (new Date(shift.starts_at) < now) {
      bucket.absent += 1;
    }
  }
  return result;
}

export const getOperationsDashboard = createAuthenticatedAction(
  DashboardFilter,
  async (data, context) => {
    const { fetchOperationsDashboard } = await import("@/lib/queries/operations-dashboard.core");
    return fetchOperationsDashboard(context, {
      period: data.period,
      locationId: data.locationId,
      view: data.view,
    });
  },
  {
    defaultInput: {},
    auth: { capability: "dashboard.view" },
  },
);
