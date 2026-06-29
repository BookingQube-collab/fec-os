"use server";

import { z } from "zod";

import { assertLocationAccess } from "@/lib/server/authorize";
import { validateBase64Size, validateUploadMime } from "@/lib/server/upload-validation";
import { createAuthenticatedAction, createSafeAuthenticatedAction } from "@/lib/server/create-action";
import type { AuthContext } from "@/lib/server/auth";
import {
  EDITABLE_STATUSES,
  MAINTENANCE_REPORT_TEAMS,
  REPORT_PRIORITIES,
  weekEndSunday,
  type WeeklyReportStatus,
} from "@/lib/maintenance-weekly-reports/constants";
import { callMaintenanceReportAiAutofill } from "@/lib/maintenance-weekly-reports/ai-autofill";
import {
  buildTeamKpiSnapshot,
  generateMaintenanceExecutiveReportCore,
} from "@/lib/queries/maintenance-weekly-reports.core";

const MaintenanceReportFormSchema = z.object({
  id: z.string().uuid().optional(),
  team: z.enum(MAINTENANCE_REPORT_TEAMS),
  location_id: z.string().uuid(),
  reporting_week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  submitted_by_name: z.string().min(1).max(200).optional(),
  top_achievements: z.string().max(4000).nullable().optional(),
  top_challenges: z.string().max(4000).nullable().optional(),
  support_required: z.string().max(4000).nullable().optional(),
  next_week_action_plan: z.string().max(4000).nullable().optional(),
  critical_issues: z.string().max(4000).nullable().optional(),
  operational_notes: z.string().max(4000).nullable().optional(),
  priority: z.enum(REPORT_PRIORITIES).default("medium"),
  refresh_kpis: z.boolean().default(true),
});

function toRow(data: z.infer<typeof MaintenanceReportFormSchema>, weekEnd: string, kpiSnapshot: Record<string, unknown>) {
  return {
    team: data.team,
    location_id: data.location_id,
    reporting_week_start: data.reporting_week_start,
    reporting_week_end: weekEnd,
    submitted_by_name: data.submitted_by_name ?? null,
    kpi_snapshot: kpiSnapshot,
    top_achievements: data.top_achievements ?? null,
    top_challenges: data.top_challenges ?? null,
    support_required: data.support_required ?? null,
    next_week_action_plan: data.next_week_action_plan ?? null,
    critical_issues: data.critical_issues ?? null,
    operational_notes: data.operational_notes ?? null,
    priority: data.priority,
  };
}

async function resolveKpiSnapshot(
  context: AuthContext,
  data: z.infer<typeof MaintenanceReportFormSchema>,
  existingSnapshot?: Record<string, unknown>,
) {
  if (!data.refresh_kpis && existingSnapshot && Object.keys(existingSnapshot).length > 0) {
    return existingSnapshot;
  }
  return buildTeamKpiSnapshot(context, data.team, data.reporting_week_start, data.location_id);
}

export const saveMaintenanceWeeklyReportDraft = createSafeAuthenticatedAction(
  MaintenanceReportFormSchema,
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    const weekEnd = weekEndSunday(data.reporting_week_start);
    let existingSnapshot: Record<string, unknown> | undefined;

    if (data.id) {
      const { data: existing, error: fetchErr } = await context.supabase
        .from("maintenance_weekly_reports")
        .select("status, team, location_id, kpi_snapshot")
        .eq("id", data.id)
        .single();
      if (fetchErr) throw fetchErr;
      if (!EDITABLE_STATUSES.includes(existing.status as WeeklyReportStatus)) {
        throw new Error("Submitted reports cannot be edited unless sent back");
      }
      if (existing.team !== data.team) {
        throw new Error("Team cannot be changed after creation");
      }
      if (existing.location_id !== data.location_id) {
        throw new Error("Location cannot be changed after creation");
      }
      await assertLocationAccess(context, existing.location_id as string);
      existingSnapshot = (existing.kpi_snapshot ?? {}) as Record<string, unknown>;
    }

    const kpiSnapshot = await resolveKpiSnapshot(context, data, existingSnapshot);
    const row = toRow(data, weekEnd, kpiSnapshot);

    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("maintenance_weekly_reports")
        .update({ ...row, status: "draft" })
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw error;
      return updated;
    }

    const { data: inserted, error } = await context.supabase
      .from("maintenance_weekly_reports")
      .insert({ ...row, status: "draft", created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return inserted;
  },
  {
    auth: {
      anyCapability: ["maintenance.weekly_report.submit", "maintenance.logistics_submit"],
    },
  },
);

export const submitMaintenanceWeeklyReport = createSafeAuthenticatedAction(
  MaintenanceReportFormSchema,
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    const weekEnd = weekEndSunday(data.reporting_week_start);
    let existingSnapshot: Record<string, unknown> | undefined;

    if (data.id) {
      const { data: existing, error: fetchErr } = await context.supabase
        .from("maintenance_weekly_reports")
        .select("status, location_id, kpi_snapshot")
        .eq("id", data.id)
        .single();
      if (fetchErr) throw fetchErr;
      if (!EDITABLE_STATUSES.includes(existing.status as WeeklyReportStatus)) {
        throw new Error("Only draft or sent-back reports can be submitted");
      }
      await assertLocationAccess(context, existing.location_id as string);
      existingSnapshot = (existing.kpi_snapshot ?? {}) as Record<string, unknown>;
    }

    const kpiSnapshot = await resolveKpiSnapshot(context, data, existingSnapshot);
    const row = toRow(data, weekEnd, kpiSnapshot);
    const payload = {
      ...row,
      status: "submitted" as const,
      submitted_at: new Date().toISOString(),
      created_by: context.userId,
    };

    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("maintenance_weekly_reports")
        .update(payload)
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw error;
      return updated;
    }

    const { data: inserted, error } = await context.supabase
      .from("maintenance_weekly_reports")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return inserted;
  },
  {
    auth: {
      anyCapability: ["maintenance.weekly_report.submit", "maintenance.logistics_submit"],
    },
  },
);

export const reviewMaintenanceWeeklyReport = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    action: z.enum(["approve", "send_back", "mark_reviewed", "flag_missing"]),
    remarks: z.string().max(4000).optional(),
    priority: z.enum(REPORT_PRIORITIES).optional(),
    missing_info_flag: z.boolean().optional(),
  }),
  async (data, context) => {
    const statusMap = {
      approve: "approved",
      send_back: "sent_back",
      mark_reviewed: "under_review",
      flag_missing: "under_review",
    } as const;

    const updates: Record<string, unknown> = {
      status: statusMap[data.action],
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    };
    if (data.remarks != null) updates.review_remarks = data.remarks;
    if (data.priority) updates.priority = data.priority;
    if (data.missing_info_flag != null) updates.missing_info_flag = data.missing_info_flag;
    if (data.action === "flag_missing") updates.missing_info_flag = true;

    const { data: updated, error } = await context.supabase
      .from("maintenance_weekly_reports")
      .update(updates)
      .eq("id", data.id)
      .select("id, status")
      .single();
    if (error) throw error;

    if (data.remarks?.trim()) {
      await context.supabase.from("maintenance_report_review_comments").insert({
        maintenance_weekly_report_id: data.id,
        comment_text: data.remarks,
        priority: data.priority ?? null,
        created_by: context.userId,
      });
    }

    return updated;
  },
  { auth: { capability: "maintenance.weekly_report.review" } },
);

export const addMaintenanceReportComment = createAuthenticatedAction(
  z.object({
    maintenance_weekly_report_id: z.string().uuid(),
    comment_text: z.string().min(1).max(4000),
    priority: z.enum(REPORT_PRIORITIES).optional(),
    is_internal: z.boolean().default(true),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("maintenance_report_review_comments")
      .insert({
        maintenance_weekly_report_id: data.maintenance_weekly_report_id,
        comment_text: data.comment_text,
        priority: data.priority ?? null,
        is_internal: data.is_internal,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "maintenance.weekly_report.review" } },
);

export const uploadMaintenanceReportAttachment = createAuthenticatedAction(
  z.object({
    maintenance_weekly_report_id: z.string().uuid(),
    file_name: z.string().min(1).max(255),
    mime_type: z.string().min(1),
    content_base64: z.string().min(1),
  }),
  async (data, context) => {
    validateUploadMime(data.mime_type);
    validateBase64Size(data.content_base64, 10 * 1024 * 1024);

    const { data: report, error: repErr } = await context.supabase
      .from("maintenance_weekly_reports")
      .select("status, location_id")
      .eq("id", data.maintenance_weekly_report_id)
      .single();
    if (repErr) throw repErr;
    await assertLocationAccess(context, report.location_id as string);
    if (!EDITABLE_STATUSES.includes(report.status as WeeklyReportStatus)) {
      throw new Error("Attachments can only be added to editable reports");
    }

    const { data: row, error } = await context.supabase
      .from("maintenance_weekly_report_attachments")
      .insert({
        maintenance_weekly_report_id: data.maintenance_weekly_report_id,
        file_name: data.file_name,
        mime_type: data.mime_type,
        content_base64: data.content_base64,
        file_size: Math.ceil((data.content_base64.length * 3) / 4),
        uploaded_by: context.userId,
      })
      .select("id, file_name")
      .single();
    if (error) throw error;
    return row;
  },
  {
    auth: {
      anyCapability: ["maintenance.weekly_report.submit", "maintenance.logistics_submit"],
    },
  },
);

export const generateMaintenanceExecutiveReport = createAuthenticatedAction(
  z.object({
    reporting_week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  async (data, context) => generateMaintenanceExecutiveReportCore(context, data.reporting_week_start),
  { auth: { capability: "maintenance.weekly_report.executive" } },
);

export const deleteMaintenanceExecutiveReport = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("maintenance_executive_reports")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { id: data.id };
  },
  { auth: { capability: "maintenance.weekly_report.executive" } },
);

export const refreshMaintenanceReportKpis = createAuthenticatedAction(
  z.object({
    team: z.enum(MAINTENANCE_REPORT_TEAMS),
    location_id: z.string().uuid(),
    reporting_week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    return buildTeamKpiSnapshot(context, data.team, data.reporting_week_start, data.location_id);
  },
  {
    auth: {
      anyCapability: ["maintenance.weekly_report.submit", "maintenance.logistics_submit", "maintenance.weekly_report"],
    },
  },
);

export const aiAutoFillMaintenanceWeeklyReport = createAuthenticatedAction(
  z.object({
    team: z.enum(MAINTENANCE_REPORT_TEAMS),
    location_id: z.string().uuid(),
    reporting_week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    submitted_by_name: z.string().max(200).optional(),
    kpi_snapshot: z.record(z.unknown()).optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);

    const { data: location, error: locErr } = await context.supabase
      .from("locations")
      .select("code, name")
      .eq("id", data.location_id)
      .single();
    if (locErr) throw locErr;

    const kpiSnapshot =
      data.kpi_snapshot && Object.keys(data.kpi_snapshot).length > 0
        ? data.kpi_snapshot
        : await buildTeamKpiSnapshot(context, data.team, data.reporting_week_start, data.location_id);

    const weekEnd = weekEndSunday(data.reporting_week_start);
    const result = await callMaintenanceReportAiAutofill({
      team: data.team,
      reporting_week_start: data.reporting_week_start,
      reporting_week_end: weekEnd,
      location_code: location.code,
      location_name: location.name,
      kpi_snapshot: kpiSnapshot,
      submitted_by_name: data.submitted_by_name,
    });

    return result;
  },
  {
    auth: {
      anyCapability: ["maintenance.weekly_report.submit", "maintenance.logistics_submit"],
    },
  },
);
