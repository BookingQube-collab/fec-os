/**
 * Additive patch: remap demo events onto 13 workstreams + 14-phase tasks.
 * Does not delete EVT-2026-0001 or any other event.
 * Usage: node --env-file=.env.local scripts/patch-event-lifecycle.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function must(error, label) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

const EXTRA_TASKS = [
  { title: "Vendor appointment pack", wbs: "vendors_contractors", phase: "procurement", status: "in_progress", priority: "high", start: "2026-07-20", due: "2026-08-10", pct: 45 },
  { title: "Live-event maintenance cover", wbs: "maintenance", phase: "operations", status: "not_started", priority: "normal", start: "2026-09-08", due: "2026-09-10", pct: 0 },
  { title: "Operations daily stand-up template", wbs: "operations", phase: "operations", status: "planned", priority: "normal", start: "2026-09-01", due: "2026-09-09", pct: 5 },
  { title: "Bump-in installation call sheet", wbs: "operations", phase: "bump_in", status: "not_started", priority: "high", start: "2026-09-01", due: "2026-09-07", pct: 0 },
  { title: "Staffing roster published", wbs: "hr_staffing", phase: "staffing", status: "completed", priority: "normal", start: "2026-08-10", due: "2026-08-18", pct: 100 },
];

async function main() {
  const { data: preProd, error: stageErr } = await admin.from("evt_stages").select("id, code").eq("code", "pre_production").maybeSingle();
  must(stageErr, "pre_production stage");
  if (!preProd) throw new Error("pre_production stage missing. Run npm run db:push first.");

  const { data: events, error: evErr } = await admin
    .from("events")
    .select("id, event_number, name, lessons_learned, pm_staff_id, location_id")
    .is("deleted_at", null);
  must(evErr, "events");

  for (const event of events ?? []) {
    if (event.event_number === "EVT-2026-0001" || /doha mall back to school/i.test(event.name)) {
      const { error } = await admin
        .from("events")
        .update({
          stage_id: preProd.id,
          lessons_learned:
            event.lessons_learned ||
            "Load-in via service corridor 2 needs a dedicated marshal. Inflatable certs must be in-hand 72h before bump-in.",
        })
        .eq("id", event.id);
      must(error, `stage ${event.event_number}`);
    } else if (!event.lessons_learned) {
      await admin
        .from("events")
        .update({
          lessons_learned: "Official close-out notes belong on this event, not in WhatsApp.",
        })
        .eq("id", event.id);
    }

    const { data: wbs } = await admin
      .from("event_wbs_nodes")
      .select("id, code")
      .eq("event_id", event.id)
      .is("deleted_at", null);
    const byCode = Object.fromEntries((wbs ?? []).map((n) => [n.code, n.id]));

    const { data: existingTasks } = await admin
      .from("event_tasks")
      .select("title")
      .eq("event_id", event.id)
      .is("deleted_at", null);
    const have = new Set((existingTasks ?? []).map((t) => t.title));

    for (const row of EXTRA_TASKS) {
      if (have.has(row.title) || !byCode[row.wbs]) continue;
      const { data: number, error: numErr } = await admin.rpc("next_tsk_number");
      must(numErr, "next_tsk_number");
      const { error } = await admin.from("event_tasks").insert({
        event_id: event.id,
        task_number: number,
        wbs_id: byCode[row.wbs],
        title: row.title,
        status: row.status,
        priority: row.priority,
        start_date: row.start,
        due_date: row.due,
        percent_complete: row.pct,
        owner_staff_id: event.pm_staff_id,
        lifecycle_phase: row.phase,
        is_critical: row.priority === "critical" || row.priority === "urgent",
      });
      must(error, `task ${row.title}`);
    }

    console.log(`Patched ${event.event_number} ${event.name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
