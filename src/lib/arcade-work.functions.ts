"use server";

import { z } from "zod";

import {
  DEFAULT_PM_CHECKLIST,
  compareWorkPriority,
  detectRepeatFault,
  faultsFromPmChecklist,
  fixSummaryFromFault,
  machineFixUpdate,
  machineStatusForFault,
  nextMachineStatus,
  nextPmDate,
  transitionFault,
  weekBounds,
  workPriority,
  type FaultStatus,
  type MachineStatus,
  type PmCadence,
} from "@/lib/arcade/domain";
import { FaultInput, FaultStatusInput, PageQuery, PmCompleteInput } from "@/lib/arcade/schemas";
import { canUserDo } from "@/lib/rbac";
import { assertLocationAccess } from "@/lib/server/authorize";
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
    await assertLocationAccess(context, fault.location_id);
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
    await assertLocationAccess(context, data.locationId);
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
    await assertLocationAccess(context, existing.location_id);
    if (data.status === "CLOSED" && !canUserDo(context.roles ?? [], "arcade.close")) {
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
    const errors = transitionFault(existing.status as FaultStatus, data.status, closure);
    if (errors.length) throw new Error(errors[0]);
    const { error: updateError } = await context.supabase
      .from("arcade_faults")
      .update({
        status: data.status,
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
        location_id: existing.location_id,
        kind: "note",
        body: data.note.trim(),
        created_by: context.userId,
      });
    }
    if (data.status === "UNDER_REPAIR") {
      await context.supabase.from("arcade_repairs").insert({
        fault_id: data.id,
        machine_id: existing.machine_id,
        location_id: existing.location_id,
        technician_staff_id: existing.technician_staff_id,
        status: "IN_PROGRESS",
        created_by: context.userId,
      });
    }
    if (data.status === "UNDER_OBSERVATION") {
      await context.supabase.from("arcade_observations").insert({
        machine_id: existing.machine_id,
        fault_id: data.id,
        location_id: existing.location_id,
        technician_staff_id: existing.technician_staff_id,
        status: "OPEN",
        created_by: context.userId,
      });
    }
    const proposed = machineStatusForFault(data.status, existing.operational_impact);
    await applyMachineStatus(context, existing.machine_id, proposed, data.id);
    await stampMachineFix(context, existing.machine_id, {
      at: new Date().toISOString(),
      summary: fixSummaryFromFault({
        note: data.note,
        actionTaken: closure.actionTaken,
        finalResult: closure.finalResult,
        diagnosis: closure.diagnosis,
        description: existing.description,
      }),
      status: data.status,
      technicianStaffId: existing.technician_staff_id,
    });
    return { id: data.id, status: data.status };
  },
  { auth: { capability: "arcade.operate" } },
);

export const addArcadeFaultNote = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), body: z.string().trim().min(2).max(4000) }),
  async (data, context) => {
    const { data: fault, error } = await context.supabase.from("arcade_faults").select("location_id").eq("id", data.id).single();
    if (error) throw error;
    await assertLocationAccess(context, fault.location_id);
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

export const setArcadeRepairState = createAuthenticatedAction(
  z.object({
    faultId: z.string().uuid(),
    action: z.enum(["START", "PAUSE", "COMPLETE"]),
    note: z.string().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    const { data: fault, error } = await context.supabase.from("arcade_faults").select("id, location_id, machine_id, technician_staff_id, status").eq("id", data.faultId).single();
    if (error) throw error;
    await assertLocationAccess(context, fault.location_id);
    if (data.action === "START") {
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
      if (fault.status === "REPORTED" || fault.status === "DIAGNOSING" || fault.status === "WAITING_PART" || fault.status === "WAITING_SUPPLIER") {
        await context.supabase.from("arcade_faults").update({ status: "UNDER_REPAIR", updated_by: context.userId }).eq("id", fault.id);
        await applyMachineStatus(context, fault.machine_id, "UNDER_REPAIR", fault.id);
      }
    } else {
      const { data: repair } = await context.supabase
        .from("arcade_repairs")
        .select("id")
        .eq("fault_id", fault.id)
        .neq("status", "COMPLETED")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (repair) {
        await context.supabase
          .from("arcade_repairs")
          .update({
            status: data.action === "PAUSE" ? "PAUSED" : "COMPLETED",
            paused_at: data.action === "PAUSE" ? new Date().toISOString() : null,
            completed_at: data.action === "COMPLETE" ? new Date().toISOString() : null,
            notes: data.note ?? null,
          })
          .eq("id", repair.id);
      }
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
      at: new Date().toISOString(),
      summary: data.note,
      fallback: data.action === "START" ? "Repair started" : data.action === "PAUSE" ? "Repair paused" : "Repair completed",
      status: repairStatus,
      technicianStaffId: fault.technician_staff_id,
    });
    return { ok: true };
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
    await assertLocationAccess(context, observation.location_id);
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
    await assertLocationAccess(context, observation.location_id);
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
    await assertLocationAccess(context, data.locationId);
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
    await assertLocationAccess(context, data.locationId);
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
    const staffId = data.staffId && canUserDo(context.roles ?? [], "arcade.assign") ? data.staffId : me?.id;
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
