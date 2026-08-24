"use server";

import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import {
  APPROVED_PR_STATUSES,
  ASSET_MOVE_STATUSES,
  BASELINE_TYPES,
  BUDGET_STATUSES,
  INVOICE_STATUSES,
  DEFAULT_READINESS_ITEMS,
  DELIVERABLE_STATUSES,
  DEP_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  EVENT_PRIORITIES,
  EVENT_STATUSES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  LIVE_STAGE_CODES,
  MILESTONE_STATUSES,
  OPEN_ISSUE_STATUSES,
  PAYABLE_KINDS,
  PAYABLE_STATUSES,
  PENDING_PO_STATUSES,
  PENDING_PR_STATUSES,
  READINESS_CATEGORIES,
  RISK_SEVERITIES,
  RISK_STATUSES,
  SIDE_STAGE_CODES,
  TASK_APPROVAL_STATUSES,
  TASK_ESCALATION_LEVELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  WBS_NODE_TYPES,
  type EventRag,
  type ReadinessCategory,
  type WbsNodeType,
} from "@/lib/events/constants";
import {
  STANDARD_WORKSTREAMS,
  canonicalWorkstreamCode,
  overallTaskProgress,
  rollupWorkstreams,
  workstreamTitle,
} from "@/lib/events/workstreams";
import { WORKSTREAM_MERGES, WORKSTREAM_RENAMES } from "@/lib/events/lifecycle";
import { assembleEventReports, type EventReportsPayload, type ReportEventFact } from "@/lib/events/reports";
import {
  blendScores,
  computeEventHealth,
  computeReadiness,
  daysUntil,
  dependencyViolations,
  effectiveHealth,
  evaluateGates,
  readinessBand,
  scoreOr,
} from "@/lib/events/health";
import {
  evaluateBudgetAlerts,
  finalRevenue,
  marginPct,
  outstandingReceivable,
  portfolioLineFinance,
  prCommittedTotal,
  recognizedRevenue,
  remainingBudget,
  revisedBudget,
  sumBudgetLines,
  varianceCommitted,
  varianceForecast,
  type LineAmounts,
  type RevenueInputs,
} from "@/lib/events/finance";
import type {
  EventAssetRow,
  EventAuditRow,
  EventBoqLineRow,
  EventBaselineRow,
  EventBudgetAlert,
  EventBudgetBaselineCompare,
  EventBudgetLineRow,
  EventBudgetTotals,
  EventClientInvoiceRow,
  EventCostSubcategory,
  EventDocumentRow,
  EventLinkedMaintenanceRow,
  EventLinkedPrRow,
  EventMarginPoint,
  EventDashboard,
  EventDeliverableRow,
  EventDependencyRow,
  EventGateRequirement,
  EventIssueRow,
  EventListRow,
  EventLookup,
  EventMilestoneRow,
  EventOverview,
  EventPayableRow,
  EventReadinessRow,
  EventRiskRow,
  EventScopeSection,
  EventScopeVersion,
  EventStage,
  EventTaskComment,
  EventTaskRow,
  EventWbsNode,
} from "@/lib/events/types";
import {
  applyNodeTypes,
  canIndent,
  canOutdent,
  daysBetween,
  descendantIds,
  flattenWbsTree,
  parseJsonArray,
  scheduleVariance,
  siblingsOf,
  typeForDepth,
  wouldCycle,
  wbsAncestors,
  wbsDepth,
} from "@/lib/events/wbs";
import { callEventPlanAiDraft, type EventPlanFocus } from "@/lib/events/ai-plan-draft";
import { callEventReportAiBrief } from "@/lib/events/ai-report-brief";
import type { EventPlanSignals } from "@/lib/events/ai-signals";
import { resolvePrActions } from "@/lib/procurement/actions";
import { prDisplayTitle } from "@/lib/procurement/display";
import {
  EVENT_DOC_BUCKET,
  EVENT_DOCUMENT_MIMES,
  LEGACY_EVENT_BOQ_SEED,
  REQUIRED_EVENT_DOC_SEEDS,
  mimeFromFileName,
  resolveDocumentStatus,
  sanitizeEventFileName,
} from "@/lib/events/documents";
import { isMissingEventColumn, textMatchesEvent } from "@/lib/events/ops-link";
import { validateBase64Size, validateUploadMimeList } from "@/lib/server/upload-validation";
import { uniqueEventProjectNames } from "@/lib/procurement/event-link";
import { canUserDo, type AppRole } from "@/lib/rbac";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  type AuthContext,
} from "@/lib/server/create-action";

const IdSchema = z.object({ id: z.string().uuid() });
const EventIdSchema = z.object({ eventId: z.string().uuid() });

async function writeEventAudit(
  context: AuthContext,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    eventId?: string | null;
    locationId?: string | null;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  },
) {
  await context.supabase.from("event_audit_logs").insert({
    actor_id: context.userId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    event_id: entry.eventId ?? null,
    location_id: entry.locationId ?? null,
    before: (entry.before ?? null) as Json,
    after: (entry.after ?? null) as Json,
    metadata: (entry.metadata ?? {}) as Json,
  });
}

async function loadEventOrThrow(context: AuthContext, eventId: string) {
  const { data, error } = await context.supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Event not found");
  await assertLocationAccess(context, data.location_id as string);
  return data;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function num(v: unknown) {
  return Number(v ?? 0);
}

function emptyDate(v?: string | null) {
  return v && v.trim() ? v : null;
}

function emptyText(v?: string | null) {
  return v && v.trim() ? v.trim() : null;
}

function numOrNull(v: unknown) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asDocuments(value: unknown) {
  return parseJsonArray<{ title: string; url: string }>(value).filter((d) => d && d.url);
}

function asChecklist(value: unknown) {
  return parseJsonArray<{ id: string; title: string; done: boolean }>(value).filter((d) => d?.title);
}

function asComments(value: unknown): EventTaskComment[] {
  return parseJsonArray<EventTaskComment>(value).filter((d) => d?.body);
}

const TASK_COLUMNS =
  "id, event_id, task_number, wbs_id, parent_task_id, title, description, status, priority, start_date, due_date, completed_at, duration_days, owner_staff_id, assignee_staff_id, department_id, percent_complete, is_critical, is_milestone, estimated_hours, actual_hours, estimated_cost, actual_cost, cost_impact, checklist, comments, documents, approval_status, delay_reason, escalation_level, evidence_url, is_snag, lifecycle_phase";

function bumpWindows(event: Record<string, unknown>) {
  return {
    bump_in_start: (event.venue_access as string | null) ?? (event.setup_start as string | null) ?? null,
    bump_in_end: (event.setup_end as string | null) ?? null,
    bump_out_start: (event.dismantle_start as string | null) ?? (event.dismantle_date as string | null) ?? null,
    bump_out_end: (event.dismantle_end as string | null) ?? (event.dismantle_date as string | null) ?? null,
  };
}

async function ensureStandardWorkstreams(context: AuthContext, eventId: string) {
  const { data: existing } = await context.supabase
    .from("event_wbs_nodes")
    .select("id, code, title, sort_order")
    .eq("event_id", eventId)
    .is("deleted_at", null);
  const nodes = existing ?? [];
  const byCode = new Map(nodes.map((n) => [n.code as string, n]));

  for (const [from, to] of Object.entries(WORKSTREAM_RENAMES)) {
    const src = byCode.get(from);
    if (!src || byCode.has(to)) continue;
    const canon = STANDARD_WORKSTREAMS.find((w) => w.code === to);
    await context.supabase
      .from("event_wbs_nodes")
      .update({ code: to, title: canon?.title_en ?? to, sort_order: canon?.sort_order ?? src.sort_order })
      .eq("id", src.id);
    byCode.delete(from);
    byCode.set(to, { ...src, code: to });
  }

  for (const [from, to] of Object.entries(WORKSTREAM_MERGES)) {
    const src = byCode.get(from);
    const tgt = byCode.get(to);
    if (!src || !tgt || src.id === tgt.id) continue;
    await context.supabase.from("event_tasks").update({ wbs_id: tgt.id }).eq("wbs_id", src.id);
    await context.supabase.from("event_wbs_nodes").update({ parent_id: tgt.id }).eq("parent_id", src.id);
    await context.supabase.from("event_milestones").update({ wbs_id: tgt.id }).eq("wbs_id", src.id);
    await context.supabase.from("event_issues").update({ wbs_id: tgt.id }).eq("wbs_id", src.id);
    await context.supabase.from("event_wbs_nodes").update({ deleted_at: new Date().toISOString() }).eq("id", src.id);
    byCode.delete(from);
  }

  const have = new Set([...byCode.keys()].filter(Boolean));
  const missing = STANDARD_WORKSTREAMS.filter((ws) => !have.has(ws.code));
  if (missing.length) {
    const { error } = await context.supabase.from("event_wbs_nodes").insert(
      missing.map((ws) => ({
        event_id: eventId,
        parent_id: null,
        node_type: "phase",
        code: ws.code,
        title: ws.title_en,
        sort_order: ws.sort_order,
        created_by: context.userId,
      })),
    );
    if (error) throw error;
  }

  for (const ws of STANDARD_WORKSTREAMS) {
    const node = byCode.get(ws.code);
    if (node && (node.title !== ws.title_en || node.sort_order !== ws.sort_order)) {
      await context.supabase
        .from("event_wbs_nodes")
        .update({ title: ws.title_en, sort_order: ws.sort_order })
        .eq("id", node.id);
    }
  }

  await ensureRequiredEventDocuments(context, eventId);

  const { data: readyRows } = await context.supabase
    .from("event_readiness_items")
    .select("code")
    .eq("event_id", eventId);
  const haveReady = new Set((readyRows ?? []).map((r) => r.code));
  const missingReady = DEFAULT_READINESS_ITEMS.filter((item) => !haveReady.has(item.code));
  if (missingReady.length) {
    await context.supabase.from("event_readiness_items").insert(
      missingReady.map((item) => ({
        event_id: eventId,
        code: item.code,
        title: item.title,
        category: item.category,
        is_required: true,
        is_complete: item.code === "go_live_approval" ? false : false,
        weight: item.weight,
        phase_code: item.phase_code,
      })),
    );
  }
}

const EVENT_DOC_SELECT =
  "id, title, doc_type, url, file_path, file_name, file_mime, notes, required, status, owner_staff_id, wbs_id, workstream_code, department_id, is_addendum, uploaded_by, uploaded_at";
const EVENT_DOC_SELECT_MID =
  "id, title, doc_type, url, file_path, file_name, file_mime, notes, required, status, owner_staff_id, wbs_id, uploaded_by, uploaded_at";
const EVENT_DOC_SELECT_LEGACY = "id, title, doc_type, url, file_path, notes";

async function fetchEventDocumentRows(context: AuthContext, eventId: string) {
  const full = await context.supabase
    .from("event_documents")
    .select(EVENT_DOC_SELECT)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (!full.error) return { data: (full.data ?? []) as Array<Record<string, unknown>> };
  if (full.error.code !== "42703" && full.error.code !== "PGRST204") throw full.error;
  const mid = await context.supabase
    .from("event_documents")
    .select(EVENT_DOC_SELECT_MID)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (!mid.error) return { data: (mid.data ?? []) as Array<Record<string, unknown>> };
  if (mid.error.code !== "42703" && mid.error.code !== "PGRST204") throw mid.error;
  const legacy = await context.supabase
    .from("event_documents")
    .select(EVENT_DOC_SELECT_LEGACY)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (legacy.error) throw legacy.error;
  return { data: (legacy.data ?? []) as Array<Record<string, unknown>> };
}

async function ensureRequiredEventDocuments(context: AuthContext, eventId: string) {
  const { data: existing, error } = await context.supabase
    .from("event_documents")
    .select("id, doc_type, workstream_code")
    .eq("event_id", eventId)
    .is("deleted_at", null);
  if (error) {
    if (error.code !== "42703" && error.code !== "PGRST204") throw error;
    const { data: legacy } = await context.supabase
      .from("event_documents")
      .select("id, doc_type")
      .eq("event_id", eventId)
      .is("deleted_at", null);
    const have = new Set((legacy ?? []).map((row) => row.doc_type as string));
    const missing = [...REQUIRED_EVENT_DOC_SEEDS, LEGACY_EVENT_BOQ_SEED].filter((seed) => !have.has(seed.doc_type));
    if (!missing.length) return;
    const { error: insertErr } = await context.supabase.from("event_documents").insert(
      missing.map((seed) => ({
        event_id: eventId,
        title: seed.title,
        doc_type: seed.doc_type,
        required: true,
        status: "missing",
        created_by: context.userId,
      })),
    );
    if (insertErr && insertErr.code !== "42703" && insertErr.code !== "PGRST204") throw insertErr;
    return;
  }

  const rows = existing ?? [];
  const seeds: Array<Record<string, unknown>> = [];
  if (!rows.some((row) => row.doc_type === "permit")) {
    seeds.push({
      event_id: eventId,
      title: "Venue permit",
      doc_type: "permit",
      required: true,
      status: "missing",
      created_by: context.userId,
    });
  }

  const haveBoq = new Set(
    rows.filter((row) => row.doc_type === "boq" && row.workstream_code).map((row) => row.workstream_code as string),
  );
  const { data: wbs } = await context.supabase
    .from("event_wbs_nodes")
    .select("id, code")
    .eq("event_id", eventId)
    .is("deleted_at", null);
  for (const ws of STANDARD_WORKSTREAMS) {
    const node = (wbs ?? []).find((n) => n.code === ws.code);
    if (!node || haveBoq.has(ws.code)) continue;
    seeds.push({
      event_id: eventId,
      title: `BOQ — ${ws.title_en}`,
      doc_type: "boq",
      required: true,
      status: "missing",
      workstream_code: ws.code,
      wbs_id: node.id,
      is_addendum: false,
      created_by: context.userId,
    });
  }

  if (!seeds.length) return;
  const { error: insertErr } = await context.supabase.from("event_documents").insert(seeds);
  if (insertErr && insertErr.code !== "42703" && insertErr.code !== "PGRST204") throw insertErr;
}

async function loadEventOps(
  context: AuthContext,
  eventId: string,
  taskRows: Array<Record<string, unknown>>,
) {
  const today = todayIso();
  const [
    { data: wbs },
    { data: issues },
    { data: documents },
    { data: payables },
    { data: assets },
    { data: prs },
    { data: pos },
  ] = await Promise.all([
    context.supabase.from("event_wbs_nodes").select("id, parent_id, code, title").eq("event_id", eventId).is("deleted_at", null),
    context.supabase
      .from("event_issues")
      .select("id, title, description, severity, status, owner_staff_id, due_date, is_snag, is_safety")
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    fetchEventDocumentRows(context, eventId),
    context.supabase
      .from("event_payables")
      .select("id, kind, title, reference, vendor_name, amount, currency, status, due_date")
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .order("due_date", { ascending: true, nullsFirst: false }),
    context.supabase
      .from("event_asset_movements")
      .select("id, item_name, qty, status, due_date, notes")
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("purchase_requisitions")
      .select("id, status, required_by, priority, po_id, total_amount, currency, pr_number")
      .eq("event_id", eventId),
    context.supabase
      .from("purchase_orders")
      .select("id, po_number, vendor_name, amount, currency, status")
      .eq("event_id", eventId)
      .is("deleted_at", null),
  ]);

  const wbsSlim = (wbs ?? []).map((n) => ({
    id: n.id as string,
    parent_id: (n.parent_id as string | null) ?? null,
    code: (n.code as string | null) ?? null,
    title: (n.title as string | null) ?? null,
  }));
  const descendants = new Map<string, Set<string>>();
  for (const node of wbsSlim) {
    const ids = descendantIds(wbsSlim, node.id);
    ids.add(node.id);
    descendants.set(node.id, ids);
  }
  const workstreams = rollupWorkstreams(
    wbsSlim,
    taskRows.map((t) => ({
      status: String(t.status ?? "not_started"),
      due_date: (t.due_date as string | null) ?? null,
      percent_complete: num(t.percent_complete),
      is_critical: Boolean(t.is_critical),
      priority: (t.priority as string | null) ?? null,
      wbs_id: (t.wbs_id as string | null) ?? null,
    })),
    descendants,
    today,
  );

  const issueStaffIds = [...new Set((issues ?? []).map((i) => i.owner_staff_id).filter(Boolean))] as string[];
  const docOwnerIds = [...new Set((documents ?? []).map((d) => d.owner_staff_id).filter(Boolean))] as string[];
  const staffIds = [...new Set([...issueStaffIds, ...docOwnerIds])];
  const { data: issueStaff } = staffIds.length
    ? await context.supabase.from("staff").select("id, full_name, user_id").in("id", staffIds)
    : { data: [] };
  const issueStaffMap = new Map((issueStaff ?? []).map((s) => [s.id, s.full_name]));
  const uploaderIds = [...new Set((documents ?? []).map((d) => d.uploaded_by).filter(Boolean))] as string[];
  const { data: uploaders } = uploaderIds.length
    ? await context.supabase.from("staff").select("user_id, full_name").in("user_id", uploaderIds)
    : { data: [] };
  const uploaderMap = new Map((uploaders ?? []).filter((s) => s.user_id).map((s) => [s.user_id as string, s.full_name]));
  const wbsTitle = new Map(wbsSlim.map((n) => [n.id, n.title]));
  const wbsCode = new Map(wbsSlim.map((n) => [n.id, n.code]));

  const boqLinesRes = await context.supabase
    .from("event_boq_lines")
    .select("document_id, amount")
    .eq("event_id", eventId);
  const lineAgg = new Map<string, { count: number; total: number }>();
  if (!boqLinesRes.error) {
    for (const row of boqLinesRes.data ?? []) {
      const id = row.document_id as string;
      const cur = lineAgg.get(id) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += num(row.amount);
      lineAgg.set(id, cur);
    }
  }

  const issueRows: EventIssueRow[] = (issues ?? []).map((i) => ({
    id: i.id as string,
    title: i.title as string,
    description: (i.description as string | null) ?? null,
    severity: i.severity as EventIssueRow["severity"],
    status: i.status as EventIssueRow["status"],
    owner_staff_id: (i.owner_staff_id as string | null) ?? null,
    owner_name: i.owner_staff_id ? (issueStaffMap.get(i.owner_staff_id as string) ?? null) : null,
    due_date: (i.due_date as string | null) ?? null,
    is_snag: Boolean(i.is_snag),
    is_safety: Boolean(i.is_safety),
    overdue: Boolean(i.due_date && OPEN_ISSUE_STATUSES.has(i.status as string) && (i.due_date as string) < today),
  }));

  const documentRows: EventDocumentRow[] = (documents ?? []).map((d) => {
    const filePath = (d.file_path as string | null) ?? null;
    const url = (d.url as string | null) ?? null;
    const status = resolveDocumentStatus({
      status: ((d.status as EventDocumentRow["status"] | null) ?? "missing") as EventDocumentRow["status"],
      file_path: filePath,
      url,
    });
    return {
      id: d.id as string,
      title: d.title as string,
      doc_type: d.doc_type as EventDocumentRow["doc_type"],
      url,
      file_path: filePath,
      file_name: (d.file_name as string | null) ?? null,
      file_mime: (d.file_mime as string | null) ?? null,
      notes: (d.notes as string | null) ?? null,
      required: Boolean(d.required),
      status,
      owner_staff_id: (d.owner_staff_id as string | null) ?? null,
      owner_name: d.owner_staff_id ? (issueStaffMap.get(d.owner_staff_id as string) ?? null) : null,
      wbs_id: (d.wbs_id as string | null) ?? null,
      workstream_code:
        ((d.workstream_code as string | null) ?? (d.wbs_id ? wbsCode.get(d.wbs_id as string) : null) ?? null),
      workstream_title: d.wbs_id
        ? (wbsTitle.get(d.wbs_id as string) ?? null)
        : workstreamTitle((d.workstream_code as string | null) ?? null) || null,
      department_id: (d.department_id as string | null) ?? null,
      is_addendum: Boolean(d.is_addendum),
      line_count: lineAgg.get(d.id as string)?.count ?? 0,
      line_total: lineAgg.get(d.id as string)?.total ?? 0,
      uploaded_by: (d.uploaded_by as string | null) ?? null,
      uploaded_by_name: d.uploaded_by ? (uploaderMap.get(d.uploaded_by as string) ?? null) : null,
      uploaded_at: (d.uploaded_at as string | null) ?? null,
    };
  });

  const payableRows: EventPayableRow[] = (payables ?? []).map((p) => ({
    id: p.id as string,
    kind: p.kind as EventPayableRow["kind"],
    title: p.title as string,
    reference: (p.reference as string | null) ?? null,
    vendor_name: (p.vendor_name as string | null) ?? null,
    amount: num(p.amount),
    currency: (p.currency as string) ?? "QAR",
    status: p.status as EventPayableRow["status"],
    due_date: (p.due_date as string | null) ?? null,
    source: "payable",
  }));
  for (const po of pos ?? []) {
    payableRows.push({
      id: po.id as string,
      kind: "po",
      title: (po.po_number as string) ?? "PO",
      reference: (po.po_number as string | null) ?? null,
      vendor_name: (po.vendor_name as string | null) ?? null,
      amount: num(po.amount),
      currency: (po.currency as string) ?? "QAR",
      status: PENDING_PO_STATUSES.has(po.status as string)
        ? "pending"
        : po.status === "received" || po.status === "closed"
          ? "paid"
          : "cancelled",
      due_date: null,
      source: "po",
    });
  }

  const assetRows: EventAssetRow[] = (assets ?? []).map((a) => ({
    id: a.id as string,
    item_name: a.item_name as string,
    qty: num(a.qty),
    status: a.status as EventAssetRow["status"],
    due_date: (a.due_date as string | null) ?? null,
    notes: (a.notes as string | null) ?? null,
  }));

  const openTasks = taskRows.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const overdueActions: EventTaskRow[] = openTasks
    .filter((t) => t.due_date && (t.due_date as string) < today)
    .slice(0, 20)
    .map((t) => ({
      id: t.id as string,
      event_id: eventId,
      task_number: (t.task_number as string | null) ?? null,
      wbs_id: (t.wbs_id as string | null) ?? null,
      parent_task_id: (t.parent_task_id as string | null) ?? null,
      title: t.title as string,
      description: (t.description as string | null) ?? null,
      status: t.status as EventTaskRow["status"],
      priority: t.priority as EventTaskRow["priority"],
      start_date: (t.start_date as string | null) ?? null,
      due_date: (t.due_date as string | null) ?? null,
      completed_at: (t.completed_at as string | null) ?? null,
      duration_days: numOrNull(t.duration_days),
      owner_staff_id: (t.owner_staff_id as string | null) ?? null,
      owner_name: null,
      assignee_staff_id: (t.assignee_staff_id as string | null) ?? null,
      assignee_name: null,
      department_id: (t.department_id as string | null) ?? null,
      department_name: null,
      percent_complete: num(t.percent_complete),
      is_critical: Boolean(t.is_critical),
      is_milestone: Boolean(t.is_milestone),
      estimated_hours: numOrNull(t.estimated_hours),
      actual_hours: numOrNull(t.actual_hours),
      estimated_cost: numOrNull(t.estimated_cost),
      actual_cost: numOrNull(t.actual_cost),
      checklist: [],
      comments: [],
      documents: [],
      ...emptyTaskExtras(),
      phase_id: null,
      phase_title: null,
      workstream_id: null,
      workstream_title: null,
      baseline_start: null,
      baseline_due: null,
      baseline_percent: null,
      variance: { startDays: null, dueDays: null, progressDelta: null },
    }));

  const openIssues = issueRows.filter((i) => OPEN_ISSUE_STATUSES.has(i.status));
  const overduePrs = (prs ?? []).filter(
    (p) => PENDING_PR_STATUSES.has(p.status as string) && p.required_by && (p.required_by as string) < today,
  ).length;
  const pendingPos =
    (pos ?? []).filter((p) => PENDING_PO_STATUSES.has(p.status as string)).length +
    payableRows.filter((p) => p.kind === "po" && p.source === "payable" && (p.status === "pending" || p.status === "overdue")).length;
  const pendingPayments = payableRows.filter(
    (p) => p.kind === "payment" && (p.status === "pending" || p.status === "partial" || p.status === "overdue"),
  ).length;
  const proc = workstreams.find((w) => w.code === "procurement_finance");
  const safety = workstreams.find((w) => w.code === "health_safety");
  const openSnags = openIssues.filter((i) => i.is_snag).length + openTasks.filter((t) => t.is_snag).length;
  const criticalSafety =
    openIssues.filter((i) => i.is_safety && (i.severity === "high" || i.severity === "critical")).length +
    (safety?.blocked ?? 0) +
    openTasks.filter((t) => {
      const node = wbsSlim.find((n) => n.id === t.wbs_id);
      return (node?.code === "health_safety" || node?.code === "safety_quality") && (t.is_critical || t.priority === "high" || t.priority === "critical");
    }).length;

  return {
    workstreams,
    issues: issueRows,
    documents: documentRows,
    payables: payableRows,
    assets: assetRows,
    overdueActions,
    openIssues: openIssues.length,
    criticalIssues: openIssues.filter((i) => i.severity === "critical").length,
    pendingPos,
    pendingPayments,
    overduePrs,
    blockedTasks: openTasks.filter((t) => t.status === "blocked").length,
    openSnags,
    criticalSafety,
    missingAssets: assetRows.filter((a) => a.status === "missing").length,
    procurementRisks: overduePrs + (proc?.overdue ?? 0) + (proc?.blocked ?? 0),
  };
}

function emptyTaskExtras() {
  return {
    supporter_ids: [] as string[],
    supporter_names: [] as string[],
    approval_status: "not_required" as EventTaskRow["approval_status"],
    delay_reason: null as string | null,
    escalation_level: "none" as EventTaskRow["escalation_level"],
    cost_impact: null as number | null,
    evidence_url: null as string | null,
    is_snag: false,
    workstream_code: null as string | null,
    lifecycle_phase: null as string | null,
  };
}

function emptyFinance(): EventBudgetTotals {
  return {
    original: null,
    approvedChanges: null,
    revised: null,
    committed: null,
    actual: null,
    forecast: null,
    variance: null,
    varianceForecast: null,
    varianceCommitted: null,
    remaining: null,
    contractValue: null,
    additionalRevenue: null,
    changeOrders: null,
    discounts: null,
    taxes: null,
    finalRevenue: null,
    recognizedRevenue: null,
    grossProfit: null,
    forecastProfit: null,
    actualProfit: null,
    marginPct: null,
    originalMarginPct: null,
    revisedMarginPct: null,
    forecastMarginPct: null,
    actualMarginPct: null,
    receivable: null,
    payable: null,
    hasBudget: false,
    hasInvoices: false,
  };
}

function toFinanceStrip(
  lines: LineAmounts[],
  revenue: RevenueInputs,
  invoices: Array<{ status: string; base_amount?: number; paid_amount?: number }>,
  extraCommitted: number,
): EventBudgetTotals {
  const receivable = outstandingReceivable(invoices);
  const recognized = invoices.length ? recognizedRevenue(invoices) : null;
  if (!lines.length) {
    return {
      ...emptyFinance(),
      contractValue: revenue.contractValue || null,
      additionalRevenue: revenue.additionalRevenue || null,
      changeOrders: revenue.changeOrders || null,
      discounts: revenue.discounts || null,
      taxes: revenue.taxes || null,
      finalRevenue: finalRevenue(revenue) || null,
      recognizedRevenue: recognized,
      receivable,
      hasInvoices: invoices.length > 0,
    };
  }
  const t = sumBudgetLines(lines);
  const committed = t.committed + extraCommitted;
  const remaining = remainingBudget(t.revised, committed);
  const varCommitted = varianceCommitted(t.revised, committed);
  const finalRev = finalRevenue(revenue);
  const forecastGp = finalRev - t.forecast;
  const actualProfit = recognized != null ? recognized - t.actual : null;
  return {
    original: t.original,
    approvedChanges: t.approvedChanges,
    revised: t.revised,
    committed,
    actual: t.actual,
    forecast: t.forecast,
    variance: t.varianceForecast,
    varianceForecast: t.varianceForecast,
    varianceCommitted: varCommitted,
    remaining,
    contractValue: revenue.contractValue,
    additionalRevenue: revenue.additionalRevenue,
    changeOrders: revenue.changeOrders,
    discounts: revenue.discounts,
    taxes: revenue.taxes,
    finalRevenue: finalRev,
    recognizedRevenue: recognized,
    grossProfit: forecastGp,
    forecastProfit: forecastGp,
    actualProfit,
    marginPct: marginPct(finalRev, t.forecast),
    originalMarginPct: marginPct(revenue.contractValue, t.original),
    revisedMarginPct: marginPct(finalRev, t.revised),
    forecastMarginPct: marginPct(finalRev, t.forecast),
    actualMarginPct: recognized != null && recognized > 0 ? marginPct(recognized, t.actual) : null,
    receivable,
    payable: null,
    hasBudget: true,
    hasInvoices: invoices.length > 0,
  };
}

function revenueFromHeader(
  header: { contract_value?: unknown; additional_revenue?: unknown; approved_change_orders?: unknown; discounts?: unknown; taxes?: unknown } | null,
  contractedFallback: number | null,
): RevenueInputs {
  return {
    contractValue: header?.contract_value != null && num(header.contract_value) > 0 ? num(header.contract_value) : contractedFallback ?? 0,
    additionalRevenue: num(header?.additional_revenue),
    changeOrders: num(header?.approved_change_orders),
    discounts: num(header?.discounts),
    taxes: num(header?.taxes),
  };
}

async function loadLookups(context: AuthContext) {
  const [types, classes, stages, cats, subcats, gates] = await Promise.all([
    context.supabase.from("evt_event_types").select("*").eq("active", true).order("sort_order"),
    context.supabase.from("evt_classifications").select("*").eq("active", true).order("sort_order"),
    context.supabase.from("evt_stages").select("*").eq("active", true).order("sort_order"),
    context.supabase.from("evt_cost_categories").select("*").eq("active", true).order("sort_order"),
    context.supabase.from("evt_cost_subcategories").select("*").eq("active", true).order("sort_order"),
    context.supabase.from("evt_stage_gate_requirements").select("*").eq("active", true).order("sort_order"),
  ]);
  if (types.error) throw types.error;
  if (classes.error) throw classes.error;
  if (stages.error) throw stages.error;
  if (cats.error) throw cats.error;
  if (subcats.error) throw subcats.error;
  if (gates.error) throw gates.error;
  return {
    types: (types.data ?? []) as EventLookup[],
    classifications: (classes.data ?? []) as EventLookup[],
    stages: (stages.data ?? []) as EventStage[],
    costCategories: (cats.data ?? []) as EventLookup[],
    costSubcategories: (subcats.data ?? []) as EventCostSubcategory[],
    gates: (gates.data ?? []) as EventGateRequirement[],
  };
}

function categoryChecklistScore(
  rows: Array<{ category?: string | null; is_complete: boolean; weight: number }>,
  category: ReadinessCategory,
): number | null {
  const subset = rows.filter((r) => (r.category ?? "production") === category);
  if (!subset.length) return null;
  const total = subset.reduce((s, r) => s + num(r.weight), 0);
  const done = subset.filter((r) => r.is_complete).reduce((s, r) => s + num(r.weight), 0);
  return scoreOr(done, total);
}

type EventPrIdentity = {
  id: string;
  name?: string | null;
  event_name?: string | null;
  event_number?: string | null;
};

async function fetchEventLinkedPrs(context: AuthContext, event: EventPrIdentity) {
  const { data: byId, error } = await context.supabase
    .from("purchase_requisitions")
    .select(
      "id, pr_number, status, total_amount, currency, cost_category_id, current_step_role, required_by, requested_by, justification, project_name, event_id",
    )
    .eq("event_id", event.id);
  if (error) throw error;

  const names = uniqueEventProjectNames(event);
  let byName: Array<Record<string, unknown>> = [];
  if (names.length) {
    const { data, error: nameErr } = await context.supabase
      .from("purchase_requisitions")
      .select(
        "id, pr_number, status, total_amount, currency, cost_category_id, current_step_role, required_by, requested_by, justification, project_name, event_id",
      )
      .is("event_id", null)
      .in("project_name", names);
    if (nameErr) throw nameErr;
    byName = (data ?? []) as unknown as Array<Record<string, unknown>>;
  }

  const seen = new Set((byId ?? []).map((row) => String((row as { id: string }).id)));
  return [
    ...((byId ?? []) as unknown as Array<Record<string, unknown>>),
    ...byName.filter((row) => !seen.has(String(row.id))),
  ];
}

async function loadEventPrCounts(
  context: AuthContext,
  events: Array<{ id: string; name: string; event_name: string | null; event_number: string | null }>,
) {
  const counts = new Map<string, { linked: number; pending: number; overdue: number }>();
  for (const event of events) counts.set(event.id, { linked: 0, pending: 0, overdue: 0 });
  if (!events.length) return counts;

  const today = todayIso();
  const { data: byId, error } = await context.supabase
    .from("purchase_requisitions")
    .select("id, event_id, project_name, status, required_by")
    .in("event_id", events.map((event) => event.id));
  if (error) throw error;

  const nameToEvent = new Map<string, string[]>();
  const originalNames: string[] = [];
  for (const event of events) {
    for (const name of uniqueEventProjectNames(event)) {
      const key = name.toLowerCase();
      const list = nameToEvent.get(key) ?? [];
      list.push(event.id);
      nameToEvent.set(key, list);
      originalNames.push(name);
    }
  }
  const matchNames = originalNames.filter((name) => (nameToEvent.get(name.toLowerCase()) ?? []).length === 1);
  const { data: byName, error: nameErr } = matchNames.length
    ? await context.supabase
        .from("purchase_requisitions")
        .select("id, event_id, project_name, status, required_by")
        .is("event_id", null)
        .in("project_name", matchNames)
    : { data: [] as Array<Record<string, unknown>>, error: null };
  if (nameErr) throw nameErr;

  const seen = new Set<string>();
  const bump = (eventId: string, status: string, requiredBy: string | null) => {
    const row = counts.get(eventId);
    if (!row) return;
    row.linked += 1;
    if (PENDING_PR_STATUSES.has(status)) {
      row.pending += 1;
      if (requiredBy && requiredBy < today) row.overdue += 1;
    }
  };

  for (const pr of byId ?? []) {
    seen.add(pr.id as string);
    if (pr.event_id) bump(pr.event_id as string, pr.status as string, (pr.required_by as string | null) ?? null);
  }

  for (const pr of byName ?? []) {
    if (seen.has(pr.id as string)) continue;
    const key = String(pr.project_name ?? "").trim().toLowerCase();
    const ids = nameToEvent.get(key);
    if (ids?.length !== 1) continue;
    bump(ids[0], pr.status as string, (pr.required_by as string | null) ?? null);
  }

  return counts;
}

function mapLinkedPrRow(
  pr: Record<string, unknown>,
  extras?: {
    requester_name?: string | null;
    canAct?: boolean;
    canReissue?: boolean;
    isOwner?: boolean;
    overdue?: boolean;
  },
): EventLinkedPrRow {
  return {
    id: pr.id as string,
    pr_number: (pr.pr_number as string | null) ?? null,
    title: prDisplayTitle({
      project_name: (pr.project_name as string | null) ?? null,
      justification: (pr.justification as string | null) ?? null,
      pr_number: (pr.pr_number as string | null) ?? null,
    }),
    status: pr.status as string,
    total_amount: num(pr.total_amount),
    currency: (pr.currency as string) ?? "QAR",
    cost_category_id: (pr.cost_category_id as string | null) ?? null,
    category_code: null,
    category_label_en: null,
    category_label_ar: null,
    exceed_by: null,
    current_step_role: (pr.current_step_role as string | null) ?? null,
    required_by: (pr.required_by as string | null) ?? null,
    requester_name: extras?.requester_name ?? null,
    canAct: extras?.canAct,
    canReissue: extras?.canReissue,
    isOwner: extras?.isOwner,
    overdue: extras?.overdue ?? false,
    match: pr.event_id ? "event_id" : "project_name",
  };
}

type EventMaintIdentity = EventPrIdentity & { location_id?: string | null };

async function fetchEventLinkedMaintenance(context: AuthContext, event: EventMaintIdentity): Promise<EventLinkedMaintenanceRow[]> {
  const cols =
    "id, request_number, status, priority, category, description, area, work_order_id, reported_at, remarks, event_id";
  const { data: byId, error } = await context.supabase
    .from("maintenance_requests")
    .select(cols)
    .eq("event_id", event.id)
    .is("deleted_at", null);
  if (error) {
    if (isMissingEventColumn(error)) return [];
    return [];
  }

  const seen = new Set((byId ?? []).map((row) => String((row as { id: string }).id)));
  let byNotes: Array<Record<string, unknown>> = [];
  if (event.location_id) {
    const { data, error: noteErr } = await context.supabase
      .from("maintenance_requests")
      .select(cols)
      .eq("location_id", event.location_id)
      .is("deleted_at", null)
      .is("event_id", null)
      .limit(60);
    if (noteErr && !isMissingEventColumn(noteErr)) throw noteErr;
    if (!noteErr) {
      byNotes = ((data ?? []) as unknown as Array<Record<string, unknown>>).filter((row) => {
        if (seen.has(String(row.id))) return false;
        return textMatchesEvent((row.remarks as string | null) ?? null, event) || textMatchesEvent((row.description as string | null) ?? null, event);
      });
    }
  }

  const mapRow = (row: Record<string, unknown>, match: EventLinkedMaintenanceRow["match"]): EventLinkedMaintenanceRow => ({
    id: row.id as string,
    request_number: (row.request_number as string) ?? "",
    status: (row.status as string) ?? "submitted",
    priority: (row.priority as string) ?? "normal",
    category: (row.category as string) ?? "",
    description: (row.description as string) ?? "",
    area: (row.area as string | null) ?? null,
    work_order_id: (row.work_order_id as string | null) ?? null,
    reported_at: (row.reported_at as string) ?? "",
    match,
  });

  return [
    ...((byId ?? []) as unknown as Array<Record<string, unknown>>).map((row) => mapRow(row, "event_id")),
    ...byNotes.map((row) => mapRow(row, "notes")),
  ];
}

async function loadScoreInputs(context: AuthContext, eventId: string, eventFacts?: { venueName?: string | null; contracted?: number | null; name?: string | null; event_name?: string | null; event_number?: string | null }) {
  const today = todayIso();
  const [tasks, risks, readinessQ, deliverables, milestones, scopes, budget, lines, baselines, prs, invoices] = await Promise.all([
    context.supabase
      .from("event_tasks")
      .select("id, task_number, title, status, priority, is_critical, is_snag, due_date, start_date, percent_complete, wbs_id, owner_staff_id, description, completed_at, duration_days, assignee_staff_id, department_id, is_milestone, estimated_hours, actual_hours, estimated_cost, actual_cost, lifecycle_phase")
      .eq("event_id", eventId)
      .is("deleted_at", null),
    context.supabase.from("event_risks").select("id, severity, status").eq("event_id", eventId),
    context.supabase.from("event_readiness_items").select("id, code, category, is_complete, weight").eq("event_id", eventId),
    context.supabase
      .from("event_deliverables")
      .select("id, status")
      .eq("event_id", eventId)
      .is("deleted_at", null),
    context.supabase.from("event_milestones").select("id, status").eq("event_id", eventId),
    context.supabase
      .from("event_scope_versions")
      .select("id, is_baseline")
      .eq("event_id", eventId)
      .order("version_no", { ascending: false }),
    context.supabase
      .from("event_budgets")
      .select("id, status, contract_value, additional_revenue, approved_change_orders, discounts, taxes")
      .eq("event_id", eventId)
      .maybeSingle(),
    context.supabase
      .from("event_budget_lines")
      .select("original_amount, approved_changes, revised_amount, committed_amount, actual_amount, forecast_amount")
      .eq("event_id", eventId),
    context.supabase.from("event_baselines").select("id, baseline_type").eq("event_id", eventId),
    fetchEventLinkedPrs(
      context,
      {
        id: eventId,
        name: eventFacts?.name ?? null,
        event_name: eventFacts?.event_name ?? null,
        event_number: eventFacts?.event_number ?? null,
      },
    ).then((rows) => ({ data: rows })),
    context.supabase.from("event_client_invoices").select("status, base_amount, paid_amount").eq("event_id", eventId),
  ]);

  const taskRows = tasks.data ?? [];
  const openTasks = taskRows.filter((t) => t.status !== "cancelled");
  const completed = openTasks.filter((t) => t.status === "completed");
  const overdue = openTasks.filter(
    (t) => t.status !== "completed" && t.due_date && (t.due_date as string) < today,
  );
  const overdueCritical = overdue.filter((t) => t.is_critical || t.priority === "critical");
  const overdueHigh = overdue.filter(
    (t) => (t.priority === "high" || t.priority === "urgent") && !t.is_critical,
  );
  const criticalOpen = openTasks.filter((t) => t.status !== "completed" && (t.is_critical || t.priority === "critical"));

  const riskRows = risks.data ?? [];
  const openRisks = riskRows.filter((r) => r.status !== "closed");
  const openCriticalRisks = openRisks.filter((r) => r.severity === "critical").length;
  const openHighRisks = openRisks.filter((r) => r.severity === "high").length;

  const readyRows = (readinessQ.data ?? []) as Array<{
    id: string;
    code: string;
    category?: string | null;
    is_complete: boolean;
    weight: number;
  }>;
  const completedCodes = new Set(readyRows.filter((r) => r.is_complete).map((r) => r.code));

  const delRows = (deliverables.data ?? []).filter((d) => d.status !== "cancelled");
  const mileRows = milestones.data ?? [];
  const scopeRows = scopes.data ?? [];
  const lineRows = (lines.data ?? []) as LineAmounts[];
  const budgetApproved = budget.data?.status === "approved" || budget.data?.status === "locked";
  const scopeBaselined = scopeRows.some((s) => s.is_baseline);
  const hasScheduleBaseline = (baselines.data ?? []).some((b) => b.baseline_type === "schedule" || b.baseline_type === "both");

  const prRows = prs.data ?? [];
  const finance = toFinanceStrip(
    lineRows,
    revenueFromHeader(budget.data, eventFacts?.contracted ?? null),
    invoices.data ?? [],
    prCommittedTotal(
      prRows.map((p) => ({
        id: p.id as string,
        status: p.status as string,
        total_amount: num(p.total_amount),
        cost_category_id: (p.cost_category_id as string | null) ?? null,
      })),
    ),
  );
  const pendingPrs = prRows.filter((p) => PENDING_PR_STATUSES.has(p.status as string)).length;
  const approvedPrs = prRows.filter((p) => APPROVED_PR_STATUSES.has(p.status as string)).length;
  const procurementPct = prRows.length ? (approvedPrs / prRows.length) * 100 : categoryChecklistScore(readyRows, "procurement");
  const criticalPrsApproved = prRows.length > 0 ? pendingPrs === 0 : completedCodes.has("critical_prs");

  const categoryScores: Partial<Record<ReadinessCategory, number | null>> = {};
  for (const cat of READINESS_CATEGORIES) {
    categoryScores[cat] = categoryChecklistScore(readyRows, cat);
  }
  categoryScores.scope = blendScores(
    categoryScores.scope,
    scopeBaselined ? 100 : scopeRows.length > 0 ? 40 : null,
  );
  categoryScores.approvals = blendScores(categoryScores.approvals, scopeBaselined ? 100 : null);
  categoryScores.budget = blendScores(categoryScores.budget, budgetApproved ? 100 : budget.data ? 50 : null);
  categoryScores.procurement = blendScores(categoryScores.procurement, procurementPct);
  categoryScores.venue = blendScores(categoryScores.venue, eventFacts?.venueName ? 100 : null);
  categoryScores.production = blendScores(
    categoryScores.production,
    scoreOr(completed.length, openTasks.length),
    scoreOr(mileRows.filter((m) => m.status === "achieved").length, mileRows.length),
    scoreOr(delRows.filter((d) => d.status === "done").length, delRows.length),
  );

  const readiness = computeReadiness({ categoryScores });

  return {
    taskRows,
    overdue,
    overdueCritical: overdueCritical.length,
    overdueHigh: overdueHigh.length,
    openRisks: openRisks.length,
    openCriticalRisks,
    openHighRisks,
    finance,
    readiness,
    budgetStatus: (budget.data?.status as EventOverview["budgetStatus"]) ?? null,
    deliverableCount: delRows.length,
    milestoneCount: mileRows.length,
    scopeBaselined,
    completedReadinessCodes: completedCodes,
    hasSchedule: hasScheduleBaseline || mileRows.length > 0 || completedCodes.has("production_schedule"),
    pendingPrs,
    linkedPrCount: prRows.length,
    procurementPct,
    criticalPrsApproved,
    tasksSummary: {
      total: openTasks.length,
      completed: completed.length,
      overdue: overdue.length,
      overdueCritical: overdueCritical.length,
      criticalOpen: criticalOpen.length,
    },
  };
}

async function persistScores(
  context: AuthContext,
  event: {
    id: string;
    event_start: string | null;
    stage_id: string | null;
    contracted_value: number | null;
    venue_name?: string | null;
    name?: string | null;
    event_name?: string | null;
    event_number?: string | null;
  },
  stages: EventStage[],
) {
  const inputs = await loadScoreInputs(context, event.id, {
    venueName: event.venue_name,
    contracted: event.contracted_value,
    name: event.name,
    event_name: event.event_name,
    event_number: event.event_number,
  });
  const stage = stages.find((s) => s.id === event.stage_id) ?? null;
  const health = computeEventHealth({
    overdueCriticalTasks: inputs.overdueCritical,
    overdueHighTasks: inputs.overdueHigh,
    openCriticalRisks: inputs.openCriticalRisks,
    openHighRisks: inputs.openHighRisks,
    forecast: inputs.finance.forecast ?? 0,
    revised: inputs.finance.revised ?? 0,
    daysUntilEvent: daysUntil(event.event_start),
    stageCode: stage?.code ?? null,
    readinessPct: inputs.readiness.pct,
  });
  await context.supabase
    .from("events")
    .update({
      health_rag: health.rag,
      health_score: health.score,
      readiness_pct: inputs.readiness.pct,
      updated_by: context.userId,
    })
    .eq("id", event.id);
  return { ...inputs, health, stage };
}

function mapListRow(
  row: Record<string, unknown>,
  extras: {
    location_name?: string | null;
    pm_name?: string | null;
    stage?: EventStage | null;
    typeCode?: string | null;
  },
): EventListRow {
  const computed = (row.health_rag as EventRag) ?? "amber";
  const override = (row.health_override_rag as EventRag | null) ?? null;
  return {
    id: row.id as string,
    event_number: (row.event_number as string | null) ?? null,
    name: row.name as string,
    event_name: (row.event_name as string | null) ?? null,
    client_name: (row.client_name as string | null) ?? null,
    venue_name: (row.venue_name as string | null) ?? null,
    location_id: row.location_id as string,
    location_name: extras.location_name ?? null,
    event_type_id: (row.event_type_id as string | null) ?? null,
    event_type_code: extras.typeCode ?? null,
    classification_id: (row.classification_id as string | null) ?? null,
    stage_id: (row.stage_id as string | null) ?? null,
    stage_code: extras.stage?.code ?? null,
    stage_label_en: extras.stage?.label_en ?? null,
    stage_label_ar: extras.stage?.label_ar ?? null,
    status: row.status as EventListRow["status"],
    priority: row.priority as EventListRow["priority"],
    event_start: (row.event_start as string | null) ?? null,
    event_end: (row.event_end as string | null) ?? null,
    setup_start: (row.setup_start as string | null) ?? null,
    dismantle_date: (row.dismantle_date as string | null) ?? (row.dismantle_end as string | null) ?? null,
    pm_staff_id: (row.pm_staff_id as string | null) ?? null,
    pm_name: extras.pm_name ?? null,
    contracted_value: row.contracted_value == null ? null : num(row.contracted_value),
    health_rag: effectiveHealth(computed, override),
    health_computed: computed,
    health_overridden: Boolean(override),
    health_score: num(row.health_score),
    readiness_pct: num(row.readiness_pct),
    days_until_event: daysUntil((row.event_start as string | null) ?? null),
    currency: (row.currency as string) ?? "QAR",
    go_live_approved: Boolean(row.go_live_approved),
    overall_progress: row.overall_progress == null ? null : num(row.overall_progress),
    pending_prs: 0,
    linked_prs: 0,
    overdue_prs: 0,
    open_maintenance: 0,
    staffing_assigned: 0,
    overdue_hr_tasks: 0,
  };
}

function gateFactsFromScores(
  event: Record<string, unknown>,
  scored: Awaited<ReturnType<typeof persistScores>>,
  manuals: Array<{ requirement_id: string }>,
) {
  return {
    hasContractValue: num(event.contracted_value) > 0,
    budgetApproved: scored.budgetStatus === "approved" || scored.budgetStatus === "locked",
    scopeBaselined: scored.scopeBaselined,
    deliverableCount: scored.deliverableCount,
    milestoneCount: scored.milestoneCount,
    readinessPct: scored.readiness.pct,
    openCriticalRisks: scored.openCriticalRisks,
    overdueCriticalTasks: scored.overdueCritical,
    manualSatisfied: new Set(manuals.map((m) => m.requirement_id)),
    venueConfirmed: Boolean(emptyText(event.venue_name as string | null) || scored.completedReadinessCodes.has("venue_confirmed")),
    completedReadinessCodes: scored.completedReadinessCodes,
    hasPm: Boolean(event.pm_staff_id),
    hasOpeningDate: Boolean(event.event_start),
    scheduleAvailable: scored.hasSchedule,
    criticalPrsApproved: scored.criticalPrsApproved,
  };
}

export const getEventOptions = createAuthenticatedActionNoInput(
  async (context) => {
    const lookups = await loadLookups(context);
    const [{ data: locations }, { data: staff }, { data: departments }] = await Promise.all([
      context.supabase.from("locations").select("id, name, code, region, city, country").eq("status", "active").order("name"),
      context.supabase
        .from("staff")
        .select("id, full_name, job_title, location_id")
        .is("deleted_at", null)
        .order("full_name")
        .limit(300),
      context.supabase.from("master_departments").select("id, name").eq("active", true).order("sort_order"),
    ]);
    return {
      ...lookups,
      locations: locations ?? [],
      staff: staff ?? [],
      departments: departments ?? [],
    };
  },
  { auth: { capability: "events.view" } },
);

export const listEvents = createAuthenticatedAction(
  z
    .object({
      locationId: z.string().uuid().nullable().optional(),
      status: z.enum(EVENT_STATUSES).nullable().optional(),
      stageId: z.string().uuid().nullable().optional(),
      health: z.enum(["green", "amber", "red", "critical"]).nullable().optional(),
      search: z.string().max(120).optional().nullable(),
      pmStaffId: z.string().uuid().nullable().optional(),
    })
    .default({}),
  async (data, context) => {
    const lookups = await loadLookups(context);
    let q = context.supabase
      .from("events")
      .select(
        "id, event_number, name, event_name, client_name, venue_name, location_id, event_type_id, classification_id, stage_id, status, priority, event_start, event_end, setup_start, dismantle_date, dismantle_end, pm_staff_id, contracted_value, health_rag, health_override_rag, health_score, readiness_pct, currency, go_live_approved",
      )
      .is("deleted_at", null)
      .order("event_start", { ascending: true, nullsFirst: false })
      .limit(400);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.status) q = q.eq("status", data.status);
    if (data.stageId) q = q.eq("stage_id", data.stageId);
    if (data.pmStaffId) q = q.eq("pm_staff_id", data.pmStaffId);
    if (data.search?.trim()) q = q.or(`name.ilike.%${data.search.trim()}%,event_name.ilike.%${data.search.trim()}%,event_number.ilike.%${data.search.trim()}%,client_name.ilike.%${data.search.trim()}%`);

    const { data: rows, error } = await q;
    if (error) throw error;
    const list = rows ?? [];
    const locIds = [...new Set(list.map((r) => r.location_id))];
    const staffIds = [...new Set(list.map((r) => r.pm_staff_id).filter(Boolean))] as string[];
    const [{ data: locs }, { data: staff }] = await Promise.all([
      locIds.length ? context.supabase.from("locations").select("id, name").in("id", locIds) : { data: [] },
      staffIds.length ? context.supabase.from("staff").select("id, full_name").in("id", staffIds) : { data: [] },
    ]);
    const locMap = new Map((locs ?? []).map((l) => [l.id, l.name]));
    const staffMap = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
    const stageMap = new Map(lookups.stages.map((s) => [s.id, s]));
    const typeMap = new Map(lookups.types.map((t) => [t.id, t.code]));

    const mapped = list.map((row) =>
      mapListRow(row as Record<string, unknown>, {
        location_name: locMap.get(row.location_id) ?? null,
        pm_name: row.pm_staff_id ? (staffMap.get(row.pm_staff_id) ?? null) : null,
        stage: row.stage_id ? (stageMap.get(row.stage_id) ?? null) : null,
        typeCode: row.event_type_id ? (typeMap.get(row.event_type_id) ?? null) : null,
      }),
    );
    const prCounts = await loadEventPrCounts(
      context,
      mapped.map((row) => ({
        id: row.id,
        name: row.name,
        event_name: row.event_name,
        event_number: row.event_number,
      })),
    );
    const withPrs = mapped.map((row) => {
      const counts = prCounts.get(row.id);
      return {
        ...row,
        linked_prs: counts?.linked ?? 0,
        pending_prs: counts?.pending ?? 0,
        overdue_prs: counts?.overdue ?? 0,
      };
    });
    return data.health ? withPrs.filter((row) => row.health_rag === data.health) : withPrs;
  },
  { defaultInput: {}, auth: { capability: "events.view" } },
);

export const getEventsDashboard = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }).default({}),
  async (data, context) => {
    const events = await listEvents({ locationId: data.locationId });
    const today = todayIso();
    const upcoming = events.filter(
      (e) => e.event_start && e.event_start >= today && e.status === "active",
    );
    const live = events.filter((e) => e.stage_code && LIVE_STAGE_CODES.has(e.stage_code));
    const eventIds = events.map((e) => e.id);
    let budgetRevised = 0;
    let budgetActual = 0;
    let budgetCommitted = 0;
    let savedVsBudgetTotal = 0;
    let overdueTasks = 0;
    let blockedTasks = 0;
    let pendingPrs = 0;
    let pendingPos = 0;
    let pendingPayments = 0;
    let procurementRisks = 0;
    let openSnags = 0;
    let criticalSafety = 0;
    let missingAssets = 0;
    let budgetLines: Array<LineAmounts & { event_id: string }> = [];
    let linkedPrs: Array<{ id: string; event_id: string | null; status: string; total_amount: number }> = [];
    if (eventIds.length) {
      const [{ data: lines }, { data: tasks }, { data: wbs }, { data: prs }, { data: payables }, { data: issues }, { data: assets }, { data: pos }] =
        await Promise.all([
          context.supabase
            .from("event_budget_lines")
            .select("event_id, original_amount, approved_changes, revised_amount, committed_amount, actual_amount, forecast_amount")
            .in("event_id", eventIds),
          context.supabase
            .from("event_tasks")
            .select("event_id, status, due_date, priority, is_critical, is_snag, wbs_id")
            .in("event_id", eventIds)
            .is("deleted_at", null),
          context.supabase.from("event_wbs_nodes").select("id, event_id, code").in("event_id", eventIds).is("deleted_at", null),
          context.supabase
            .from("purchase_requisitions")
            .select("id, event_id, status, required_by, priority, po_id, total_amount")
            .in("event_id", eventIds),
          context.supabase
            .from("event_payables")
            .select("event_id, kind, status, due_date")
            .in("event_id", eventIds)
            .is("deleted_at", null),
          context.supabase
            .from("event_issues")
            .select("event_id, status, severity, is_snag, is_safety")
            .in("event_id", eventIds)
            .is("deleted_at", null),
          context.supabase
            .from("event_asset_movements")
            .select("event_id, status")
            .in("event_id", eventIds)
            .is("deleted_at", null),
          context.supabase
            .from("purchase_orders")
            .select("id, event_id, status")
            .in("event_id", eventIds)
            .is("deleted_at", null),
        ]);
      budgetLines = (lines ?? []) as Array<LineAmounts & { event_id: string }>;
      linkedPrs = (prs ?? []).map((p) => ({
        id: p.id as string,
        event_id: (p.event_id as string | null) ?? null,
        status: p.status as string,
        total_amount: num(p.total_amount),
      }));
      const extraCommitted = prCommittedTotal(
        linkedPrs.map((p) => ({ id: p.id, status: p.status, total_amount: p.total_amount, cost_category_id: null })),
      );
      const portfolio = portfolioLineFinance(budgetLines, extraCommitted);
      budgetRevised = portfolio.revised;
      budgetActual = portfolio.actual;
      budgetCommitted = portfolio.committed;
      savedVsBudgetTotal = portfolio.savedVsBudget;
      const openTasks = (tasks ?? []).filter((t) => t.status !== "completed" && t.status !== "cancelled");
      overdueTasks = openTasks.filter((t) => t.due_date && t.due_date < today).length;
      blockedTasks = openTasks.filter((t) => t.status === "blocked").length;
      pendingPrs = (prs ?? []).filter((p) => PENDING_PR_STATUSES.has(p.status as string)).length;
      const overduePrs = (prs ?? []).filter(
        (p) => PENDING_PR_STATUSES.has(p.status as string) && p.required_by && (p.required_by as string) < today,
      ).length;
      const poIds = [...new Set((prs ?? []).map((p) => p.po_id).filter(Boolean))] as string[];
      const { data: linkedPos } = poIds.length
        ? await context.supabase.from("purchase_orders").select("id, status").in("id", poIds).is("deleted_at", null)
        : { data: [] };
      pendingPos =
        (pos ?? []).filter((p) => PENDING_PO_STATUSES.has(p.status as string)).length +
        (linkedPos ?? []).filter((p) => PENDING_PO_STATUSES.has(p.status as string)).length +
        (payables ?? []).filter((p) => p.kind === "po" && (p.status === "pending" || p.status === "overdue")).length;
      pendingPayments = (payables ?? []).filter((p) => p.kind === "payment" && (p.status === "pending" || p.status === "overdue" || p.status === "partial")).length;
      const safetyIds = new Set((wbs ?? []).filter((n) => n.code === "health_safety" || n.code === "safety_quality").map((n) => n.id));
      const procIds = new Set((wbs ?? []).filter((n) => n.code === "procurement_finance").map((n) => n.id));
      const procHigh = openTasks.filter(
        (t) => t.wbs_id && procIds.has(t.wbs_id as string) && (t.priority === "high" || t.priority === "critical" || t.priority === "urgent" || t.is_critical),
      ).length;
      procurementRisks = overduePrs + procHigh;
      openSnags =
        (issues ?? []).filter((i) => OPEN_ISSUE_STATUSES.has(i.status as string) && i.is_snag).length +
        openTasks.filter((t) => t.is_snag).length;
      criticalSafety =
        (issues ?? []).filter((i) => OPEN_ISSUE_STATUSES.has(i.status as string) && i.is_safety && (i.severity === "high" || i.severity === "critical")).length +
        openTasks.filter((t) => t.wbs_id && safetyIds.has(t.wbs_id as string) && (t.is_critical || t.priority === "high" || t.priority === "critical")).length;
      missingAssets = (assets ?? []).filter((a) => a.status === "missing").length;
    }
    const result: EventDashboard = {
      total: events.length,
      upcoming: upcoming.length,
      live: live.length,
      rag: {
        green: events.filter((e) => e.health_rag === "green").length,
        amber: events.filter((e) => e.health_rag === "amber").length,
        red: events.filter((e) => e.health_rag === "red").length,
        critical: events.filter((e) => e.health_rag === "critical").length,
      },
      contractedValue: events.reduce((s, e) => s + (e.contracted_value ?? 0), 0),
      budgetRevised,
      budgetActual,
      budgetCommitted,
      savedVsBudget: savedVsBudgetTotal,
      overdueTasks,
      blockedTasks,
      avgReadiness: events.length ? Math.round(events.reduce((s, e) => s + e.readiness_pct, 0) / events.length) : 0,
      pendingPrs,
      pendingPos,
      pendingPayments,
      procurementRisks,
      openSnags,
      criticalSafety,
      missingAssets,
      goLivePending: events.filter((e) => e.status === "active" && !e.go_live_approved).length,
      events: events.slice(0, 12).map((event) => {
        const evLines = budgetLines.filter((l) => l.event_id === event.id);
        const extra = prCommittedTotal(
          linkedPrs
            .filter((p) => p.event_id === event.id)
            .map((p) => ({ id: p.id, status: p.status, total_amount: p.total_amount, cost_category_id: null })),
        );
        const finance = portfolioLineFinance(evLines, extra);
        return {
          ...event,
          budget_revised: finance.revised,
          budget_actual: finance.actual,
          budget_committed: finance.committed,
          saved_vs_budget: finance.savedVsBudget,
        };
      }),
    };
    return result;
  },
  { defaultInput: {}, auth: { capability: "events.view" } },
);

export const listEventCalendar = createAuthenticatedAction(
  z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    locationId: z.string().uuid().nullable().optional(),
  }),
  async (data, context) => {
    const start = `${data.month}-01`;
    const endDate = new Date(`${start}T00:00:00`);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);
    const end = endDate.toISOString().slice(0, 10);
    const events = await listEvents({ locationId: data.locationId });
    return events.filter((e) => {
      const from = e.setup_start ?? e.event_start;
      const to = e.dismantle_date ?? e.event_end ?? e.event_start;
      if (!from && !to) return false;
      const a = from ?? to!;
      const b = to ?? from!;
      return a <= end && b >= start;
    });
  },
  { auth: { capability: "events.view" } },
);

export const listMyEventTasks = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }).default({}),
  async (data, context) => {
    const { data: me } = await context.supabase
      .from("staff")
      .select("id")
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .maybeSingle();

    let q = context.supabase
      .from("event_tasks")
      .select(
        TASK_COLUMNS,
      )
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(200);
    if (me?.id) q = q.or(`owner_staff_id.eq.${me.id},assignee_staff_id.eq.${me.id}`);
    else q = q.eq("id", "00000000-0000-0000-0000-000000000000");

    const { data: rows, error } = await q;
    if (error) throw error;
    const list = rows ?? [];
    const eventIds = [...new Set(list.map((r) => r.event_id))];
    const { data: events } = eventIds.length
      ? await context.supabase
          .from("events")
          .select("id, name, event_number, location_id")
          .in("id", eventIds)
          .is("deleted_at", null)
      : { data: [] };
    const evMap = new Map((events ?? []).map((e) => [e.id, e]));
    return list
      .filter((t) => {
        const ev = evMap.get(t.event_id);
        if (!ev) return false;
        if (data.locationId && ev.location_id !== data.locationId) return false;
        return true;
      })
      .map((t) => {
        const ev = evMap.get(t.event_id);
        return {
          ...t,
          owner_name: null,
          assignee_name: null,
          department_name: null,
          checklist: asChecklist(t.checklist),
          comments: asComments(t.comments),
          documents: asDocuments(t.documents),
          ...emptyTaskExtras(),
          approval_status: ((t as { approval_status?: string }).approval_status as EventTaskRow["approval_status"]) ?? "not_required",
          delay_reason: ((t as { delay_reason?: string | null }).delay_reason) ?? null,
          escalation_level: ((t as { escalation_level?: string }).escalation_level as EventTaskRow["escalation_level"]) ?? "none",
          cost_impact: numOrNull((t as { cost_impact?: number | null }).cost_impact),
          evidence_url: ((t as { evidence_url?: string | null }).evidence_url) ?? null,
          is_snag: Boolean((t as { is_snag?: boolean }).is_snag),
          phase_id: null,
          phase_title: null,
          workstream_id: null,
          workstream_title: null,
          baseline_start: null,
          baseline_due: null,
          baseline_percent: null,
          variance: { startDays: null, dueDays: null, progressDelta: null },
          event_name: ev?.name,
          event_number: ev?.event_number ?? null,
        } as EventTaskRow;
      });
  },
  { defaultInput: {}, auth: { capability: "events.view" } },
);

export const getEvent = createAuthenticatedAction(IdSchema, async (data, context) => {
  const event = await loadEventOrThrow(context, data.id);
  const lookups = await loadLookups(context);
  const scored = await persistScores(
    context,
    {
      id: event.id as string,
      event_start: event.event_start as string | null,
      stage_id: event.stage_id as string | null,
      contracted_value: event.contracted_value as number | null,
      venue_name: event.venue_name as string | null,
      name: event.name as string | null,
      event_name: event.event_name as string | null,
      event_number: event.event_number as string | null,
    },
    lookups.stages,
  );

  const linear = lookups.stages.filter((s) => s.is_linear !== false).sort((a, b) => a.sort_order - b.sort_order);
  const current = linear.find((s) => s.id === event.stage_id) ?? lookups.stages.find((s) => s.id === event.stage_id) ?? null;
  const nextStage = current
    ? linear.find((s) => s.sort_order === current.sort_order + 1) ?? linear.find((s) => s.sort_order > current.sort_order) ?? null
    : linear[0] ?? null;
  const gateStageId = nextStage?.id ?? event.stage_id;
  const stageReqs = lookups.gates.filter((g) => g.stage_id === gateStageId);
  const { data: manuals } = await context.supabase
    .from("event_gate_completions")
    .select("requirement_id, is_satisfied")
    .eq("event_id", event.id)
    .eq("is_satisfied", true);
  const gates = evaluateGates(stageReqs, gateFactsFromScores(event as Record<string, unknown>, scored, manuals ?? []));

  const [{ data: loc }, { data: pm }, { data: director }, { data: dept }, { data: team }, { data: risks }, { data: ready }, { data: audit }] =
    await Promise.all([
      context.supabase.from("locations").select("id, name").eq("id", event.location_id as string).maybeSingle(),
      event.pm_staff_id
        ? context.supabase.from("staff").select("id, full_name").eq("id", event.pm_staff_id as string).maybeSingle()
        : Promise.resolve({ data: null }),
      event.director_staff_id
        ? context.supabase.from("staff").select("id, full_name").eq("id", event.director_staff_id as string).maybeSingle()
        : Promise.resolve({ data: null }),
      event.department_id
        ? context.supabase.from("master_departments").select("id, name").eq("id", event.department_id as string).maybeSingle()
        : Promise.resolve({ data: null }),
      context.supabase.from("event_team_members").select("id, staff_id, role_label, is_pm").eq("event_id", event.id),
      context.supabase
        .from("event_risks")
        .select("id, title, severity, status, due_date")
        .eq("event_id", event.id)
        .order("created_at", { ascending: false }),
      context.supabase.from("event_readiness_items").select("id, code, title, category, is_required, is_complete, weight, phase_code").eq("event_id", event.id),
      context.supabase
        .from("event_audit_logs")
        .select("id, action, entity_type, created_at, metadata")
        .eq("event_id", event.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  const teamStaffIds = [...new Set((team ?? []).map((m) => m.staff_id))];
  const { data: teamStaff } = teamStaffIds.length
    ? await context.supabase.from("staff").select("id, full_name").in("id", teamStaffIds)
    : { data: [] };
  const staffMap = new Map((teamStaff ?? []).map((s) => [s.id, s.full_name]));
  const type = lookups.types.find((t) => t.id === event.event_type_id);
  const classification = lookups.classifications.find((c) => c.id === event.classification_id);
  const stage = lookups.stages.find((s) => s.id === event.stage_id) ?? null;
  const overrideRag = (event.health_override_rag as EventRag | null) ?? null;
  const listRow = mapListRow(
    { ...event, health_rag: scored.health.rag, health_score: scored.health.score, readiness_pct: scored.readiness.pct },
    {
      location_name: loc?.name ?? null,
      pm_name: pm?.full_name ?? null,
      stage,
      typeCode: type?.code ?? null,
    },
  );

  await ensureStandardWorkstreams(context, event.id as string);
  const ops = await loadEventOps(context, event.id as string, scored.taskRows as Array<Record<string, unknown>>);
  const missingGates = gates.filter((g) => g.blocking && !g.satisfied).length;

  const rawPrs = await fetchEventLinkedPrs(
    context,
    {
      id: event.id as string,
      name: event.name as string | null,
      event_name: event.event_name as string | null,
      event_number: event.event_number as string | null,
    },
  );
  const prUserIds = [...new Set(rawPrs.map((p) => p.requested_by as string | null).filter(Boolean))] as string[];
  const { data: prStaff } = prUserIds.length
    ? await context.supabase.from("staff").select("user_id, full_name").in("user_id", prUserIds)
    : { data: [] as { user_id: string | null; full_name: string }[] };
  const prStaffMap = new Map((prStaff ?? []).filter((s) => s.user_id).map((s) => [s.user_id as string, s.full_name]));
  const roles = (context.roles ?? []) as AppRole[];
  const today = todayIso();
  const linkedPrs = rawPrs.map((pr) => {
    const flags = resolvePrActions({
      status: pr.status as string,
      currentStepRole: (pr.current_step_role as string | null) ?? null,
      requestedBy: (pr.requested_by as string | null) ?? null,
      userId: context.userId,
      roles,
    });
    const requiredBy = (pr.required_by as string | null) ?? null;
    return mapLinkedPrRow(pr, {
      requester_name: pr.requested_by ? (prStaffMap.get(pr.requested_by as string) ?? null) : null,
      canAct: flags.canAct,
      canReissue: flags.canReissue,
      isOwner: flags.isOwner,
      overdue: Boolean(
        requiredBy && requiredBy < today && PENDING_PR_STATUSES.has(pr.status as string),
      ),
    });
  });
  const linkedMaintenance = await fetchEventLinkedMaintenance(context, {
    id: event.id as string,
    name: event.name as string | null,
    event_name: event.event_name as string | null,
    event_number: event.event_number as string | null,
    location_id: event.location_id as string | null,
  });

  const overview: EventOverview = {
    event: {
      ...listRow,
      description: (event.description as string | null) ?? null,
      notes: (event.notes as string | null) ?? null,
      lessons_learned: (event.lessons_learned as string | null) ?? null,
      inquiry_date: (event.inquiry_date as string | null) ?? null,
      contract_date: (event.contract_date as string | null) ?? null,
      setup_end: (event.setup_end as string | null) ?? null,
      classification_code: classification?.code ?? null,
      client_contact: (event.client_contact as string | null) ?? null,
      business_unit: (event.business_unit as string | null) ?? null,
      director_staff_id: (event.director_staff_id as string | null) ?? null,
      director_name: director?.full_name ?? null,
      department_id: (event.department_id as string | null) ?? null,
      department_name: dept?.name ?? null,
      country: (event.country as string | null) ?? null,
      city: (event.city as string | null) ?? null,
      planning_start: (event.planning_start as string | null) ?? null,
      venue_access: (event.venue_access as string | null) ?? null,
      rehearsal_date: (event.rehearsal_date as string | null) ?? null,
      client_inspection_date: (event.client_inspection_date as string | null) ?? null,
      dismantle_start: (event.dismantle_start as string | null) ?? null,
      dismantle_end: (event.dismantle_end as string | null) ?? (event.dismantle_date as string | null) ?? null,
      handover_date: (event.handover_date as string | null) ?? null,
      financial_close_target: (event.financial_close_target as string | null) ?? null,
      final_closure_date: (event.final_closure_date as string | null) ?? null,
      health_override_rag: overrideRag,
      health_override_justification: (event.health_override_justification as string | null) ?? null,
      event_type_label_en: type?.label_en ?? null,
      event_type_label_ar: type?.label_ar ?? null,
      go_live_approved_at: (event.go_live_approved_at as string | null) ?? null,
      ...bumpWindows(event as Record<string, unknown>),
      go_live_approved: Boolean(event.go_live_approved),
      overall_progress: overallTaskProgress(scored.taskRows),
      pending_prs: linkedPrs.filter((p) => PENDING_PR_STATUSES.has(p.status)).length,
      linked_prs: linkedPrs.length,
      overdue_prs: linkedPrs.filter((p) => p.overdue).length,
    },
    stages: lookups.stages,
    nextStage,
    gates,
    health: scored.health,
    readinessParts: scored.readiness.parts,
    readinessBand: readinessBand(scored.readiness.pct),
    finance: scored.finance,
    budgetStatus: scored.budgetStatus,
    tasks: scored.tasksSummary,
    ops: {
      tasksTotal: scored.tasksSummary.total,
      tasksCompleted: scored.tasksSummary.completed,
      tasksOverdue: scored.tasksSummary.overdue,
      tasksCritical: scored.tasksSummary.criticalOpen,
      openRisks: scored.openRisks,
      criticalRisks: scored.openCriticalRisks,
      openIssues: ops.openIssues,
      criticalIssues: ops.criticalIssues,
      pendingPrs: linkedPrs.filter((p) => PENDING_PR_STATUSES.has(p.status)).length,
      pendingPos: ops.pendingPos,
      pendingPayments: ops.pendingPayments,
      pendingApprovals: missingGates + (Boolean(event.go_live_approved) ? 0 : 1),
      procurementPct: scored.procurementPct,
      manpowerPct: scored.readiness.parts.manpower ?? null,
      logisticsPct: scored.readiness.parts.logistics ?? null,
      inventoryPct: scored.readiness.parts.inventory ?? null,
      permitPct: scored.readiness.parts.permits ?? null,
      linkedPrCount: linkedPrs.length,
      overduePrs: linkedPrs.filter((p) => p.overdue).length,
      blockedTasks: ops.blockedTasks,
      openSnags: ops.openSnags,
      criticalSafety: ops.criticalSafety,
      missingAssets: ops.missingAssets,
      bumpInPct: (() => {
        const bumpTasks = scored.taskRows.filter((t) => (t as { lifecycle_phase?: string | null }).lifecycle_phase === "bump_in");
        return bumpTasks.length ? overallTaskProgress(bumpTasks) : null;
      })(),
      staffingPct: ops.workstreams.find((w) => w.code === "hr_staffing")?.pct ?? scored.readiness.parts.manpower ?? null,
      procurementRisks: ops.procurementRisks,
    },
    risks: (risks ?? []) as EventRiskRow[],
    readinessItems: (ready ?? []) as EventReadinessRow[],
    team: (team ?? []).map((m) => ({
      id: m.id as string,
      staff_id: m.staff_id as string,
      full_name: staffMap.get(m.staff_id as string) ?? "—",
      role_label: m.role_label as string,
      is_pm: Boolean(m.is_pm),
    })),
    audit: (audit ?? []) as EventAuditRow[],
    linkedPrCount: linkedPrs.length,
    linkedPrs,
    linkedMaintenance,
    documents: ops.documents,
    issues: ops.issues,
    payables: ops.payables,
    assets: ops.assets,
    workstreams: ops.workstreams,
    overdueActions: ops.overdueActions,
  };
  return overview;
}, { auth: { capability: "events.view" } });

const CreateEventSchema = z.object({
  name: z.string().min(3).max(200),
  event_name: z.string().max(200).optional().nullable(),
  client_name: z.string().max(200).optional().nullable(),
  client_contact: z.string().max(200).optional().nullable(),
  business_unit: z.string().max(120).optional().nullable(),
  venue_name: z.string().max(200).optional().nullable(),
  location_id: z.string().uuid(),
  event_type_id: z.string().uuid().optional().nullable(),
  classification_id: z.string().uuid().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  country: z.string().max(80).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  priority: z.enum(EVENT_PRIORITIES).default("normal"),
  inquiry_date: z.string().optional().nullable(),
  contract_date: z.string().optional().nullable(),
  planning_start: z.string().optional().nullable(),
  venue_access: z.string().optional().nullable(),
  setup_start: z.string().optional().nullable(),
  setup_end: z.string().optional().nullable(),
  rehearsal_date: z.string().optional().nullable(),
  client_inspection_date: z.string().optional().nullable(),
  event_start: z.string().optional().nullable(),
  event_end: z.string().optional().nullable(),
  dismantle_start: z.string().optional().nullable(),
  dismantle_end: z.string().optional().nullable(),
  dismantle_date: z.string().optional().nullable(),
  handover_date: z.string().optional().nullable(),
  financial_close_target: z.string().optional().nullable(),
  final_closure_date: z.string().optional().nullable(),
  pm_staff_id: z.string().uuid().optional().nullable(),
  director_staff_id: z.string().uuid().optional().nullable(),
  contracted_value: z.number().min(0).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

export const createEvent = createAuthenticatedAction(
  CreateEventSchema,
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    const lookups = await loadLookups(context);
    const lead =
      lookups.stages.find((s) => s.code === "initiation") ??
      lookups.stages.find((s) => s.code === "lead") ??
      lookups.stages.find((s) => s.code === "inquiry") ??
      lookups.stages[0];
    const { data: number, error: numErr } = await context.supabase.rpc("next_evt_number");
    if (numErr) throw numErr;

    const dismantleEnd = emptyDate(data.dismantle_end) ?? emptyDate(data.dismantle_date);
    const { data: created, error } = await context.supabase
      .from("events")
      .insert({
        event_number: number,
        name: data.name,
        event_name: emptyText(data.event_name) ?? data.name,
        client_name: emptyText(data.client_name),
        client_contact: emptyText(data.client_contact),
        business_unit: emptyText(data.business_unit),
        venue_name: emptyText(data.venue_name),
        location_id: data.location_id,
        event_type_id: data.event_type_id ?? null,
        classification_id: data.classification_id ?? null,
        department_id: data.department_id ?? null,
        country: emptyText(data.country) ?? "Qatar",
        city: emptyText(data.city),
        stage_id: lead?.id ?? null,
        status: "draft",
        priority: data.priority,
        inquiry_date: emptyDate(data.inquiry_date) ?? todayIso(),
        contract_date: emptyDate(data.contract_date),
        planning_start: emptyDate(data.planning_start),
        venue_access: emptyDate(data.venue_access),
        setup_start: emptyDate(data.setup_start),
        setup_end: emptyDate(data.setup_end),
        rehearsal_date: emptyDate(data.rehearsal_date),
        client_inspection_date: emptyDate(data.client_inspection_date),
        event_start: emptyDate(data.event_start),
        event_end: emptyDate(data.event_end),
        dismantle_start: emptyDate(data.dismantle_start) ?? emptyDate(data.dismantle_date),
        dismantle_end: dismantleEnd,
        dismantle_date: dismantleEnd,
        handover_date: emptyDate(data.handover_date),
        financial_close_target: emptyDate(data.financial_close_target),
        final_closure_date: emptyDate(data.final_closure_date),
        pm_staff_id: data.pm_staff_id ?? null,
        director_staff_id: data.director_staff_id ?? null,
        contracted_value: data.contracted_value ?? null,
        description: emptyText(data.description),
        notes: emptyText(data.notes),
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, event_number")
      .single();
    if (error) throw error;

    const teamRows: Array<{
      event_id: string;
      staff_id: string;
      role_label: string;
      is_pm: boolean;
      created_by: string;
    }> = [];
    if (data.pm_staff_id) {
      teamRows.push({
        event_id: created.id,
        staff_id: data.pm_staff_id,
        role_label: "Project Manager",
        is_pm: true,
        created_by: context.userId,
      });
    }
    if (data.director_staff_id && data.director_staff_id !== data.pm_staff_id) {
      teamRows.push({
        event_id: created.id,
        staff_id: data.director_staff_id,
        role_label: "Project Director",
        is_pm: false,
        created_by: context.userId,
      });
    }
    if (teamRows.length) {
      await context.supabase.from("event_team_members").insert(teamRows);
    }

    await context.supabase.from("event_readiness_items").insert(
      DEFAULT_READINESS_ITEMS.map((item) => ({
        event_id: created.id,
        code: item.code,
        title: item.title,
        category: item.category,
        is_required: true,
        is_complete: false,
        weight: item.weight,
        phase_code: item.phase_code,
      })),
    );
    await ensureStandardWorkstreams(context, created.id);

    await writeEventAudit(context, {
      action: "create",
      entityType: "event",
      entityId: created.id,
      eventId: created.id,
      locationId: data.location_id,
      after: { event_number: created.event_number, name: data.name },
    });
    return created;
  },
  { auth: { capability: "events.create" } },
);

export const updateEvent = createAuthenticatedAction(
  CreateEventSchema.extend({
    id: z.string().uuid(),
    status: z.enum(EVENT_STATUSES).optional(),
    notes: z.string().max(4000).optional().nullable(),
    lessons_learned: z.string().max(8000).optional().nullable(),
  }),
  async (data, context) => {
    const current = await loadEventOrThrow(context, data.id);
    await assertLocationAccess(context, data.location_id);
    const { id, ...rest } = data;
    const dismantleEnd = emptyDate(rest.dismantle_end) ?? emptyDate(rest.dismantle_date);
    const patch = {
      ...rest,
      event_name: emptyText(rest.event_name) ?? rest.name,
      client_name: emptyText(rest.client_name),
      client_contact: emptyText(rest.client_contact),
      business_unit: emptyText(rest.business_unit),
      venue_name: emptyText(rest.venue_name),
      country: emptyText(rest.country) ?? "Qatar",
      city: emptyText(rest.city),
      inquiry_date: emptyDate(rest.inquiry_date),
      contract_date: emptyDate(rest.contract_date),
      planning_start: emptyDate(rest.planning_start),
      venue_access: emptyDate(rest.venue_access),
      setup_start: emptyDate(rest.setup_start),
      setup_end: emptyDate(rest.setup_end),
      rehearsal_date: emptyDate(rest.rehearsal_date),
      client_inspection_date: emptyDate(rest.client_inspection_date),
      event_start: emptyDate(rest.event_start),
      event_end: emptyDate(rest.event_end),
      dismantle_start: emptyDate(rest.dismantle_start) ?? emptyDate(rest.dismantle_date),
      dismantle_end: dismantleEnd,
      dismantle_date: dismantleEnd,
      handover_date: emptyDate(rest.handover_date),
      financial_close_target: emptyDate(rest.financial_close_target),
      final_closure_date: emptyDate(rest.final_closure_date),
      description: emptyText(rest.description),
      notes: rest.notes !== undefined ? emptyText(rest.notes) : undefined,
      lessons_learned: rest.lessons_learned !== undefined ? emptyText(rest.lessons_learned) : undefined,
      updated_by: context.userId,
    };
    const { error } = await context.supabase
      .from("events")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
    if (data.pm_staff_id && data.pm_staff_id !== current.pm_staff_id) {
      await context.supabase.from("event_team_members").upsert(
        {
          event_id: id,
          staff_id: data.pm_staff_id,
          role_label: "Project Manager",
          is_pm: true,
          created_by: context.userId,
        },
        { onConflict: "event_id,staff_id" },
      );
    }
    await writeEventAudit(context, {
      action: "update",
      entityType: "event",
      entityId: id,
      eventId: id,
      locationId: data.location_id,
      before: { name: current.name, status: current.status },
      after: { name: data.name, status: data.status ?? current.status },
    });
    const lookups = await loadLookups(context);
    await persistScores(
      context,
      {
        id,
        event_start: data.event_start ?? null,
        stage_id: current.stage_id as string | null,
        contracted_value: data.contracted_value ?? null,
        venue_name: data.venue_name ?? null,
      },
      lookups.stages,
    );
    return { id };
  },
  { auth: { capability: "events.edit" } },
);

export const changeEventStage = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    stageId: z.string().uuid(),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const lookups = await loadLookups(context);
    const linear = lookups.stages.filter((s) => s.is_linear !== false);
    const current = lookups.stages.find((s) => s.id === event.stage_id);
    const target = lookups.stages.find((s) => s.id === data.stageId);
    if (!target) throw new Error("Unknown stage");

    const side = SIDE_STAGE_CODES.has(target.code);
    if (side) {
      throw new ForbiddenError("Use hold or cancel actions for On Hold / Cancelled.");
    }

    const currentOrder = current?.sort_order ?? 0;
    const skipped = linear.filter(
      (s) => s.sort_order > currentOrder && s.sort_order < target.sort_order && s.is_critical,
    );
    if (skipped.length > 0) {
      throw new ForbiddenError(
        `Cannot skip critical stage: ${skipped.map((s) => s.label_en).join(", ")}`,
      );
    }

    if (target.sort_order > currentOrder) {
      const scored = await persistScores(
        context,
        {
          id: event.id as string,
          event_start: event.event_start as string | null,
          stage_id: event.stage_id as string | null,
          contracted_value: event.contracted_value as number | null,
          venue_name: event.venue_name as string | null,
          name: event.name as string | null,
          event_name: event.event_name as string | null,
          event_number: event.event_number as string | null,
        },
        lookups.stages,
      );
      const { data: manuals } = await context.supabase
        .from("event_gate_completions")
        .select("requirement_id, is_satisfied")
        .eq("event_id", event.id)
        .eq("is_satisfied", true);
      const gates = evaluateGates(
        lookups.gates.filter((g) => g.stage_id === target.id),
        gateFactsFromScores(event as Record<string, unknown>, scored, manuals ?? []),
      );
      const missing = gates.filter((g) => g.blocking && !g.satisfied);
      if (missing.length) {
        throw new ForbiddenError(
          `Stage gate blocked: ${missing.map((g) => g.labelEn).join("; ")}`,
        );
      }
    }

    const nextStatus = target.code === "closed" || target.is_terminal
      ? "closed"
      : event.status === "closed" || event.status === "on_hold" || event.status === "cancelled"
        ? "active"
        : event.status;
    const { error } = await context.supabase
      .from("events")
      .update({
        stage_id: target.id,
        status: nextStatus,
        prior_stage_id: null,
        updated_by: context.userId,
      })
      .eq("id", event.id);
    if (error) throw error;
    await writeEventAudit(context, {
      action: "stage_change",
      entityType: "event",
      entityId: event.id as string,
      eventId: event.id as string,
      locationId: event.location_id as string,
      before: { stage: current?.code, status: event.status },
      after: { stage: target.code, status: nextStatus },
    });
    return { stageId: target.id };
  },
  { auth: { capability: "events.edit" } },
);

export const overrideEventHealth = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    rag: z.enum(["green", "amber", "red", "critical"]).nullable(),
    justification: z.string().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    if (data.rag && (!data.justification || data.justification.trim().length < 8)) {
      throw new Error("Health override requires a justification of at least 8 characters.");
    }
    const { error } = await context.supabase
      .from("events")
      .update({
        health_override_rag: data.rag,
        health_override_justification: data.rag ? data.justification?.trim() : null,
        health_override_by: data.rag ? context.userId : null,
        health_override_at: data.rag ? new Date().toISOString() : null,
        updated_by: context.userId,
      })
      .eq("id", event.id);
    if (error) throw error;
    await writeEventAudit(context, {
      action: data.rag ? "health_override" : "health_override_clear",
      entityType: "event",
      entityId: event.id as string,
      eventId: event.id as string,
      locationId: event.location_id as string,
      before: { health_override_rag: event.health_override_rag, health_rag: event.health_rag },
      after: { health_override_rag: data.rag, justification: data.justification },
    });
    return { rag: data.rag };
  },
  { auth: { capability: "events.approve" } },
);

export const setEventLifecycleStatus = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    status: z.enum(["on_hold", "cancelled", "active"]),
    reason: z.string().max(500).optional().nullable(),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const lookups = await loadLookups(context);
    const hold = lookups.stages.find((s) => s.code === "on_hold");
    const cancelled = lookups.stages.find((s) => s.code === "cancelled");
    let stageId = event.stage_id as string | null;
    let prior = (event.prior_stage_id as string | null) ?? null;
    if (data.status === "on_hold") {
      prior = (event.stage_id as string) ?? prior;
      stageId = hold?.id ?? stageId;
    } else if (data.status === "cancelled") {
      prior = (event.stage_id as string) ?? prior;
      stageId = cancelled?.id ?? stageId;
    } else {
      stageId = prior ?? event.stage_id;
      prior = null;
    }
    const { error } = await context.supabase
      .from("events")
      .update({
        status: data.status,
        stage_id: stageId,
        prior_stage_id: prior,
        updated_by: context.userId,
      })
      .eq("id", event.id);
    if (error) throw error;
    await writeEventAudit(context, {
      action: `status_${data.status}`,
      entityType: "event",
      entityId: event.id as string,
      eventId: event.id as string,
      locationId: event.location_id as string,
      before: { status: event.status, stage: event.stage_id },
      after: { status: data.status, stage: stageId, reason: data.reason },
    });
    return { status: data.status };
  },
  { auth: { anyCapability: ["events.manage", "events.approve"] } },
);

export const getEventScope = createAuthenticatedAction(EventIdSchema, async (data, context) => {
  await loadEventOrThrow(context, data.eventId);
  const [{ data: versions }, { data: deliverables }, staffIdsWait] = await Promise.all([
    context.supabase
      .from("event_scope_versions")
      .select("id, event_id, version_no, title, sections, is_baseline, created_at")
      .eq("event_id", data.eventId)
      .order("version_no", { ascending: false }),
    context.supabase
      .from("event_deliverables")
      .select("id, event_id, title, description, status, due_date, owner_staff_id, sort_order")
      .eq("event_id", data.eventId)
      .is("deleted_at", null)
      .order("sort_order"),
    Promise.resolve(null),
  ]);
  void staffIdsWait;
  const ownerIds = [...new Set((deliverables ?? []).map((d) => d.owner_staff_id).filter(Boolean))] as string[];
  const { data: staff } = ownerIds.length
    ? await context.supabase.from("staff").select("id, full_name").in("id", ownerIds)
    : { data: [] };
  const staffMap = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
  return {
    versions: (versions ?? []) as EventScopeVersion[],
    deliverables: (deliverables ?? []).map((d) => ({
      ...d,
      owner_name: d.owner_staff_id ? (staffMap.get(d.owner_staff_id) ?? null) : null,
    })) as EventDeliverableRow[],
  };
}, { auth: { capability: "events.view" } });

export const saveScopeVersion = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    title: z.string().max(160).default("Scope"),
    sections: z.array(z.object({ key: z.string(), title: z.string(), body: z.string() })),
    isBaseline: z.boolean().optional(),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const { data: last } = await context.supabase
      .from("event_scope_versions")
      .select("version_no")
      .eq("event_id", data.eventId)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const versionNo = (last?.version_no ?? 0) + 1;
    if (data.isBaseline) {
      await context.supabase.from("event_scope_versions").update({ is_baseline: false }).eq("event_id", data.eventId);
    }
    const { data: created, error } = await context.supabase
      .from("event_scope_versions")
      .insert({
        event_id: data.eventId,
        version_no: versionNo,
        title: data.title,
        sections: data.sections as unknown as Json,
        is_baseline: Boolean(data.isBaseline),
        created_by: context.userId,
      })
      .select("id, version_no")
      .single();
    if (error) throw error;
    await writeEventAudit(context, {
      action: data.isBaseline ? "scope_baseline" : "scope_save",
      entityType: "scope",
      entityId: created.id,
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: { version_no: versionNo },
    });
    return created;
  },
  { auth: { capability: "events.edit" } },
);

export const upsertDeliverable = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    eventId: z.string().uuid(),
    title: z.string().min(2).max(200),
    description: z.string().max(2000).optional().nullable(),
    status: z.enum(DELIVERABLE_STATUSES).default("pending"),
    due_date: z.string().optional().nullable(),
    owner_staff_id: z.string().uuid().optional().nullable(),
    sort_order: z.number().int().optional(),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    const payload = {
      event_id: data.eventId,
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      due_date: data.due_date ?? null,
      owner_staff_id: data.owner_staff_id ?? null,
      sort_order: data.sort_order ?? 0,
      updated_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("event_deliverables").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("event_deliverables")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return created;
  },
  { auth: { capability: "events.edit" } },
);

export const deleteDeliverable = createAuthenticatedAction(IdSchema, async (data, context) => {
  const { data: row } = await context.supabase.from("event_deliverables").select("event_id").eq("id", data.id).maybeSingle();
  if (!row) throw new Error("Deliverable not found");
  await loadEventOrThrow(context, row.event_id as string);
  const { error } = await context.supabase
    .from("event_deliverables")
    .update({ deleted_at: new Date().toISOString(), updated_by: context.userId })
    .eq("id", data.id);
  if (error) throw error;
  return { id: data.id };
}, { auth: { capability: "events.edit" } });

async function loadEventWbsNodes(context: AuthContext, eventId: string) {
  const { data, error } = await context.supabase
    .from("event_wbs_nodes")
    .select(
      "id, event_id, parent_id, node_type, code, title, description, sort_order, owner_staff_id, budget_amount, actual_cost, start_date, due_date, percent_complete, documents",
    )
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export const getEventPlan = createAuthenticatedAction(EventIdSchema, async (data, context) => {
  await loadEventOrThrow(context, data.eventId);
  await ensureStandardWorkstreams(context, data.eventId);
  const [wbsRows, tasks, deps, miles, baselines] = await Promise.all([
    loadEventWbsNodes(context, data.eventId),
    context.supabase
      .from("event_tasks")
      .select(
        TASK_COLUMNS,
      )
      .eq("event_id", data.eventId)
      .is("deleted_at", null)
      .order("due_date", { ascending: true, nullsFirst: false }),
    context.supabase
      .from("event_task_dependencies")
      .select("id, event_id, predecessor_id, successor_id, dep_type, lag_days")
      .eq("event_id", data.eventId),
    context.supabase
      .from("event_milestones")
      .select("id, event_id, title, description, due_date, status, achieved_at, is_critical, owner_staff_id, wbs_id, task_id")
      .eq("event_id", data.eventId)
      .order("due_date"),
    context.supabase
      .from("event_baselines")
      .select("id, baseline_type, snapshot, created_at")
      .eq("event_id", data.eventId)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  if (tasks.error) throw tasks.error;
  if (deps.error) throw deps.error;
  if (miles.error) throw miles.error;

  const staffIds = [
    ...new Set(
      [
        ...wbsRows.map((n) => n.owner_staff_id),
        ...(tasks.data ?? []).flatMap((t) => [t.owner_staff_id, t.assignee_staff_id]),
        ...(miles.data ?? []).map((m) => m.owner_staff_id),
      ].filter(Boolean) as string[],
    ),
  ];
  const deptIds = [...new Set((tasks.data ?? []).map((t) => t.department_id).filter(Boolean))] as string[];
  const [{ data: staff }, { data: depts }] = await Promise.all([
    staffIds.length ? context.supabase.from("staff").select("id, full_name").in("id", staffIds) : { data: [] },
    deptIds.length ? context.supabase.from("master_departments").select("id, name").in("id", deptIds) : { data: [] },
  ]);
  const staffMap = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
  const deptMap = new Map((depts ?? []).map((d) => [d.id, d.name]));
  const taskIds = (tasks.data ?? []).map((t) => t.id as string);
  const { data: supporterRows } = taskIds.length
    ? await context.supabase.from("event_task_supporters").select("task_id, staff_id").in("task_id", taskIds)
    : { data: [] };
  const extraStaffIds = [...new Set((supporterRows ?? []).map((s) => s.staff_id).filter((id) => !staffMap.has(id)))];
  if (extraStaffIds.length) {
    const { data: extraStaff } = await context.supabase.from("staff").select("id, full_name").in("id", extraStaffIds);
    for (const s of extraStaff ?? []) staffMap.set(s.id, s.full_name);
  }
  const supportersByTask = new Map<string, string[]>();
  for (const row of supporterRows ?? []) {
    const list = supportersByTask.get(row.task_id as string) ?? [];
    list.push(row.staff_id as string);
    supportersByTask.set(row.task_id as string, list);
  }

  const baselineRows = (baselines.data ?? []) as EventBaselineRow[];
  const latestSchedule =
    baselineRows.find((b) => b.baseline_type === "schedule" || b.baseline_type === "both") ?? null;
  const baseTaskMap = new Map((latestSchedule?.snapshot.tasks ?? []).map((t) => [t.id, t]));
  const baseMileMap = new Map((latestSchedule?.snapshot.milestones ?? []).map((m) => [m.id, m]));

  const wbsSlim = wbsRows.map((n) => ({
    id: n.id as string,
    parent_id: (n.parent_id as string | null) ?? null,
    node_type: n.node_type as WbsNodeType,
    sort_order: num(n.sort_order),
  }));
  const orderedWbs = flattenWbsTree(wbsSlim);
  const taskList = tasks.data ?? [];
  const descendantCache = new Map<string, Set<string>>();
  const nodeTaskProgress = (nodeId: string) => {
    let ids = descendantCache.get(nodeId);
    if (!ids) {
      ids = descendantIds(wbsSlim, nodeId);
      ids.add(nodeId);
      descendantCache.set(nodeId, ids);
    }
    const linked = taskList.filter((t) => t.wbs_id && ids.has(t.wbs_id as string) && t.status !== "cancelled");
    if (!linked.length) return null;
    return Math.round(linked.reduce((s, t) => s + num(t.percent_complete), 0) / linked.length);
  };

  const wbsMapped: EventWbsNode[] = orderedWbs.map((slim) => {
    const raw = wbsRows.find((n) => n.id === slim.id)!;
    const rolled = nodeTaskProgress(slim.id);
    return {
      id: slim.id,
      event_id: raw.event_id as string,
      parent_id: slim.parent_id,
      node_type: typeForDepth(slim.depth),
      code: (raw.code as string | null) ?? null,
      title: raw.title as string,
      description: (raw.description as string | null) ?? null,
      sort_order: slim.sort_order,
      owner_staff_id: (raw.owner_staff_id as string | null) ?? null,
      owner_name: raw.owner_staff_id ? (staffMap.get(raw.owner_staff_id as string) ?? null) : null,
      budget_amount: num(raw.budget_amount),
      actual_cost: num(raw.actual_cost),
      start_date: (raw.start_date as string | null) ?? null,
      due_date: (raw.due_date as string | null) ?? null,
      percent_complete: rolled ?? num(raw.percent_complete),
      documents: asDocuments(raw.documents),
      depth: slim.depth,
      rolled_progress: rolled ?? num(raw.percent_complete),
    };
  });
  const wbsById = new Map(wbsMapped.map((n) => [n.id, n]));

  const taskRows: EventTaskRow[] = taskList.map((t) => {
    const chain = t.wbs_id ? wbsAncestors(wbsMapped, t.wbs_id as string) : [];
    const phase = [...chain].reverse().find((n) => n.node_type === "phase") ?? chain.at(-1);
    const workstream = chain.find((n) => n.node_type === "workstream") ?? null;
    const baseline = baseTaskMap.get(t.id as string);
    const start = (t.start_date as string | null) ?? null;
    const due = (t.due_date as string | null) ?? null;
    const pct = num(t.percent_complete);
    return {
      id: t.id as string,
      event_id: t.event_id as string,
      task_number: (t.task_number as string | null) ?? null,
      wbs_id: (t.wbs_id as string | null) ?? null,
      parent_task_id: (t.parent_task_id as string | null) ?? null,
      title: t.title as string,
      description: (t.description as string | null) ?? null,
      status: t.status as EventTaskRow["status"],
      priority: t.priority as EventTaskRow["priority"],
      start_date: start,
      due_date: due,
      completed_at: (t.completed_at as string | null) ?? null,
      duration_days: numOrNull(t.duration_days) ?? daysBetween(start, due),
      owner_staff_id: (t.owner_staff_id as string | null) ?? null,
      owner_name: t.owner_staff_id ? (staffMap.get(t.owner_staff_id as string) ?? null) : null,
      assignee_staff_id: (t.assignee_staff_id as string | null) ?? null,
      assignee_name: t.assignee_staff_id ? (staffMap.get(t.assignee_staff_id as string) ?? null) : null,
      department_id: (t.department_id as string | null) ?? null,
      department_name: t.department_id ? (deptMap.get(t.department_id as string) ?? null) : null,
      percent_complete: pct,
      is_critical: Boolean(t.is_critical),
      is_milestone: Boolean(t.is_milestone),
      estimated_hours: numOrNull(t.estimated_hours),
      actual_hours: numOrNull(t.actual_hours),
      estimated_cost: numOrNull(t.estimated_cost),
      actual_cost: numOrNull(t.actual_cost),
      checklist: asChecklist(t.checklist),
      comments: asComments(t.comments),
      documents: asDocuments(t.documents),
      supporter_ids: supportersByTask.get(t.id as string) ?? [],
      supporter_names: (supportersByTask.get(t.id as string) ?? []).map((id) => staffMap.get(id) ?? "—"),
      approval_status: ((t as { approval_status?: string }).approval_status as EventTaskRow["approval_status"]) ?? "not_required",
      delay_reason: ((t as { delay_reason?: string | null }).delay_reason) ?? null,
      escalation_level: ((t as { escalation_level?: string }).escalation_level as EventTaskRow["escalation_level"]) ?? "none",
      cost_impact: numOrNull((t as { cost_impact?: number | null }).cost_impact) ?? numOrNull(t.estimated_cost),
      evidence_url: ((t as { evidence_url?: string | null }).evidence_url) ?? null,
      is_snag: Boolean((t as { is_snag?: boolean }).is_snag),
      phase_id: phase?.id ?? null,
      phase_title: phase?.title ?? null,
      workstream_id: workstream?.id ?? phase?.id ?? null,
      workstream_title: workstream?.title ?? phase?.title ?? null,
      workstream_code: (workstream ?? phase)?.code ?? null,
      lifecycle_phase: ((t as { lifecycle_phase?: string | null }).lifecycle_phase) ?? null,
      baseline_start: baseline?.start_date ?? null,
      baseline_due: baseline?.due_date ?? null,
      baseline_percent: baseline?.percent_complete ?? null,
      variance: scheduleVariance(start, due, pct, baseline?.start_date, baseline?.due_date, baseline?.percent_complete),
    };
  });

  const depRows = (deps.data ?? []) as EventDependencyRow[];
  const mileRows: EventMilestoneRow[] = (miles.data ?? []).map((m) => {
    const baseline = baseMileMap.get(m.id as string);
    const due = m.due_date as string;
    return {
      id: m.id as string,
      event_id: m.event_id as string,
      title: m.title as string,
      description: (m.description as string | null) ?? null,
      due_date: due,
      status: m.status as EventMilestoneRow["status"],
      achieved_at: (m.achieved_at as string | null) ?? null,
      is_critical: Boolean(m.is_critical),
      owner_staff_id: (m.owner_staff_id as string | null) ?? null,
      owner_name: m.owner_staff_id ? (staffMap.get(m.owner_staff_id as string) ?? null) : null,
      wbs_id: (m.wbs_id as string | null) ?? null,
      wbs_title: m.wbs_id ? (wbsById.get(m.wbs_id as string)?.title ?? null) : null,
      task_id: (m.task_id as string | null) ?? null,
      task_title: m.task_id ? (taskRows.find((t) => t.id === m.task_id)?.title ?? null) : null,
      baseline_due: baseline?.due_date ?? null,
      variance_days: daysBetween(baseline?.due_date, due),
    };
  });

  return {
    wbs: wbsMapped,
    tasks: taskRows,
    dependencies: depRows,
    milestones: mileRows,
    baselines: baselineRows,
    latestScheduleBaseline: latestSchedule,
    violations: dependencyViolations(taskRows, depRows),
  };
}, { auth: { capability: "events.view" } });

export const upsertWbsNode = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    eventId: z.string().uuid(),
    parent_id: z.string().uuid().optional().nullable(),
    node_type: z.enum(WBS_NODE_TYPES).optional(),
    code: z.string().max(20).optional().nullable(),
    title: z.string().min(2).max(200),
    description: z.string().max(2000).optional().nullable(),
    sort_order: z.number().int().optional(),
    owner_staff_id: z.string().uuid().optional().nullable(),
    budget_amount: z.number().min(0).optional(),
    actual_cost: z.number().min(0).optional(),
    start_date: z.string().optional().nullable(),
    due_date: z.string().optional().nullable(),
    percent_complete: z.number().int().min(0).max(100).optional(),
    documents: z.array(z.object({ title: z.string().max(160), url: z.string().max(500) })).optional(),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    const existing = await loadEventWbsNodes(context, data.eventId);
    const parentId = data.parent_id === undefined
      ? (data.id ? (existing.find((n) => n.id === data.id)?.parent_id as string | null) ?? null : null)
      : data.parent_id;
    if (data.id && wouldCycle(existing.map((n) => ({ id: n.id as string, parent_id: n.parent_id as string | null })), data.id, parentId)) {
      throw new Error("Cannot move a WBS node under itself");
    }
    const parentDepth = parentId ? wbsDepth(existing.map((n) => ({ id: n.id as string, parent_id: n.parent_id as string | null })), parentId) : -1;
    const depth = parentDepth + 1;
    if (depth > 3) throw new Error("WBS is limited to phase → workstream → task → subtask");
    const payload = {
      event_id: data.eventId,
      parent_id: parentId,
      node_type: data.node_type ?? typeForDepth(depth),
      code: data.code ?? null,
      title: data.title,
      description: data.description ?? null,
      sort_order: data.sort_order ?? existing.filter((n) => (n.parent_id ?? null) === parentId).length,
      owner_staff_id: data.owner_staff_id ?? null,
      budget_amount: data.budget_amount ?? 0,
      actual_cost: data.actual_cost ?? 0,
      start_date: emptyDate(data.start_date),
      due_date: emptyDate(data.due_date),
      percent_complete: data.percent_complete ?? 0,
      documents: (data.documents ?? []) as unknown as Json,
    };
    if (data.id) {
      const { error } = await context.supabase.from("event_wbs_nodes").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("event_wbs_nodes")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return created;
  },
  { auth: { capability: "events.edit" } },
);

export const moveWbsNode = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    direction: z.enum(["up", "down", "indent", "outdent"]),
  }),
  async (data, context) => {
    const { data: row } = await context.supabase
      .from("event_wbs_nodes")
      .select("id, event_id, parent_id, sort_order")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!row) throw new Error("WBS node not found");
    await loadEventOrThrow(context, row.event_id as string);
    const nodes = (await loadEventWbsNodes(context, row.event_id as string)).map((n) => ({
      id: n.id as string,
      parent_id: (n.parent_id as string | null) ?? null,
      sort_order: num(n.sort_order),
      node_type: n.node_type as WbsNodeType,
    }));
    const node = nodes.find((n) => n.id === data.id);
    if (!node) throw new Error("WBS node not found");
    const sibs = siblingsOf(nodes, node);
    const idx = sibs.findIndex((n) => n.id === data.id);

    if (data.direction === "up" || data.direction === "down") {
      const swap = data.direction === "up" ? sibs[idx - 1] : sibs[idx + 1];
      if (!swap) return { id: data.id };
      const { error: a } = await context.supabase.from("event_wbs_nodes").update({ sort_order: swap.sort_order }).eq("id", node.id);
      if (a) throw a;
      const { error: b } = await context.supabase.from("event_wbs_nodes").update({ sort_order: node.sort_order }).eq("id", swap.id);
      if (b) throw b;
      return { id: data.id };
    }

    if (data.direction === "indent") {
      if (!canIndent(nodes, node.id)) throw new Error("Cannot indent — no previous sibling or max depth reached");
      const prev = sibs[idx - 1];
      const newDepth = wbsDepth(nodes, prev.id) + 1;
      const { error } = await context.supabase
        .from("event_wbs_nodes")
        .update({
          parent_id: prev.id,
          node_type: typeForDepth(newDepth),
          sort_order: nodes.filter((n) => n.parent_id === prev.id).length,
        })
        .eq("id", node.id);
      if (error) throw error;
      const kids = nodes.filter((n) => n.parent_id === node.id || descendantIds(nodes, node.id).has(n.id));
      for (const child of kids) {
        const { error: childErr } = await context.supabase
          .from("event_wbs_nodes")
          .update({ node_type: typeForDepth(wbsDepth(nodes, child.id) + 1) })
          .eq("id", child.id);
        if (childErr) throw childErr;
      }
      return { id: data.id };
    }

    if (!canOutdent(nodes, node.id) || !node.parent_id) throw new Error("Cannot outdent a top-level phase");
    const parent = nodes.find((n) => n.id === node.parent_id);
    const grandparent = parent?.parent_id ?? null;
    const newSibs = nodes.filter((n) => n.parent_id === grandparent).sort((a, b) => a.sort_order - b.sort_order);
    const parentIdx = newSibs.findIndex((n) => n.id === parent?.id);
    const { error } = await context.supabase
      .from("event_wbs_nodes")
      .update({
        parent_id: grandparent,
        node_type: typeForDepth(grandparent ? wbsDepth(nodes, grandparent) + 1 : 0),
        sort_order: (parentIdx >= 0 ? newSibs[parentIdx].sort_order : node.sort_order) + 1,
      })
      .eq("id", node.id);
    if (error) throw error;
    const shifted = applyNodeTypes(
      nodes.map((n) =>
        n.id === node.id ? { ...n, parent_id: grandparent, node_type: typeForDepth(grandparent ? wbsDepth(nodes, grandparent) + 1 : 0) } : n,
      ),
    );
    for (const child of shifted.filter((n) => descendantIds(shifted, node.id).has(n.id))) {
      const { error: childErr } = await context.supabase
        .from("event_wbs_nodes")
        .update({ node_type: child.node_type })
        .eq("id", child.id);
      if (childErr) throw childErr;
    }
    return { id: data.id };
  },
  { auth: { capability: "events.edit" } },
);

export const deleteWbsNode = createAuthenticatedAction(IdSchema, async (data, context) => {
  const { data: row } = await context.supabase
    .from("event_wbs_nodes")
    .select("id, event_id, parent_id")
    .eq("id", data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) throw new Error("WBS node not found");
  await loadEventOrThrow(context, row.event_id as string);
  const { data: children } = await context.supabase
    .from("event_wbs_nodes")
    .select("id")
    .eq("parent_id", data.id)
    .is("deleted_at", null)
    .limit(1);
  if (children?.length) throw new Error("Move or delete child WBS nodes first");
  const { error: reparentErr } = await context.supabase
    .from("event_tasks")
    .update({ wbs_id: (row.parent_id as string | null) ?? null, updated_by: context.userId })
    .eq("wbs_id", data.id)
    .is("deleted_at", null);
  if (reparentErr) throw reparentErr;
  const { error: mileErr } = await context.supabase
    .from("event_milestones")
    .update({ wbs_id: (row.parent_id as string | null) ?? null })
    .eq("wbs_id", data.id);
  if (mileErr) throw mileErr;
  const { error } = await context.supabase
    .from("event_wbs_nodes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", data.id);
  if (error) throw error;
  return { id: data.id };
}, { auth: { capability: "events.edit" } });

export const upsertEventTask = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    eventId: z.string().uuid(),
    wbs_id: z.string().uuid().optional().nullable(),
    parent_task_id: z.string().uuid().optional().nullable(),
    title: z.string().min(2).max(200),
    description: z.string().max(2000).optional().nullable(),
    status: z.enum(TASK_STATUSES).default("not_started"),
    priority: z.enum(TASK_PRIORITIES).default("normal"),
    start_date: z.string().optional().nullable(),
    due_date: z.string().optional().nullable(),
    owner_staff_id: z.string().uuid().optional().nullable(),
    assignee_staff_id: z.string().uuid().optional().nullable(),
    department_id: z.string().uuid().optional().nullable(),
    percent_complete: z.number().int().min(0).max(100).optional(),
    duration_days: z.number().int().min(0).optional().nullable(),
    estimated_hours: z.number().min(0).optional().nullable(),
    actual_hours: z.number().min(0).optional().nullable(),
    estimated_cost: z.number().min(0).optional().nullable(),
    actual_cost: z.number().min(0).optional().nullable(),
    is_critical: z.boolean().optional(),
    is_milestone: z.boolean().optional(),
    checklist: z.array(z.object({ id: z.string(), title: z.string().max(200), done: z.boolean() })).optional(),
    documents: z.array(z.object({ title: z.string().max(160), url: z.string().max(500) })).optional(),
    supporter_ids: z.array(z.string().uuid()).optional(),
    approval_status: z.enum(TASK_APPROVAL_STATUSES).optional(),
    delay_reason: z.string().max(1000).optional().nullable(),
    escalation_level: z.enum(TASK_ESCALATION_LEVELS).optional(),
    cost_impact: z.number().min(0).optional().nullable(),
    evidence_url: z.string().max(500).optional().nullable(),
    is_snag: z.boolean().optional(),
    lifecycle_phase: z.string().max(40).optional().nullable(),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    if (data.parent_task_id && data.parent_task_id === data.id) throw new Error("A task cannot be its own parent");
    const { data: existing } = data.id
      ? await context.supabase.from("event_tasks").select("completed_at, comments").eq("id", data.id).maybeSingle()
      : { data: null };
    const start = data.start_date !== undefined ? emptyDate(data.start_date) : undefined;
    const due = data.due_date !== undefined ? emptyDate(data.due_date) : undefined;
    const completedAt =
      data.status === "completed" ? ((existing?.completed_at as string | null) ?? new Date().toISOString()) : null;
    const payload: Record<string, unknown> = {
      event_id: data.eventId,
      title: data.title,
      status: data.status,
      priority: data.priority,
      percent_complete: data.status === "completed" ? 100 : (data.percent_complete ?? 0),
      is_critical: data.is_critical ?? data.priority === "critical",
      updated_by: context.userId,
      completed_at: completedAt,
    };
    if (data.wbs_id !== undefined) payload.wbs_id = data.wbs_id;
    if (data.parent_task_id !== undefined) payload.parent_task_id = data.parent_task_id;
    if (data.description !== undefined) payload.description = data.description;
    if (start !== undefined) payload.start_date = start;
    if (due !== undefined) payload.due_date = due;
    if (data.duration_days !== undefined) payload.duration_days = data.duration_days ?? daysBetween(start ?? null, due ?? null);
    else if (start !== undefined || due !== undefined) payload.duration_days = daysBetween(start ?? null, due ?? null);
    if (data.owner_staff_id !== undefined) payload.owner_staff_id = data.owner_staff_id;
    if (data.assignee_staff_id !== undefined) payload.assignee_staff_id = data.assignee_staff_id;
    if (data.department_id !== undefined) payload.department_id = data.department_id;
    if (data.is_milestone !== undefined) payload.is_milestone = data.is_milestone;
    if (data.estimated_hours !== undefined) payload.estimated_hours = data.estimated_hours;
    if (data.actual_hours !== undefined) payload.actual_hours = data.actual_hours;
    if (data.estimated_cost !== undefined) payload.estimated_cost = data.estimated_cost;
    if (data.actual_cost !== undefined) payload.actual_cost = data.actual_cost;
    if (data.cost_impact !== undefined) payload.cost_impact = data.cost_impact;
    if (data.checklist !== undefined) payload.checklist = data.checklist as unknown as Json;
    if (data.documents !== undefined) payload.documents = data.documents as unknown as Json;
    if (data.approval_status !== undefined) payload.approval_status = data.approval_status;
    if (data.delay_reason !== undefined) payload.delay_reason = emptyText(data.delay_reason);
    if (data.escalation_level !== undefined) payload.escalation_level = data.escalation_level;
    if (data.evidence_url !== undefined) payload.evidence_url = emptyText(data.evidence_url);
    if (data.is_snag !== undefined) payload.is_snag = data.is_snag;
    if (data.lifecycle_phase !== undefined) payload.lifecycle_phase = emptyText(data.lifecycle_phase);
    let id = data.id;
    if (id) {
      const { error } = await context.supabase.from("event_tasks").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { data: number, error: numErr } = await context.supabase.rpc("next_tsk_number");
      if (numErr) throw numErr;
      const { data: created, error } = await context.supabase
        .from("event_tasks")
        .insert({ ...payload, task_number: number, created_by: context.userId })
        .select("id, task_number")
        .single();
      if (error) throw error;
      id = created.id;
    }
    if (id && data.supporter_ids) {
      await context.supabase.from("event_task_supporters").delete().eq("task_id", id);
      const unique = [...new Set(data.supporter_ids.filter((sid) => sid !== data.owner_staff_id))];
      if (unique.length) {
        const { error: supErr } = await context.supabase
          .from("event_task_supporters")
          .insert(unique.map((staff_id) => ({ task_id: id, staff_id })));
        if (supErr) throw supErr;
      }
    }
    const lookups = await loadLookups(context);
    await persistScores(
      context,
      {
        id: event.id as string,
        event_start: event.event_start as string | null,
        stage_id: event.stage_id as string | null,
        contracted_value: event.contracted_value as number | null,
        venue_name: event.venue_name as string | null,
      },
      lookups.stages,
    );
    return { id };
  },
  { auth: { capability: "events.edit" } },
);

export const deleteEventTask = createAuthenticatedAction(IdSchema, async (data, context) => {
  const { data: row } = await context.supabase
    .from("event_tasks")
    .select("event_id, parent_task_id")
    .eq("id", data.id)
    .maybeSingle();
  if (!row) throw new Error("Task not found");
  const event = await loadEventOrThrow(context, row.event_id as string);
  const { error: reparentErr } = await context.supabase
    .from("event_tasks")
    .update({ parent_task_id: (row.parent_task_id as string | null) ?? null, updated_by: context.userId })
    .eq("parent_task_id", data.id)
    .is("deleted_at", null);
  if (reparentErr) throw reparentErr;
  const { error } = await context.supabase
    .from("event_tasks")
    .update({ deleted_at: new Date().toISOString(), updated_by: context.userId })
    .eq("id", data.id);
  if (error) throw error;
  const lookups = await loadLookups(context);
  await persistScores(
    context,
    {
      id: event.id as string,
      event_start: event.event_start as string | null,
      stage_id: event.stage_id as string | null,
      contracted_value: event.contracted_value as number | null,
    },
    lookups.stages,
  );
  return { id: data.id };
}, { auth: { capability: "events.edit" } });

export const upsertDependency = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    predecessor_id: z.string().uuid(),
    successor_id: z.string().uuid(),
    dep_type: z.enum(DEP_TYPES).default("FS"),
    lag_days: z.number().int().default(0),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    if (data.predecessor_id === data.successor_id) throw new Error("A task cannot depend on itself");
    const { data: created, error } = await context.supabase
      .from("event_task_dependencies")
      .insert({
        event_id: data.eventId,
        predecessor_id: data.predecessor_id,
        successor_id: data.successor_id,
        dep_type: data.dep_type,
        lag_days: data.lag_days,
      })
      .select("id")
      .single();
    if (error) throw error;
    return created;
  },
  { auth: { capability: "events.edit" } },
);

export const deleteDependency = createAuthenticatedAction(IdSchema, async (data, context) => {
  const { data: row } = await context.supabase
    .from("event_task_dependencies")
    .select("event_id")
    .eq("id", data.id)
    .maybeSingle();
  if (!row) throw new Error("Dependency not found");
  await loadEventOrThrow(context, row.event_id as string);
  const { error } = await context.supabase.from("event_task_dependencies").delete().eq("id", data.id);
  if (error) throw error;
  return { id: data.id };
}, { auth: { capability: "events.edit" } });

export const upsertMilestone = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    eventId: z.string().uuid(),
    title: z.string().min(2).max(200),
    description: z.string().max(2000).optional().nullable(),
    due_date: z.string(),
    status: z.enum(MILESTONE_STATUSES).default("pending"),
    is_critical: z.boolean().optional(),
    owner_staff_id: z.string().uuid().optional().nullable(),
    wbs_id: z.string().uuid().optional().nullable(),
    task_id: z.string().uuid().optional().nullable(),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    const payload = {
      event_id: data.eventId,
      title: data.title,
      description: data.description ?? null,
      due_date: data.due_date,
      status: data.status,
      is_critical: data.is_critical ?? false,
      owner_staff_id: data.owner_staff_id ?? null,
      wbs_id: data.wbs_id ?? null,
      task_id: data.task_id ?? null,
      achieved_at: data.status === "achieved" ? new Date().toISOString() : null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("event_milestones").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("event_milestones")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return created;
  },
  { auth: { capability: "events.edit" } },
);

export const deleteMilestone = createAuthenticatedAction(IdSchema, async (data, context) => {
  const { data: row } = await context.supabase.from("event_milestones").select("event_id").eq("id", data.id).maybeSingle();
  if (!row) throw new Error("Milestone not found");
  await loadEventOrThrow(context, row.event_id as string);
  const { error } = await context.supabase.from("event_milestones").delete().eq("id", data.id);
  if (error) throw error;
  return { id: data.id };
}, { auth: { capability: "events.edit" } });

export const addEventTaskComment = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    body: z.string().min(1).max(2000),
  }),
  async (data, context) => {
    const { data: row } = await context.supabase
      .from("event_tasks")
      .select("id, event_id, comments")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Task not found");
    await loadEventOrThrow(context, row.event_id as string);
    const { data: profile } = await context.supabase
      .from("staff")
      .select("full_name")
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .maybeSingle();
    const comments = asComments(row.comments);
    comments.push({
      id: crypto.randomUUID(),
      body: data.body.trim(),
      created_at: new Date().toISOString(),
      author_name: profile?.full_name ?? null,
    });
    const { error } = await context.supabase
      .from("event_tasks")
      .update({ comments: comments as unknown as Json, updated_by: context.userId })
      .eq("id", data.id);
    if (error) throw error;
    return { id: data.id };
  },
  { auth: { capability: "events.edit" } },
);

export const saveEventBaseline = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    baseline_type: z.enum(BASELINE_TYPES).default("schedule"),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    if (data.baseline_type === "budget" && !canUserDo(context.roles ?? [], "events.finance")) {
      throw new ForbiddenError("Budget baseline requires events.finance.");
    }
    let snapshot: Record<string, unknown>;
    if (data.baseline_type === "budget") {
      const lookups = await loadLookups(context);
      const catMap = new Map(lookups.costCategories.map((c) => [c.id, c]));
      const [{ data: header }, { data: lines }] = await Promise.all([
        context.supabase
          .from("event_budgets")
          .select("contract_value, additional_revenue, approved_change_orders, discounts, taxes")
          .eq("event_id", data.eventId)
          .maybeSingle(),
        context.supabase
          .from("event_budget_lines")
          .select("id, category_id, original_amount, approved_changes, revised_amount, committed_amount, actual_amount, forecast_amount")
          .eq("event_id", data.eventId),
      ]);
      const revenue = revenueFromHeader(header, event.contracted_value as number | null);
      const lineRows = (lines ?? []).map((line) => ({
        id: line.id as string,
        category_id: line.category_id as string,
        category_code: catMap.get(line.category_id as string)?.code ?? "",
        original_amount: num(line.original_amount),
        approved_changes: num(line.approved_changes),
        revised_amount: revisedBudget(num(line.original_amount), num(line.approved_changes)),
        committed_amount: num(line.committed_amount),
        actual_amount: num(line.actual_amount),
        forecast_amount: num(line.forecast_amount),
      }));
      const totals = sumBudgetLines(lineRows);
      const finalRev = finalRevenue(revenue);
      snapshot = {
        saved_at: new Date().toISOString(),
        revenue: { ...revenue, finalRevenue: finalRev },
        lines: lineRows,
        totals: {
          original: totals.original,
          revised: totals.revised,
          forecast: totals.forecast,
          marginPct: marginPct(finalRev, totals.forecast),
        },
      };
    } else {
      const [{ data: tasks }, { data: miles }, { data: scope }, wbs] = await Promise.all([
        context.supabase
          .from("event_tasks")
          .select("id, task_number, title, start_date, due_date, percent_complete, status, wbs_id")
          .eq("event_id", data.eventId)
          .is("deleted_at", null),
        context.supabase.from("event_milestones").select("id, title, due_date, status").eq("event_id", data.eventId),
        context.supabase
          .from("event_scope_versions")
          .select("id")
          .eq("event_id", data.eventId)
          .eq("is_baseline", true)
          .maybeSingle(),
        loadEventWbsNodes(context, data.eventId),
      ]);
      snapshot = {
        saved_at: new Date().toISOString(),
        tasks: tasks ?? [],
        wbs: wbs.map((n) => ({
          id: n.id,
          parent_id: n.parent_id,
          title: n.title,
          node_type: n.node_type,
          start_date: n.start_date,
          due_date: n.due_date,
          budget_amount: num(n.budget_amount),
          percent_complete: num(n.percent_complete),
        })),
        milestones: miles ?? [],
        scope_version_id: data.baseline_type === "schedule" ? null : (scope?.id ?? null),
      };
    }
    const { data: created, error } = await context.supabase
      .from("event_baselines")
      .insert({
        event_id: data.eventId,
        baseline_type: data.baseline_type,
        snapshot: snapshot as unknown as Json,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    await writeEventAudit(context, {
      action: "baseline_save",
      entityType: "baseline",
      entityId: created.id,
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: { baseline_type: data.baseline_type },
    });
    return created;
  },
  { auth: { anyCapability: ["events.edit", "events.finance"] } },
);

function mapBudgetLine(
  line: Record<string, unknown>,
  catMap: Map<string, EventLookup>,
  subMap: Map<string, EventCostSubcategory>,
): EventBudgetLineRow {
  const cat = catMap.get(line.category_id as string);
  const sub = line.subcategory_id ? subMap.get(line.subcategory_id as string) : undefined;
  const original = num(line.original_amount);
  const approved = num(line.approved_changes);
  const revised = revisedBudget(original, approved);
  const committed = num(line.committed_amount);
  const forecast = num(line.forecast_amount);
  return {
    id: line.id as string,
    category_id: line.category_id as string,
    category_code: cat?.code ?? "",
    category_label_en: cat?.label_en ?? "",
    category_label_ar: cat?.label_ar ?? "",
    subcategory_id: (line.subcategory_id as string | null) ?? null,
    subcategory_code: sub?.code ?? null,
    subcategory_label_en: sub?.label_en ?? null,
    subcategory_label_ar: sub?.label_ar ?? null,
    title: (line.title as string) ?? "",
    original_amount: original,
    approved_changes: approved,
    revised_amount: revised,
    committed_amount: committed,
    actual_amount: num(line.actual_amount),
    forecast_amount: forecast,
    variance: varianceForecast(revised, forecast),
    variance_forecast: varianceForecast(revised, forecast),
    variance_committed: varianceCommitted(revised, committed),
    remaining: remainingBudget(revised, committed),
    notes: (line.notes as string | null) ?? null,
    sort_order: num(line.sort_order),
  };
}

export const getEventBudget = createAuthenticatedAction(EventIdSchema, async (data, context) => {
  const event = await loadEventOrThrow(context, data.eventId);
  const lookups = await loadLookups(context);
  const [{ data: header }, { data: lines }, { data: invoices }, { data: prs }, { data: baselines }] = await Promise.all([
    context.supabase
      .from("event_budgets")
      .select(
        "id, event_id, currency, status, notes, contract_value, additional_revenue, approved_change_orders, discounts, taxes, line_alert_threshold_pct, contingency_usage_threshold_pct",
      )
      .eq("event_id", data.eventId)
      .maybeSingle(),
    context.supabase
      .from("event_budget_lines")
      .select(
        "id, category_id, subcategory_id, title, original_amount, approved_changes, revised_amount, committed_amount, actual_amount, forecast_amount, notes, sort_order",
      )
      .eq("event_id", data.eventId)
      .order("sort_order"),
    context.supabase
      .from("event_client_invoices")
      .select("id, invoice_number, title, status, amount, currency, fx_rate, base_amount, paid_amount, issue_date, due_date, notes")
      .eq("event_id", data.eventId)
      .order("issue_date", { ascending: true, nullsFirst: false }),
    fetchEventLinkedPrs(
      context,
      {
        id: event.id as string,
        name: event.name as string | null,
        event_name: event.event_name as string | null,
        event_number: event.event_number as string | null,
      },
    ).then((rows) => ({ data: rows })),
    context.supabase
      .from("event_baselines")
      .select("id, baseline_type, snapshot, created_at")
      .eq("event_id", data.eventId)
      .eq("baseline_type", "budget")
      .order("created_at", { ascending: true }),
  ]);

  const catMap = new Map(lookups.costCategories.map((c) => [c.id, c]));
  const subMap = new Map(lookups.costSubcategories.map((s) => [s.id, s]));
  const mapped: EventBudgetLineRow[] = (lines ?? []).map((line) =>
    mapBudgetLine(line as Record<string, unknown>, catMap, subMap),
  );
  const invoiceRows: EventClientInvoiceRow[] = (invoices ?? []).map((inv) => ({
    id: inv.id as string,
    invoice_number: inv.invoice_number as string,
    title: (inv.title as string | null) ?? null,
    status: inv.status as EventClientInvoiceRow["status"],
    amount: num(inv.amount),
    currency: (inv.currency as string) ?? "QAR",
    fx_rate: num(inv.fx_rate) || 1,
    base_amount: num(inv.base_amount),
    paid_amount: num(inv.paid_amount),
    outstanding: Math.max(0, num(inv.base_amount) - num(inv.paid_amount)),
    issue_date: (inv.issue_date as string | null) ?? null,
    due_date: (inv.due_date as string | null) ?? null,
    notes: (inv.notes as string | null) ?? null,
  }));
  const prInputs = (prs ?? []).map((p) => ({
    id: p.id as string,
    status: p.status as string,
    total_amount: num(p.total_amount),
    cost_category_id: (p.cost_category_id as string | null) ?? null,
  }));
  const extraCommitted = prCommittedTotal(prInputs);
  const revenue = revenueFromHeader(header, event.contracted_value as number | null);
  const finance = toFinanceStrip(mapped, revenue, invoiceRows, extraCommitted);
  const lineThreshold = num(header?.line_alert_threshold_pct);
  const contingencyCap = num(header?.contingency_usage_threshold_pct) || 80;
  const rawAlerts = evaluateBudgetAlerts({
    lines: mapped,
    prs: prInputs,
    lineThresholdPct: lineThreshold,
    contingencyUsagePct: contingencyCap,
  });
  const prRows: EventLinkedPrRow[] = (prs ?? []).map((p) => {
    const cat = p.cost_category_id ? catMap.get(p.cost_category_id as string) : undefined;
    const match = rawAlerts.find((a) => a.kind === "pr_exceeds_category" && a.prId === p.id);
    return {
      id: p.id as string,
      pr_number: (p.pr_number as string | null) ?? null,
      status: p.status as string,
      total_amount: num(p.total_amount),
      currency: (p.currency as string) ?? "QAR",
      cost_category_id: (p.cost_category_id as string | null) ?? null,
      category_code: cat?.code ?? null,
      category_label_en: cat?.label_en ?? null,
      category_label_ar: cat?.label_ar ?? null,
      exceed_by: match?.amount ?? null,
    };
  });
  const alerts: EventBudgetAlert[] = rawAlerts;
  const budgetBaselines = (baselines ?? []) as EventBaselineRow[];
  const firstBaseline = budgetBaselines[0] ?? null;
  const baselineCompare: EventBudgetBaselineCompare = {
    baselineId: firstBaseline?.id ?? null,
    savedAt: firstBaseline?.created_at ?? null,
    original: firstBaseline?.snapshot.totals?.original ?? firstBaseline?.snapshot.totals?.revised ?? null,
    currentRevised: finance.revised,
    variance:
      firstBaseline?.snapshot.totals?.original != null && finance.revised != null
        ? finance.revised - firstBaseline.snapshot.totals.original
        : firstBaseline?.snapshot.totals?.revised != null && finance.revised != null
          ? finance.revised - firstBaseline.snapshot.totals.revised
          : null,
  };
  const marginTrend: EventMarginPoint[] = [
    ...budgetBaselines.map((b, i) => ({
      key: `baseline-${i + 1}`,
      at: b.created_at,
      marginPct: b.snapshot.totals?.marginPct ?? null,
      source: "baseline" as const,
    })),
    { key: "original", at: "original", marginPct: finance.originalMarginPct, source: "derived" as const },
    { key: "revised", at: "revised", marginPct: finance.revisedMarginPct, source: "derived" as const },
    { key: "forecast", at: "forecast", marginPct: finance.forecastMarginPct, source: "derived" as const },
    { key: "actual", at: "actual", marginPct: finance.actualMarginPct, source: "derived" as const },
  ];

  return {
    header: header
      ? {
          id: header.id as string,
          currency: header.currency as string,
          status: header.status as (typeof BUDGET_STATUSES)[number],
          notes: (header.notes as string | null) ?? null,
          contract_value: revenue.contractValue,
          additional_revenue: revenue.additionalRevenue,
          approved_change_orders: revenue.changeOrders,
          discounts: revenue.discounts,
          taxes: revenue.taxes,
          line_alert_threshold_pct: lineThreshold,
          contingency_usage_threshold_pct: contingencyCap,
        }
      : null,
    lines: mapped,
    invoices: invoiceRows,
    linkedPrs: prRows,
    totals: sumBudgetLines(mapped),
    finance,
    alerts,
    categories: lookups.costCategories,
    subcategories: lookups.costSubcategories,
    baselines: budgetBaselines,
    baselineCompare,
    marginTrend,
    eventContracted: event.contracted_value == null ? null : num(event.contracted_value),
  };
}, { auth: { capability: "events.view" } });

export const upsertEventBudget = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    status: z.enum(BUDGET_STATUSES).default("draft"),
    notes: z.string().max(2000).optional().nullable(),
    contract_value: z.number().min(0).optional(),
    additional_revenue: z.number().min(0).optional(),
    approved_change_orders: z.number().min(0).optional(),
    discounts: z.number().min(0).optional(),
    taxes: z.number().min(0).optional(),
    line_alert_threshold_pct: z.number().min(0).max(100).optional(),
    contingency_usage_threshold_pct: z.number().min(0).max(100).optional(),
    lines: z.array(
      z.object({
        id: z.string().uuid().optional(),
        category_id: z.string().uuid(),
        subcategory_id: z.string().uuid().optional().nullable(),
        title: z.string().max(200).optional().nullable(),
        original_amount: z.number().min(0),
        approved_changes: z.number(),
        committed_amount: z.number().min(0),
        actual_amount: z.number().min(0),
        forecast_amount: z.number().min(0),
        notes: z.string().max(500).optional().nullable(),
        sort_order: z.number().int().optional(),
      }),
    ),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const lookups = await loadLookups(context);
    const catMap = new Map(lookups.costCategories.map((c) => [c.id, c]));
    const computedLines = data.lines.map((line, idx) => {
      const revised = revisedBudget(line.original_amount, line.approved_changes);
      return {
        ...line,
        revised_amount: revised,
        category_code: catMap.get(line.category_id)?.code ?? "",
        sort_order: line.sort_order ?? idx,
      };
    });
    const { data: existingPrs } = await context.supabase
      .from("purchase_requisitions")
      .select("id, status, total_amount, cost_category_id")
      .eq("event_id", data.eventId);
    const alerts = evaluateBudgetAlerts({
      lines: computedLines,
      prs: (existingPrs ?? []).map((p) => ({
        id: p.id as string,
        status: p.status as string,
        total_amount: num(p.total_amount),
        cost_category_id: (p.cost_category_id as string | null) ?? null,
      })),
      lineThresholdPct: data.line_alert_threshold_pct ?? 0,
      contingencyUsagePct: data.contingency_usage_threshold_pct ?? 80,
    });

    const headerPatch = {
      status: data.status,
      notes: data.notes ?? null,
      contract_value: data.contract_value ?? num(event.contracted_value),
      additional_revenue: data.additional_revenue ?? 0,
      approved_change_orders: data.approved_change_orders ?? 0,
      discounts: data.discounts ?? 0,
      taxes: data.taxes ?? 0,
      line_alert_threshold_pct: data.line_alert_threshold_pct ?? 0,
      contingency_usage_threshold_pct: data.contingency_usage_threshold_pct ?? 80,
      updated_by: context.userId,
    };
    let { data: header } = await context.supabase
      .from("event_budgets")
      .select("id")
      .eq("event_id", data.eventId)
      .maybeSingle();
    if (!header) {
      const inserted = await context.supabase
        .from("event_budgets")
        .insert({
          event_id: data.eventId,
          currency: "QAR",
          created_by: context.userId,
          ...headerPatch,
        })
        .select("id")
        .single();
      if (inserted.error) throw inserted.error;
      header = inserted.data;
    } else {
      const { error } = await context.supabase.from("event_budgets").update(headerPatch).eq("id", header.id);
      if (error) throw error;
    }

    const { data: existing } = await context.supabase
      .from("event_budget_lines")
      .select("id")
      .eq("budget_id", header.id);
    const keep = new Set(computedLines.map((l) => l.id).filter(Boolean) as string[]);
    const toDelete = (existing ?? []).filter((row) => !keep.has(row.id as string));
    if (toDelete.length) {
      await context.supabase.from("event_budget_lines").delete().in(
        "id",
        toDelete.map((r) => r.id),
      );
    }
    for (const line of computedLines) {
      const payload = {
        budget_id: header.id,
        event_id: data.eventId,
        category_id: line.category_id,
        subcategory_id: line.subcategory_id ?? null,
        title: line.title ?? "",
        original_amount: line.original_amount,
        approved_changes: line.approved_changes,
        revised_amount: line.revised_amount,
        committed_amount: line.committed_amount,
        actual_amount: line.actual_amount,
        forecast_amount: line.forecast_amount,
        notes: line.notes ?? null,
        sort_order: line.sort_order,
      };
      if (line.id) {
        const { error } = await context.supabase.from("event_budget_lines").update(payload).eq("id", line.id);
        if (error) throw error;
      } else {
        const { error } = await context.supabase.from("event_budget_lines").insert(payload);
        if (error) throw error;
      }
    }

    if (data.contract_value != null && data.contract_value !== num(event.contracted_value)) {
      await context.supabase
        .from("events")
        .update({ contracted_value: data.contract_value, updated_by: context.userId })
        .eq("id", data.eventId);
    }

    await writeEventAudit(context, {
      action: "budget_save",
      entityType: "budget",
      entityId: header.id,
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: { status: data.status, lines: computedLines.length, alerts: alerts.length },
    });
    await persistScores(
      context,
      {
        id: event.id as string,
        event_start: event.event_start as string | null,
        stage_id: event.stage_id as string | null,
        contracted_value: data.contract_value ?? (event.contracted_value as number | null),
        venue_name: event.venue_name as string | null,
      },
      lookups.stages,
    );
    return { id: header.id, alerts };
  },
  { auth: { capability: "events.finance" } },
);

export const upsertEventClientInvoice = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    eventId: z.string().uuid(),
    invoice_number: z.string().min(1).max(40),
    title: z.string().max(200).optional().nullable(),
    status: z.enum(INVOICE_STATUSES).default("draft"),
    amount: z.number().min(0),
    currency: z.string().max(8).default("QAR"),
    fx_rate: z.number().positive().default(1),
    paid_amount: z.number().min(0).default(0),
    issue_date: z.string().optional().nullable(),
    due_date: z.string().optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const baseAmount = data.amount * (data.fx_rate || 1);
    const payload = {
      event_id: data.eventId,
      invoice_number: data.invoice_number.trim(),
      title: emptyText(data.title),
      status: data.status,
      amount: data.amount,
      currency: data.currency || "QAR",
      fx_rate: data.fx_rate || 1,
      base_amount: baseAmount,
      paid_amount: data.paid_amount,
      issue_date: emptyDate(data.issue_date),
      due_date: emptyDate(data.due_date),
      notes: emptyText(data.notes),
      updated_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("event_client_invoices").update(payload).eq("id", data.id);
      if (error) throw error;
      await writeEventAudit(context, {
        action: "invoice_save",
        entityType: "invoice",
        entityId: data.id,
        eventId: data.eventId,
        locationId: event.location_id as string,
        after: { invoice_number: payload.invoice_number, status: data.status },
      });
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("event_client_invoices")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    await writeEventAudit(context, {
      action: "invoice_save",
      entityType: "invoice",
      entityId: created.id,
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: { invoice_number: payload.invoice_number, status: data.status },
    });
    return created;
  },
  { auth: { capability: "events.finance" } },
);

export const deleteEventClientInvoice = createAuthenticatedAction(IdSchema, async (data, context) => {
  const { data: row } = await context.supabase
    .from("event_client_invoices")
    .select("event_id")
    .eq("id", data.id)
    .maybeSingle();
  if (!row) throw new Error("Invoice not found");
  await loadEventOrThrow(context, row.event_id as string);
  const { error } = await context.supabase.from("event_client_invoices").delete().eq("id", data.id);
  if (error) throw error;
  return { id: data.id };
}, { auth: { capability: "events.finance" } });

export const toggleReadinessItem = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), is_complete: z.boolean() }),
  async (data, context) => {
    const { data: row } = await context.supabase
      .from("event_readiness_items")
      .select("event_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Readiness item not found");
    const event = await loadEventOrThrow(context, row.event_id as string);
    const { error } = await context.supabase
      .from("event_readiness_items")
      .update({
        is_complete: data.is_complete,
        completed_at: data.is_complete ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw error;
    const lookups = await loadLookups(context);
    await persistScores(
      context,
      {
        id: event.id as string,
        event_start: event.event_start as string | null,
        stage_id: event.stage_id as string | null,
        contracted_value: event.contracted_value as number | null,
        venue_name: event.venue_name as string | null,
      },
      lookups.stages,
    );
    return { id: data.id };
  },
  { auth: { capability: "events.edit" } },
);

export const upsertEventRisk = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    eventId: z.string().uuid(),
    title: z.string().min(2).max(200),
    severity: z.enum(RISK_SEVERITIES).default("medium"),
    status: z.enum(RISK_STATUSES).default("open"),
    due_date: z.string().optional().nullable(),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const payload = {
      event_id: data.eventId,
      title: data.title,
      severity: data.severity,
      status: data.status,
      due_date: data.due_date ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("event_risks").update(payload).eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase
        .from("event_risks")
        .insert({ ...payload, created_by: context.userId });
      if (error) throw error;
    }
    const lookups = await loadLookups(context);
    await persistScores(
      context,
      {
        id: event.id as string,
        event_start: event.event_start as string | null,
        stage_id: event.stage_id as string | null,
        contracted_value: event.contracted_value as number | null,
        venue_name: event.venue_name as string | null,
      },
      lookups.stages,
    );
    return { ok: true };
  },
  { auth: { capability: "events.edit" } },
);

export const setEventGoLive = createAuthenticatedAction(
  z.object({ eventId: z.string().uuid(), approved: z.boolean() }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const { error } = await context.supabase
      .from("events")
      .update({
        go_live_approved: data.approved,
        go_live_approved_at: data.approved ? new Date().toISOString() : null,
        go_live_approved_by: data.approved ? context.userId : null,
        updated_by: context.userId,
      })
      .eq("id", data.eventId);
    if (error) throw error;
    await context.supabase
      .from("event_readiness_items")
      .update({
        is_complete: data.approved,
        completed_at: data.approved ? new Date().toISOString() : null,
      })
      .eq("event_id", data.eventId)
      .eq("code", "go_live_approval");
    await writeEventAudit(context, {
      action: data.approved ? "go_live_approve" : "go_live_clear",
      entityType: "event",
      entityId: data.eventId,
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: { go_live_approved: data.approved },
    });
    const lookups = await loadLookups(context);
    await persistScores(
      context,
      {
        id: event.id as string,
        event_start: event.event_start as string | null,
        stage_id: event.stage_id as string | null,
        contracted_value: event.contracted_value as number | null,
        venue_name: event.venue_name as string | null,
      },
      lookups.stages,
    );
    return { ok: true };
  },
  { auth: { capability: "events.approve" } },
);

export const upsertEventIssue = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    eventId: z.string().uuid(),
    title: z.string().min(2).max(200),
    description: z.string().max(2000).optional().nullable(),
    severity: z.enum(ISSUE_SEVERITIES).default("medium"),
    status: z.enum(ISSUE_STATUSES).default("open"),
    owner_staff_id: z.string().uuid().optional().nullable(),
    due_date: z.string().optional().nullable(),
    is_snag: z.boolean().optional(),
    is_safety: z.boolean().optional(),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    const payload = {
      event_id: data.eventId,
      title: data.title,
      description: emptyText(data.description),
      severity: data.severity,
      status: data.status,
      owner_staff_id: data.owner_staff_id ?? null,
      due_date: emptyDate(data.due_date),
      is_snag: data.is_snag ?? false,
      is_safety: data.is_safety ?? false,
      updated_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("event_issues").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("event_issues")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return created;
  },
  { auth: { capability: "events.edit" } },
);

export const deleteEventIssue = createAuthenticatedAction(IdSchema, async (data, context) => {
  const { data: row } = await context.supabase.from("event_issues").select("id, event_id").eq("id", data.id).maybeSingle();
  if (!row) throw new Error("Issue not found");
  await loadEventOrThrow(context, row.event_id as string);
  const { error } = await context.supabase
    .from("event_issues")
    .update({ deleted_at: new Date().toISOString(), updated_by: context.userId })
    .eq("id", data.id);
  if (error) throw error;
  return { id: data.id };
}, { auth: { capability: "events.edit" } });

export const upsertEventDocument = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    eventId: z.string().uuid(),
    title: z.string().min(2).max(200),
    doc_type: z.enum(DOCUMENT_TYPES).default("other"),
    url: z.string().max(500).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    required: z.boolean().optional(),
    owner_staff_id: z.string().uuid().optional().nullable(),
    wbs_id: z.string().uuid().optional().nullable(),
    workstream_code: z.string().max(80).optional().nullable(),
    is_addendum: z.boolean().optional(),
    status: z.enum(DOCUMENT_STATUSES).optional(),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    const existing = data.id
      ? (await context.supabase
          .from("event_documents")
          .select("id, file_path, url, status")
          .eq("id", data.id)
          .maybeSingle()).data
      : null;
    const url = emptyText(data.url) ?? (existing?.url as string | null) ?? null;
    const filePath = (existing?.file_path as string | null) ?? null;
    const nextStatus =
      data.status === "waived"
        ? "waived"
        : resolveDocumentStatus({
            status: (data.status ?? (existing?.status as EventDocumentRow["status"] | undefined) ?? "missing") as EventDocumentRow["status"],
            file_path: filePath,
            url,
          });
    const payload: Record<string, unknown> = {
      event_id: data.eventId,
      title: data.title,
      doc_type: data.doc_type,
      url,
      notes: emptyText(data.notes),
      required: data.required ?? false,
      owner_staff_id: data.owner_staff_id ?? null,
      wbs_id: data.wbs_id ?? null,
      status: nextStatus,
      updated_by: context.userId,
    };
    if (data.workstream_code !== undefined) payload.workstream_code = emptyText(data.workstream_code);
    if (data.is_addendum !== undefined) payload.is_addendum = data.is_addendum;
    if (data.id) {
      const { error } = await context.supabase.from("event_documents").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("event_documents")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return created;
  },
  { auth: { capability: "events.edit" } },
);

export const uploadEventDocumentFile = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    filename: z.string().min(1).max(200),
    data_base64: z.string().min(10).max(28_000_000),
    content_type: z.string().max(100).optional().nullable(),
  }),
  async (data, context) => {
    const mime = mimeFromFileName(data.filename, data.content_type);
    validateUploadMimeList(mime, [...EVENT_DOCUMENT_MIMES]);
    validateBase64Size(data.data_base64, 20 * 1024 * 1024);

    const { data: row } = await context.supabase
      .from("event_documents")
      .select("id, event_id, file_path")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!row) throw new Error("Document not found");
    await loadEventOrThrow(context, row.event_id as string);

    if (row.file_path) {
      await context.supabase.storage.from(EVENT_DOC_BUCKET).remove([row.file_path as string]);
    }

    const safeName = sanitizeEventFileName(data.filename);
    const path = `${row.event_id}/${row.id}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(data.data_base64, "base64");
    const { error: upErr } = await context.supabase.storage
      .from(EVENT_DOC_BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: false });
    if (upErr) throw upErr;

    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("event_documents")
      .update({
        file_path: path,
        file_name: data.filename,
        file_mime: mime,
        url: null,
        status: "uploaded",
        uploaded_by: context.userId,
        uploaded_at: now,
        updated_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { id: data.id, path, file_name: data.filename };
  },
  { auth: { capability: "events.edit" } },
);

export const getEventDocumentUrl = createAuthenticatedAction(IdSchema, async (data, context) => {
  const { data: row } = await context.supabase
    .from("event_documents")
    .select("id, event_id, url, file_path")
    .eq("id", data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) throw new Error("Document not found");
  await loadEventOrThrow(context, row.event_id as string);
  if (row.url) return { url: row.url as string };
  if (!row.file_path) return { url: null };
  const { data: signed, error } = await context.supabase.storage
    .from(EVENT_DOC_BUCKET)
    .createSignedUrl(row.file_path as string, 600);
  if (error) throw error;
  return { url: signed.signedUrl };
}, { auth: { capability: "events.view" } });

export const deleteEventDocument = createAuthenticatedAction(IdSchema, async (data, context) => {
  const { data: row } = await context.supabase
    .from("event_documents")
    .select("id, event_id, file_path")
    .eq("id", data.id)
    .maybeSingle();
  if (!row) throw new Error("Document not found");
  await loadEventOrThrow(context, row.event_id as string);
  await context.supabase.from("event_boq_lines").delete().eq("document_id", data.id);
  if (row.file_path) {
    await context.supabase.storage.from(EVENT_DOC_BUCKET).remove([row.file_path as string]);
  }
  const { error } = await context.supabase
    .from("event_documents")
    .update({ deleted_at: new Date().toISOString(), updated_by: context.userId })
    .eq("id", data.id);
  if (error) throw error;
  return { id: data.id };
}, { auth: { capability: "events.edit" } });

const BoqLineInput = z.object({
  description: z.string().min(1).max(500),
  qty: z.number().min(0).max(1_000_000_000),
  unit: z.string().max(40).optional().nullable(),
  rate: z.number().min(0).max(1_000_000_000_000).optional().nullable(),
  amount: z.number().min(0).max(1_000_000_000_000).optional().nullable(),
  cost_category: z.string().max(80).optional().nullable(),
});

export const listEventBoqLines = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    documentId: z.string().uuid().optional(),
    workstream_code: z.string().max(80).optional(),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    let query = context.supabase
      .from("event_boq_lines")
      .select("id, event_id, document_id, workstream_code, line_no, description, qty, unit, rate, amount, cost_category")
      .eq("event_id", data.eventId)
      .order("line_no", { ascending: true });
    if (data.documentId) query = query.eq("document_id", data.documentId);
    if (data.workstream_code) query = query.eq("workstream_code", data.workstream_code);
    const { data: rows, error } = await query;
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return { lines: [] as EventBoqLineRow[] };
      throw error;
    }
    const lines: EventBoqLineRow[] = (rows ?? []).map((row) => ({
      id: row.id as string,
      event_id: row.event_id as string,
      document_id: row.document_id as string,
      workstream_code: (row.workstream_code as string | null) ?? null,
      line_no: num(row.line_no) || 1,
      description: row.description as string,
      qty: num(row.qty),
      unit: (row.unit as string | null) ?? null,
      rate: row.rate == null ? null : num(row.rate),
      amount: num(row.amount),
      cost_category: (row.cost_category as string | null) ?? null,
    }));
    return { lines };
  },
  { auth: { capability: "events.view" } },
);

export const uploadDepartmentBoq = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    workstream_code: z.string().min(1).max(80),
    document_id: z.string().uuid().optional(),
    is_addendum: z.boolean().optional(),
    filename: z.string().min(1).max(200),
    data_base64: z.string().min(10).max(28_000_000),
    content_type: z.string().max(100).optional().nullable(),
    lines: z.array(BoqLineInput).max(2000).optional(),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    const canon = canonicalWorkstreamCode(data.workstream_code);
    const { data: node } = await context.supabase
      .from("event_wbs_nodes")
      .select("id, code, title")
      .eq("event_id", data.eventId)
      .eq("code", canon ?? data.workstream_code)
      .is("deleted_at", null)
      .maybeSingle();
    const code = canon ?? (node?.code as string | null) ?? data.workstream_code;
    if (!canon && !node) throw new Error("Unknown department / workstream");

    let docId = data.document_id ?? null;
    if (!docId && !data.is_addendum) {
      const { data: existing } = await context.supabase
        .from("event_documents")
        .select("id")
        .eq("event_id", data.eventId)
        .eq("doc_type", "boq")
        .eq("workstream_code", code)
        .eq("is_addendum", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      docId = (existing?.id as string | undefined) ?? null;
    }
    if (!docId) {
      const label = ((node?.title as string | null) ?? workstreamTitle(code)) || code;
      const { data: created, error } = await context.supabase
        .from("event_documents")
        .insert({
          event_id: data.eventId,
          title: data.is_addendum ? `BOQ addendum — ${label}` : `BOQ — ${label}`,
          doc_type: "boq",
          required: !data.is_addendum,
          status: "missing",
          workstream_code: code,
          wbs_id: (node?.id as string | undefined) ?? null,
          is_addendum: Boolean(data.is_addendum),
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      docId = created.id as string;
    }

    const mime = mimeFromFileName(data.filename, data.content_type);
    validateUploadMimeList(mime, [...EVENT_DOCUMENT_MIMES]);
    validateBase64Size(data.data_base64, 20 * 1024 * 1024);

    const { data: row } = await context.supabase
      .from("event_documents")
      .select("id, event_id, file_path")
      .eq("id", docId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!row) throw new Error("Document not found");

    if (row.file_path) {
      await context.supabase.storage.from(EVENT_DOC_BUCKET).remove([row.file_path as string]);
    }

    const safeName = sanitizeEventFileName(data.filename);
    const path = `${data.eventId}/${docId}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(data.data_base64, "base64");
    const { error: upErr } = await context.supabase.storage
      .from(EVENT_DOC_BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: false });
    if (upErr) throw upErr;

    const now = new Date().toISOString();
    const { error: docErr } = await context.supabase
      .from("event_documents")
      .update({
        file_path: path,
        file_name: data.filename,
        file_mime: mime,
        url: null,
        status: "uploaded",
        workstream_code: code,
        wbs_id: (node?.id as string | undefined) ?? null,
        uploaded_by: context.userId,
        uploaded_at: now,
        updated_by: context.userId,
      })
      .eq("id", docId);
    if (docErr) throw docErr;

    await context.supabase.from("event_boq_lines").delete().eq("document_id", docId);
    const incoming = data.lines ?? [];
    if (incoming.length) {
      const { error: lineErr } = await context.supabase.from("event_boq_lines").insert(
        incoming.map((line, idx) => {
          const qty = line.qty;
          const rate = line.rate ?? null;
          const amount = line.amount ?? (rate != null ? qty * rate : 0);
          return {
            event_id: data.eventId,
            document_id: docId,
            workstream_code: code,
            line_no: idx + 1,
            description: line.description,
            qty,
            unit: emptyText(line.unit),
            rate,
            amount: Math.round(amount * 100) / 100,
            cost_category: emptyText(line.cost_category),
            created_by: context.userId,
          };
        }),
      );
      if (lineErr) throw lineErr;
    }

    return { id: docId, path, file_name: data.filename, line_count: incoming.length };
  },
  { auth: { capability: "events.edit" } },
);

export const upsertEventPayable = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    eventId: z.string().uuid(),
    kind: z.enum(PAYABLE_KINDS).default("payment"),
    title: z.string().min(2).max(200),
    reference: z.string().max(80).optional().nullable(),
    vendor_name: z.string().max(200).optional().nullable(),
    amount: z.number().min(0),
    status: z.enum(PAYABLE_STATUSES).default("pending"),
    due_date: z.string().optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    const payload = {
      event_id: data.eventId,
      kind: data.kind,
      title: data.title,
      reference: emptyText(data.reference),
      vendor_name: emptyText(data.vendor_name),
      amount: data.amount,
      currency: "QAR",
      status: data.status,
      due_date: emptyDate(data.due_date),
      notes: emptyText(data.notes),
      updated_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("event_payables").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("event_payables")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return created;
  },
  { auth: { anyCapability: ["events.edit", "events.finance"] } },
);

export const deleteEventPayable = createAuthenticatedAction(IdSchema, async (data, context) => {
  const { data: row } = await context.supabase.from("event_payables").select("id, event_id").eq("id", data.id).maybeSingle();
  if (!row) throw new Error("Payable not found");
  await loadEventOrThrow(context, row.event_id as string);
  const { error } = await context.supabase
    .from("event_payables")
    .update({ deleted_at: new Date().toISOString(), updated_by: context.userId })
    .eq("id", data.id);
  if (error) throw error;
  return { id: data.id };
}, { auth: { anyCapability: ["events.edit", "events.finance"] } });

export const upsertEventAsset = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    eventId: z.string().uuid(),
    item_name: z.string().min(2).max(200),
    qty: z.number().min(0).default(1),
    status: z.enum(ASSET_MOVE_STATUSES).default("planned"),
    due_date: z.string().optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    const payload = {
      event_id: data.eventId,
      item_name: data.item_name,
      qty: data.qty,
      status: data.status,
      due_date: emptyDate(data.due_date),
      notes: emptyText(data.notes),
      updated_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("event_asset_movements").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("event_asset_movements")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return created;
  },
  { auth: { capability: "events.edit" } },
);

export const deleteEventAsset = createAuthenticatedAction(IdSchema, async (data, context) => {
  const { data: row } = await context.supabase.from("event_asset_movements").select("id, event_id").eq("id", data.id).maybeSingle();
  if (!row) throw new Error("Asset movement not found");
  await loadEventOrThrow(context, row.event_id as string);
  const { error } = await context.supabase
    .from("event_asset_movements")
    .update({ deleted_at: new Date().toISOString(), updated_by: context.userId })
    .eq("id", data.id);
  if (error) throw error;
  return { id: data.id };
}, { auth: { capability: "events.edit" } });

export const saveEventLessons = createAuthenticatedAction(
  z.object({ eventId: z.string().uuid(), lessons_learned: z.string().max(8000).nullable() }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    const { error } = await context.supabase
      .from("events")
      .update({ lessons_learned: emptyText(data.lessons_learned), updated_by: context.userId })
      .eq("id", data.eventId);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "events.edit" } },
);

const EventPlanApplySchema = z.object({
  eventId: z.string().uuid(),
  apply: z.object({
    scope: z.boolean().optional(),
    tasks: z.boolean().optional(),
    schedule: z.boolean().optional(),
    budget: z.boolean().optional(),
    risks: z.boolean().optional(),
    dates: z.boolean().optional(),
  }),
  draft: z.object({
    scope_sections: z.array(z.object({ key: z.string(), title: z.string(), body: z.string() })),
    deliverables: z.array(z.object({ title: z.string(), due_date: z.string().nullable() })),
    included_workstreams: z.array(z.string()),
    tasks: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
        workstream_code: z.string(),
        lifecycle_phase: z.string(),
        start_date: z.string(),
        due_date: z.string(),
        priority: z.enum(TASK_PRIORITIES),
        is_critical: z.boolean(),
      }),
    ),
    budget_lines: z.array(
      z.object({
        category_code: z.string(),
        title: z.string(),
        original_amount: z.number(),
        notes: z.string(),
      }),
    ),
    risks: z.array(z.object({ title: z.string(), severity: z.enum(RISK_SEVERITIES) })),
    next_actions: z.array(z.string()),
    event_dates: z.object({
      planning_start: z.string().nullable(),
      setup_start: z.string().nullable(),
      setup_end: z.string().nullable(),
      event_start: z.string().nullable(),
      event_end: z.string().nullable(),
      dismantle_start: z.string().nullable(),
      dismantle_end: z.string().nullable(),
    }),
  }),
});

const EventPlanSignalSchema = z.object({
  overdue_tasks: z
    .array(
      z.object({
        title: z.string(),
        due_date: z.string().nullable().optional(),
        owner_name: z.string().nullable().optional(),
        workstream: z.string().nullable().optional(),
      }),
    )
    .max(12)
    .default([]),
  pending_prs: z
    .array(
      z.object({
        pr_number: z.string().nullable(),
        title: z.string().nullable().optional(),
        status: z.string(),
        overdue: z.boolean().optional(),
      }),
    )
    .max(12)
    .default([]),
  missing_docs: z
    .array(z.object({ kind: z.enum(["boq", "permit"]), title: z.string().nullable().optional() }))
    .max(8)
    .default([]),
  blocked_tasks: z
    .array(
      z.object({
        title: z.string(),
        due_date: z.string().nullable().optional(),
        owner_name: z.string().nullable().optional(),
        workstream: z.string().nullable().optional(),
      }),
    )
    .max(8)
    .default([]),
  unassigned_open_tasks: z.number().int().min(0).max(999).default(0),
});

export const aiDraftEventPlan = createAuthenticatedAction(
  z.object({
    notes: z.string().max(4000).default(""),
    focus: z.enum(["all", "scope", "wbs", "schedule", "budget", "tasks", "next"]).optional(),
    eventId: z.string().uuid().optional(),
    event_name: z.string().max(200).optional().nullable(),
    client_name: z.string().max(200).optional().nullable(),
    venue_name: z.string().max(200).optional().nullable(),
    event_type: z.string().max(120).optional().nullable(),
    event_start: z.string().optional().nullable(),
    event_end: z.string().optional().nullable(),
    planning_start: z.string().optional().nullable(),
    setup_start: z.string().optional().nullable(),
    dismantle_end: z.string().optional().nullable(),
    contracted_value: z.number().min(0).optional().nullable(),
    location_id: z.string().uuid().optional().nullable(),
    locale: z.enum(["en", "ar"]).optional(),
    signals: EventPlanSignalSchema.optional().nullable(),
  }),
  async (data, context) => {
    const lookups = await loadLookups(context);
    let locationName: string | null = null;
    let eventName = data.event_name ?? null;
    let clientName = data.client_name ?? null;
    let venueName = data.venue_name ?? null;
    let eventStart = data.event_start ?? null;
    let eventEnd = data.event_end ?? null;
    let planningStart = data.planning_start ?? null;
    let setupStart = data.setup_start ?? null;
    let dismantleEnd = data.dismantle_end ?? null;
    let contracted = data.contracted_value ?? null;
    let typeLabel = data.event_type ?? null;
    let notes = data.notes;

    if (data.eventId) {
      const event = await loadEventOrThrow(context, data.eventId);
      const { data: loc } = await context.supabase.from("locations").select("name").eq("id", event.location_id as string).maybeSingle();
      locationName = loc?.name ?? null;
      eventName = eventName || (event.event_name as string | null) || (event.name as string);
      clientName = clientName || (event.client_name as string | null);
      venueName = venueName || (event.venue_name as string | null);
      eventStart = eventStart || (event.event_start as string | null);
      eventEnd = eventEnd || (event.event_end as string | null);
      planningStart = planningStart || (event.planning_start as string | null);
      setupStart = setupStart || (event.setup_start as string | null);
      dismantleEnd = dismantleEnd || (event.dismantle_end as string | null);
      contracted = contracted ?? (event.contracted_value as number | null);
      notes = notes.trim() || (event.notes as string | null) || (event.description as string | null) || "";
      const type = lookups.types.find((t) => t.id === event.event_type_id);
      typeLabel = typeLabel || type?.label_en || type?.code || null;
    } else if (data.location_id) {
      await assertLocationAccess(context, data.location_id);
      const { data: loc } = await context.supabase.from("locations").select("name").eq("id", data.location_id).maybeSingle();
      locationName = loc?.name ?? null;
    }

    const draft = await callEventPlanAiDraft({
      notes,
      focus: (data.focus ?? "all") as EventPlanFocus,
      event_name: eventName,
      client_name: clientName,
      venue_name: venueName,
      location_name: locationName,
      event_type: typeLabel,
      event_start: eventStart,
      event_end: eventEnd,
      planning_start: planningStart,
      setup_start: setupStart,
      dismantle_end: dismantleEnd,
      contracted_value: contracted,
      locale: data.locale,
      signals: (data.signals ?? null) as EventPlanSignals | null,
      cost_categories: lookups.costCategories.map((c) => ({
        id: c.id,
        code: c.code,
        label_en: c.label_en,
        label_ar: c.label_ar,
      })),
    });

    return draft;
  },
  { auth: { capability: "events.edit" } },
);

export const aiDraftEventReportBrief = createAuthenticatedAction(
  z.object({
    mode: z.enum(["current", "executive"]).default("current"),
    report_id: z.string().max(80),
    report_label: z.string().max(160),
    locale: z.enum(["en", "ar"]).optional(),
    row_count: z.number().int().min(0).max(10_000),
    kpis: z.array(z.object({ label: z.string().max(120), value: z.string().max(80) })).max(12),
    columns: z.array(z.string().max(80)).max(24),
    rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).max(40),
    portfolio: z
      .array(z.object({ id: z.string().max(80), label: z.string().max(160), row_count: z.number().int().min(0) }))
      .max(24)
      .optional(),
  }),
  async (data) =>
    callEventReportAiBrief({
      mode: data.mode,
      report_id: data.report_id,
      report_label: data.report_label,
      locale: data.locale,
      row_count: data.row_count,
      kpis: data.kpis,
      columns: data.columns,
      rows: data.rows,
      portfolio: data.portfolio,
    }),
  { auth: { capability: "events.view" } },
);

export const applyEventPlanDraft = createAuthenticatedAction(
  EventPlanApplySchema,
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    await ensureStandardWorkstreams(context, data.eventId);
    const lookups = await loadLookups(context);
    const applied: string[] = [];
    const skipped: string[] = [];

    if (data.apply.dates) {
      const d = data.draft.event_dates;
      const dismantleEnd = emptyDate(d.dismantle_end);
      const { error } = await context.supabase
        .from("events")
        .update({
          planning_start: emptyDate(d.planning_start),
          setup_start: emptyDate(d.setup_start),
          setup_end: emptyDate(d.setup_end),
          event_start: emptyDate(d.event_start),
          event_end: emptyDate(d.event_end),
          dismantle_start: emptyDate(d.dismantle_start),
          dismantle_end: dismantleEnd,
          dismantle_date: dismantleEnd,
          updated_by: context.userId,
        })
        .eq("id", data.eventId);
      if (error) throw error;
      applied.push("dates");
    }

    if (data.apply.scope) {
      const filled = data.draft.scope_sections.filter((s) => s.body.trim());
      if (filled.length) {
        await saveScopeVersion({
          eventId: data.eventId,
          title: "Scope",
          sections: data.draft.scope_sections,
          isBaseline: false,
        });
        applied.push("scope");
      } else {
        skipped.push("scope");
      }
      const { data: existingDeliv } = await context.supabase
        .from("event_deliverables")
        .select("title")
        .eq("event_id", data.eventId)
        .is("deleted_at", null);
      const haveDeliv = new Set((existingDeliv ?? []).map((d) => (d.title as string).trim().toLowerCase()));
      const newDeliv = data.draft.deliverables.filter((d) => d.title.trim() && !haveDeliv.has(d.title.trim().toLowerCase()));
      if (newDeliv.length) {
        const { error } = await context.supabase.from("event_deliverables").insert(
          newDeliv.map((d, idx) => ({
            event_id: data.eventId,
            title: d.title,
            due_date: emptyDate(d.due_date),
            status: "pending",
            sort_order: (existingDeliv?.length ?? 0) + idx,
            created_by: context.userId,
          })),
        );
        if (error) throw error;
      }
    }

    if (data.apply.tasks || data.apply.schedule) {
      const { data: wbsRows } = await context.supabase
        .from("event_wbs_nodes")
        .select("id, code")
        .eq("event_id", data.eventId)
        .is("deleted_at", null);
      const wbsByCode = new Map((wbsRows ?? []).map((n) => [n.code as string, n.id as string]));
      const { data: existingTasks } = await context.supabase
        .from("event_tasks")
        .select("id, title, wbs_id")
        .eq("event_id", data.eventId)
        .is("deleted_at", null);
      const existingKey = new Set(
        (existingTasks ?? []).map((t) => `${t.wbs_id ?? ""}::${String(t.title).trim().toLowerCase()}`),
      );
      const wanted = data.draft.included_workstreams.length
        ? data.draft.tasks.filter((t) => data.draft.included_workstreams.includes(t.workstream_code))
        : data.draft.tasks;

      if (data.apply.tasks) {
        for (const task of wanted) {
          const wbsId = wbsByCode.get(task.workstream_code) ?? null;
          const key = `${wbsId ?? ""}::${task.title.trim().toLowerCase()}`;
          if (existingKey.has(key)) continue;
          const { data: number, error: numErr } = await context.supabase.rpc("next_tsk_number");
          if (numErr) throw numErr;
          const { error } = await context.supabase.from("event_tasks").insert({
            event_id: data.eventId,
            task_number: number,
            title: task.title,
            description: emptyText(task.description),
            wbs_id: wbsId,
            status: "not_started",
            priority: task.priority,
            is_critical: task.is_critical,
            start_date: emptyDate(task.start_date),
            due_date: emptyDate(task.due_date),
            duration_days: daysBetween(task.start_date, task.due_date),
            lifecycle_phase: task.lifecycle_phase,
            created_by: context.userId,
            updated_by: context.userId,
          });
          if (error) throw error;
          existingKey.add(key);
        }
        applied.push("tasks");
      }

      if (data.apply.schedule) {
        for (const task of wanted) {
          const wbsId = wbsByCode.get(task.workstream_code) ?? null;
          const match = (existingTasks ?? []).find(
            (t) =>
              t.title.trim().toLowerCase() === task.title.trim().toLowerCase() &&
              (t.wbs_id ?? null) === wbsId,
          );
          if (!match) continue;
          const { error } = await context.supabase
            .from("event_tasks")
            .update({
              start_date: emptyDate(task.start_date),
              due_date: emptyDate(task.due_date),
              duration_days: daysBetween(task.start_date, task.due_date),
              lifecycle_phase: task.lifecycle_phase,
              updated_by: context.userId,
            })
            .eq("id", match.id);
          if (error) throw error;
        }
        for (const ws of STANDARD_WORKSTREAMS) {
          const nodeId = wbsByCode.get(ws.code);
          if (!nodeId) continue;
          const wsTasks = wanted.filter((t) => t.workstream_code === ws.code);
          if (!wsTasks.length) continue;
          const start = wsTasks.map((t) => t.start_date).sort()[0];
          const due = wsTasks.map((t) => t.due_date).sort().at(-1);
          await context.supabase
            .from("event_wbs_nodes")
            .update({ start_date: emptyDate(start), due_date: emptyDate(due) })
            .eq("id", nodeId);
        }
        applied.push("schedule");
      }
    }

    if (data.apply.budget) {
      if (!canUserDo(context.roles ?? [], "events.finance")) {
        skipped.push("budget");
      } else {
        const catByCode = new Map(lookups.costCategories.map((c) => [c.code, c]));
        const { data: currentLines } = await context.supabase
          .from("event_budget_lines")
          .select("id, category_id, subcategory_id, title, original_amount, approved_changes, committed_amount, actual_amount, forecast_amount, notes, sort_order")
          .eq("event_id", data.eventId)
          .order("sort_order");
        const merged: Array<{
          id?: string;
          category_id: string;
          subcategory_id?: string | null;
          title: string;
          original_amount: number;
          approved_changes: number;
          committed_amount: number;
          actual_amount: number;
          forecast_amount: number;
          notes: string | null;
          sort_order: number;
        }> = (currentLines ?? []).map((l) => ({
          id: l.id as string,
          category_id: l.category_id as string,
          subcategory_id: (l.subcategory_id as string | null) ?? null,
          title: (l.title as string) ?? "",
          original_amount: num(l.original_amount),
          approved_changes: num(l.approved_changes),
          committed_amount: num(l.committed_amount),
          actual_amount: num(l.actual_amount),
          forecast_amount: num(l.forecast_amount),
          notes: (l.notes as string | null) ?? null,
          sort_order: num(l.sort_order),
        }));
        for (const line of data.draft.budget_lines) {
          const cat = catByCode.get(line.category_code);
          if (!cat) continue;
          const exists = merged.some(
            (l) => l.category_id === cat.id && l.title.trim().toLowerCase() === line.title.trim().toLowerCase(),
          );
          if (exists) continue;
          merged.push({
            category_id: cat.id,
            subcategory_id: null,
            title: line.title,
            original_amount: line.original_amount,
            approved_changes: 0,
            committed_amount: 0,
            actual_amount: 0,
            forecast_amount: line.original_amount,
            notes: line.notes || "Estimate",
            sort_order: merged.length,
          });
        }
        await upsertEventBudget({
          eventId: data.eventId,
          status: "draft",
          notes: "Starting estimates from the project builder. Review before approval.",
          contract_value: num(event.contracted_value),
          lines: merged,
        });
        applied.push("budget");
      }
    }

    if (data.apply.risks) {
      const { data: existingRisks } = await context.supabase
        .from("event_risks")
        .select("title")
        .eq("event_id", data.eventId);
      const have = new Set((existingRisks ?? []).map((r) => String(r.title).trim().toLowerCase()));
      const add = data.draft.risks.filter((r) => r.title.trim() && !have.has(r.title.trim().toLowerCase()));
      if (add.length) {
        const { error } = await context.supabase.from("event_risks").insert(
          add.map((r) => ({
            event_id: data.eventId,
            title: r.title,
            severity: r.severity,
            status: "open",
            created_by: context.userId,
          })),
        );
        if (error) throw error;
      }
      applied.push("risks");
    }

    await persistScores(
      context,
      {
        id: event.id as string,
        event_start: data.draft.event_dates.event_start ?? (event.event_start as string | null),
        stage_id: event.stage_id as string | null,
        contracted_value: event.contracted_value as number | null,
        venue_name: event.venue_name as string | null,
      },
      lookups.stages,
    );
    await writeEventAudit(context, {
      action: "plan_draft_apply",
      entityType: "event",
      entityId: data.eventId,
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: { applied, skipped },
    });
    return { applied, skipped };
  },
  { auth: { capability: "events.edit" } },
);

export const launchEventSetup = createAuthenticatedAction(
  z.object({ eventId: z.string().uuid() }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const { error } = await context.supabase
      .from("events")
      .update({ status: "active", updated_by: context.userId })
      .eq("id", data.eventId);
    if (error) throw error;
    await writeEventAudit(context, {
      action: "setup_launch",
      entityType: "event",
      entityId: data.eventId,
      eventId: data.eventId,
      locationId: event.location_id as string,
      before: { status: event.status },
      after: { status: "active" },
    });
    return { id: data.eventId, status: "active" as const };
  },
  { auth: { capability: "events.edit" } },
);

export const getEventReports = createAuthenticatedAction(
  z
    .object({
      locationId: z.string().uuid().nullable().optional(),
      eventId: z.string().uuid().nullable().optional(),
      pmStaffId: z.string().uuid().nullable().optional(),
      from: z.string().nullable().optional(),
      to: z.string().nullable().optional(),
    })
    .default({}),
  async (data, context): Promise<EventReportsPayload> => {
    const canFinance = canUserDo(context.roles ?? [], "events.finance");
    const lookups = await loadLookups(context);
    let q = context.supabase
      .from("events")
      .select(
        "id, event_number, name, event_name, client_name, venue_name, status, stage_id, pm_staff_id, event_start, event_end, setup_start, dismantle_date, health_rag, readiness_pct, go_live_approved, contracted_value, lessons_learned, location_id",
      )
      .is("deleted_at", null)
      .order("event_start", { ascending: true, nullsFirst: false })
      .limit(400);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.eventId) q = q.eq("id", data.eventId);
    if (data.pmStaffId) q = q.eq("pm_staff_id", data.pmStaffId);
    const { data: rows, error } = await q;
    if (error) throw error;

    const from = data.from || null;
    const to = data.to || null;
    const raw = (rows ?? []).filter((row) => {
      if (!from && !to) return true;
      const start = (row.event_start as string | null) ?? (row.setup_start as string | null);
      const end = (row.event_end as string | null) ?? (row.dismantle_date as string | null) ?? start;
      if (!start && !end) return true;
      if (from && end && end < from) return false;
      if (to && start && start > to) return false;
      return true;
    });

    const eventIds = raw.map((r) => r.id as string);
    const staffIds = [...new Set(raw.map((r) => r.pm_staff_id).filter(Boolean))] as string[];
    const stageMap = new Map(lookups.stages.map((s) => [s.id, s]));
    const { data: staff } = staffIds.length
      ? await context.supabase.from("staff").select("id, full_name").in("id", staffIds)
      : { data: [] };
    const staffMap = new Map((staff ?? []).map((s) => [s.id, s.full_name]));

    const emptyKids = {
      tasks: [] as Array<Record<string, unknown>>,
      wbs: [] as Array<Record<string, unknown>>,
      ready: [] as Array<Record<string, unknown>>,
      issues: [] as Array<Record<string, unknown>>,
      risks: [] as Array<Record<string, unknown>>,
      prs: [] as Array<Record<string, unknown>>,
      pos: [] as Array<Record<string, unknown>>,
      payables: [] as Array<Record<string, unknown>>,
      assets: [] as Array<Record<string, unknown>>,
      lines: [] as Array<Record<string, unknown>>,
      budgets: [] as Array<Record<string, unknown>>,
      invoices: [] as Array<Record<string, unknown>>,
    };
    const kids = eventIds.length
      ? await Promise.all([
          context.supabase
            .from("event_tasks")
            .select("event_id, title, status, priority, due_date, percent_complete, is_critical, is_snag, owner_staff_id, wbs_id, lifecycle_phase")
            .in("event_id", eventIds)
            .is("deleted_at", null),
          context.supabase.from("event_wbs_nodes").select("id, event_id, code, title").in("event_id", eventIds).is("deleted_at", null),
          context.supabase
            .from("event_readiness_items")
            .select("event_id, code, title, phase_code, is_complete, is_required")
            .in("event_id", eventIds),
          context.supabase
            .from("event_issues")
            .select("event_id, title, severity, status, is_snag, is_safety, due_date, owner_staff_id")
            .in("event_id", eventIds)
            .is("deleted_at", null),
          context.supabase.from("event_risks").select("event_id, title, severity, status, due_date").in("event_id", eventIds),
          context.supabase
            .from("purchase_requisitions")
            .select("event_id, pr_number, status, total_amount, required_by, priority")
            .in("event_id", eventIds),
          context.supabase
            .from("purchase_orders")
            .select("event_id, po_number, vendor_name, amount, status")
            .in("event_id", eventIds)
            .is("deleted_at", null),
          context.supabase
            .from("event_payables")
            .select("event_id, kind, title, reference, vendor_name, amount, status, due_date")
            .in("event_id", eventIds)
            .is("deleted_at", null),
          context.supabase
            .from("event_asset_movements")
            .select("event_id, item_name, qty, status, due_date")
            .in("event_id", eventIds)
            .is("deleted_at", null),
          context.supabase.from("event_budget_lines").select("event_id, original_amount, approved_changes, revised_amount, committed_amount, actual_amount, forecast_amount").in("event_id", eventIds),
          context.supabase.from("event_budgets").select("event_id, contract_value, additional_revenue, approved_change_orders, discounts, taxes").in("event_id", eventIds),
          context.supabase.from("event_client_invoices").select("event_id, status, base_amount, paid_amount").in("event_id", eventIds),
        ]).then(([tasks, wbs, ready, issues, risks, prs, pos, payables, assets, lines, budgets, invoices]) => ({
          tasks: (tasks.data ?? []) as Array<Record<string, unknown>>,
          wbs: (wbs.data ?? []) as Array<Record<string, unknown>>,
          ready: (ready.data ?? []) as Array<Record<string, unknown>>,
          issues: (issues.data ?? []) as Array<Record<string, unknown>>,
          risks: (risks.data ?? []) as Array<Record<string, unknown>>,
          prs: (prs.data ?? []) as Array<Record<string, unknown>>,
          pos: (pos.data ?? []) as Array<Record<string, unknown>>,
          payables: (payables.data ?? []) as Array<Record<string, unknown>>,
          assets: (assets.data ?? []) as Array<Record<string, unknown>>,
          lines: (lines.data ?? []) as Array<Record<string, unknown>>,
          budgets: (budgets.data ?? []) as Array<Record<string, unknown>>,
          invoices: (invoices.data ?? []) as Array<Record<string, unknown>>,
        }))
      : emptyKids;

    const ownerIds = [
      ...new Set(
        [...kids.tasks, ...kids.issues]
          .map((r) => r.owner_staff_id)
          .filter(Boolean) as string[],
      ),
    ];
    const { data: owners } = ownerIds.length
      ? await context.supabase.from("staff").select("id, full_name").in("id", ownerIds)
      : { data: [] };
    const ownerMap = new Map((owners ?? []).map((s) => [s.id, s.full_name]));
    const wbsById = new Map(kids.wbs.map((n) => [n.id as string, n]));
    const budgetByEvent = new Map(kids.budgets.map((b) => [b.event_id as string, b]));

    const facts: ReportEventFact[] = raw.map((row) => {
      const stage = row.stage_id ? stageMap.get(row.stage_id as string) ?? null : null;
      const evTasks = kids.tasks.filter((t) => t.event_id === row.id);
      const evLines = kids.lines.filter((l) => l.event_id === row.id);
      const evInvoices = kids.invoices.filter((i) => i.event_id === row.id);
      const header = budgetByEvent.get(row.id as string) ?? null;
      const finance = evLines.length
        ? toFinanceStrip(
            evLines as LineAmounts[],
            revenueFromHeader(header, (row.contracted_value as number | null) ?? null),
            evInvoices as Array<{ status: string; base_amount?: number; paid_amount?: number }>,
            0,
          )
        : null;
      return {
        id: row.id as string,
        event_number: (row.event_number as string | null) ?? null,
        name: row.name as string,
        client_name: (row.client_name as string | null) ?? null,
        venue_name: (row.venue_name as string | null) ?? null,
        status: row.status as string,
        stage_code: stage?.code ?? null,
        stage_label: stage?.label_en ?? null,
        pm_staff_id: (row.pm_staff_id as string | null) ?? null,
        pm_name: row.pm_staff_id ? (staffMap.get(row.pm_staff_id as string) ?? null) : null,
        event_start: (row.event_start as string | null) ?? null,
        event_end: (row.event_end as string | null) ?? null,
        health_rag: (row.health_rag as string) ?? "amber",
        readiness_pct: num(row.readiness_pct),
        go_live_approved: Boolean(row.go_live_approved),
        contracted_value: (row.contracted_value as number | null) ?? null,
        lessons_learned: (row.lessons_learned as string | null) ?? null,
        overall_progress: overallTaskProgress(
          evTasks.map((t) => ({ status: String(t.status), percent_complete: num(t.percent_complete) })),
        ),
        finance,
      };
    });

    const reports = assembleEventReports({
      events: facts,
      tasks: kids.tasks.map((t) => {
        const node = t.wbs_id ? wbsById.get(t.wbs_id as string) : null;
        return {
          event_id: t.event_id as string,
          title: t.title as string,
          status: String(t.status),
          priority: String(t.priority ?? "normal"),
          due_date: (t.due_date as string | null) ?? null,
          percent_complete: num(t.percent_complete),
          is_critical: Boolean(t.is_critical),
          is_snag: Boolean(t.is_snag),
          owner_name: t.owner_staff_id ? (ownerMap.get(t.owner_staff_id as string) ?? null) : null,
          workstream_code: (node?.code as string | null) ?? null,
          workstream_title: (node?.title as string | null) ?? null,
          lifecycle_phase: (t.lifecycle_phase as string | null) ?? null,
        };
      }),
      readiness: kids.ready.map((r) => ({
        event_id: r.event_id as string,
        code: r.code as string,
        title: r.title as string,
        phase_code: (r.phase_code as string | null) ?? null,
        is_complete: Boolean(r.is_complete),
        is_required: Boolean(r.is_required),
      })),
      issues: kids.issues.map((i) => ({
        event_id: i.event_id as string,
        title: i.title as string,
        severity: String(i.severity),
        status: String(i.status),
        is_snag: Boolean(i.is_snag),
        is_safety: Boolean(i.is_safety),
        due_date: (i.due_date as string | null) ?? null,
        owner_name: i.owner_staff_id ? (ownerMap.get(i.owner_staff_id as string) ?? null) : null,
      })),
      risks: kids.risks.map((r) => ({
        event_id: r.event_id as string,
        title: r.title as string,
        severity: String(r.severity),
        status: String(r.status),
        due_date: (r.due_date as string | null) ?? null,
      })),
      prs: kids.prs.map((p) => ({
        event_id: p.event_id as string,
        pr_number: (p.pr_number as string | null) ?? null,
        status: String(p.status),
        total_amount: num(p.total_amount),
        required_by: (p.required_by as string | null) ?? null,
        priority: (p.priority as string | null) ?? null,
      })),
      pos: kids.pos.map((p) => ({
        event_id: p.event_id as string,
        po_number: (p.po_number as string | null) ?? null,
        vendor_name: (p.vendor_name as string | null) ?? null,
        amount: num(p.amount),
        status: String(p.status),
      })),
      payables: kids.payables.map((p) => ({
        event_id: p.event_id as string,
        kind: String(p.kind),
        title: p.title as string,
        reference: (p.reference as string | null) ?? null,
        vendor_name: (p.vendor_name as string | null) ?? null,
        amount: num(p.amount),
        status: String(p.status),
        due_date: (p.due_date as string | null) ?? null,
      })),
      assets: kids.assets.map((a) => ({
        event_id: a.event_id as string,
        item_name: a.item_name as string,
        qty: num(a.qty),
        status: String(a.status),
        due_date: (a.due_date as string | null) ?? null,
      })),
      canFinance,
      today: todayIso(),
    });

    const pms = [...new Map(facts.filter((e) => e.pm_staff_id).map((e) => [e.pm_staff_id!, { id: e.pm_staff_id!, name: e.pm_name ?? "—" }])).values()];

    return {
      canFinance,
      events: facts.map((e) => ({
        id: e.id,
        event_number: e.event_number,
        name: e.name,
        pm_staff_id: e.pm_staff_id,
        pm_name: e.pm_name,
      })),
      pms,
      reports,
    };
  },
  { defaultInput: {}, auth: { capability: "events.view" } },
);

