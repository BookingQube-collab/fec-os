import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  getMaintenanceTeamEmails,
  notifyMaintenanceTeamInApp,
  sendSlaEscalationEmail,
} from "@/lib/maintenance/email";
import { validateCronRequest } from "@/lib/server/cron-auth";

export async function POST(request: Request) {
  const authError = validateCronRequest(request);
  if (authError) return authError;

  const sb = createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: sweepRows, error } = await sb.rpc("run_maintenance_sla_sweep");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let notificationsSent = 0;

  for (const row of sweepRows ?? []) {
    const action = row.action as string;
    const workOrderId = row.work_order_id as string;

    const { data: wo } = await sb
      .from("work_orders")
      .select("id, title, priority, sla_due_at, job_order_number, location_id, assigned_to")
      .eq("id", workOrderId)
      .single();
    if (!wo) continue;

    const teamEmails = await getMaintenanceTeamEmails(sb, wo.location_id);

    if (action === "escalation_reminder") {
      if (teamEmails.length) {
        await sendSlaEscalationEmail(sb, {
          toEmails: teamEmails,
          workOrderId: wo.id,
          jobOrderNumber: wo.job_order_number,
          title: wo.title,
          priority: wo.priority,
          slaDueAt: wo.sla_due_at!,
        });
      }
      await notifyMaintenanceTeamInApp(sb, {
        locationId: wo.location_id,
        title: `SLA reminder: ${wo.job_order_number ?? wo.title}`,
        body: `Due ${new Date(wo.sla_due_at!).toLocaleString()}`,
        actionUrl: "/maintenance",
        sourceType: "work_orders",
        sourceId: wo.id,
      });
      notificationsSent += 1;
    }

    if (action === "breached") {
      await notifyMaintenanceTeamInApp(sb, {
        locationId: wo.location_id,
        title: `SLA BREACHED: ${wo.job_order_number ?? wo.title}`,
        body: wo.title,
        actionUrl: "/maintenance",
        sourceType: "work_orders",
        sourceId: wo.id,
      });
      if (teamEmails.length) {
        await sendSlaEscalationEmail(sb, {
          toEmails: teamEmails,
          workOrderId: wo.id,
          jobOrderNumber: wo.job_order_number,
          title: wo.title,
          priority: wo.priority,
          slaDueAt: wo.sla_due_at!,
        });
      }
      notificationsSent += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: (sweepRows ?? []).length,
    notificationsSent,
  });
}
