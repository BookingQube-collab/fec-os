/**
 * Idempotent walkthrough dummy for Project Management.
 * Does not touch EVT-2026-0001 or EVT-2026-0002.
 *
 *   DUMMY — Mall Activation Showcase
 *
 * Usage: node --env-file=.env.local scripts/seed-event-dummy.mjs
 *    or: npm run seed:event-dummy
 */
import { createClient } from "@supabase/supabase-js";

const EVENT_NAME = "DUMMY — Mall Activation Showcase";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const STANDARD_WORKSTREAMS = [
  ["operations", "Operations", 1],
  ["project_management", "Project management", 2],
  ["creative_branding", "Creative and branding", 3],
  ["production_technical", "Production and technical", 4],
  ["it_pos", "IT and POS", 5],
  ["procurement_finance", "Procurement and finance", 6],
  ["logistics_warehouse", "Logistics and warehouse", 7],
  ["hr_staffing", "HR and staffing", 8],
  ["marketing", "Marketing", 9],
  ["mall_venue", "Mall or venue management", 10],
  ["vendors_contractors", "Vendors and contractors", 11],
  ["health_safety", "Health and safety", 12],
  ["maintenance", "Maintenance", 13],
];

const PHASE_FOR = {
  project_management: "initiation",
  mall_venue: "feasibility",
  creative_branding: "design",
  marketing: "design",
  procurement_finance: "procurement",
  vendors_contractors: "procurement",
  production_technical: "pre_production",
  hr_staffing: "staffing",
  logistics_warehouse: "logistics",
  it_pos: "bump_in",
  health_safety: "testing",
  operations: "operations",
  maintenance: "operations",
};

const READINESS = [
  ["client_brief", "Client brief signed", "scope", "initiation", true, 10],
  ["objectives", "Event objectives agreed", "scope", "initiation", true, 8],
  ["location_dates", "Location and dates locked", "venue", "initiation", true, 8],
  ["capacity", "Capacity and audience size set", "scope", "initiation", true, 6],
  ["scope_approved", "Client-approved scope", "approvals", "initiation", true, 12],
  ["stakeholders", "Stakeholders mapped", "approvals", "initiation", true, 6],
  ["site_survey", "Site survey complete", "venue", "feasibility", true, 8],
  ["measurements", "Site measurements recorded", "venue", "feasibility", true, 6],
  ["utilities", "Utilities survey complete", "venue", "feasibility", true, 6],
  ["site_access", "Access route confirmed", "venue", "feasibility", true, 6],
  ["permits_identified", "Required permits identified", "permits", "feasibility", true, 12],
  ["risk_assessment", "Risk assessment completed", "safety", "feasibility", true, 12],
  ["venue_confirmed", "Venue confirmed", "venue", "feasibility", true, 10],
  ["permits", "Permits in progress or issued", "permits", "feasibility", false, 8],
  ["insurance", "Insurance certificate", "safety", "feasibility", true, 8],
  ["budget_ack", "Estimated budget reviewed with finance", "budget", "budget_approval", true, 8],
  ["quotation_compare", "Quotation comparison complete", "budget", "budget_approval", true, 8],
  ["payment_schedule", "Payment schedule agreed", "budget", "budget_approval", true, 6],
  ["floor_plan", "Layout / floor plan approved", "venue", "design", false, 8],
  ["renders", "Renders issued", "production", "design", true, 6],
  ["branding_pack", "Branding pack approved", "production", "design", false, 6],
  ["power_plan", "Electrical / load plan", "production", "design", false, 8],
  ["equipment_list", "Equipment list locked", "inventory", "design", false, 6],
  ["customer_flow", "Customer flow approved", "venue", "design", false, 6],
  ["critical_prs", "Critical purchase items approved", "procurement", "procurement", false, 12],
  ["pos_issued", "Purchase orders issued", "procurement", "procurement", false, 8],
  ["critical_suppliers", "Critical suppliers appointed", "suppliers", "procurement", false, 12],
  ["delivery_dates", "Delivery dates confirmed", "procurement", "procurement", false, 8],
  ["payment_status", "Supplier payment status reviewed", "budget", "procurement", false, 6],
  ["production_schedule", "Production schedule available", "production", "pre_production", false, 12],
  ["kit_list", "Kit / inventory list drafted", "inventory", "pre_production", false, 8],
  ["manpower_plan", "Manpower requirement completed", "manpower", "staffing", false, 12],
  ["logistics_plan", "Vehicle / logistics plan drafted", "logistics", "logistics", false, 8],
  ["run_of_show", "Run of show draft", "production", "testing", false, 8],
  ["safety", "HSE briefing prepared", "safety", "testing", false, 8],
  ["go_live_approval", "Opening / go-live approval", "approvals", "go_live", false, 12],
  ["comms", "Client comms cadence set", "approvals", "go_live", false, 6],
];

function must(error, label) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function byCode(table, code) {
  const { data, error } = await admin.from(table).select("*").eq("code", code).maybeSingle();
  must(error, table);
  if (!data) throw new Error(`Missing ${table} code=${code}. Run db:push first.`);
  return data;
}

function pickStaff(pool, pattern, used) {
  const found = pool.find((s) => !used.has(s.id) && pattern.test(`${s.job_title ?? ""} ${s.full_name}`));
  if (found) {
    used.add(found.id);
    return found;
  }
  const fallback = pool.find((s) => !used.has(s.id));
  if (fallback) used.add(fallback.id);
  return fallback ?? pool[0];
}

function daysBetween(start, due) {
  return Math.max(1, Math.round((new Date(`${due}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1);
}

async function nextTsk() {
  const { data, error } = await admin.rpc("next_tsk_number");
  must(error, "next_tsk_number");
  return data;
}

async function loadCostLookups() {
  const cats = {};
  for (const code of [
    "manpower",
    "equipment_rental",
    "decoration",
    "transportation",
    "permits",
    "marketing",
    "catering",
    "contingency",
  ]) {
    cats[code] = await byCode("evt_cost_categories", code);
  }
  const subBy = {};
  for (const [cat, code] of [
    ["manpower", "crew"],
    ["manpower", "supervisors"],
    ["equipment_rental", "inflatables"],
    ["equipment_rental", "av_kit"],
    ["decoration", "theming"],
    ["transportation", "freight"],
    ["permits", "civil_defence"],
    ["marketing", "print"],
    ["catering", "meals"],
    ["contingency", "reserve"],
  ]) {
    const { data, error } = await admin
      .from("evt_cost_subcategories")
      .select("id, code")
      .eq("category_id", cats[cat].id)
      .eq("code", code)
      .maybeSingle();
    must(error, `subcategory ${code}`);
    subBy[`${cat}.${code}`] = data?.id ?? null;
  }
  return { cats, subBy };
}

async function clearChildren(eventId) {
  await admin.from("purchase_requisitions").update({ event_id: null, cost_category_id: null }).eq("event_id", eventId);
  const tables = [
    "event_gate_completions",
    "event_readiness_items",
    "event_risks",
    "event_issues",
    "event_documents",
    "event_payables",
    "event_asset_movements",
    "event_client_invoices",
    "event_budget_lines",
    "event_budgets",
    "event_baselines",
    "event_milestones",
    "event_task_dependencies",
    "event_tasks",
    "event_wbs_nodes",
    "event_deliverables",
    "event_scope_versions",
    "event_team_members",
  ];
  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq("event_id", eventId);
    must(error, `clear ${table}`);
  }
}

async function upsertEventByName(name, payload) {
  const { data: existing, error: existErr } = await admin
    .from("events")
    .select("id, event_number")
    .eq("name", name)
    .is("deleted_at", null)
    .maybeSingle();
  must(existErr, "events lookup");

  if (existing?.id) {
    await clearChildren(existing.id);
    const { error } = await admin.from("events").update(payload).eq("id", existing.id);
    must(error, `update ${name}`);
    console.log(`Updating ${existing.event_number}`);
    return { eventId: existing.id, eventNumber: existing.event_number };
  }

  const { data: number, error: numErr } = await admin.rpc("next_evt_number");
  must(numErr, "next_evt_number");
  const { data: created, error } = await admin
    .from("events")
    .insert({ event_number: number, name, event_name: name, ...payload })
    .select("id")
    .single();
  must(error, `insert ${name}`);
  console.log(`Created ${number}`);
  return { eventId: created.id, eventNumber: number };
}

async function main() {
  const [{ data: locations, error: locErr }, { data: staff, error: staffErr }, { data: depts, error: deptErr }] =
    await Promise.all([
      admin.from("locations").select("id, code, name, region").eq("status", "active"),
      admin.from("staff").select("id, full_name, location_id, job_title, user_id").is("deleted_at", null).eq("status", "active"),
      admin.from("master_departments").select("id, name, code").eq("active", true),
    ]);
  must(locErr, "locations");
  must(staffErr, "staff");
  must(deptErr, "departments");

  const location =
    (locations ?? []).find((l) => l.code === "CB-VM") ??
    (locations ?? []).find((l) => /vendome/i.test(`${l.name} ${l.region}`)) ??
    (locations ?? []).find((l) => l.code !== "UA-DM" && l.code !== "INF-CC") ??
    (locations ?? [])[0];
  if (!location) throw new Error("No active location found. Run seed:locations first.");

  const siteStaff = (staff ?? []).filter((s) => s.location_id === location.id);
  const pool = siteStaff.length ? siteStaff : (staff ?? []);
  if (!pool.length) throw new Error("No staff found. Seed staff before events.");

  const used = new Set();
  const pm = pickStaff(pool, /venue supervisor|branch manager/i, used);
  const director = pickStaff(pool, /branch manager|shift supervisor/i, used);
  const opsLead = pickStaff(pool, /shift supervisor|supervisor/i, used);
  const creative = pickStaff(pool, /host|cashier|operator|attraction/i, used);
  const crew = [opsLead, creative].filter(Boolean);

  const deptByCode = Object.fromEntries((depts ?? []).map((d) => [d.code, d.id]));
  const opsDept = deptByCode.OPS ?? (depts ?? [])[0]?.id ?? null;
  const maintDept = deptByCode.MAINT ?? opsDept;
  const cashierDept = deptByCode.CASHIER ?? opsDept;

  const mallActivation = await byCode("evt_event_types", "mall_activation");
  const seasonalClass = await byCode("evt_classifications", "seasonal_event");
  const designStage = await byCode("evt_stages", "design");
  const { cats, subBy } = await loadCostLookups();

  const { eventId, eventNumber } = await upsertEventByName(EVENT_NAME, {
    client_name: "Vendome Mall",
    event_name: EVENT_NAME,
    client_contact: "Mall Marketing — activations desk",
    business_unit: "Events & Activations",
    venue_name: "Vendome Mall atrium + Crayons & Bricks frontage",
    location_id: location.id,
    event_type_id: mallActivation.id,
    classification_id: seasonalClass.id,
    department_id: opsDept,
    stage_id: designStage.id,
    status: "active",
    priority: "high",
    country: "Qatar",
    city: location.region ?? "Doha",
    inquiry_date: "2026-06-02",
    contract_date: "2026-07-14",
    planning_start: "2026-07-16",
    venue_access: "2026-10-13",
    setup_start: "2026-10-14",
    setup_end: "2026-10-15",
    rehearsal_date: "2026-10-15",
    client_inspection_date: "2026-10-15",
    event_start: "2026-10-16",
    event_end: "2026-10-19",
    dismantle_start: "2026-10-20",
    dismantle_end: "2026-10-20",
    dismantle_date: "2026-10-20",
    handover_date: "2026-10-20",
    financial_close_target: "2026-11-15",
    final_closure_date: "2026-11-30",
    pm_staff_id: pm.id,
    director_staff_id: director?.id ?? null,
    currency: "QAR",
    contracted_value: 98000,
    description:
      "Walkthrough dummy: four-day mall activation at Vendome. Design is live, procurement is opening, go-live is not approved. Safe to re-seed.",
    notes: "seed:dummy-mall-activation-showcase",
    lessons_learned: "Dummy project — use this record for PM walkthroughs. Do not treat as a live client job.",
    go_live_approved: false,
    health_rag: "amber",
    health_score: 62,
    readiness_pct: 48,
  });

  const team = [
    { staff_id: pm.id, role_label: "Project Manager", is_pm: true },
    ...(director && director.id !== pm.id
      ? [{ staff_id: director.id, role_label: "Project Director", is_pm: false }]
      : []),
    ...crew.map((s, i) => ({
      staff_id: s.id,
      role_label: ["Operations lead", "Creative lead"][i] ?? "Team",
      is_pm: false,
    })),
  ];
  const { error: teamErr } = await admin.from("event_team_members").insert(
    team.map((row) => ({ event_id: eventId, ...row })),
  );
  must(teamErr, "team");

  const { error: scopeErr } = await admin.from("event_scope_versions").insert({
    event_id: eventId,
    version_no: 1,
    title: "Signed dummy scope",
    is_baseline: true,
    sections: [
      {
        key: "inclusions",
        title: "Inclusions",
        body: "Thu–Sun atrium activation, brand wall, two inflatable islands, weekend host, extra POS, overnight security 14–20 Oct.",
      },
      {
        key: "exclusions",
        title: "Exclusions",
        body: "Mall paid media, celebrity hosts, food-court takeover.",
      },
      {
        key: "assumptions",
        title: "Assumptions",
        body: "Vendome provides atrium power at columns V3–V6. Load-in after 22:00 via service corridor A.",
      },
      {
        key: "success",
        title: "Success criteria",
        body: "Walkthrough-ready PM record: mid-lifecycle tracker, mixed workstreams, overdue + blocked tasks, non-zero finance, go-live pending.",
      },
    ],
  });
  must(scopeErr, "scope");

  const { error: delivErr } = await admin.from("event_deliverables").insert(
    [
      { title: "Atrium layout + fire lanes", status: "in_progress", due_date: "2026-08-20", sort_order: 1 },
      { title: "Brand wall drawings", status: "done", due_date: "2026-08-08", sort_order: 2 },
      { title: "Opening run of show", status: "pending", due_date: "2026-10-12", sort_order: 3 },
    ].map((row) => ({ event_id: eventId, owner_staff_id: pm.id, ...row })),
  );
  must(delivErr, "deliverables");

  const { data: phases, error: phaseErr } = await admin
    .from("event_wbs_nodes")
    .insert(
      STANDARD_WORKSTREAMS.map(([code, title, sort_order]) => ({
        event_id: eventId,
        owner_staff_id: pm.id,
        code,
        title,
        node_type: "phase",
        sort_order,
        start_date: sort_order <= 6 ? "2026-07-16" : sort_order <= 11 ? "2026-09-01" : "2026-10-14",
        due_date: sort_order <= 6 ? "2026-09-15" : sort_order <= 11 ? "2026-10-13" : "2026-10-20",
      })),
    )
    .select("id, code");
  must(phaseErr, "wbs workstreams");
  const wbsByCode = Object.fromEntries((phases ?? []).map((row) => [row.code, row.id]));

  function deptFor(wbs) {
    if (wbs === "it_pos") return cashierDept;
    if (["health_safety", "maintenance"].includes(wbs)) return maintDept;
    return opsDept;
  }

  const assigneeFor = (i) => crew[i % crew.length] ?? pm;

  // Mixed department status: blocked (HSE), delayed (mall overdue), on_track (design/procurement), not_started (later streams).
  const taskDefs = [
    { title: "Kickoff pack issued", status: "completed", priority: "normal", start: "2026-07-16", due: "2026-07-22", wbs: "project_management", pct: 100, phase: "initiation" },
    { title: "Activation contract countersigned", status: "completed", priority: "high", start: "2026-07-08", due: "2026-07-14", wbs: "project_management", pct: 100, phase: "initiation" },
    { title: "Scope baseline saved", status: "completed", priority: "normal", start: "2026-07-18", due: "2026-07-25", wbs: "project_management", pct: 100, phase: "initiation" },
    { title: "Atrium survey + load-in path", status: "completed", priority: "normal", start: "2026-07-20", due: "2026-07-30", wbs: "mall_venue", pct: 100, phase: "feasibility" },
    { title: "Mall ops stamp on floor plan", status: "in_progress", priority: "urgent", start: "2026-08-01", due: "2026-08-12", wbs: "mall_venue", pct: 40, phase: "feasibility" },
    { title: "Budget v1 approved by finance", status: "completed", priority: "high", start: "2026-07-20", due: "2026-07-28", wbs: "procurement_finance", pct: 100, phase: "budget_approval" },
    { title: "Brand wall drawings issued", status: "completed", priority: "normal", start: "2026-07-22", due: "2026-08-08", wbs: "creative_branding", pct: 100, phase: "design" },
    { title: "Atrium render pack v2", status: "in_progress", priority: "high", start: "2026-08-04", due: "2026-08-28", wbs: "creative_branding", pct: 55, phase: "design" },
    { title: "Client brand palette locked", status: "blocked", priority: "critical", start: "2026-08-06", due: "2026-08-25", wbs: "creative_branding", pct: 20, phase: "design" },
    { title: "Mall social teaser copy", status: "in_progress", priority: "normal", start: "2026-08-10", due: "2026-09-05", wbs: "marketing", pct: 35, phase: "design" },
    { title: "Critical PRs released", status: "in_progress", priority: "high", start: "2026-08-04", due: "2026-08-30", wbs: "procurement_finance", pct: 30, phase: "procurement" },
    { title: "Vendor appointment pack", status: "planned", priority: "high", start: "2026-08-18", due: "2026-09-08", wbs: "vendors_contractors", pct: 10, phase: "procurement" },
    { title: "Inflatable island fabrication hold", status: "planned", priority: "normal", start: "2026-09-01", due: "2026-09-25", wbs: "production_technical", pct: 5, phase: "pre_production" },
    { title: "Host roster draft", status: "not_started", priority: "normal", start: "2026-09-15", due: "2026-10-05", wbs: "hr_staffing", pct: 0, phase: "staffing" },
    { title: "Warehouse pull list", status: "not_started", priority: "normal", start: "2026-09-20", due: "2026-10-08", wbs: "logistics_warehouse", pct: 0, phase: "logistics" },
    { title: "Extra POS + Wi-Fi circuit", status: "planned", priority: "high", start: "2026-09-22", due: "2026-10-10", wbs: "it_pos", pct: 5, phase: "bump_in" },
    { title: "HSE atrium briefing pack", status: "blocked", priority: "critical", start: "2026-08-10", due: "2026-09-01", wbs: "health_safety", pct: 15, phase: "testing" },
    { title: "Opening-day stand-up template", status: "not_started", priority: "normal", start: "2026-10-08", due: "2026-10-15", wbs: "operations", pct: 0, phase: "operations" },
    { title: "Live-event maintenance cover", status: "not_started", priority: "normal", start: "2026-10-10", due: "2026-10-15", wbs: "maintenance", pct: 0, phase: "operations" },
    { title: "Go-live checklist signed", status: "not_started", priority: "critical", start: "2026-10-14", due: "2026-10-15", wbs: "project_management", pct: 0, phase: "go_live" },
  ];

  const taskRows = [];
  for (const [i, row] of taskDefs.entries()) {
    const assignee = assigneeFor(i);
    taskRows.push({
      event_id: eventId,
      task_number: await nextTsk(),
      wbs_id: wbsByCode[row.wbs] ?? null,
      title: row.title,
      status: row.status,
      priority: row.priority,
      start_date: row.start,
      due_date: row.due,
      duration_days: daysBetween(row.start, row.due),
      owner_staff_id: pm.id,
      assignee_staff_id: assignee.id,
      department_id: deptFor(row.wbs),
      lifecycle_phase: row.phase ?? PHASE_FOR[row.wbs] ?? null,
      percent_complete: row.pct,
      is_critical: row.priority === "urgent" || row.priority === "critical",
      is_milestone: row.title === "Scope baseline saved",
      estimated_hours: 8,
      actual_hours: row.pct === 100 ? 8 : row.pct > 0 ? 3 : 0,
      estimated_cost: 800,
      actual_cost: row.pct === 100 ? 750 : row.pct > 0 ? 250 : 0,
      cost_impact: 800,
      approval_status: row.priority === "critical" || row.priority === "urgent" ? "pending" : "not_required",
      delay_reason:
        row.status === "blocked"
          ? "Waiting on mall marketing brand-palette sign-off."
          : row.title === "Mall ops stamp on floor plan"
            ? "Mall ops asked for a revised fire-lane drawing."
            : null,
      escalation_level: row.priority === "critical" ? "pm" : row.priority === "urgent" ? "director" : "none",
      completed_at: row.status === "completed" ? `${row.due}T12:00:00Z` : null,
    });
  }

  const { data: tasks, error: taskErr } = await admin.from("event_tasks").insert(taskRows).select("id, title");
  must(taskErr, "tasks");
  const taskByTitle = Object.fromEntries((tasks ?? []).map((row) => [row.title, row.id]));

  if (opsLead && taskByTitle["HSE atrium briefing pack"]) {
    const { error: supErr } = await admin.from("event_task_supporters").insert({
      task_id: taskByTitle["HSE atrium briefing pack"],
      staff_id: opsLead.id,
    });
    must(supErr, "task supporters");
  }

  const { error: depErr } = await admin.from("event_task_dependencies").insert(
    [
      ["Atrium survey + load-in path", "Mall ops stamp on floor plan", "FS", 0],
      ["Brand wall drawings issued", "Atrium render pack v2", "FS", 0],
      ["Client brand palette locked", "Critical PRs released", "FS", 0],
    ]
      .filter(([pre, suc]) => taskByTitle[pre] && taskByTitle[suc])
      .map(([pre, suc, dep_type, lag_days]) => ({
        event_id: eventId,
        predecessor_id: taskByTitle[pre],
        successor_id: taskByTitle[suc],
        dep_type,
        lag_days,
      })),
  );
  must(depErr, "dependencies");

  const { error: mileErr } = await admin.from("event_milestones").insert(
    [
      { title: "Contract signed", due_date: "2026-07-14", status: "achieved", is_critical: true, achieved_at: "2026-07-14T10:00:00Z", wbs_id: wbsByCode.project_management, task_id: taskByTitle["Activation contract countersigned"] },
      { title: "Scope baseline locked", due_date: "2026-07-25", status: "achieved", is_critical: true, achieved_at: "2026-07-25T10:00:00Z", wbs_id: wbsByCode.project_management, task_id: taskByTitle["Scope baseline saved"] },
      { title: "Mall ops floor-plan stamp", due_date: "2026-08-12", status: "pending", is_critical: true, wbs_id: wbsByCode.mall_venue, task_id: taskByTitle["Mall ops stamp on floor plan"] },
      { title: "Atrium live 10:00", due_date: "2026-10-16", status: "pending", is_critical: true, wbs_id: wbsByCode.operations },
    ].map((row) => ({ event_id: eventId, owner_staff_id: pm.id, ...row })),
  );
  must(mileErr, "milestones");

  const { data: budget, error: budErr } = await admin
    .from("event_budgets")
    .insert({
      event_id: eventId,
      currency: "QAR",
      status: "approved",
      notes: "Dummy walkthrough budget — contract 98k",
      contract_value: 98000,
      additional_revenue: 0,
      approved_change_orders: 0,
      discounts: 0,
      taxes: 0,
      line_alert_threshold_pct: 0,
      contingency_usage_threshold_pct: 80,
    })
    .select("id")
    .single();
  must(budErr, "budget");

  const lineDefs = [
    ["manpower", "crew", "Activation crew + hosts", 18000, 0, 4000, 2000, 18000, 1],
    ["manpower", "supervisors", "Duty supervisors", 6000, 0, 2000, 1000, 6000, 2],
    ["equipment_rental", "inflatables", "Inflatable islands", 16000, 1000, 8000, 4000, 17000, 3],
    ["equipment_rental", "av_kit", "Atrium lighting hire", 8000, 0, 3000, 1500, 8000, 4],
    ["decoration", "theming", "Brand wall + atrium theming", 14000, 0, 6000, 3000, 14000, 5],
    ["transportation", "freight", "Warehouse → Vendome trucks", 4000, 0, 0, 0, 4000, 6],
    ["permits", "civil_defence", "Mall license / Civil Defence", 4000, 0, 2000, 1000, 4000, 7],
    ["marketing", "print", "Print + mall social", 8000, 0, 2000, 1000, 8000, 8],
    ["catering", "meals", "Crew meals (4 days)", 4000, 0, 0, 0, 4000, 9],
    ["contingency", "reserve", "Contingency reserve", 6000, 0, 0, 0, 5000, 10],
  ];
  const { error: lineErr } = await admin.from("event_budget_lines").insert(
    lineDefs.map(([cat, sub, title, original, changes, committed, actual, forecast, sort]) => ({
      budget_id: budget.id,
      event_id: eventId,
      category_id: cats[cat].id,
      subcategory_id: subBy[`${cat}.${sub}`],
      title,
      original_amount: original,
      approved_changes: changes,
      revised_amount: original + changes,
      committed_amount: committed,
      actual_amount: actual,
      forecast_amount: forecast,
      sort_order: sort,
    })),
  );
  must(lineErr, "budget lines");

  const { error: invErr } = await admin.from("event_client_invoices").insert([
    {
      event_id: eventId,
      invoice_number: "INV-DUM-0001",
      title: "Contract 50% on award",
      status: "partial",
      amount: 49000,
      currency: "QAR",
      fx_rate: 1,
      base_amount: 49000,
      paid_amount: 25000,
      issue_date: "2026-07-20",
      due_date: "2026-08-20",
    },
  ]);
  must(invErr, "invoices");

  const { error: payErr } = await admin.from("event_payables").insert([
    { event_id: eventId, kind: "po", title: "Brand wall fabrication PO", reference: "PO-DUM-001", vendor_name: "Atelier Doha", amount: 14000, currency: "QAR", status: "pending", due_date: "2026-09-01" },
  ]);
  must(payErr, "payables");

  const { error: riskErr } = await admin.from("event_risks").insert([
    {
      event_id: eventId,
      title: "Mall marketing still holding the brand palette",
      severity: "high",
      status: "open",
      due_date: "2026-08-25",
    },
  ]);
  must(riskErr, "risks");

  const { error: readyErr } = await admin.from("event_readiness_items").insert(
    READINESS.map(([code, title, category, phase_code, done, weight]) => ({
      event_id: eventId,
      code,
      title,
      category,
      phase_code,
      is_required: true,
      is_complete: done,
      weight,
      completed_at: done ? "2026-07-28T10:00:00Z" : null,
    })),
  );
  must(readyErr, "readiness");

  const { error: issueErr } = await admin.from("event_issues").insert([
    {
      event_id: eventId,
      title: "Mall ops stamp outstanding on atrium fire-lane drawing",
      description: "Blocks floor-plan readiness. Escalated to Vendome operations.",
      severity: "high",
      status: "open",
      is_snag: false,
      is_safety: false,
      owner_staff_id: pm.id,
      due_date: "2026-08-12",
      wbs_id: wbsByCode.mall_venue,
    },
    {
      event_id: eventId,
      title: "Client brand palette not released",
      description: "Print and brand-wall colourway are blocked until mall marketing signs the palette.",
      severity: "medium",
      status: "in_progress",
      is_snag: false,
      is_safety: false,
      owner_staff_id: (creative ?? pm).id,
      due_date: "2026-08-25",
      wbs_id: wbsByCode.creative_branding,
    },
  ]);
  must(issueErr, "issues");

  const { error: docErr } = await admin.from("event_documents").insert([
    {
      event_id: eventId,
      title: "Vendome activation contract",
      doc_type: "contract",
      file_path: `events/${eventNumber}/vendome-activation-contract.pdf`,
    },
  ]);
  must(docErr, "documents");

  const { error: assetErr } = await admin.from("event_asset_movements").insert([
    { event_id: eventId, item_name: "Handheld POS kit", qty: 2, status: "planned", due_date: "2026-10-14" },
  ]);
  must(assetErr, "assets");

  const { error: auditErr } = await admin.from("event_audit_logs").insert({
    event_id: eventId,
    action: "seed",
    entity_type: "event",
    entity_id: eventId,
    location_id: location.id,
    after: { event_number: eventNumber, name: EVENT_NAME },
    metadata: { script: "seed-event-dummy" },
  });
  must(auditErr, "audit");

  console.log("");
  console.log(`${eventNumber}  ${EVENT_NAME}`);
  console.log(`  id       ${eventId}`);
  console.log(`  pm       ${pm.full_name}`);
  console.log(`  venue    ${location.name} (${location.code}) · Vendome Mall atrium + Crayons & Bricks frontage`);
  console.log(`  stage    Design  |  go-live not approved`);
  console.log(`  dates    2026-10-16 → 2026-10-19  (setup 14–15 Oct)`);
  console.log(`  /events/${eventId}`);
  console.log(`  /events/${eventId}/plan`);
  console.log(`  /events/${eventId}/budget`);
  console.log(`  /events/reports   filter Event → ${eventNumber} · ${EVENT_NAME}   dates 2026-10-16 to 2026-10-19`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
