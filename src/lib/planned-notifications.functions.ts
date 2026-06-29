"use server";

import { z } from "zod";

import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";

const REMINDER_TYPES = [
  "amc_renewal",
  "amc_service_due",
  "inspection_due",
  "contract_expiry",
  "license_expiry",
  "staff_medical_expiry",
  "compliance_document",
  "pm_due",
  "escalation",
  "general",
] as const;

export const listPlannedNotifications = createAuthenticatedAction(
  z.object({
    status: z.string().nullable().optional(),
    upcomingOnly: z.boolean().default(true),
  }).default({}),
  async (data, context) => {
    let q = context.supabase
      .from("planned_notifications")
      .select("*")
      .order("due_date")
      .limit(100);
    if (data.status) q = q.eq("status", data.status);
    if (data.upcomingOnly) {
      q = q.gte("due_date", new Date().toISOString().slice(0, 10));
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "notifications.planned.view" } },
);

/** Scan AMC, compliance docs, calendar, PM — create planned notification rows. */
export const syncPlannedNotifications = createAuthenticatedActionNoInput(
  async (context) => {
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    let created = 0;

    const [{ data: amcContracts }, { data: amcServices }, { data: complianceDocs }, { data: pmSchedules }] =
      await Promise.all([
        context.supabase
          .from("amc_contracts")
          .select("id, location_id, vendor_name, category, contract_end_date")
          .gte("contract_end_date", today)
          .lte("contract_end_date", in30)
          .neq("status", "cancelled"),
        context.supabase
          .from("amc_service_schedules")
          .select("id, contract_id, planned_date, status")
          .in("status", ["pending", "overdue"])
          .gte("planned_date", today)
          .lte("planned_date", new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)),
        context.supabase
          .from("compliance_documents")
          .select("id, location_id, document_type, expiry_date")
          .not("expiry_date", "is", null)
          .gte("expiry_date", today)
          .lte("expiry_date", in30),
        context.supabase
          .from("pm_schedules")
          .select("id, location_id, title, next_due_at")
          .gte("next_due_at", today)
          .lte("next_due_at", new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)),
      ]);

    const inserts: Array<Record<string, unknown>> = [];

    for (const c of amcContracts ?? []) {
      inserts.push({
        location_id: c.location_id,
        reminder_type: "amc_renewal",
        title: `AMC renewal: ${c.category}`,
        body: `${c.vendor_name} contract expires ${c.contract_end_date}`,
        source_type: "amc_contracts",
        source_id: c.id,
        due_date: c.contract_end_date,
        scheduled_for: new Date(`${c.contract_end_date}T08:00:00+03:00`).toISOString(),
        status: "pending",
      });
    }

    for (const s of amcServices ?? []) {
      inserts.push({
        reminder_type: "amc_service_due",
        title: "AMC service due",
        body: `Service scheduled ${s.planned_date}`,
        source_type: "amc_service_schedules",
        source_id: s.id,
        due_date: s.planned_date,
        scheduled_for: new Date(`${s.planned_date}T07:00:00+03:00`).toISOString(),
        status: "pending",
      });
    }

    for (const d of complianceDocs ?? []) {
      inserts.push({
        location_id: d.location_id,
        reminder_type: "license_expiry",
        title: `Document expiry: ${d.document_type}`,
        body: `Expires ${d.expiry_date}`,
        source_type: "compliance_documents",
        source_id: d.id,
        due_date: d.expiry_date,
        scheduled_for: new Date(`${d.expiry_date}T08:00:00+03:00`).toISOString(),
        status: "pending",
      });
    }

    for (const p of pmSchedules ?? []) {
      const due = String(p.next_due_at).slice(0, 10);
      inserts.push({
        location_id: p.location_id,
        reminder_type: "pm_due",
        title: `PM due: ${p.title}`,
        body: `Preventive maintenance due ${due}`,
        source_type: "pm_schedules",
        source_id: p.id,
        due_date: due,
        scheduled_for: new Date(`${due}T06:00:00+03:00`).toISOString(),
        status: "pending",
      });
    }

    for (const row of inserts) {
      const { data: existing } = await context.supabase
        .from("planned_notifications")
        .select("id")
        .eq("source_type", row.source_type as string)
        .eq("source_id", row.source_id as string)
        .eq("due_date", row.due_date as string)
        .maybeSingle();
      if (existing) continue;

      const { error } = await context.supabase.from("planned_notifications").insert(row);
      if (!error) created += 1;
    }

    return { created, scanned: inserts.length };
  },
  { auth: { capability: "notifications.planned.manage" } },
);

export const dispatchDuePlannedNotifications = createAuthenticatedActionNoInput(
  async (context) => {
    const now = new Date().toISOString();
    const { data: due, error } = await context.supabase
      .from("planned_notifications")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .limit(50);
    if (error) throw error;

    let sent = 0;
    for (const row of due ?? []) {
      const { data: notif, error: nErr } = await context.supabase
        .from("notifications")
        .insert({
          user_id: context.userId,
          location_id: row.location_id,
          category: row.reminder_type.includes("amc") ? "compliance" : "general",
          title: row.title,
          body: row.body,
          severity: row.reminder_type.includes("expiry") || row.reminder_type.includes("overdue") ? "warning" : "info",
          source_type: row.source_type,
          source_id: row.source_id,
        })
        .select("id")
        .single();
      if (nErr) continue;

      await context.supabase
        .from("planned_notifications")
        .update({ status: "sent", sent_at: now, notification_id: notif.id })
        .eq("id", row.id);
      sent += 1;
    }
    return { sent };
  },
  { auth: { capability: "notifications.planned.manage" } },
);
