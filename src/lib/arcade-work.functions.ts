"use server";

import { z } from "zod";

import {
  DAILY_CHECK_LABEL,
  DEFAULT_PM_CHECKLIST,
  compareWorkPriority,
  detectRepeatFault,
  downtimeHoursInWindow,
  faultsFromPmChecklist,
  fixSummaryFromFault,
  formatWorkingDuration,
  gameElements,
  machineFixUpdate,
  machineStatusForFault,
  monthComparison,
  monthWindows,
  visibleArcadeList,
  nextMachineStatus,
  nextPmDate,
  repairPhase,
  repairWorkingMs,
  simpleClosureFromNote,
  transitionFault,
  weekBounds,
  workPriority,
  type FaultStatus,
  type MachineStatus,
  type PmCadence,
  type RepairSpan,
} from "@/lib/arcade/domain";
import { canActorPerform, isArcadeSupervisor } from "@/lib/arcade/access";
import { readArcadeListHides } from "@/lib/arcade/list-membership";
import { FaultInput, FaultStatusInput, PageQuery, PmCompleteInput } from "@/lib/arcade/schemas";
import { assertArcadeLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

function range(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

async function openFaultCount(context: AuthContext, machineId: string, exceptId?: string) {
  let query = context.supabase
    .from("arcade_faults")
    .select("id", { count: "exact", head: true })
    .eq("machine_id", machineId)
    .not("status", "in", "(RESOLVED,CLOSED)");
  if (exceptId) query = query.neq("id", exceptId);
  const { count } = await query;
  return count ?? 0;
}

async function applyMachineStatus(
  context: AuthContext,
  machineId: string,
  proposed: MachineStatus | null,
  exceptFaultId?: string,
) {
  const { data: machine, error } = await context.supabase
    .from("arcade_machines")
    .select("id, status")
    .eq("id", machineId)
    .single();
  if (error) throw error;
  const next = nextMachineStatus({
    proposed,
    current: machine.status as MachineStatus,
    openFaultCountExcludingCurrent: await openFaultCount(context, machineId, exceptFaultId),
  });
  if (next !== machine.status) {
    const { error: updateError } = await context.supabase
      .from("arcade_machines")
      .update({ status: next, updated_by: context.userId })
      .eq("id", machineId);
    if (updateError) throw updateError;
  }
  return next;
}

async function stampMachineFix(
  context: AuthContext,
  machineId: string,
  input: {
    at: string;
    summary?: string | null;
    status: string;
    technicianStaffId?: string | null;
    fallback?: string | null;
  },
) {
  const summary = fixSummaryFromFault({
    note: input.summary,
    description: input.fallback,
  });
  const stamp = machineFixUpdate({
    at: input.at,
    summary,
    status: input.status,
    technicianStaffId: input.technicianStaffId,
  });
  const patch: {
    last_fix_at: string;
    last_fix_summary: string;
    last_fix_status: string;
    updated_by: string;
    last_fix_technician_staff_id?: string;
    last_repair_at?: string;
  } = {
    last_fix_at: stamp.lastFixAt,
    last_fix_summary: stamp.lastFixSummary,
    last_fix_status: stamp.lastFixStatus,
    updated_by: context.userId,
  };
  if (stamp.lastFixTechnicianStaffId) patch.last_fix_technician_staff_id = stamp.lastFixTechnicianStaffId;
  if (stamp.lastRepairAt) patch.last_repair_at = stamp.lastRepairAt;
  const { error } = await context.supabase.from("arcade_machines").update(patch).eq("id", machineId);
  if (error) throw error;
}

export const listArcadeFaults = createAuthenticatedAction(
  PageQuery,
  async (data, context) => {
    let query = context.supabase
      .from("arcade_faults")
      .select("id, ticket_number, location_id, machine_id, status, severity, category, operational_impact, reported_at, is_repeat, repeat_count, last_failure_at, days_since_last_repair, technician_staff_id, description", { count: "exact" })
      .order("reported_at", { ascending: false });
    if (data.locationId) query = query.eq("location_id", data.locationId);
    if (data.machineId) query = query.eq("machine_id", data.machineId);
    if (data.status) query = query.eq("status", data.status);
    if (data.q && data.q.trim().length >= 2) {
      const token = data.q.trim().replace(/[%_,]/g, "");
      query = query.or(`ticket_number.ilike.%${token}%,description.ilike.%${token}%,category.ilike.%${token}%`);
    }
    const { from, to } = range(data.page, data.pageSize);
    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw error;
    const list = rows ?? [];
    const machineIds = [...new Set(list.map((row) => row.machine_id))];
    const { data: machines } = machineIds.length
      ? await context.supabase.from("arcade_machines").select("id, name, asset_code").in("id", machineIds)
      : { data: [] };
    const names = new Map((machines ?? []).map((machine) => [machine.id, machine]));
    return {
      rows: list.map((row) => ({
        ...row,
        machine_name: names.get(row.machine_id)?.name ?? null,
        asset_code: names.get(row.machine_id)?.asset_code ?? null,
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const getArcadeFault = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: fault, error } = await context.supabase.from("arcade_faults").select("*").eq("id", data.id).single();
    if (error) throw error;
    await assertArcadeLocationAccess(context, fault.location_id);
    const [updates, repairs, usages] = await Promise.all([
      context.supabase.from("arcade_fault_updates").select("*").eq("fault_id", data.id).order("created_at"),
      context.supabase.from("arcade_repairs").select("*").eq("fault_id", data.id).order("started_at"),
      context.supabase.from("arcade_part_usages").select("*").eq("fault_id", data.id).order("used_on"),
    ]);
    return { fault, updates: updates.data ?? [], repairs: repairs.data ?? [], usages: usages.data ?? [] };
  },
  { auth: { capability: "arcade.view" } },
);

export const reportArcadeFault = createAuthenticatedAction(
  FaultInput,
  async (data, context) => {
    await assertArcadeLocationAccess(context, data.locationId);
    const reportedAt = data.reportedAt ?? new Date().toISOString();
    const since = new Date(new Date(reportedAt).getTime() - 90 * 86400000).toISOString();
    const { data: history, error: historyError } = await context.supabase
      .from("arcade_faults")
      .select("id, category, reported_at, resolved_at")
      .eq("machine_id", data.machineId)
      .gte("reported_at", since)
      .limit(50);
    if (historyError) throw historyError;
    const repeat = detectRepeatFault(
      (history ?? []).map((row) => ({
        id: row.id,
        category: row.category,
        reportedAt: row.reported_at,
        resolvedAt: row.resolved_at,
      })),
      data.category,
      reportedAt,
    );
    const down = data.operationalImpact === "OUT_OF_SERVICE" || data.machineStatus === "DOWN";
    const { data: row, error } = await context.supabase
      .from("arcade_faults")
      .insert({
        location_id: data.locationId,
        machine_id: data.machineId,
        unit_number: data.unitNumber ?? null,
        reported_at: reportedAt,
        reported_by_staff_id: data.reportedByStaffId ?? null,
        technician_staff_id: data.technicianStaffId ?? null,
        category: data.category,
        description: data.description,
        severity: data.severity,
        operational_impact: data.operationalImpact,
        status: "REPORTED",
        is_repeat: repeat.isRepeat,
        repeat_count: repeat.repeatCount,
        prior_fault_id: repeat.priorFaultId,
        last_failure_at: repeat.lastFailureAt,
        days_since_last_repair: repeat.daysSinceLastRepair,
        downtime_started_at: down ? reportedAt : null,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, ticket_number, is_repeat, repeat_count")
      .single();
    if (error) throw error;
    await context.supabase.from("arcade_fault_updates").insert({
      fault_id: row.id,
      location_id: data.locationId,
      kind: "note",
      body: data.description,
      new_status: "REPORTED",
      created_by: context.userId,
    });
    const proposed = data.machineStatus ?? machineStatusForFault("REPORTED", data.operationalImpact);
    await applyMachineStatus(context, data.machineId, proposed, row.id);
    await context.supabase.from("arcade_machines").update({ last_fault_at: reportedAt, updated_by: context.userId }).eq("id", data.machineId);
    await stampMachineFix(context, data.machineId, {
      at: reportedAt,
      summary: data.description,
      status: "REPORTED",
      technicianStaffId: data.technicianStaffId,
    });
    return row;
  },
  { auth: { capability: "arcade.operate" } },
);

export const updateArcadeFault = createAuthenticatedAction(
  FaultStatusInput,
  async (data, context) => {
    const { data: existing, error } = await context.supabase.from("arcade_faults").select("*").eq("id", data.id).single();
    if (error) throw error;
    await assertArcadeLocationAccess(context, existing.location_id);
    if (data.status === "CLOSED" && !canActorPerform(context.roles ?? [], "arcade.close", context.access)) {
      throw new Error("Closing a ticket requires Head of Operations approval");
    }
    const closure = {
      problem: data.problem ?? existing.problem,
      diagnosis: data.diagnosis ?? existing.diagnosis,
      actionTaken: data.actionTaken ?? existing.action_taken,
      partsUsed: data.partsUsed ?? existing.parts_used,
      testingPerformed: data.testingPerformed ?? existing.testing_performed,
      finalResult: data.finalResult ?? existing.final_result,
      recommendations: data.recommendations ?? existing.recommendations,
    };
    let machineId = data.machineId ?? existing.machine_id;
    let locationId = data.locationId ?? existing.location_id;
    if (data.machineId && data.machineId !== existing.machine_id) {
      const { data: machine, error: machineError } = await context.supabase
        .from("arcade_machines")
        .select("id, location_id")
        .eq("id", data.machineId)
        .single();
      if (machineError) throw machineError;
      if (data.locationId && data.locationId !== machine.location_id) {
        throw new Error("That machine is not at the selected site");
      }
      machineId = machine.id;
      locationId = machine.location_id;
    }
    if (locationId !== existing.location_id) await assertArcadeLocationAccess(context, locationId);
    const statusChanged = data.status !== existing.status;
    if (statusChanged) {
      const errors = transitionFault(existing.status as FaultStatus, data.status, closure);
      if (errors.length) throw new Error(errors[0]);
    }
    const description = data.description?.trim() || existing.description;
    const { error: updateError } = await context.supabase
      .from("arcade_faults")
      .update({
        status: data.status,
        description,
        location_id: locationId,
        machine_id: machineId,
        reported_at: data.reportedAt ?? existing.reported_at,
        problem: closure.problem,
        diagnosis: closure.diagnosis,
        action_taken: closure.actionTaken,
        parts_used: closure.partsUsed,
        testing_performed: closure.testingPerformed,
        final_result: closure.finalResult,
        recommendations: closure.recommendations,
        updated_by: context.userId,
      })
      .eq("id", data.id);
    if (updateError) throw updateError;
    if (data.note?.trim()) {
      await context.supabase.from("arcade_fault_updates").insert({
        fault_id: data.id,
        location_id: locationId,
        kind: "note",
        body: data.note.trim(),
        created_by: context.userId,
      });
    }
    if (statusChanged && data.status === "UNDER_REPAIR") {
      await context.supabase.from("arcade_repairs").insert({
        fault_id: data.id,
        machine_id: machineId,
        location_id: locationId,
        technician_staff_id: existing.technician_staff_id,
        status: "IN_PROGRESS",
        created_by: context.userId,
      });
    }
    if (statusChanged && data.status === "UNDER_OBSERVATION") {
      await context.supabase.from("arcade_observations").insert({
        machine_id: machineId,
        fault_id: data.id,
        location_id: locationId,
        technician_staff_id: existing.technician_staff_id,
        status: "OPEN",
        created_by: context.userId,
      });
    }
    const proposed = machineStatusForFault(data.status, existing.operational_impact);
    const machineMoved = machineId !== existing.machine_id;
    if (statusChanged || machineMoved) {
      await applyMachineStatus(context, machineId, proposed, data.id);
      if (machineMoved) await applyMachineStatus(context, existing.machine_id, "WORKING", data.id);
    }
    if (statusChanged || machineMoved) {
      await stampMachineFix(context, machineId, {
        at: new Date().toISOString(),
        summary: fixSummaryFromFault({
          note: data.note,
          actionTaken: closure.actionTaken,
          finalResult: closure.finalResult,
          diagnosis: closure.diagnosis,
          description,
        }),
        status: data.status,
        technicianStaffId: existing.technician_staff_id,
      });
    }
    return { id: data.id, status: data.status };
  },
  { auth: { capability: "arcade.operate" } },
);

export const addArcadeFaultNote = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), body: z.string().trim().min(2).max(4000) }),
  async (data, context) => {
    const { data: fault, error } = await context.supabase.from("arcade_faults").select("location_id").eq("id", data.id).single();
    if (error) throw error;
    await assertArcadeLocationAccess(context, fault.location_id);
    const { error: insertError } = await context.supabase.from("arcade_fault_updates").insert({
      fault_id: data.id,
      location_id: fault.location_id,
      kind: "note",
      body: data.body,
      created_by: context.userId,
    });
    if (insertError) throw insertError;
    return { ok: true };
  },
  { auth: { capability: "arcade.operate" } },
);

function asSpans(rows: { status: string; started_at: string; paused_at: string | null; completed_at: string | null }[]): RepairSpan[] {
  return rows.map((row) => ({
    status: row.status,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    completedAt: row.completed_at,
  }));
}

async function loadRepairSpans(context: AuthContext, faultId: string) {
  const { data, error } = await context.supabase
    .from("arcade_repairs")
    .select("id, status, started_at, paused_at, completed_at")
    .eq("fault_id", faultId)
    .order("started_at");
  if (error) throw error;
  return data ?? [];
}

function clockFromRows(rows: { status: string; started_at: string; paused_at: string | null; completed_at: string | null }[], nowMs = Date.now()) {
  const spans = asSpans(rows);
  const workingMs = repairWorkingMs(spans, nowMs);
  return { phase: repairPhase(spans), workingMs, ...formatWorkingDuration(workingMs), asOf: new Date(nowMs).toISOString() };
}

export const setArcadeRepairState = createAuthenticatedAction(
  z.object({
    faultId: z.string().uuid(),
    action: z.enum(["START", "PAUSE", "COMPLETE"]),
    note: z.string().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    const { data: fault, error } = await context.supabase.from("arcade_faults").select("id, location_id, machine_id, technician_staff_id, status").eq("id", data.faultId).single();
    if (error) throw error;
    await assertArcadeLocationAccess(context, fault.location_id);
    const nowIso = new Date().toISOString();
    const open = await context.supabase
      .from("arcade_repairs")
      .select("id, status, paused_at")
      .eq("fault_id", fault.id)
      .neq("status", "COMPLETED")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open.error) throw open.error;
    const current = open.data;

    if (data.action === "START") {
      if (current?.status !== "IN_PROGRESS") {
        const { error: insertError } = await context.supabase.from("arcade_repairs").insert({
          fault_id: fault.id,
          machine_id: fault.machine_id,
          location_id: fault.location_id,
          technician_staff_id: fault.technician_staff_id,
          status: "IN_PROGRESS",
          notes: data.note ?? null,
          created_by: context.userId,
        });
        if (insertError) throw insertError;
      }
      if (fault.status === "REPORTED" || fault.status === "DIAGNOSING" || fault.status === "WAITING_PART" || fault.status === "WAITING_SUPPLIER") {
        await context.supabase.from("arcade_faults").update({ status: "UNDER_REPAIR", updated_by: context.userId }).eq("id", fault.id);
        await applyMachineStatus(context, fault.machine_id, "UNDER_REPAIR", fault.id);
      }
    } else if (!current) {
      throw new Error("Start the repair before you pause or finish it");
    } else if (data.action === "PAUSE") {
      if (current.status === "IN_PROGRESS") {
        await context.supabase
          .from("arcade_repairs")
          .update({ status: "PAUSED", paused_at: nowIso, notes: data.note ?? null })
          .eq("id", current.id);
      }
    } else if (current.status === "IN_PROGRESS") {
      await context.supabase
        .from("arcade_repairs")
        .update({ status: "COMPLETED", completed_at: nowIso, notes: data.note ?? null })
        .eq("id", current.id);
    } else {
      await context.supabase
        .from("arcade_repairs")
        .update({
          status: "COMPLETED",
          completed_at: current.paused_at ?? nowIso,
          notes: data.note ?? null,
        })
        .eq("id", current.id);
    }

    if (data.note?.trim()) {
      await context.supabase.from("arcade_fault_updates").insert({
        fault_id: fault.id,
        location_id: fault.location_id,
        kind: "note",
        body: data.note.trim(),
        created_by: context.userId,
      });
    }
    const repairStatus = data.action === "START" ? "IN_PROGRESS" : data.action === "PAUSE" ? "PAUSED" : "COMPLETED";
    await stampMachineFix(context, fault.machine_id, {
      at: nowIso,
      summary: data.note,
      fallback: data.action === "START" ? "Repair started" : data.action === "PAUSE" ? "Repair paused" : "Repair completed",
      status: repairStatus,
      technicianStaffId: fault.technician_staff_id,
    });
    const rows = await loadRepairSpans(context, fault.id);
    return { ok: true, faultId: fault.id, ...clockFromRows(rows) };
  },
  { auth: { capability: "arcade.operate" } },
);

export const listArcadeObservation = createAuthenticatedAction(
  PageQuery,
  async (data, context) => {
    let query = context.supabase
      .from("arcade_observations")
      .select("id, machine_id, fault_id, location_id, status, started_at, technician_staff_id", { count: "exact" })
      .in("status", ["OPEN", "ISSUE_FOUND"])
      .order("started_at");
    if (data.locationId) query = query.eq("location_id", data.locationId);
    const { from, to } = range(data.page, data.pageSize);
    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw error;
    const ids = (rows ?? []).map((row) => row.id);
    const { data: checks } = ids.length
      ? await context.supabase.from("arcade_observation_checks").select("observation_id, checked_on, result, notes").in("observation_id", ids).order("checked_on", { ascending: false })
      : { data: [] };
    return { rows: rows ?? [], checks: checks ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const recordObservationCheck = createAuthenticatedAction(
  z.object({
    observationId: z.string().uuid(),
    result: z.enum(["PASS", "ISSUE_FOUND"]),
    notes: z.string().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    const { data: observation, error } = await context.supabase.from("arcade_observations").select("id, location_id").eq("id", data.observationId).single();
    if (error) throw error;
    await assertArcadeLocationAccess(context, observation.location_id);
    const { error: insertError } = await context.supabase.from("arcade_observation_checks").insert({
      observation_id: data.observationId,
      location_id: observation.location_id,
      result: data.result,
      notes: data.notes ?? null,
      created_by: context.userId,
    });
    if (insertError) throw insertError;
    await context.supabase.from("arcade_observations").update({ status: data.result === "PASS" ? "PASSED" : "ISSUE_FOUND" }).eq("id", data.observationId);
    return { ok: true };
  },
  { auth: { capability: "arcade.operate" } },
);

export const finishObservation = createAuthenticatedAction(
  FaultStatusInput.extend({
    observationId: z.string().uuid(),
    decision: z.enum(["RETURN_WORKING", "REOPEN"]),
  }),
  async (data, context) => {
    const { data: observation, error } = await context.supabase.from("arcade_observations").select("*").eq("id", data.observationId).single();
    if (error) throw error;
    await assertArcadeLocationAccess(context, observation.location_id);
    if (data.decision === "REOPEN") {
      if (observation.fault_id) {
        await context.supabase.from("arcade_faults").update({ status: "UNDER_REPAIR", updated_by: context.userId }).eq("id", observation.fault_id);
      }
      await context.supabase.from("arcade_observations").update({ status: "REOPENED", closed_at: new Date().toISOString() }).eq("id", observation.id);
      await applyMachineStatus(context, observation.machine_id, "UNDER_REPAIR", observation.fault_id ?? undefined);
      await stampMachineFix(context, observation.machine_id, {
        at: new Date().toISOString(),
        fallback: "Returned to repair",
        status: "UNDER_REPAIR",
        technicianStaffId: observation.technician_staff_id,
      });
      return { status: "UNDER_REPAIR" as const };
    }
    if (!observation.fault_id) throw new Error("This observation is not linked to a fault");
    const errors = transitionFault("UNDER_OBSERVATION", "RESOLVED", {
      problem: data.problem,
      diagnosis: data.diagnosis,
      actionTaken: data.actionTaken,
      partsUsed: data.partsUsed,
      testingPerformed: data.testingPerformed,
      finalResult: data.finalResult,
      recommendations: data.recommendations,
    });
    if (errors.length) throw new Error(errors[0]);
    const { error: updateError } = await context.supabase.from("arcade_faults").update({
      status: "RESOLVED",
      problem: data.problem,
      diagnosis: data.diagnosis,
      action_taken: data.actionTaken,
      parts_used: data.partsUsed,
      testing_performed: data.testingPerformed,
      final_result: data.finalResult,
      recommendations: data.recommendations,
      updated_by: context.userId,
    }).eq("id", observation.fault_id);
    if (updateError) throw updateError;
    await context.supabase.from("arcade_observations").update({ status: "RETURNED", closed_at: new Date().toISOString() }).eq("id", observation.id);
    await applyMachineStatus(context, observation.machine_id, "WORKING", observation.fault_id);
    await stampMachineFix(context, observation.machine_id, {
      at: new Date().toISOString(),
      summary: fixSummaryFromFault({
        actionTaken: data.actionTaken,
        finalResult: data.finalResult,
        diagnosis: data.diagnosis,
        description: data.problem,
      }),
      status: "RESOLVED",
      technicianStaffId: observation.technician_staff_id,
    });
    return { status: "RESOLVED" as const };
  },
  { auth: { capability: "arcade.operate" } },
);

export const listPmSchedules = createAuthenticatedAction(
  PageQuery,
  async (data, context) => {
    let query = context.supabase.from("arcade_pm_schedules").select("*", { count: "exact" }).eq("active", true).order("next_due_on");
    if (data.locationId) query = query.eq("location_id", data.locationId);
    if (data.machineId) query = query.eq("machine_id", data.machineId);
    const { from, to } = range(data.page, data.pageSize);
    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw error;
    return { rows: rows ?? [], total: count ?? 0, checklist: DEFAULT_PM_CHECKLIST, page: data.page, pageSize: data.pageSize };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const savePmSchedule = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    machineId: z.string().uuid(),
    locationId: z.string().uuid(),
    cadence: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "CUSTOM"]),
    customIntervalDays: z.number().int().min(1).max(365).optional().nullable(),
    checklist: z.array(z.string().min(2).max(200)).min(1),
    nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  async (data, context) => {
    await assertArcadeLocationAccess(context, data.locationId);
    const payload = {
      machine_id: data.machineId,
      location_id: data.locationId,
      cadence: data.cadence,
      custom_interval_days: data.customIntervalDays ?? null,
      checklist: data.checklist,
      next_due_on: data.nextDueOn,
      active: true,
    };
    const query = data.id
      ? context.supabase.from("arcade_pm_schedules").update(payload).eq("id", data.id)
      : context.supabase.from("arcade_pm_schedules").insert({ ...payload, created_by: context.userId });
    const { data: row, error } = await query.select("id").single();
    if (error) throw error;
    await context.supabase.from("arcade_machines").update({ next_pm_on: data.nextDueOn }).eq("id", data.machineId);
    return row;
  },
  { auth: { anyCapability: ["arcade.manage", "arcade.assign"] } },
);

export const completePm = createAuthenticatedAction(
  PmCompleteInput,
  async (data, context) => {
    await assertArcadeLocationAccess(context, data.locationId);
    const fails = faultsFromPmChecklist(data.items.map((item) => ({ label: item.label, result: item.result, notes: item.notes })));
    let cadence: PmCadence = "MONTHLY";
    let custom: number | null = null;
    if (data.scheduleId) {
      const { data: schedule } = await context.supabase.from("arcade_pm_schedules").select("cadence, custom_interval_days").eq("id", data.scheduleId).maybeSingle();
      if (schedule) {
        cadence = schedule.cadence as PmCadence;
        custom = schedule.custom_interval_days;
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    const next = nextPmDate(cadence, today, custom);
    const { data: record, error } = await context.supabase
      .from("arcade_pm_records")
      .insert({
        schedule_id: data.scheduleId ?? null,
        machine_id: data.machineId,
        location_id: data.locationId,
        technician_staff_id: data.technicianStaffId ?? null,
        performed_on: today,
        started_at: data.startedAt ?? null,
        completed_at: new Date().toISOString(),
        notes: data.notes ?? null,
        issues_found: data.issuesFound ?? (fails.length ? fails.map((item) => item.description).join("\n") : null),
        confirmed: true,
        next_pm_on: next,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    const { error: resultError } = await context.supabase.from("arcade_pm_results").insert(
      data.items.map((item) => ({
        record_id: record.id,
        location_id: data.locationId,
        item_label: item.label,
        result: item.result,
        notes: item.notes ?? null,
      })),
    );
    if (resultError) throw resultError;
    await context.supabase.from("arcade_machines").update({ last_pm_on: today, next_pm_on: next, updated_by: context.userId }).eq("id", data.machineId);
    if (data.scheduleId) {
      await context.supabase.from("arcade_pm_schedules").update({ next_due_on: next }).eq("id", data.scheduleId);
    }
    const faultIds: string[] = [];
    for (const draft of fails) {
      const { data: fault, error: faultError } = await context.supabase
        .from("arcade_faults")
        .insert({
          location_id: data.locationId,
          machine_id: data.machineId,
          reported_at: new Date().toISOString(),
          technician_staff_id: data.technicianStaffId ?? null,
          category: draft.category,
          description: draft.description,
          severity: draft.severity,
          operational_impact: "PARTIALLY_OPERATIONAL",
          status: "REPORTED",
          pm_record_id: record.id,
          created_by: context.userId,
          updated_by: context.userId,
        })
        .select("id, ticket_number")
        .single();
      if (faultError) throw faultError;
      faultIds.push(fault.ticket_number ?? fault.id);
      await stampMachineFix(context, data.machineId, {
        at: new Date().toISOString(),
        summary: draft.description,
        status: "REPORTED",
        technicianStaffId: data.technicianStaffId,
      });
    }
    return { recordId: record.id, nextPmOn: next, faultTickets: faultIds, pmCompleted: true };
  },
  { auth: { capability: "arcade.operate" } },
);

export const getMyWeek = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid().optional().nullable(),
    anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).default({}),
  async (data, context) => {
    const { data: me } = await context.supabase.from("staff").select("id").eq("user_id", context.userId).limit(1).maybeSingle();
    const staffId = data.staffId && canActorPerform(context.roles ?? [], "arcade.assign", context.access) ? data.staffId : me?.id;
    const bounds = weekBounds(data.anchor ?? new Date().toISOString().slice(0, 10));
    const today = new Date().toISOString().slice(0, 10);
    if (!staffId) return { bounds, today, items: [], tasks: [] };
    const [faults, pm, installs, cases, tasks] = await Promise.all([
      context.supabase.from("arcade_faults").select("id, ticket_number, machine_id, location_id, status, severity, operational_impact, is_repeat, description, reported_at").eq("technician_staff_id", staffId).not("status", "in", "(RESOLVED,CLOSED)").limit(40),
      context.supabase.from("arcade_pm_schedules").select("id, machine_id, location_id, next_due_on, cadence").eq("active", true).gte("next_due_on", bounds.start).lte("next_due_on", bounds.end).limit(40),
      context.supabase.from("arcade_installations").select("id, machine_id, location_id, status, installed_on").eq("technician_staff_id", staffId).neq("status", "COMMISSIONED").limit(20),
      context.supabase.from("arcade_supplier_cases").select("id, case_number, machine_id, location_id, status, next_follow_up_on, problem").eq("technician_staff_id", staffId).not("status", "in", "(RESOLVED,CLOSED)").limit(20),
      context.supabase.from("arcade_week_tasks").select("*").eq("technician_staff_id", staffId).gte("task_date", bounds.start).lte("task_date", bounds.end).order("task_date"),
    ]);
    const items = [
      ...(faults.data ?? []).map((fault) => ({
        kind: "fault" as const,
        id: fault.id,
        title: `${fault.ticket_number ?? "Fault"} · ${fault.description.slice(0, 80)}`,
        date: fault.reported_at.slice(0, 10),
        locationId: fault.location_id,
        machineId: fault.machine_id,
        priority: workPriority({
          severity: fault.severity,
          impact: fault.operational_impact,
          waitingPart: fault.status === "WAITING_PART",
          isRepeat: fault.is_repeat,
        }),
        href: `/arcade/faults/${fault.id}`,
      })),
      ...(pm.data ?? []).map((row) => ({
        kind: "pm" as const,
        id: row.id,
        title: `PM ${row.cadence.toLowerCase()}`,
        date: row.next_due_on ?? today,
        locationId: row.location_id,
        machineId: row.machine_id,
        priority: workPriority({ pmOverdue: (row.next_due_on ?? today) < today }),
        href: "/arcade/pm",
      })),
      ...(installs.data ?? []).map((row) => ({
        kind: "installation" as const,
        id: row.id,
        title: `Installation ${row.status}`,
        date: row.installed_on ?? today,
        locationId: row.location_id,
        machineId: row.machine_id,
        priority: "normal" as const,
        href: "/arcade/installations",
      })),
      ...(cases.data ?? []).map((row) => ({
        kind: "supplier" as const,
        id: row.id,
        title: `${row.case_number ?? "Supplier"} · ${row.problem.slice(0, 80)}`,
        date: row.next_follow_up_on ?? today,
        locationId: row.location_id,
        machineId: row.machine_id,
        priority: "normal" as const,
        href: `/arcade/support/${row.id}`,
      })),
    ].sort((a, b) => compareWorkPriority(a.priority, b.priority));
    return { bounds, today, staffId, items, tasks: tasks.data ?? [] };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);

export const saveWeekTask = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    staffId: z.string().uuid(),
    locationId: z.string().uuid().optional().nullable(),
    machineId: z.string().uuid().optional().nullable(),
    taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kind: z.string().min(2).max(40),
    title: z.string().min(2).max(200),
    status: z.enum(["TODO", "STARTED", "PAUSED", "DONE"]).default("TODO"),
    priority: z.string().max(40).default("normal"),
    notes: z.string().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    const payload = {
      technician_staff_id: data.staffId,
      location_id: data.locationId ?? null,
      machine_id: data.machineId ?? null,
      task_date: data.taskDate,
      kind: data.kind,
      title: data.title,
      status: data.status,
      priority: data.priority,
      notes: data.notes ?? null,
      updated_by: context.userId,
    };
    const query = data.id
      ? context.supabase.from("arcade_week_tasks").update(payload).eq("id", data.id)
      : context.supabase.from("arcade_week_tasks").insert({ ...payload, created_by: context.userId });
    const { data: row, error } = await query.select("id, status").single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "arcade.operate" } },
);

const OPEN_FAULT = "(RESOLVED,CLOSED)";

export const getRepairJob = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    machineId: z.string().uuid(),
  }),
  async (data, context) => {
    await assertArcadeLocationAccess(context, data.locationId);
    const { data: machine, error } = await context.supabase
      .from("arcade_machines")
      .select("id, name, asset_code, location_id, status")
      .eq("id", data.machineId)
      .single();
    if (error) throw error;
    if (machine.location_id !== data.locationId) throw new Error("That game is not at this location");
    const open = await context.supabase
      .from("arcade_faults")
      .select("id, ticket_number, status, description, parts_used, resolved_at")
      .eq("machine_id", machine.id)
      .not("status", "in", OPEN_FAULT)
      .order("reported_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open.error) throw open.error;
    const today = new Date().toISOString().slice(0, 10);
    let fault = open.data;
    if (!fault) {
      const recent = await context.supabase
        .from("arcade_faults")
        .select("id, ticket_number, status, description, parts_used, resolved_at")
        .eq("machine_id", machine.id)
        .gte("resolved_at", `${today}T00:00:00.000Z`)
        .order("resolved_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recent.error) throw recent.error;
      fault = recent.data;
    }
    const rows = fault ? await loadRepairSpans(context, fault.id) : [];
    const clock = clockFromRows(rows);
    return { machine, fault: fault ?? null, ...clock, phase: open.data ? clock.phase : fault ? "FINISHED" as const : clock.phase };
  },
  { auth: { capability: "arcade.view" } },
);

export const startRepairJob = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    machineId: z.string().uuid(),
  }),
  async (data, context) => {
    await assertArcadeLocationAccess(context, data.locationId);
    const { data: machine, error } = await context.supabase
      .from("arcade_machines")
      .select("id, location_id, unit_number")
      .eq("id", data.machineId)
      .single();
    if (error) throw error;
    if (machine.location_id !== data.locationId) throw new Error("That game is not at this location");
    const staff = await staffForUser(context);
    let faultId: string;
    const existing = await context.supabase
      .from("arcade_faults")
      .select("id, status")
      .eq("machine_id", machine.id)
      .not("status", "in", OPEN_FAULT)
      .order("reported_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      faultId = existing.data.id;
    } else {
      const reportedAt = new Date().toISOString();
      const { data: created, error: insertError } = await context.supabase
        .from("arcade_faults")
        .insert({
          location_id: data.locationId,
          machine_id: machine.id,
          unit_number: machine.unit_number,
          reported_at: reportedAt,
          technician_staff_id: staff?.id ?? null,
          category: "Other",
          description: "Technician started a repair on this game.",
          severity: "MEDIUM",
          operational_impact: "PARTIALLY_OPERATIONAL",
          status: "REPORTED",
          created_by: context.userId,
          updated_by: context.userId,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      faultId = created.id;
      await context.supabase.from("arcade_machines").update({ last_fault_at: reportedAt, updated_by: context.userId }).eq("id", machine.id);
    }
    const running = await context.supabase
      .from("arcade_repairs")
      .select("id")
      .eq("fault_id", faultId)
      .eq("status", "IN_PROGRESS")
      .limit(1)
      .maybeSingle();
    if (!running.data) {
      const { error: repairError } = await context.supabase.from("arcade_repairs").insert({
        fault_id: faultId,
        machine_id: machine.id,
        location_id: data.locationId,
        technician_staff_id: staff?.id ?? null,
        status: "IN_PROGRESS",
        created_by: context.userId,
      });
      if (repairError) throw repairError;
    }
    await context.supabase.from("arcade_faults").update({ status: "UNDER_REPAIR", technician_staff_id: staff?.id ?? null, updated_by: context.userId }).eq("id", faultId).in("status", ["REPORTED", "DIAGNOSING", "WAITING_PART", "WAITING_SUPPLIER"]);
    await applyMachineStatus(context, machine.id, "UNDER_REPAIR", faultId);
    const rows = await loadRepairSpans(context, faultId);
    return { faultId, ...clockFromRows(rows) };
  },
  { auth: { capability: "arcade.operate" } },
);

export const finishRepairJob = createAuthenticatedAction(
  z.object({
    faultId: z.string().uuid(),
    note: z.string().trim().min(8).max(2000),
    parts: z.string().trim().max(500).optional().nullable(),
  }),
  async (data, context) => {
    const { data: fault, error } = await context.supabase
      .from("arcade_faults")
      .select("id, location_id, machine_id, status, description, technician_staff_id")
      .eq("id", data.faultId)
      .single();
    if (error) throw error;
    await assertArcadeLocationAccess(context, fault.location_id);
    const nowIso = new Date().toISOString();
    const open = await context.supabase
      .from("arcade_repairs")
      .select("id, status, paused_at")
      .eq("fault_id", fault.id)
      .neq("status", "COMPLETED")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open.data?.status === "IN_PROGRESS") {
      await context.supabase.from("arcade_repairs").update({ status: "COMPLETED", completed_at: nowIso, notes: data.note }).eq("id", open.data.id);
    } else if (open.data) {
      await context.supabase
        .from("arcade_repairs")
        .update({ status: "COMPLETED", completed_at: open.data.paused_at ?? nowIso, notes: data.note })
        .eq("id", open.data.id);
    }
    const closure = simpleClosureFromNote({
      description: fault.description,
      note: data.note,
      parts: data.parts && data.parts.trim().length >= 2 ? data.parts : null,
    });
    if (fault.status !== "RESOLVED" && fault.status !== "CLOSED") {
      const errors = transitionFault(fault.status as FaultStatus, "RESOLVED", closure);
      if (errors.length) throw new Error(errors[0]);
      const { error: updateError } = await context.supabase
        .from("arcade_faults")
        .update({
          status: "RESOLVED",
          problem: closure.problem,
          diagnosis: closure.diagnosis,
          action_taken: closure.actionTaken,
          parts_used: closure.partsUsed,
          testing_performed: closure.testingPerformed,
          final_result: closure.finalResult,
          recommendations: closure.recommendations,
          resolved_at: nowIso,
          updated_by: context.userId,
        })
        .eq("id", fault.id);
      if (updateError) throw updateError;
      await applyMachineStatus(context, fault.machine_id, "WORKING", fault.id);
    }
    await stampMachineFix(context, fault.machine_id, {
      at: nowIso,
      summary: data.note,
      status: "RESOLVED",
      technicianStaffId: fault.technician_staff_id,
    });
    const rows = await loadRepairSpans(context, fault.id);
    return { faultId: fault.id, ...clockFromRows(rows) };
  },
  { auth: { capability: "arcade.operate" } },
);

export const getDailyChecklist = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid() }),
  async (data, context) => {
    await assertArcadeLocationAccess(context, data.locationId);
    const today = new Date().toISOString().slice(0, 10);
    const [machines, records, people] = await Promise.all([
      context.supabase
        .from("arcade_machines")
        .select("id, name, asset_code, status, game_category")
        .eq("location_id", data.locationId)
        .eq("active", true)
        .neq("status", "DECOMMISSIONED")
        .order("name"),
      context.supabase
        .from("arcade_pm_records")
        .select("id, machine_id, notes, issues_found")
        .eq("location_id", data.locationId)
        .eq("performed_on", today)
        .eq("confirmed", true),
      context.supabase
        .from("staff")
        .select("id, full_name, job_title, staff_role, phone")
        .eq("status", "active")
        .eq("location_id", data.locationId)
        .limit(200),
    ]);
    if (machines.error) throw machines.error;
    if (records.error) throw records.error;
    const recordIds = (records.data ?? []).map((row) => row.id);
    const results = recordIds.length
      ? await context.supabase.from("arcade_pm_results").select("record_id, item_label, result, notes").in("record_id", recordIds)
      : { data: [] as { record_id: string; item_label: string; result: string; notes: string | null }[] };
    const daily = new Map<string, { result: string; notes: string | null }>();
    for (const result of results.data ?? []) {
      if (result.item_label !== DAILY_CHECK_LABEL) continue;
      const record = (records.data ?? []).find((row) => row.id === result.record_id);
      if (!record) continue;
      daily.set(record.machine_id, { result: result.result, notes: result.notes });
    }
    const supervisors = (people.data ?? [])
      .filter((person) => isArcadeSupervisor(person.job_title, person.staff_role))
      .map((person) => ({ id: person.id, name: person.full_name, phone: person.phone, title: person.job_title }));
    return {
      today,
      supervisors,
      games: (machines.data ?? []).map((machine) => ({
        id: machine.id,
        name: machine.name,
        assetCode: machine.asset_code,
        status: machine.status,
        category: machine.game_category,
        check: daily.get(machine.id) ?? null,
      })),
    };
  },
  { auth: { capability: "arcade.view" } },
);

export const markDailyGameCheck = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    machineId: z.string().uuid(),
    ok: z.boolean(),
    note: z.string().trim().max(500).optional().nullable(),
  }),
  async (data, context) => {
    await assertArcadeLocationAccess(context, data.locationId);
    if (!data.ok && !(data.note && data.note.trim().length >= 2)) {
      throw new Error("Add a short note when the game is not ok");
    }
    const today = new Date().toISOString().slice(0, 10);
    const { data: machine, error } = await context.supabase
      .from("arcade_machines")
      .select("id, location_id")
      .eq("id", data.machineId)
      .single();
    if (error) throw error;
    if (machine.location_id !== data.locationId) throw new Error("That game is not at this location");
    const existing = await context.supabase
      .from("arcade_pm_records")
      .select("id")
      .eq("machine_id", machine.id)
      .eq("performed_on", today)
      .eq("confirmed", true);
    if (existing.data?.length) {
      const ids = existing.data.map((row) => row.id);
      const prior = await context.supabase
        .from("arcade_pm_results")
        .select("record_id")
        .in("record_id", ids)
        .eq("item_label", DAILY_CHECK_LABEL)
        .limit(1)
        .maybeSingle();
      if (prior.data) return { alreadyChecked: true as const };
    }
    const staff = await staffForUser(context);
    const note = data.note?.trim() || null;
    const { data: record, error: recordError } = await context.supabase
      .from("arcade_pm_records")
      .insert({
        machine_id: machine.id,
        location_id: data.locationId,
        technician_staff_id: staff?.id ?? null,
        performed_on: today,
        completed_at: new Date().toISOString(),
        notes: note,
        issues_found: data.ok ? null : note,
        confirmed: true,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (recordError) throw recordError;
    const { error: resultError } = await context.supabase.from("arcade_pm_results").insert({
      record_id: record.id,
      location_id: data.locationId,
      item_label: DAILY_CHECK_LABEL,
      result: data.ok ? "PASS" : "FAIL",
      notes: note,
    });
    if (resultError) throw resultError;
    let faultTicket: string | null = null;
    if (!data.ok) {
      const description = [DAILY_CHECK_LABEL, note].filter(Boolean).join(" — ");
      const { data: fault, error: faultError } = await context.supabase
        .from("arcade_faults")
        .insert({
          location_id: data.locationId,
          machine_id: machine.id,
          reported_at: new Date().toISOString(),
          technician_staff_id: staff?.id ?? null,
          category: "Other",
          description: description.length >= 8 ? description : "Daily check found a problem",
          severity: "MEDIUM",
          operational_impact: "PARTIALLY_OPERATIONAL",
          status: "REPORTED",
          pm_record_id: record.id,
          created_by: context.userId,
          updated_by: context.userId,
        })
        .select("ticket_number")
        .single();
      if (faultError) throw faultError;
      faultTicket = fault.ticket_number;
    }
    return { alreadyChecked: false as const, faultTicket };
  },
  { auth: { capability: "arcade.operate" } },
);

async function staffForUser(context: AuthContext) {
  const { data } = await context.supabase
    .from("staff")
    .select("id")
    .eq("user_id", context.userId)
    .limit(1)
    .maybeSingle();
  return data;
}

export const getArcadePicture = createAuthenticatedAction(
  z.object({}).default({}),
  async (_data, context) => {
    const now = new Date();
    const windows = monthWindows(now);
    const nowIso = now.toISOString();
    const [sites, machines, faults, checksNow, checksPrev, openFaults] = await Promise.all([
      context.supabase.from("arcade_site_health").select("location_id, active_machines, working, down, under_repair, waiting_part, waiting_supplier"),
      context.supabase
        .from("arcade_machines")
        .select("id, name, asset_code, game_category, location_id, status, zone, unit_number, manufacturer, model, serial_number, power_requirement, network_requirement, controller_pcb, card_rfid_interface, software_version, notes, active")
        .eq("active", true)
        .neq("status", "DECOMMISSIONED")
        .order("name")
        .limit(800),
      context.supabase
        .from("arcade_faults")
        .select("id, status, reported_at, resolved_at, downtime_started_at, downtime_ended_at")
        .gte("reported_at", `${windows.previousStart}T00:00:00.000Z`)
        .order("reported_at", { ascending: false })
        .limit(2000),
      context.supabase.from("arcade_pm_records").select("id", { count: "exact", head: true }).eq("confirmed", true).gte("performed_on", windows.currentStart).lte("performed_on", windows.currentEnd),
      context.supabase.from("arcade_pm_records").select("id", { count: "exact", head: true }).eq("confirmed", true).gte("performed_on", windows.previousStart).lte("performed_on", windows.previousEnd),
      context.supabase.from("arcade_fault_kpis").select("open_faults").limit(1),
    ]);
    if (sites.error) throw sites.error;
    if (machines.error) throw machines.error;
    const faultRows = faults.data ?? [];
    const inMonth = (iso: string | null, start: string, end: string) => {
      if (!iso) return false;
      const day = iso.slice(0, 10);
      return day >= start && day <= end;
    };
    const countWindow = (start: string, end: string) => ({
      repairsOpened: faultRows.filter((row) => inMonth(row.reported_at, start, end)).length,
      repairsFinished: faultRows.filter((row) => inMonth(row.resolved_at, start, end)).length,
      downtimeHours: downtimeHoursInWindow(
        faultRows.map((row) => ({ startedAt: row.downtime_started_at, endedAt: row.downtime_ended_at })),
        start,
        end,
        nowIso,
      ),
      checksRecorded: 0,
    });
    const current = countWindow(windows.currentStart, windows.currentEnd);
    const previous = countWindow(windows.previousStart, windows.previousEnd);
    current.checksRecorded = checksNow.count ?? 0;
    previous.checksRecorded = checksPrev.count ?? 0;
    const siteRows = sites.data ?? [];
    const machineRows = machines.data ?? [];
    const hides = await readArcadeListHides(context.supabase);
    const hiddenLocations = new Set(hides.filter((hide) => hide.locationId && !hide.machineId).map((hide) => hide.locationId as string));
    const hiddenGames = new Set(hides.filter((hide) => hide.machineId).map((hide) => hide.machineId as string));
    const listed = visibleArcadeList(
      siteRows.map((site) => ({
        locationId: site.location_id,
        games: site.active_machines,
        working: site.working,
        down: site.down,
        inRepair: site.under_repair,
        waitingPart: site.waiting_part,
        waitingSupplier: site.waiting_supplier,
      })),
      machineRows.map((machine) => ({ id: machine.id, locationId: machine.location_id, status: machine.status })),
      hides,
    );
    const visibleIds = new Set(listed.games.map((game) => game.id));
    const canManageList = canActorPerform(context.roles ?? [], "arcade.manage", context.access);
    return {
      windows,
      comparison: monthComparison(current, previous),
      openRepairsNow: openFaults.data?.[0]?.open_faults ?? faultRows.filter((row) => row.status !== "RESOLVED" && row.status !== "CLOSED").length,
      fleet: {
        games: listed.sites.reduce((sum, row) => sum + row.games, 0),
        working: listed.sites.reduce((sum, row) => sum + row.working, 0),
        down: listed.sites.reduce((sum, row) => sum + row.down, 0),
        inRepair: listed.sites.reduce((sum, row) => sum + row.inRepair, 0),
      },
      truncated: faultRows.length >= 2000 || machineRows.length >= 800,
      canManageList,
      sites: listed.sites,
      games: machineRows.filter((machine) => visibleIds.has(machine.id)).map((machine) => ({
        id: machine.id,
        locationId: machine.location_id,
        name: machine.name,
        assetCode: machine.asset_code,
        category: machine.game_category,
        status: machine.status,
        elements: gameElements({
          zone: machine.zone,
          unitNumber: machine.unit_number,
          manufacturer: machine.manufacturer,
          model: machine.model,
          serialNumber: machine.serial_number,
          powerRequirement: machine.power_requirement,
          networkRequirement: machine.network_requirement,
          controllerPcb: machine.controller_pcb,
          cardRfidInterface: machine.card_rfid_interface,
          softwareVersion: machine.software_version,
          notes: machine.notes,
        }),
      })),
      removed: canManageList
        ? {
            locations: [...hiddenLocations].map((locationId) => ({ locationId })),
            games: machineRows
              .filter((machine) => hiddenGames.has(machine.id))
              .map((machine) => ({
                id: machine.id,
                locationId: machine.location_id,
                name: machine.name,
                assetCode: machine.asset_code,
              })),
          }
        : { locations: [], games: [] },
    };
  },
  { defaultInput: {}, auth: { capability: "arcade.view" } },
);
