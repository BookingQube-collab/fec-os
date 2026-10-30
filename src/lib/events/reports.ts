import { computeVelocity } from "@/lib/events/agile";
import { CLOSED_TASK_STATUSES, OPEN_ISSUE_STATUSES, PENDING_PO_STATUSES, PENDING_PR_STATUSES } from "@/lib/events/constants";
import { computeEvLite } from "@/lib/events/evm-lite";
import { LIFECYCLE_PHASES, phaseLabel } from "@/lib/events/lifecycle";
import type { EventBudgetTotals } from "@/lib/events/types";
import { STANDARD_WORKSTREAMS, overallTaskProgress } from "@/lib/events/workstreams";

export const EVENT_REPORT_IDS = [
  "project_status",
  "event_readiness",
  "department_completion",
  "overdue_blocked",
  "budget_vs_actual",
  "budget_variance",
  "profitability",
  "pending_procurement",
  "procurement_risks",
  "staffing_readiness",
  "resource_utilization",
  "est_vs_actual_hours",
  "portfolio_timeline",
  "agile_performance",
  "earned_value_lite",
  "bump_in_progress",
  "open_snags",
  "critical_safety",
  "asset_movement",
  "go_live_status",
  "risk_register",
  "issues",
  "lessons_learned",
] as const;

export type EventReportId = (typeof EVENT_REPORT_IDS)[number];

export const FINANCE_REPORT_IDS = new Set<EventReportId>([
  "budget_vs_actual",
  "budget_variance",
  "profitability",
  "earned_value_lite",
]);

/** Money columns must never appear in exports without events.finance. */
export function redactReportBlockForExport(
  block: EventReportBlock,
  canFinance: boolean,
): EventReportBlock {
  if (canFinance) return block;
  if (FINANCE_REPORT_IDS.has(block.id) || block.finance) {
    return { ...block, rows: [], columns: block.columns.filter((c) => !c.money) };
  }
  return {
    ...block,
    columns: block.columns.filter((c) => !c.money),
    rows: block.rows.map((row) => {
      const next = { ...row };
      for (const col of block.columns) {
        if (col.money) delete next[col.key];
      }
      return next;
    }),
  };
}

export interface ReportColumn {
  key: string;
  labelKey: string;
  money?: boolean;
  pct?: boolean;
}

export interface EventReportBlock {
  id: EventReportId;
  finance: boolean;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
}

export interface EventReportsPayload {
  canFinance: boolean;
  events: Array<{ id: string; event_number: string | null; name: string; pm_staff_id: string | null; pm_name: string | null }>;
  pms: Array<{ id: string; name: string }>;
  reports: EventReportBlock[];
}

export interface ReportEventFact {
  id: string;
  event_number: string | null;
  name: string;
  client_name: string | null;
  venue_name: string | null;
  status: string;
  stage_code: string | null;
  stage_label: string | null;
  pm_staff_id: string | null;
  pm_name: string | null;
  event_start: string | null;
  event_end: string | null;
  setup_start?: string | null;
  dismantle_date?: string | null;
  health_rag: string;
  readiness_pct: number;
  go_live_approved: boolean;
  contracted_value: number | null;
  lessons_learned: string | null;
  overall_progress: number;
  finance: EventBudgetTotals | null;
}

export interface ReportTaskFact {
  event_id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  percent_complete: number;
  is_critical: boolean;
  is_snag: boolean;
  owner_name: string | null;
  owner_staff_id?: string | null;
  estimated_hours?: number | null;
  actual_hours?: number | null;
  estimated_cost?: number | null;
  actual_cost?: number | null;
  story_points?: number | null;
  sprint_id?: string | null;
  completed_at?: string | null;
  workstream_code: string | null;
  workstream_title: string | null;
  lifecycle_phase: string | null;
}

export interface ReportSprintFact {
  id: string;
  event_id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

export interface ReportReadyFact {
  event_id: string;
  code: string;
  title: string;
  phase_code: string | null;
  is_complete: boolean;
  is_required: boolean;
}

export interface ReportIssueFact {
  event_id: string;
  title: string;
  severity: string;
  status: string;
  is_snag: boolean;
  is_safety: boolean;
  due_date: string | null;
  owner_name: string | null;
}

export interface ReportRiskFact {
  event_id: string;
  title: string;
  severity: string;
  status: string;
  due_date: string | null;
}

export interface ReportPrFact {
  event_id: string;
  pr_number: string | null;
  status: string;
  total_amount: number;
  required_by: string | null;
  priority: string | null;
}

export interface ReportPoFact {
  event_id: string;
  po_number: string | null;
  vendor_name: string | null;
  amount: number;
  status: string;
}

export interface ReportPayableFact {
  event_id: string;
  kind: string;
  title: string;
  reference: string | null;
  vendor_name: string | null;
  amount: number;
  status: string;
  due_date: string | null;
}

export interface ReportAssetFact {
  event_id: string;
  item_name: string;
  qty: number;
  status: string;
  due_date: string | null;
}

function evName(events: ReportEventFact[], id: string) {
  const ev = events.find((e) => e.id === id);
  return ev ? `${ev.event_number ?? ""} ${ev.name}`.trim() : id;
}

function evMeta(events: ReportEventFact[], id: string) {
  return events.find((e) => e.id === id) ?? null;
}

function pctOf(done: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((done / total) * 100);
}

export function assembleEventReports(input: {
  events: ReportEventFact[];
  tasks: ReportTaskFact[];
  readiness: ReportReadyFact[];
  issues: ReportIssueFact[];
  risks: ReportRiskFact[];
  prs: ReportPrFact[];
  pos: ReportPoFact[];
  payables: ReportPayableFact[];
  assets: ReportAssetFact[];
  sprints?: ReportSprintFact[];
  canFinance: boolean;
  today: string;
}): EventReportBlock[] {
  const { events, tasks, readiness, issues, risks, prs, pos, payables, assets, canFinance, today } = input;
  const sprints = input.sprints ?? [];
  const openTasks = tasks.filter((t) => !CLOSED_TASK_STATUSES.has(t.status as never));
  const openIssues = issues.filter((i) => OPEN_ISSUE_STATUSES.has(i.status));

  const projectStatus: EventReportBlock = {
    id: "project_status",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "client", labelKey: "events.fields.client" },
      { key: "stage", labelKey: "events.fields.stage" },
      { key: "pm", labelKey: "events.fields.pm" },
      { key: "health", labelKey: "events.fields.health" },
      { key: "readiness", labelKey: "events.fields.readiness", pct: true },
      { key: "progress", labelKey: "events.fields.progress", pct: true },
      { key: "dates", labelKey: "events.fields.dates" },
      { key: "status", labelKey: "events.fields.status" },
    ],
    rows: events.map((e) => ({
      event: `${e.event_number ?? ""} ${e.name}`.trim(),
      client: e.client_name,
      stage: e.stage_label ?? phaseLabel(e.stage_code),
      pm: e.pm_name,
      health: e.health_rag,
      readiness: e.readiness_pct,
      progress: e.overall_progress,
      dates: [e.event_start, e.event_end].filter(Boolean).join(" → ") || null,
      status: e.status,
    })),
  };

  const eventReadiness: EventReportBlock = {
    id: "event_readiness",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "phase", labelKey: "events.fields.stage" },
      { key: "item", labelKey: "events.reports.cols.item" },
      { key: "complete", labelKey: "events.reports.cols.complete" },
      { key: "required", labelKey: "events.reports.cols.required" },
    ],
    rows: readiness.map((r) => ({
      event: evName(events, r.event_id),
      phase: phaseLabel(r.phase_code),
      item: r.title,
      complete: r.is_complete ? "yes" : "no",
      required: r.is_required ? "yes" : "no",
    })),
  };

  const deptRows: Array<Record<string, string | number | null>> = [];
  for (const ev of events) {
    const evTasks = tasks.filter((t) => t.event_id === ev.id);
    for (const ws of STANDARD_WORKSTREAMS) {
      const linked = evTasks.filter((t) => t.workstream_code === ws.code);
      if (!linked.length) {
        deptRows.push({
          event: `${ev.event_number ?? ""} ${ev.name}`.trim(),
          department: ws.title_en,
          tasks: 0,
          complete: 0,
          pct: null,
          overdue: 0,
          blocked: 0,
        });
        continue;
      }
      const open = linked.filter((t) => t.status !== "cancelled");
      const done = open.filter((t) => t.status === "completed").length;
      deptRows.push({
        event: `${ev.event_number ?? ""} ${ev.name}`.trim(),
        department: ws.title_en,
        tasks: open.length,
        complete: done,
        pct: overallTaskProgress(open),
        overdue: open.filter((t) => t.status !== "completed" && t.due_date && t.due_date < today).length,
        blocked: open.filter((t) => t.status === "blocked").length,
      });
    }
  }

  const departmentCompletion: EventReportBlock = {
    id: "department_completion",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "department", labelKey: "events.fields.department" },
      { key: "tasks", labelKey: "events.ops.tasks" },
      { key: "complete", labelKey: "events.reports.cols.complete" },
      { key: "pct", labelKey: "events.plan.progress", pct: true },
      { key: "overdue", labelKey: "events.ops.overdue" },
      { key: "blocked", labelKey: "events.ops.blocked" },
    ],
    rows: deptRows.filter((r) => Number(r.tasks) > 0),
  };

  const overdueBlocked: EventReportBlock = {
    id: "overdue_blocked",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "task", labelKey: "events.plan.task" },
      { key: "owner", labelKey: "events.plan.owner" },
      { key: "department", labelKey: "events.fields.department" },
      { key: "phase", labelKey: "events.fields.stage" },
      { key: "status", labelKey: "events.plan.status" },
      { key: "due", labelKey: "events.plan.due" },
      { key: "priority", labelKey: "events.plan.priority" },
    ],
    rows: openTasks
      .filter((t) => t.status === "blocked" || (t.due_date && t.due_date < today))
      .map((t) => ({
        event: evName(events, t.event_id),
        task: t.title,
        owner: t.owner_name,
        department: t.workstream_title,
        phase: phaseLabel(t.lifecycle_phase),
        status: t.status,
        due: t.due_date,
        priority: t.priority,
      })),
  };

  const budgetVsActual: EventReportBlock = {
    id: "budget_vs_actual",
    finance: true,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "revised", labelKey: "events.budget.revised", money: true },
      { key: "committed", labelKey: "events.budget.committed", money: true },
      { key: "actual", labelKey: "events.budget.actual", money: true },
      { key: "forecast", labelKey: "events.budget.forecast", money: true },
      { key: "remaining", labelKey: "events.budget.remaining", money: true },
    ],
    rows: canFinance
      ? events
          .filter((e) => e.finance?.hasBudget)
          .map((e) => ({
            event: `${e.event_number ?? ""} ${e.name}`.trim(),
            revised: e.finance?.revised ?? null,
            committed: e.finance?.committed ?? null,
            actual: e.finance?.actual ?? null,
            forecast: e.finance?.forecast ?? null,
            remaining: e.finance?.remaining ?? null,
          }))
      : [],
  };

  const budgetVariance: EventReportBlock = {
    id: "budget_variance",
    finance: true,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "original", labelKey: "events.budget.original", money: true },
      { key: "revised", labelKey: "events.budget.revised", money: true },
      { key: "forecast", labelKey: "events.budget.forecast", money: true },
      { key: "varianceForecast", labelKey: "events.budget.varianceForecast", money: true },
      { key: "varianceCommitted", labelKey: "events.budget.varianceCommitted", money: true },
    ],
    rows: canFinance
      ? events
          .filter((e) => e.finance?.hasBudget)
          .map((e) => ({
            event: `${e.event_number ?? ""} ${e.name}`.trim(),
            original: e.finance?.original ?? null,
            revised: e.finance?.revised ?? null,
            forecast: e.finance?.forecast ?? null,
            varianceForecast: e.finance?.varianceForecast ?? null,
            varianceCommitted: e.finance?.varianceCommitted ?? null,
          }))
      : [],
  };

  const profitability: EventReportBlock = {
    id: "profitability",
    finance: true,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "revenue", labelKey: "events.budget.finalRevenue", money: true },
      { key: "actual", labelKey: "events.budget.actual", money: true },
      { key: "forecastProfit", labelKey: "events.budget.forecastProfit", money: true },
      { key: "actualProfit", labelKey: "events.budget.actualProfit", money: true },
      { key: "forecastMargin", labelKey: "events.budget.forecastMargin", pct: true },
      { key: "actualMargin", labelKey: "events.budget.actualMargin", pct: true },
    ],
    rows: canFinance
      ? events
          .filter((e) => e.finance?.hasBudget || e.contracted_value != null)
          .map((e) => ({
            event: `${e.event_number ?? ""} ${e.name}`.trim(),
            revenue: e.finance?.finalRevenue ?? e.contracted_value,
            actual: e.finance?.actual ?? null,
            forecastProfit: e.finance?.forecastProfit ?? null,
            actualProfit: e.finance?.actualProfit ?? e.finance?.grossProfit ?? null,
            forecastMargin: e.finance?.forecastMarginPct ?? e.finance?.marginPct ?? null,
            actualMargin: e.finance?.actualMarginPct ?? null,
          }))
      : [],
  };

  const pendingProcurement: EventReportBlock = {
    id: "pending_procurement",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "kind", labelKey: "events.reports.cols.kind" },
      { key: "ref", labelKey: "events.reports.cols.ref" },
      { key: "title", labelKey: "events.reports.cols.item" },
      { key: "vendor", labelKey: "events.reports.cols.vendor" },
      { key: "amount", labelKey: "events.budget.amount", money: true },
      { key: "status", labelKey: "events.fields.status" },
      { key: "due", labelKey: "events.plan.due" },
    ],
    rows: [
      ...prs
        .filter((p) => PENDING_PR_STATUSES.has(p.status))
        .map((p) => ({
          event: evName(events, p.event_id),
          kind: "PR",
          ref: p.pr_number,
          title: p.pr_number,
          vendor: null,
          amount: p.total_amount,
          status: p.status,
          due: p.required_by,
        })),
      ...pos
        .filter((p) => PENDING_PO_STATUSES.has(p.status))
        .map((p) => ({
          event: evName(events, p.event_id),
          kind: "PO",
          ref: p.po_number,
          title: p.po_number,
          vendor: p.vendor_name,
          amount: p.amount,
          status: p.status,
          due: null,
        })),
      ...payables
        .filter((p) => p.status === "pending" || p.status === "partial" || p.status === "overdue")
        .map((p) => ({
          event: evName(events, p.event_id),
          kind: p.kind,
          ref: p.reference,
          title: p.title,
          vendor: p.vendor_name,
          amount: p.amount,
          status: p.status,
          due: p.due_date,
        })),
    ],
  };

  const procRisks: EventReportBlock = {
    id: "procurement_risks",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "kind", labelKey: "events.reports.cols.kind" },
      { key: "item", labelKey: "events.reports.cols.item" },
      { key: "reason", labelKey: "events.reports.cols.reason" },
      { key: "due", labelKey: "events.plan.due" },
      { key: "priority", labelKey: "events.plan.priority" },
    ],
    rows: [
      ...prs
        .filter((p) => PENDING_PR_STATUSES.has(p.status) && p.required_by && p.required_by < today)
        .map((p) => ({
          event: evName(events, p.event_id),
          kind: "PR",
          item: p.pr_number,
          reason: "overdue",
          due: p.required_by,
          priority: p.priority,
        })),
      ...payables
        .filter((p) => p.status === "overdue" || (p.due_date && p.due_date < today && p.status !== "paid" && p.status !== "cancelled"))
        .map((p) => ({
          event: evName(events, p.event_id),
          kind: p.kind,
          item: p.title,
          reason: "overdue",
          due: p.due_date,
          priority: null,
        })),
      ...openTasks
        .filter(
          (t) =>
            t.workstream_code === "procurement_finance" &&
            (t.is_critical || t.priority === "high" || t.priority === "critical" || t.priority === "urgent" || (t.due_date && t.due_date < today)),
        )
        .map((t) => ({
          event: evName(events, t.event_id),
          kind: "task",
          item: t.title,
          reason: t.due_date && t.due_date < today ? "overdue" : "critical",
          due: t.due_date,
          priority: t.priority,
        })),
    ],
  };

  const staffingRows = events.map((ev) => {
    const staffTasks = tasks.filter((t) => t.event_id === ev.id && (t.workstream_code === "hr_staffing" || t.lifecycle_phase === "staffing"));
    const items = readiness.filter((r) => r.event_id === ev.id && r.phase_code === "staffing");
    return {
      event: `${ev.event_number ?? ""} ${ev.name}`.trim(),
      tasks: staffTasks.filter((t) => t.status !== "cancelled").length,
      taskPct: staffTasks.length ? overallTaskProgress(staffTasks) : null,
      checklist: pctOf(items.filter((i) => i.is_complete).length, items.length),
      overdue: staffTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled" && t.due_date && t.due_date < today).length,
    };
  });

  const staffingReadiness: EventReportBlock = {
    id: "staffing_readiness",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "tasks", labelKey: "events.ops.tasks" },
      { key: "taskPct", labelKey: "events.plan.progress", pct: true },
      { key: "checklist", labelKey: "events.overview.readiness", pct: true },
      { key: "overdue", labelKey: "events.ops.overdue" },
    ],
    rows: staffingRows.filter((r) => r.tasks > 0 || r.checklist != null),
  };

  /** Phase 5 — task-hours utilization by owner (allocations live on Resources tab). */
  const utilByOwner = new Map<
    string,
    { owner: string; estimated: number; actual: number; tasks: number }
  >();
  for (const task of tasks) {
    if (task.status === "cancelled") continue;
    const key = task.owner_staff_id || task.owner_name || "unassigned";
    const row = utilByOwner.get(key) ?? {
      owner: task.owner_name ?? "Unassigned",
      estimated: 0,
      actual: 0,
      tasks: 0,
    };
    row.estimated += Number(task.estimated_hours) || 0;
    row.actual += Number(task.actual_hours) || 0;
    row.tasks += 1;
    utilByOwner.set(key, row);
  }

  const resourceUtilization: EventReportBlock = {
    id: "resource_utilization",
    finance: false,
    columns: [
      { key: "owner", labelKey: "events.plan.owner" },
      { key: "tasks", labelKey: "events.ops.tasks" },
      { key: "estimated", labelKey: "events.resources.estHours" },
      { key: "actual", labelKey: "events.resources.actHours" },
      { key: "utilization", labelKey: "events.resources.utilization", pct: true },
    ],
    rows: [...utilByOwner.values()]
      .filter((r) => r.estimated > 0 || r.actual > 0)
      .map((r) => ({
        owner: r.owner,
        tasks: r.tasks,
        estimated: Math.round(r.estimated * 100) / 100,
        actual: Math.round(r.actual * 100) / 100,
        utilization: r.estimated > 0 ? Math.round((r.actual / r.estimated) * 1000) / 10 : null,
      })),
  };

  const estVsActualHours: EventReportBlock = {
    id: "est_vs_actual_hours",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "item", labelKey: "events.reports.cols.item" },
      { key: "owner", labelKey: "events.plan.owner" },
      { key: "estimated", labelKey: "events.resources.estHours" },
      { key: "actual", labelKey: "events.resources.actHours" },
      { key: "variance", labelKey: "events.resources.variance" },
    ],
    rows: tasks
      .filter((t) => t.status !== "cancelled" && ((Number(t.estimated_hours) || 0) > 0 || (Number(t.actual_hours) || 0) > 0))
      .map((t) => {
        const estimated = Number(t.estimated_hours) || 0;
        const actual = Number(t.actual_hours) || 0;
        return {
          event: evName(events, t.event_id),
          item: t.title,
          owner: t.owner_name,
          estimated: Math.round(estimated * 100) / 100,
          actual: Math.round(actual * 100) / 100,
          variance: Math.round((actual - estimated) * 100) / 100,
        };
      }),
  };

  /** Phase 8 — cross-event timeline rows (setup → dismantle). */
  const portfolioTimeline: EventReportBlock = {
    id: "portfolio_timeline",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "from", labelKey: "events.reports.cols.from" },
      { key: "to", labelKey: "events.reports.cols.to" },
      { key: "spanDays", labelKey: "events.reports.cols.spanDays" },
      { key: "stage", labelKey: "events.fields.stage" },
      { key: "health", labelKey: "events.fields.health" },
      { key: "progress", labelKey: "events.fields.progress", pct: true },
      { key: "pm", labelKey: "events.fields.pm" },
    ],
    rows: events
      .map((e) => {
        const from = e.setup_start ?? e.event_start;
        const to = e.dismantle_date ?? e.event_end ?? e.event_start;
        if (!from && !to) return null;
        const a = from ?? to!;
        const b = to ?? from!;
        const spanDays =
          Math.round(
            (new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000,
          ) + 1;
        return {
          event: `${e.event_number ?? ""} ${e.name}`.trim(),
          from: a,
          to: b,
          spanDays,
          stage: e.stage_label ?? phaseLabel(e.stage_code),
          health: e.health_rag,
          progress: e.overall_progress,
          pm: e.pm_name,
        };
      })
      .filter(Boolean) as Array<Record<string, string | number | null>>,
  };

  /** Phase 8 — sprint velocity / points summary (reuses Phase 4 agile helpers). */
  const velocity = computeVelocity(
    sprints.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      start_date: s.start_date,
      end_date: s.end_date,
    })),
    tasks.map((t) => ({
      id: `${t.event_id}:${t.title}`,
      status: t.status,
      sprint_id: t.sprint_id ?? null,
      story_points: t.story_points ?? null,
      completed_at: t.completed_at ?? null,
    })),
  );
  const agilePerformance: EventReportBlock = {
    id: "agile_performance",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "sprint", labelKey: "events.plan.sprint" },
      { key: "status", labelKey: "events.fields.status" },
      { key: "committed", labelKey: "events.reports.cols.committedPts" },
      { key: "completed", labelKey: "events.reports.cols.completedPts" },
      { key: "velocity", labelKey: "events.plan.velocity" },
      { key: "window", labelKey: "events.fields.dates" },
    ],
    rows: sprints.map((s) => {
      const v = velocity.find((row) => row.sprintId === s.id);
      return {
        event: evName(events, s.event_id),
        sprint: s.name,
        status: s.status,
        committed: v?.committed ?? 0,
        completed: v?.completed ?? 0,
        velocity: v?.completed ?? 0,
        window: [s.start_date, s.end_date].filter(Boolean).join(" → ") || null,
      };
    }),
  };

  /** Phase 8 — SPI/CPI-lite (finance amounts redacted without events.finance). */
  const earnedValueLite: EventReportBlock = {
    id: "earned_value_lite",
    finance: true,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "progress", labelKey: "events.fields.progress", pct: true },
      { key: "planned", labelKey: "events.reports.cols.plannedPct", pct: true },
      { key: "spi", labelKey: "events.reports.cols.spi" },
      { key: "cpi", labelKey: "events.reports.cols.cpi" },
      { key: "earned", labelKey: "events.reports.cols.earnedValue", money: true },
      { key: "actual", labelKey: "events.budget.actual", money: true },
      { key: "hoursUtil", labelKey: "events.resources.utilization", pct: true },
    ],
    rows: canFinance
      ? events.map((e) => {
          const evTasks = tasks.filter((t) => t.event_id === e.id && t.status !== "cancelled");
          const estimatedHours = evTasks.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0);
          const actualHours = evTasks.reduce((s, t) => s + (Number(t.actual_hours) || 0), 0);
          const lite = computeEvLite({
            progressPct: e.overall_progress,
            start: e.setup_start ?? e.event_start,
            end: e.dismantle_date ?? e.event_end ?? e.event_start,
            today,
            budgetRevised: e.finance?.revised ?? null,
            actualCost: e.finance?.actual ?? null,
            estimatedHours,
            actualHours,
          });
          return {
            event: `${e.event_number ?? ""} ${e.name}`.trim(),
            progress: lite.progressPct,
            planned: lite.plannedPct,
            spi: lite.spi,
            cpi: lite.cpi,
            earned: lite.earnedValue,
            actual: lite.actualCost,
            hoursUtil: lite.hoursUtilizationPct,
          };
        })
      : [],
  };

  const bumpRows = events.map((ev) => {
    const bumpTasks = tasks.filter((t) => t.event_id === ev.id && t.lifecycle_phase === "bump_in");
    const items = readiness.filter((r) => r.event_id === ev.id && r.phase_code === "bump_in");
    return {
      event: `${ev.event_number ?? ""} ${ev.name}`.trim(),
      tasks: bumpTasks.filter((t) => t.status !== "cancelled").length,
      taskPct: bumpTasks.length ? overallTaskProgress(bumpTasks) : null,
      checklist: pctOf(items.filter((i) => i.is_complete).length, items.length),
      overdue: bumpTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled" && t.due_date && t.due_date < today).length,
    };
  });

  const bumpInProgress: EventReportBlock = {
    id: "bump_in_progress",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "tasks", labelKey: "events.ops.tasks" },
      { key: "taskPct", labelKey: "events.ops.bumpIn", pct: true },
      { key: "checklist", labelKey: "events.overview.readiness", pct: true },
      { key: "overdue", labelKey: "events.ops.overdue" },
    ],
    rows: bumpRows.filter((r) => r.tasks > 0 || r.checklist != null),
  };

  const openSnags: EventReportBlock = {
    id: "open_snags",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "item", labelKey: "events.reports.cols.item" },
      { key: "kind", labelKey: "events.reports.cols.kind" },
      { key: "severity", labelKey: "events.reports.cols.severity" },
      { key: "status", labelKey: "events.fields.status" },
      { key: "due", labelKey: "events.plan.due" },
      { key: "owner", labelKey: "events.plan.owner" },
    ],
    rows: [
      ...openIssues
        .filter((i) => i.is_snag)
        .map((i) => ({
          event: evName(events, i.event_id),
          item: i.title,
          kind: "issue",
          severity: i.severity,
          status: i.status,
          due: i.due_date,
          owner: i.owner_name,
        })),
      ...openTasks
        .filter((t) => t.is_snag)
        .map((t) => ({
          event: evName(events, t.event_id),
          item: t.title,
          kind: "task",
          severity: t.priority,
          status: t.status,
          due: t.due_date,
          owner: t.owner_name,
        })),
    ],
  };

  const criticalSafety: EventReportBlock = {
    id: "critical_safety",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "item", labelKey: "events.reports.cols.item" },
      { key: "kind", labelKey: "events.reports.cols.kind" },
      { key: "severity", labelKey: "events.reports.cols.severity" },
      { key: "status", labelKey: "events.fields.status" },
      { key: "due", labelKey: "events.plan.due" },
    ],
    rows: [
      ...openIssues
        .filter((i) => i.is_safety && (i.severity === "high" || i.severity === "critical"))
        .map((i) => ({
          event: evName(events, i.event_id),
          item: i.title,
          kind: "issue",
          severity: i.severity,
          status: i.status,
          due: i.due_date,
        })),
      ...openTasks
        .filter(
          (t) =>
            (t.workstream_code === "health_safety" || t.lifecycle_phase === "testing") &&
            (t.is_critical || t.priority === "high" || t.priority === "critical"),
        )
        .map((t) => ({
          event: evName(events, t.event_id),
          item: t.title,
          kind: "task",
          severity: t.priority,
          status: t.status,
          due: t.due_date,
        })),
    ],
  };

  const assetMovement: EventReportBlock = {
    id: "asset_movement",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "item", labelKey: "events.reports.cols.item" },
      { key: "qty", labelKey: "events.reports.cols.qty" },
      { key: "status", labelKey: "events.fields.status" },
      { key: "due", labelKey: "events.plan.due" },
    ],
    rows: assets.map((a) => ({
      event: evName(events, a.event_id),
      item: a.item_name,
      qty: a.qty,
      status: a.status,
      due: a.due_date,
    })),
  };

  const goLiveStatus: EventReportBlock = {
    id: "go_live_status",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "stage", labelKey: "events.fields.stage" },
      { key: "approved", labelKey: "events.overview.goLive" },
      { key: "checklist", labelKey: "events.overview.readiness", pct: true },
      { key: "opening", labelKey: "events.fields.event_start" },
    ],
    rows: events.map((e) => {
      const items = readiness.filter((r) => r.event_id === e.id && r.phase_code === "go_live");
      return {
        event: `${e.event_number ?? ""} ${e.name}`.trim(),
        stage: e.stage_label ?? phaseLabel(e.stage_code),
        approved: e.go_live_approved ? "yes" : "no",
        checklist: pctOf(items.filter((i) => i.is_complete).length, items.length),
        opening: e.event_start,
      };
    }),
  };

  const riskRegister: EventReportBlock = {
    id: "risk_register",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "title", labelKey: "events.reports.cols.item" },
      { key: "severity", labelKey: "events.reports.cols.severity" },
      { key: "status", labelKey: "events.fields.status" },
      { key: "due", labelKey: "events.plan.due" },
    ],
    rows: risks.map((r) => ({
      event: evName(events, r.event_id),
      title: r.title,
      severity: r.severity,
      status: r.status,
      due: r.due_date,
    })),
  };

  const issuesReport: EventReportBlock = {
    id: "issues",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "title", labelKey: "events.reports.cols.item" },
      { key: "severity", labelKey: "events.reports.cols.severity" },
      { key: "status", labelKey: "events.fields.status" },
      { key: "snag", labelKey: "events.overview.snag" },
      { key: "safety", labelKey: "events.overview.safetyIssue" },
      { key: "due", labelKey: "events.plan.due" },
      { key: "owner", labelKey: "events.plan.owner" },
    ],
    rows: issues.map((i) => ({
      event: evName(events, i.event_id),
      title: i.title,
      severity: i.severity,
      status: i.status,
      snag: i.is_snag ? "yes" : "no",
      safety: i.is_safety ? "yes" : "no",
      due: i.due_date,
      owner: i.owner_name,
    })),
  };

  const lessons: EventReportBlock = {
    id: "lessons_learned",
    finance: false,
    columns: [
      { key: "event", labelKey: "events.reports.cols.event" },
      { key: "stage", labelKey: "events.fields.stage" },
      { key: "lessons", labelKey: "events.reports.lessons" },
      { key: "checklist", labelKey: "events.readinessItem.lessons_learned" },
    ],
    rows: events
      .map((e) => {
        const item = readiness.find((r) => r.event_id === e.id && r.code === "lessons_learned");
        return {
          event: `${e.event_number ?? ""} ${e.name}`.trim(),
          stage: e.stage_label ?? phaseLabel(e.stage_code),
          lessons: e.lessons_learned,
          checklist: item ? (item.is_complete ? "yes" : "no") : null,
        };
      })
      .filter((r) => r.lessons || r.checklist),
  };

  void evMeta;
  void LIFECYCLE_PHASES;

  return [
    projectStatus,
    eventReadiness,
    departmentCompletion,
    overdueBlocked,
    budgetVsActual,
    budgetVariance,
    profitability,
    pendingProcurement,
    procRisks,
    staffingReadiness,
    resourceUtilization,
    estVsActualHours,
    portfolioTimeline,
    agilePerformance,
    earnedValueLite,
    bumpInProgress,
    openSnags,
    criticalSafety,
    assetMovement,
    goLiveStatus,
    riskRegister,
    issuesReport,
    lessons,
  ];
}
