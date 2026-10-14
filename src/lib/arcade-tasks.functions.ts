"use server";

import { z } from "zod";

import { canActorPerform, isArcadeSupervisor } from "@/lib/arcade/access";
import { weekBounds, workPriority } from "@/lib/arcade/domain";
import {
  applyTaskSignoff,
  applyTaskStatus,
  boardPriorityFromWork,
  dependencyIssue,
  kindForSource,
  TASK_EVIDENCE_MIN,
  TASK_KINDS,
  TASK_PRIORITIES,
  TASK_SOURCE_TYPES,
  TASK_SPANS,
  TASK_STATUSES,
  type BoardTask,
  type TaskPriority,
  type TaskRuleCode,
  type TaskSourceType,
  type TaskStatus,
  type TaskVerification,
} from "@/lib/arcade/task-board";
import { assertArcadeLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

const RULE_MESSAGE: Record<TaskRuleCode, string> = {
  blocked: "Finish the earlier task before moving this one.",
  cycle: "These tasks depend on each other.",
  missing: "The earlier task is not on the board.",
  evidence: "Add completion evidence before marking this done.",
  approved: "A supervisor already signed this off.",
  own_task: "A supervisor signs off someone else's task.",
  not_done: "Finish the task before asking for sign-off.",
  not_supervisor: "Only a supervisor can sign this off.",
};

type TaskRow = {
  id: string;
  location_id: string | null;
  technician_staff_id: string | null;
  machine_id: string | null;
  title: string;
  kind: BoardTask["kind"];
  span: BoardTask["span"];
  due_on: string;
  priority: TaskPriority;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  status: TaskStatus;
  depends_on_id: string | null;
  source_type: TaskSourceType | null;
  source_id: string | null;
  evidence: string | null;
  verification: TaskVerification;
  verified_by_staff_id: string | null;
  verified_at: string | null;
  verification_note: string | null;
  notes: string | null;
};

export type TaskCard = BoardTask & {
  locationId: string | null;
  machineId: string | null;
  machineLabel: string | null;
  notes: string | null;
  verificationNote: string | null;
};

export type TaskSourceCard = {
  sourceType: TaskSourceType;
  sourceId: string;
  title: string;
  dueOn: string;
  locationId: string | null;
  machineId: string | null;
  machineLabel: string | null;
  technicianStaffId: string | null;
  priority: TaskPriority;
  kind: BoardTask["kind"];
};

function fail(code: TaskRuleCode): never {
  throw new Error(RULE_MESSAGE[code]);
}

function toBoardTask(row: TaskRow): BoardTask {
  return {
    id: row.id,
    technicianStaffId: row.technician_staff_id,
    title: row.title,
    kind: row.kind,
    span: row.span,
    dueOn: row.due_on,
    priority: row.priority,
    estimatedMinutes: row.estimated_minutes,
    actualMinutes: row.actual_minutes,
    status: row.status,
    dependsOnId: row.depends_on_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    evidence: row.evidence,
    verification: row.verification,
  };
}

async function staffIdForUser(context: AuthContext) {
  const { data } = await context.supabase.from("staff").select("id").eq("user_id", context.userId).limit(1).maybeSingle();
  return data?.id ?? null;
}

function canVerify(context: AuthContext) {
  return canActorPerform(context.roles ?? [], "arcade.assign", context.access) || isArcadeSupervisor(context.access?.jobTitle, context.access?.staffRole);
}

function canAssignOthers(context: AuthContext) {
  return canVerify(context);
}

async function machineLabels(context: AuthContext, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const labels = new Map<string, string>();
  if (unique.length === 0) return labels;
  const { data, error } = await context.supabase.from("arcade_machines").select("id, name, asset_code").in("id", unique);
  if (error) throw error;
  for (const row of data ?? []) labels.set(row.id, `${row.asset_code} · ${row.name}`);
  return labels;
}

async function dependencyMap(context: AuthContext, dependsOnId: string | null) {
  const map = new Map<string, BoardTask>();
  let cursor = dependsOnId;
  for (let guard = 0; guard < 30 && cursor; guard += 1) {
    if (map.has(cursor)) {
      cursor = map.get(cursor)?.dependsOnId ?? null;
      continue;
    }
    const { data, error } = await context.supabase.from("arcade_tasks").select("*").eq("id", cursor).maybeSingle();
    if (error) throw error;
    if (!data) break;
    const task = toBoardTask(data as TaskRow);
    map.set(task.id, task);
    cursor = task.dependsOnId;
  }
  return map;
}

async function loadTask(context: AuthContext, id: string) {
  const { data, error } = await context.supabase.from("arcade_tasks").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("That task is not on the board.");
  return data as TaskRow;
}

const taskFields = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(200),
  kind: z.enum(TASK_KINDS),
  span: z.enum(TASK_SPANS),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  estimatedMinutes: z.number().int().min(0).max(10080).nullable().optional(),
  technicianStaffId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  machineId: z.string().uuid().nullable().optional(),
  dependsOnId: z.string().uuid().nullable().optional(),
  sourceType: z.enum(TASK_SOURCE_TYPES).nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const listTaskBoard = createAuthenticatedAction(
  z.object({
    anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).default({}),
  async (data, context) => {
    const today = new Date().toISOString().slice(0, 10);
    const anchor = data.anchor ?? today;
    const bounds = weekBounds(anchor);
    const staffId = await staffIdForUser(context);
    const [tasksResult, faultsResult, pmResult, observationResult] = await Promise.all([
      context.supabase
        .from("arcade_tasks")
        .select("*")
        .lte("due_on", bounds.end)
        .or(`due_on.gte.${bounds.start},status.neq.DONE`)
        .order("due_on")
        .limit(300),
      context.supabase
        .from("arcade_faults")
        .select("id, ticket_number, description, machine_id, location_id, technician_staff_id, severity, operational_impact, status, is_repeat, reported_at")
        .not("status", "in", "(RESOLVED,CLOSED)")
        .order("reported_at", { ascending: false })
        .limit(80),
      context.supabase
        .from("arcade_pm_schedules")
        .select("id, machine_id, location_id, next_due_on, cadence")
        .eq("active", true)
        .gte("next_due_on", bounds.start)
        .lte("next_due_on", bounds.end)
        .order("next_due_on")
        .limit(40),
      context.supabase
        .from("arcade_observations")
        .select("id, machine_id, location_id, technician_staff_id, status, started_at")
        .neq("status", "PASSED")
        .order("started_at", { ascending: false })
        .limit(40),
    ]);
    if (tasksResult.error) throw tasksResult.error;
    if (faultsResult.error) throw faultsResult.error;
    if (pmResult.error) throw pmResult.error;
    if (observationResult.error) throw observationResult.error;

    const taskRows = (tasksResult.data ?? []) as TaskRow[];
    const linked = new Set(
      taskRows
        .filter((row) => row.source_type && row.source_id)
        .map((row) => `${row.source_type}:${row.source_id}:${row.due_on}`),
    );
    const sources: Omit<TaskSourceCard, "machineLabel">[] = [];
    for (const fault of faultsResult.data ?? []) {
      const dueOn = fault.reported_at.slice(0, 10) < bounds.start ? today : fault.reported_at.slice(0, 10);
      if (linked.has(`fault:${fault.id}:${dueOn}`)) continue;
      sources.push({
        sourceType: "fault",
        sourceId: fault.id,
        title: `${fault.ticket_number ?? "Fault"} · ${fault.description.slice(0, 80)}`,
        dueOn,
        locationId: fault.location_id,
        machineId: fault.machine_id,
        technicianStaffId: fault.technician_staff_id,
        priority: boardPriorityFromWork(workPriority({
          severity: fault.severity,
          impact: fault.operational_impact,
          waitingPart: fault.status === "WAITING_PART",
          isRepeat: fault.is_repeat,
        })),
        kind: kindForSource("fault"),
      });
    }
    for (const row of pmResult.data ?? []) {
      const dueOn = row.next_due_on ?? today;
      if (linked.has(`pm_schedule:${row.id}:${dueOn}`)) continue;
      sources.push({
        sourceType: "pm_schedule",
        sourceId: row.id,
        title: `PM ${row.cadence.toLowerCase()}`,
        dueOn,
        locationId: row.location_id,
        machineId: row.machine_id,
        technicianStaffId: null,
        priority: boardPriorityFromWork(workPriority({ pmOverdue: dueOn < today })),
        kind: kindForSource("pm_schedule"),
      });
    }
    for (const row of observationResult.data ?? []) {
      const started = row.started_at.slice(0, 10);
      const dueOn = started < bounds.start ? today : started;
      if (linked.has(`observation:${row.id}:${dueOn}`)) continue;
      sources.push({
        sourceType: "observation",
        sourceId: row.id,
        title: "Inspection",
        dueOn,
        locationId: row.location_id,
        machineId: row.machine_id,
        technicianStaffId: row.technician_staff_id,
        priority: "normal",
        kind: kindForSource("observation"),
      });
    }

    const labels = await machineLabels(context, [
      ...taskRows.map((row) => row.machine_id ?? ""),
      ...sources.map((row) => row.machineId ?? ""),
    ]);
    const tasks: TaskCard[] = taskRows.map((row) => ({
      ...toBoardTask(row),
      locationId: row.location_id,
      machineId: row.machine_id,
      machineLabel: row.machine_id ? labels.get(row.machine_id) ?? null : null,
      notes: row.notes,
      verificationNote: row.verification_note,
    }));
    return {
      bounds,
      today,
      staffId,
      canAssign: canAssignOthers(context),
      canVerify: canVerify(context),
      tasks,
      sources: sources.map((row) => ({
        ...row,
        machineLabel: row.machineId ? labels.get(row.machineId) ?? null : null,
      })),
    };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const saveTaskBoard = createAuthenticatedAction(
  taskFields,
  async (data, context) => {
    const me = await staffIdForUser(context);
    const assignee = data.technicianStaffId ?? me;
    if (assignee && assignee !== me && !canAssignOthers(context)) {
      throw new Error("Only a supervisor can assign another technician.");
    }
    if (data.locationId) await assertArcadeLocationAccess(context, data.locationId);
    let id = data.id ?? null;
    if (!id && data.sourceType && data.sourceId) {
      const existing = await context.supabase
        .from("arcade_tasks")
        .select("id")
        .eq("source_type", data.sourceType)
        .eq("source_id", data.sourceId)
        .eq("due_on", data.dueOn)
        .maybeSingle();
      if (existing.error) throw existing.error;
      id = existing.data?.id ?? null;
    }
    const current = id ? await loadTask(context, id) : null;
    if (current?.verification === "APPROVED" && !canVerify(context)) {
      throw new Error(RULE_MESSAGE.approved);
    }
    const taskId = id ?? "new";
    const chain = await dependencyMap(context, data.dependsOnId ?? null);
    const issue = dependencyIssue(taskId, data.dependsOnId ?? null, chain);
    if (issue) fail(issue);
    const payload = {
      title: data.title,
      kind: data.kind,
      span: data.span,
      due_on: data.dueOn,
      priority: data.priority,
      estimated_minutes: data.estimatedMinutes ?? null,
      technician_staff_id: assignee,
      location_id: data.locationId ?? null,
      machine_id: data.machineId ?? null,
      depends_on_id: data.dependsOnId ?? null,
      source_type: data.sourceType ?? null,
      source_id: data.sourceId ?? null,
      notes: data.notes ?? null,
      updated_by: context.userId,
    };
    const query = id
      ? context.supabase.from("arcade_tasks").update(payload).eq("id", id)
      : context.supabase.from("arcade_tasks").insert({ ...payload, status: "TODO", verification: "NONE", created_by: context.userId });
    const { data: row, error } = await query.select("id, status, verification").single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "arcade.operate" } },
);

export const moveTaskBoard = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    status: z.enum(TASK_STATUSES),
    evidence: z.string().trim().max(2000).optional().nullable(),
    actualMinutes: z.number().int().min(0).max(10080).nullable().optional(),
  }),
  async (data, context) => {
    const row = await loadTask(context, data.id);
    const me = await staffIdForUser(context);
    if (row.technician_staff_id && row.technician_staff_id !== me && !canAssignOthers(context)) {
      throw new Error("Only a supervisor can move another technician's task.");
    }
    const chain = await dependencyMap(context, row.depends_on_id);
    chain.set(row.id, toBoardTask(row));
    const evidence = data.status === "DONE" ? (data.evidence ?? row.evidence ?? "") : (data.evidence ?? null);
    if (data.status === "DONE" && (evidence ?? "").trim().length < TASK_EVIDENCE_MIN) fail("evidence");
    const next = applyTaskStatus(toBoardTask(row), data.status, chain, evidence);
    if (!next.ok) fail(next.code);
    const { data: saved, error } = await context.supabase
      .from("arcade_tasks")
      .update({
        status: next.task.status,
        verification: next.task.verification,
        evidence: next.task.evidence,
        actual_minutes: data.actualMinutes === undefined ? row.actual_minutes : data.actualMinutes,
        updated_by: context.userId,
      })
      .eq("id", row.id)
      .select("id, status, verification")
      .single();
    if (error) throw error;
    return saved;
  },
  { auth: { capability: "arcade.operate" } },
);

export const signOffTaskBoard = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    decision: z.enum(["APPROVED", "RETURNED"]),
    note: z.string().trim().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    const row = await loadTask(context, data.id);
    const me = await staffIdForUser(context);
    const next = applyTaskSignoff(toBoardTask(row), data.decision, { staffId: me, canVerify: canVerify(context) });
    if (!next.ok) fail(next.code);
    const { data: saved, error } = await context.supabase
      .from("arcade_tasks")
      .update({
        status: next.task.status,
        verification: next.task.verification,
        verified_by_staff_id: me,
        verified_at: new Date().toISOString(),
        verification_note: data.note ?? null,
        updated_by: context.userId,
      })
      .eq("id", row.id)
      .select("id, status, verification")
      .single();
    if (error) throw error;
    return saved;
  },
  { auth: { capability: "arcade.operate" } },
);
