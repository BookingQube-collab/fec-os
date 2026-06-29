"use server";

import { z } from "zod";

import { assertLocationAccess } from "@/lib/server/authorize";
import { validateBase64Size, validateUploadMime } from "@/lib/server/upload-validation";
import { createAuthenticatedAction, createSafeAuthenticatedAction } from "@/lib/server/create-action";
import {
  EDITABLE_STATUSES,
  getWeekBounds,
  REPORT_PRIORITIES,
  weekEndSunday,
  WEEKLY_REPORT_STATUSES,
} from "@/lib/weekly-reports/constants";
import { generateExecutiveReportCore, fetchExecutiveReportDetail, fetchExecutiveReports, fetchWeeklyReports } from "@/lib/queries/weekly-reports.core";
import { normalizeExecutiveContent } from "@/lib/weekly-reports/executive-assembler";
import type { ExecutiveWeeklyReport } from "@/lib/weekly-reports/executive-report-types";

export { getWeekBounds };

const WeeklyReportFormSchema = z.object({
  id: z.string().uuid().optional(),
  location_id: z.string().uuid(),
  reporting_week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  submitted_by_name: z.string().min(1).max(200).optional(),
  revenue: z.number().min(0).nullable().optional(),
  footfall: z.number().int().min(0).nullable().optional(),
  staff_scheduled: z.number().int().min(0).default(0),
  staff_present: z.number().int().min(0).default(0),
  absentees_late: z.string().max(4000).nullable().optional(),
  customer_complaints: z.number().int().min(0).default(0),
  positive_feedback: z.string().max(4000).nullable().optional(),
  incidents_count: z.number().int().min(0).default(0),
  incidents_detail: z.string().max(4000).nullable().optional(),
  maintenance_issues: z.string().max(4000).nullable().optional(),
  maintenance_open: z.number().int().min(0).default(0),
  maintenance_closed: z.number().int().min(0).default(0),
  compliance_updates: z.string().max(4000).nullable().optional(),
  compliance_score: z.number().min(0).max(100).nullable().optional(),
  inventory_issues: z.string().max(4000).nullable().optional(),
  cashier_pos_issues: z.string().max(4000).nullable().optional(),
  marketing_events: z.string().max(4000).nullable().optional(),
  top_achievements: z.string().max(4000).nullable().optional(),
  top_challenges: z.string().max(4000).nullable().optional(),
  support_required: z.string().max(4000).nullable().optional(),
  next_week_action_plan: z.string().max(4000).nullable().optional(),
  critical_issues: z.string().max(4000).nullable().optional(),
  priority: z.enum(REPORT_PRIORITIES).default("medium"),
});

function toRow(data: z.infer<typeof WeeklyReportFormSchema>, weekEnd: string) {
  return {
    location_id: data.location_id,
    reporting_week_start: data.reporting_week_start,
    reporting_week_end: weekEnd,
    submitted_by_name: data.submitted_by_name ?? null,
    revenue: data.revenue ?? null,
    footfall: data.footfall ?? null,
    staff_scheduled: data.staff_scheduled,
    staff_present: data.staff_present,
    absentees_late: data.absentees_late ?? null,
    customer_complaints: data.customer_complaints,
    positive_feedback: data.positive_feedback ?? null,
    incidents_count: data.incidents_count,
    incidents_detail: data.incidents_detail ?? null,
    maintenance_issues: data.maintenance_issues ?? null,
    maintenance_open: data.maintenance_open,
    maintenance_closed: data.maintenance_closed,
    compliance_updates: data.compliance_updates ?? null,
    compliance_score: data.compliance_score ?? null,
    inventory_issues: data.inventory_issues ?? null,
    cashier_pos_issues: data.cashier_pos_issues ?? null,
    marketing_events: data.marketing_events ?? null,
    top_achievements: data.top_achievements ?? null,
    top_challenges: data.top_challenges ?? null,
    support_required: data.support_required ?? null,
    next_week_action_plan: data.next_week_action_plan ?? null,
    critical_issues: data.critical_issues ?? null,
    priority: data.priority,
  };
}

export const saveWeeklyReportDraft = createSafeAuthenticatedAction(
  WeeklyReportFormSchema,
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    const weekEnd = weekEndSunday(data.reporting_week_start);
    const row = toRow(data, weekEnd);

    if (data.id) {
      const { data: existing, error: fetchErr } = await context.supabase
        .from("weekly_reports")
        .select("status, location_id")
        .eq("id", data.id)
        .single();
      if (fetchErr) throw fetchErr;
      if (!EDITABLE_STATUSES.includes(existing.status as WeeklyReportStatus)) {
        throw new Error("Submitted reports cannot be edited unless sent back");
      }
      await assertLocationAccess(context, existing.location_id);

      const { data: updated, error } = await context.supabase
        .from("weekly_reports")
        .update({ ...row, status: "draft" })
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw error;
      return updated;
    }

    const { data: inserted, error } = await context.supabase
      .from("weekly_reports")
      .insert({ ...row, status: "draft", created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return inserted;
  },
  { auth: { capability: "weekly_reports.submit" } },
);

export const submitWeeklyReport = createSafeAuthenticatedAction(
  WeeklyReportFormSchema,
  async (data, context) => {
    await assertLocationAccess(context, data.location_id);
    const weekEnd = weekEndSunday(data.reporting_week_start);
    const row = toRow(data, weekEnd);

    if (data.id) {
      const { data: existing, error: fetchErr } = await context.supabase
        .from("weekly_reports")
        .select("status, location_id")
        .eq("id", data.id)
        .single();
      if (fetchErr) throw fetchErr;
      if (!EDITABLE_STATUSES.includes(existing.status as WeeklyReportStatus)) {
        throw new Error("Only draft or sent-back reports can be submitted");
      }
    }

    const payload = {
      ...row,
      status: "submitted" as const,
      submitted_at: new Date().toISOString(),
      created_by: context.userId,
    };

    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("weekly_reports")
        .update(payload)
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw error;
      return updated;
    }

    const { data: inserted, error } = await context.supabase
      .from("weekly_reports")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return inserted;
  },
  { auth: { capability: "weekly_reports.submit" } },
);

export const reviewWeeklyReport = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    action: z.enum(["approve", "send_back", "mark_reviewed", "flag_missing"]),
    remarks: z.string().max(4000).optional(),
    priority: z.enum(REPORT_PRIORITIES).optional(),
    missing_info_flag: z.boolean().optional(),
  }),
  async (data, context) => {
    const { data: report, error: fetchErr } = await context.supabase
      .from("weekly_reports")
      .select("id, status, location_id")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw fetchErr;

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
      .from("weekly_reports")
      .update(updates)
      .eq("id", data.id)
      .select("id, status")
      .single();
    if (error) throw error;

    if (data.remarks?.trim()) {
      await context.supabase.from("report_review_comments").insert({
        weekly_report_id: data.id,
        comment_text: data.remarks,
        priority: data.priority ?? null,
        created_by: context.userId,
      });
    }

    return updated;
  },
  { auth: { capability: "weekly_reports.review" } },
);

export const addWeeklyReportComment = createAuthenticatedAction(
  z.object({
    weekly_report_id: z.string().uuid(),
    comment_text: z.string().min(1).max(4000),
    priority: z.enum(REPORT_PRIORITIES).optional(),
    is_internal: z.boolean().default(true),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("report_review_comments")
      .insert({
        weekly_report_id: data.weekly_report_id,
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
  { auth: { capability: "weekly_reports.review" } },
);

export const uploadWeeklyReportAttachment = createAuthenticatedAction(
  z.object({
    weekly_report_id: z.string().uuid(),
    file_name: z.string().min(1).max(255),
    mime_type: z.string().min(1),
    content_base64: z.string().min(1),
  }),
  async (data, context) => {
    validateUploadMime(data.mime_type);
    validateBase64Size(data.content_base64, 10 * 1024 * 1024);

    const { data: report, error: repErr } = await context.supabase
      .from("weekly_reports")
      .select("location_id, status")
      .eq("id", data.weekly_report_id)
      .single();
    if (repErr) throw repErr;
    if (!EDITABLE_STATUSES.includes(report.status as WeeklyReportStatus)) {
      throw new Error("Attachments can only be added to editable reports");
    }
    await assertLocationAccess(context, report.location_id);

    const { data: row, error } = await context.supabase
      .from("weekly_report_attachments")
      .insert({
        weekly_report_id: data.weekly_report_id,
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
  { auth: { capability: "weekly_reports.submit" } },
);

export const generateExecutiveReport = createAuthenticatedAction(
  z.object({
    reporting_week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  async (data, context) => generateExecutiveReportCore(context, data.reporting_week_start),
  { auth: { capability: "weekly_reports.executive" } },
);

/** @deprecated use generateExecutiveReport */
export const generateExecutiveWeeklyReportAction = generateExecutiveReport;

export const deleteExecutiveReport = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase.from("executive_reports").delete().eq("id", data.id);
    if (error) throw error;
    return { id: data.id };
  },
  { auth: { capability: "weekly_reports.executive" } },
);

export const publishExecutiveReport = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("executive_reports")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("id, status")
      .single();
    if (error) throw error;

    await context.supabase
      .from("weekly_reports")
      .update({ status: "closed" })
      .eq("executive_report_id", data.id);

    return row;
  },
  { auth: { capability: "weekly_reports.executive" } },
);

export type WeeklyReportStatus = (typeof WEEKLY_REPORT_STATUSES)[number];

export const getExecutiveWeeklyReport = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const detail = await fetchExecutiveReportDetail(context, data.id);
    const report = normalizeExecutiveContent(detail.content) ?? (detail.content as ExecutiveWeeklyReport);
    return { report, meta: detail };
  },
  { auth: { anyCapability: ["weekly_reports.executive", "weekly_reports.view_executive"] } },
);

export const listExecutiveWeeklyReports = createAuthenticatedAction(
  z.object({ limit: z.number().int().min(1).max(52).default(12) }),
  async (data, context) => {
    const rows = await fetchExecutiveReports(context, null);
    return rows.slice(0, data.limit).map((r) => ({
      id: r.id,
      week_start: r.reporting_week_start,
      week_end: r.reporting_week_end,
      status: r.status,
      generation_mode: r.ai_generated ? "ai" : "rule_based",
      created_at: r.created_at,
      reporting_week_start: r.reporting_week_start,
      ai_generated: r.ai_generated,
    }));
  },
  { defaultInput: { limit: 12 }, auth: { anyCapability: ["weekly_reports.executive", "weekly_reports.view_executive"] } },
);

export const listSupervisorReportsForWeek = createAuthenticatedAction(
  z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  async (data, context) => {
    const rows = await fetchWeeklyReports(context, { weekStart: data.weekStart });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      submitted_at: r.submitted_at,
      location: r.locations ? { code: r.locations.code, name: r.locations.name } : null,
    }));
  },
  { auth: { capability: "weekly_reports.view" } },
);
