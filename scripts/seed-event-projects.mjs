/**
 * Idempotent demo events for /events:
 *   1. Doha Mall Back to School Festival (EVT-2026-0001 if already numbered)
 *   2. Inflatapark Summer Night Market (second lived-in project)
 * Usage: node --env-file=.env.local scripts/seed-event-projects.mjs
 *    or: npm run seed:events
 */
import { createClient } from "@supabase/supabase-js";

const EVENT_NAME = "Doha Mall Back to School Festival";
const NIGHT_MARKET_NAME = "Inflatapark Summer Night Market";

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

async function byCode(table, code) {
  const { data, error } = await admin.from(table).select("*").eq("code", code).maybeSingle();
  must(error, table);
  if (!data) throw new Error(`Missing ${table} code=${code}. Run db:push first.`);
  return data;
}

async function clearChildren(eventId) {
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

const WBS_ALIASES = {
  project_approvals: "project_management",
  venue_permits: "mall_venue",
  design_branding: "creative_branding",
  production_fabrication: "production_technical",
  games_equipment: "production_technical",
  logistics_assets: "logistics_warehouse",
  staffing_training: "hr_staffing",
  marketing_comms: "marketing",
  safety_quality: "health_safety",
  live_ops: "operations",
  bump_in: "operations",
  bump_out: "operations",
  critical_controls: "health_safety",
};

const PHASE_FOR = {
  project_management: "initiation",
  project_approvals: "initiation",
  "1": "initiation",
  mall_venue: "feasibility",
  venue_permits: "feasibility",
  "1.1": "feasibility",
  creative_branding: "design",
  design_branding: "design",
  marketing: "design",
  marketing_comms: "design",
  "1.2": "design",
  "3.1": "design",
  procurement_finance: "procurement",
  vendors_contractors: "procurement",
  production_technical: "pre_production",
  production_fabrication: "pre_production",
  games_equipment: "pre_production",
  "1.3": "pre_production",
  "1.3.1": "pre_production",
  "1.3.1.1": "pre_production",
  "7.1": "pre_production",
  "7.1.1": "pre_production",
  it_pos: "bump_in",
  logistics_warehouse: "logistics",
  logistics_assets: "logistics",
  hr_staffing: "staffing",
  staffing_training: "staffing",
  health_safety: "testing",
  safety_quality: "testing",
  critical_controls: "go_live",
  operations: "operations",
  live_ops: "operations",
  maintenance: "operations",
  bump_in: "bump_in",
  bump_out: "bump_out",
};

function aliasWbs(map) {
  for (const [from, to] of Object.entries(WBS_ALIASES)) {
    if (!map[from] && map[to]) map[from] = map[to];
  }
  return map;
}

async function seedNightMarket() {
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
    (locations ?? []).find((l) => l.code === "INF-CC") ??
    (locations ?? []).find((l) => /inflata/i.test(`${l.name} ${l.region}`)) ??
    (locations ?? [])[0];
  if (!location) throw new Error("No active location found. Run seed:locations first.");

  const siteStaff = (staff ?? []).filter((s) => s.location_id === location.id);
  const pool = siteStaff.length ? siteStaff : (staff ?? []);
  if (!pool.length) throw new Error("No staff found. Seed staff before events.");

  const used = new Set();
  const pm = pickStaff(pool, /venue supervisor|branch manager/i, used);
  const director = pickStaff(pool, /branch manager|shift supervisor/i, used);
  const opsLead = pickStaff(pool, /shift supervisor|supervisor/i, used);
  const siteLead = pickStaff(pool, /attraction|operator|floor/i, used);
  const host = pickStaff(pool, /party host|host|cashier/i, used);
  const crew = [opsLead, siteLead, host].filter(Boolean);

  const deptByCode = Object.fromEntries((depts ?? []).map((d) => [d.code, d.id]));
  const opsDept = deptByCode.OPS ?? (depts ?? [])[0]?.id ?? null;
  const inflataDept = deptByCode.INFLATA ?? deptByCode.INFLATA2 ?? opsDept;
  const maintDept = deptByCode.MAINT ?? opsDept;
  const cashierDept = deptByCode.CASHIER ?? opsDept;

  const mallActivation = await byCode("evt_event_types", "mall_activation");
  const seasonalClass = await byCode("evt_classifications", "seasonal_event");
  const preProd = await byCode("evt_stages", "pre_production");
  const { cats, subBy } = await loadCostLookups();

  const { eventId, eventNumber } = await upsertEventByName(NIGHT_MARKET_NAME, {
    client_name: "City Center Doha",
    event_name: NIGHT_MARKET_NAME,
    client_contact: "Mall Activations — City Center marketing",
    business_unit: "Events & Activations",
    venue_name: "Inflatapark frontage + City Center L1 courtyard",
    location_id: location.id,
    event_type_id: mallActivation.id,
    classification_id: seasonalClass.id,
    department_id: opsDept,
    stage_id: preProd.id,
    status: "active",
    priority: "high",
    country: "Qatar",
    city: location.region ?? "Doha",
    inquiry_date: "2026-04-08",
    contract_date: "2026-05-18",
    planning_start: "2026-05-20",
    venue_access: "2026-08-26",
    setup_start: "2026-08-26",
    setup_end: "2026-08-27",
    rehearsal_date: "2026-08-27",
    client_inspection_date: "2026-08-27",
    event_start: "2026-08-28",
    event_end: "2026-08-30",
    dismantle_start: "2026-08-31",
    dismantle_end: "2026-08-31",
    dismantle_date: "2026-08-31",
    handover_date: "2026-08-31",
    financial_close_target: "2026-09-25",
    final_closure_date: "2026-10-10",
    pm_staff_id: pm.id,
    director_staff_id: director?.id ?? null,
    currency: "QAR",
    contracted_value: 165000,
    description:
      "Three-night summer souq at Inflatapark / City Center: glow inflatables after dark, street-food stalls, weekend DJ, and mall courtyard crossover. Load-in after mall close on 26 Aug.",
    notes: "seed:inflatapark-summer-night-market-2026",
    lessons_learned: "Night-trading NOC needs a 10-day buffer. Crowd density sign-off cannot sit in a WhatsApp thread.",
    go_live_approved: false,
  });

  const team = [
    { staff_id: pm.id, role_label: "Project Manager", is_pm: true },
    ...(director && director.id !== pm.id
      ? [{ staff_id: director.id, role_label: "Project Director", is_pm: false }]
      : []),
    ...crew.map((s, i) => ({
      staff_id: s.id,
      role_label: ["Operations lead", "Site supervisor", "Guest experience"][i] ?? "Team",
      is_pm: false,
    })),
  ];
  const { error: teamErr } = await admin.from("event_team_members").insert(
    team.map((row) => ({ event_id: eventId, ...row })),
  );
  must(teamErr, "night market team");

  const { error: scopeErr } = await admin.from("event_scope_versions").insert({
    event_id: eventId,
    version_no: 1,
    title: "Signed night-market scope",
    is_baseline: true,
    sections: [
      {
        key: "inclusions",
        title: "Inclusions",
        body: "Thu–Sat 18:00–23:30 courtyard + Inflatapark frontage, 8 market stalls, night-glow inflatable lane, DJ Fri/Sat, extra POS, overnight security 26–31 Aug.",
      },
      {
        key: "exclusions",
        title: "Exclusions",
        body: "Mall paid media, alcohol, celebrity hosts, indoor food-court takeover.",
      },
      {
        key: "assumptions",
        title: "Assumptions",
        body: "City Center provides courtyard power at columns C4–C8 and loading-bay access after 22:00. Civil Defence night-trading NOC by 25 Aug.",
      },
      {
        key: "success",
        title: "Success criteria",
        body: "Zero safety incidents, courtyard live by 28 Aug 18:00, nightly photo pack to mall marketing, POS uptime above 99%.",
      },
    ],
  });
  must(scopeErr, "night market scope");

  const { error: delivErr } = await admin.from("event_deliverables").insert(
    [
      { title: "Approved courtyard + fire-lane plan", status: "done", due_date: "2026-07-15", sort_order: 1 },
      { title: "Night-glow inflatables certified", status: "in_progress", due_date: "2026-08-25", sort_order: 2 },
      { title: "Fri/Sat DJ run of show", status: "done", due_date: "2026-08-10", sort_order: 3 },
      { title: "Nightly recap pack to mall marketing", status: "pending", due_date: "2026-08-28", sort_order: 4 },
      { title: "Stall vendor kit-out complete", status: "in_progress", due_date: "2026-08-26", sort_order: 5 },
    ].map((row) => ({ event_id: eventId, owner_staff_id: pm.id, ...row })),
  );
  must(delivErr, "night market deliverables");

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
        start_date: sort_order <= 11 ? "2026-05-20" : sort_order <= 13 ? "2026-08-26" : "2026-08-31",
        due_date: sort_order <= 11 ? "2026-08-25" : sort_order <= 13 ? "2026-08-30" : "2026-08-31",
      })),
    )
    .select("id, code");
  must(phaseErr, "night market wbs phases");
  const wbsByCode = aliasWbs(Object.fromEntries((phases ?? []).map((row) => [row.code, row.id])));

  const { data: glowNode, error: glowErr } = await admin
    .from("event_wbs_nodes")
    .insert({
      event_id: eventId,
      parent_id: wbsByCode.production_technical,
      node_type: "task",
      code: "7.1",
      title: "Night-glow inflatable lane",
      sort_order: 1,
      owner_staff_id: (siteLead ?? pm).id,
      budget_amount: 22000,
      start_date: "2026-06-01",
      due_date: "2026-08-25",
      documents: [{ title: "Glow kit quote", url: "https://example.com/glow-lane-quote" }],
    })
    .select("id, code")
    .single();
  must(glowErr, "night market wbs task");
  wbsByCode[glowNode.code] = glowNode.id;

  const { data: certNode, error: certErr } = await admin
    .from("event_wbs_nodes")
    .insert({
      event_id: eventId,
      parent_id: glowNode.id,
      node_type: "subtask",
      code: "7.1.1",
      title: "Blower + LED certification pack",
      sort_order: 1,
      owner_staff_id: (siteLead ?? pm).id,
      start_date: "2026-08-04",
      due_date: "2026-08-24",
    })
    .select("id, code")
    .single();
  must(certErr, "night market wbs subtask");
  wbsByCode[certNode.code] = certNode.id;

  const { data: souqNode, error: souqErr } = await admin
    .from("event_wbs_nodes")
    .insert({
      event_id: eventId,
      parent_id: wbsByCode.creative_branding,
      node_type: "task",
      code: "3.1",
      title: "Souq alley graphic package",
      sort_order: 1,
      owner_staff_id: (host ?? pm).id,
      budget_amount: 14000,
      start_date: "2026-06-10",
      due_date: "2026-08-15",
    })
    .select("id, code")
    .single();
  must(souqErr, "night market design wbs");
  wbsByCode[souqNode.code] = souqNode.id;

  function deptFor(wbs) {
    if (wbs === "it_pos") return cashierDept;
    if (["games_equipment", "7.1", "7.1.1", "production_fabrication", "production_technical"].includes(wbs)) return inflataDept;
    if (["safety_quality", "health_safety", "bump_in", "bump_out", "maintenance"].includes(wbs)) return maintDept;
    return opsDept;
  }

  const assigneeFor = (i) => crew[i % crew.length] ?? pm;

  const taskDefs = [
    { title: "City Center kickoff pack issued", status: "completed", priority: "normal", start: "2026-05-20", due: "2026-05-26", wbs: "project_approvals", pct: 100 },
    { title: "Night-market contract countersigned", status: "completed", priority: "high", start: "2026-05-12", due: "2026-05-18", wbs: "project_approvals", pct: 100 },
    { title: "Budget v1 approved by finance", status: "completed", priority: "high", start: "2026-05-19", due: "2026-05-28", wbs: "project_approvals", pct: 100 },
    { title: "Scope baseline saved", status: "completed", priority: "normal", start: "2026-05-26", due: "2026-06-02", wbs: "project_approvals", pct: 100 },
    { title: "Courtyard survey + load-in path", status: "completed", priority: "normal", start: "2026-06-01", due: "2026-06-12", wbs: "venue_permits", pct: 100 },
    { title: "Common-area night-trading NOC", status: "in_progress", priority: "urgent", start: "2026-07-20", due: "2026-08-18", wbs: "venue_permits", pct: 45 },
    { title: "Fire-lane plan with mall ops", status: "in_progress", priority: "high", start: "2026-07-22", due: "2026-08-20", wbs: "venue_permits", pct: 60 },
    { title: "Souq alley drawings issued", status: "completed", priority: "normal", start: "2026-06-10", due: "2026-07-08", wbs: "3.1", pct: 100 },
    { title: "Lantern and wayfinding print", status: "in_progress", priority: "normal", start: "2026-07-15", due: "2026-08-22", wbs: "design_branding", pct: 70 },
    { title: "Critical PRs released", status: "in_progress", priority: "high", start: "2026-06-02", due: "2026-07-20", wbs: "procurement_finance", pct: 65 },
    { title: "Vendor deposits cleared", status: "completed", priority: "high", start: "2026-06-01", due: "2026-06-15", wbs: "procurement_finance", pct: 100 },
    { title: "Market stall frames fabricated", status: "in_progress", priority: "normal", start: "2026-07-01", due: "2026-08-20", wbs: "production_fabrication", pct: 55 },
    { title: "Soft-goods sew-up (bunting + banners)", status: "planned", priority: "normal", start: "2026-08-10", due: "2026-08-24", wbs: "production_fabrication", pct: 20 },
    { title: "Extra POS + 4G failover confirmed", status: "in_progress", priority: "high", start: "2026-07-08", due: "2026-08-21", wbs: "it_pos", pct: 50 },
    { title: "Night-glow inflatable lane booked", status: "completed", priority: "high", start: "2026-06-01", due: "2026-06-20", wbs: "7.1", pct: 100 },
    { title: "Blower + LED certs received", status: "planned", priority: "high", start: "2026-08-04", due: "2026-08-24", wbs: "7.1.1", pct: 15 },
    { title: "Warehouse pull list locked", status: "in_progress", priority: "normal", start: "2026-08-08", due: "2026-08-22", wbs: "logistics_assets", pct: 40 },
    { title: "Overnight truck to City Center", status: "planned", priority: "normal", start: "2026-08-24", due: "2026-08-26", wbs: "logistics_assets", pct: 10 },
    { title: "Night-shift roster published", status: "completed", priority: "normal", start: "2026-07-20", due: "2026-08-08", wbs: "staffing_training", pct: 100 },
    { title: "Host briefing and guest script", status: "not_started", priority: "normal", start: "2026-08-24", due: "2026-08-27", wbs: "staffing_training", pct: 0 },
    { title: "Mall social assets delivered", status: "completed", priority: "normal", start: "2026-07-01", due: "2026-07-25", wbs: "marketing_comms", pct: 100 },
    { title: "Fri/Sat DJ hold confirmed", status: "completed", priority: "normal", start: "2026-06-15", due: "2026-07-10", wbs: "marketing_comms", pct: 100 },
    { title: "HSE night-work briefing pack", status: "in_progress", priority: "critical", start: "2026-08-01", due: "2026-08-25", wbs: "safety_quality", pct: 40 },
    { title: "Crowd density plan for courtyard", status: "blocked", priority: "critical", start: "2026-08-05", due: "2026-08-20", wbs: "safety_quality", pct: 25 },
    { title: "Thursday 22:00 load-in call sheet", status: "not_started", priority: "high", start: "2026-08-24", due: "2026-08-26", wbs: "bump_in", pct: 0 },
    { title: "Fri/Sat opening run-of-show", status: "not_started", priority: "high", start: "2026-08-26", due: "2026-08-28", wbs: "live_ops", pct: 0 },
    { title: "Monday 01:00 strike crew confirmed", status: "not_started", priority: "normal", start: "2026-08-27", due: "2026-08-30", wbs: "bump_out", pct: 0 },
    { title: "Go-live checklist signed", status: "not_started", priority: "critical", start: "2026-08-26", due: "2026-08-27", wbs: "critical_controls", pct: 0 },
    { title: "Stall contractor appointments", status: "in_progress", priority: "high", start: "2026-06-10", due: "2026-07-15", wbs: "vendors_contractors", pct: 50 },
    { title: "On-call maintenance cover for night shift", status: "planned", priority: "normal", start: "2026-08-20", due: "2026-08-27", wbs: "maintenance", pct: 10 },
  ];

  const taskRows = [];
  for (const [i, row] of taskDefs.entries()) {
    const number = await nextTsk();
    const assignee = assigneeFor(i);
    taskRows.push({
      event_id: eventId,
      task_number: number,
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
      lifecycle_phase: PHASE_FOR[row.wbs] ?? null,
      percent_complete: row.pct,
      is_critical: row.priority === "urgent" || row.priority === "critical",
      is_milestone: row.title === "Scope baseline saved",
      estimated_hours: 8,
      actual_hours: row.pct === 100 ? 8 : row.pct > 0 ? 3 : 0,
      estimated_cost: 900,
      actual_cost: row.pct === 100 ? 850 : row.pct > 0 ? 300 : 0,
      cost_impact: 900,
      approval_status: row.priority === "critical" || row.priority === "urgent" ? "pending" : "not_required",
      delay_reason: row.status === "blocked" ? "Waiting on mall security crowd-count sign-off." : null,
      escalation_level: row.priority === "critical" ? "pm" : row.priority === "urgent" ? "director" : "none",
      evidence_url: row.title === "Souq alley drawings issued" ? `events/${eventNumber}/souq-alley.pdf` : null,
      checklist:
        row.title === "Fire-lane plan with mall ops"
          ? [
              { id: "c1", title: "Hydrant access marked", done: true },
              { id: "c2", title: "Mall ops stamp", done: false },
              { id: "c3", title: "Civil Defence copy filed", done: false },
            ]
          : [],
      comments:
        row.title === "Common-area night-trading NOC"
          ? [
              {
                id: "nm-c1",
                body: "Mall ops asked for a revised fire-lane drawing before they will stamp the NOC.",
                created_at: "2026-08-16T09:30:00Z",
                author_name: pm.full_name,
              },
            ]
          : [],
      documents:
        row.title === "Courtyard survey + load-in path"
          ? [{ title: "Survey photos", url: "https://example.com/cc-courtyard-survey" }]
          : [],
      completed_at: row.status === "completed" ? `${row.due}T12:00:00Z` : null,
    });
  }

  const { data: tasks, error: taskErr } = await admin.from("event_tasks").insert(taskRows).select("id, title");
  must(taskErr, "night market tasks");
  const taskByTitle = Object.fromEntries((tasks ?? []).map((row) => [row.title, row.id]));

  if (opsLead && taskByTitle["HSE night-work briefing pack"]) {
    const { error: supErr } = await admin.from("event_task_supporters").insert({
      task_id: taskByTitle["HSE night-work briefing pack"],
      staff_id: opsLead.id,
    });
    must(supErr, "night market task supporters");
  }

  const childId = taskByTitle["Blower + LED certs received"];
  const parentId = taskByTitle["Night-glow inflatable lane booked"];
  if (childId && parentId) {
    const { error: parentErr } = await admin.from("event_tasks").update({ parent_task_id: parentId }).eq("id", childId);
    must(parentErr, "night market parent task");
  }

  const { error: depErr } = await admin.from("event_task_dependencies").insert(
    [
      ["Courtyard survey + load-in path", "Fire-lane plan with mall ops", "FS", 0],
      ["Night-glow inflatable lane booked", "Thursday 22:00 load-in call sheet", "FS", 5],
      ["City Center kickoff pack issued", "Scope baseline saved", "SS", 0],
      ["Fri/Sat DJ hold confirmed", "Mall social assets delivered", "FS", 0],
      ["Common-area night-trading NOC", "Go-live checklist signed", "FS", 0],
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
  must(depErr, "night market dependencies");

  const { data: miles, error: mileErr } = await admin
    .from("event_milestones")
    .insert(
      [
        { title: "Contract signed", due_date: "2026-05-18", status: "achieved", is_critical: true, achieved_at: "2026-05-18T10:00:00Z", wbs_id: wbsByCode.project_approvals, task_id: taskByTitle["Night-market contract countersigned"] },
        { title: "Scope baseline locked", due_date: "2026-06-02", status: "achieved", is_critical: true, achieved_at: "2026-06-02T10:00:00Z", wbs_id: wbsByCode.project_approvals, task_id: taskByTitle["Scope baseline saved"] },
        { title: "Vendor deposits cleared", due_date: "2026-06-15", status: "achieved", is_critical: false, achieved_at: "2026-06-15T10:00:00Z", wbs_id: wbsByCode.procurement_finance, task_id: taskByTitle["Vendor deposits cleared"] },
        { title: "DJ holds confirmed", due_date: "2026-07-10", status: "achieved", is_critical: false, achieved_at: "2026-07-10T10:00:00Z", wbs_id: wbsByCode.marketing_comms },
        { title: "Night-trading NOC", due_date: "2026-08-18", status: "pending", is_critical: true, wbs_id: wbsByCode.venue_permits, task_id: taskByTitle["Common-area night-trading NOC"] },
        { title: "Courtyard live 18:00", due_date: "2026-08-28", status: "pending", is_critical: true, wbs_id: wbsByCode.live_ops },
      ].map((row) => ({ event_id: eventId, owner_staff_id: pm.id, ...row })),
    )
    .select("id, title, due_date, status");
  must(mileErr, "night market milestones");

  const { error: baseErr } = await admin.from("event_baselines").insert({
    event_id: eventId,
    baseline_type: "schedule",
    snapshot: {
      saved_at: "2026-07-01T10:00:00Z",
      tasks: (tasks ?? []).map((row) => {
        const def = taskDefs.find((t) => t.title === row.title);
        return {
          id: row.id,
          title: row.title,
          start_date: def?.start ?? null,
          due_date: def?.due ?? null,
          percent_complete: def?.pct ?? 0,
          status: def?.status,
          wbs_id: wbsByCode[def?.wbs] ?? null,
        };
      }),
      wbs: Object.entries(wbsByCode).map(([code, nodeId]) => ({
        id: nodeId,
        title: code,
        node_type: "phase",
        parent_id: null,
        start_date: null,
        due_date: null,
      })),
      milestones: (miles ?? []).map((row) => ({ id: row.id, title: row.title, due_date: row.due_date, status: row.status })),
      scope_version_id: null,
    },
  });
  must(baseErr, "night market baseline");

  const slipId = taskByTitle["Fire-lane plan with mall ops"];
  if (slipId) {
    const { error: slipErr } = await admin
      .from("event_tasks")
      .update({ due_date: "2026-08-24", duration_days: 34 })
      .eq("id", slipId);
    must(slipErr, "night market schedule slip");
  }

  const { data: budget, error: budErr } = await admin
    .from("event_budgets")
    .insert({
      event_id: eventId,
      currency: "QAR",
      status: "approved",
      notes: "Revised after courtyard lighting hire",
      contract_value: 165000,
      additional_revenue: 8000,
      approved_change_orders: 0,
      discounts: 0,
      taxes: 0,
      line_alert_threshold_pct: 0,
      contingency_usage_threshold_pct: 80,
    })
    .select("id")
    .single();
  must(budErr, "night market budget");

  const lineDefs = [
    ["manpower", "crew", "Night crew + hosts", 28000, 1000, 24000, 16000, 30000, 1],
    ["manpower", "supervisors", "Duty supervisors", 10000, 0, 9000, 5000, 10000, 2],
    ["equipment_rental", "inflatables", "Night-glow inflatable lane", 22000, 2000, 18000, 16000, 24000, 3],
    ["equipment_rental", "av_kit", "DJ + courtyard lighting", 14000, 1000, 10000, 8000, 15000, 4],
    ["decoration", "theming", "Souq stalls + lanterns", 16000, 0, 12000, 7000, 16000, 5],
    ["transportation", "freight", "Overnight trucks", 8000, 1000, 6000, 2000, 9000, 6],
    ["permits", "civil_defence", "Night-trading / Civil Defence", 6000, 0, 6000, 4000, 6000, 7],
    ["marketing", "print", "Print + mall social", 12000, 0, 8000, 6000, 11000, 8],
    ["catering", "meals", "Crew meals (3 nights)", 6000, -1000, 2000, 1000, 5000, 9],
    ["contingency", "reserve", "Contingency reserve", 8000, 0, 0, 0, 6000, 10],
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
  must(lineErr, "night market budget lines");

  const { error: invErr } = await admin.from("event_client_invoices").insert([
    {
      event_id: eventId,
      invoice_number: "INV-NM-0001",
      title: "Contract 50% on award",
      status: "partial",
      amount: 82500,
      currency: "QAR",
      fx_rate: 1,
      base_amount: 82500,
      paid_amount: 50000,
      issue_date: "2026-05-25",
      due_date: "2026-06-25",
    },
    {
      event_id: eventId,
      invoice_number: "INV-NM-0002",
      title: "Balance on opening night",
      status: "draft",
      amount: 82500,
      currency: "QAR",
      fx_rate: 1,
      base_amount: 82500,
      paid_amount: 0,
      issue_date: "2026-08-28",
      due_date: "2026-09-15",
    },
  ]);
  must(invErr, "night market invoices");

  const { error: budBaseErr } = await admin.from("event_baselines").insert({
    event_id: eventId,
    baseline_type: "budget",
    snapshot: {
      saved_at: "2026-05-28T10:00:00Z",
      revenue: {
        contractValue: 165000,
        additionalRevenue: 0,
        changeOrders: 0,
        discounts: 0,
        taxes: 0,
        finalRevenue: 165000,
      },
      totals: { original: 130000, revised: 130000, forecast: 130000, marginPct: ((165000 - 130000) / 165000) * 100 },
    },
  });
  must(budBaseErr, "night market budget baseline");

  await admin.from("purchase_requisitions").update({ event_id: null, cost_category_id: null }).eq("event_id", eventId);
  const { data: requester } = await admin
    .from("staff")
    .select("id, user_id")
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (requester?.user_id) {
    async function nextPr() {
      const { data, error } = await admin.rpc("next_pr_number");
      must(error, "next_pr_number");
      return data;
    }
    const { error: prErr } = await admin.from("purchase_requisitions").insert([
      {
        pr_number: await nextPr(),
        requested_by: requester.user_id,
        requester_staff_id: requester.id,
        location_id: location.id,
        project_name: NIGHT_MARKET_NAME,
        event_id: eventId,
        cost_category_id: cats.equipment_rental.id,
        request_type: "services",
        justification: "Courtyard lighting balance — seeded for night-market committed cost.",
        status: "submitted",
        total_amount: 6000,
        currency: "QAR",
        submitted_at: "2026-07-08T10:00:00Z",
      },
      {
        pr_number: await nextPr(),
        requested_by: requester.user_id,
        requester_staff_id: requester.id,
        location_id: location.id,
        project_name: NIGHT_MARKET_NAME,
        event_id: eventId,
        cost_category_id: cats.catering.id,
        request_type: "goods",
        justification: "Crew meal upgrade for three night shifts.",
        status: "draft",
        total_amount: 4500,
        currency: "QAR",
      },
    ]);
    must(prErr, "night market PRs");
  }

  const { error: riskErr } = await admin.from("event_risks").insert([
    {
      event_id: eventId,
      title: "Night-trading NOC still unstamped — courtyard cannot go live",
      severity: "high",
      status: "open",
      due_date: "2026-08-25",
    },
    {
      event_id: eventId,
      title: "Glow-lane LED drivers delayed from Jebel Ali",
      severity: "medium",
      status: "mitigating",
      due_date: "2026-08-24",
    },
    {
      event_id: eventId,
      title: "Thursday load-in clashes with mall movie premiere",
      severity: "low",
      status: "closed",
      due_date: "2026-08-15",
    },
  ]);
  must(riskErr, "night market risks");

  const ready = [
    ["client_brief", "Client brief signed", "scope", true, 10],
    ["scope_approved", "Client-approved scope", "approvals", true, 12],
    ["budget_ack", "Budget pack reviewed with finance", "budget", true, 8],
    ["critical_prs", "Critical purchase items approved", "procurement", true, 12],
    ["critical_suppliers", "Critical suppliers appointed", "suppliers", true, 12],
    ["kit_list", "Kit / inventory list drafted", "inventory", false, 8],
    ["manpower_plan", "Manpower requirement completed", "manpower", true, 12],
    ["logistics_plan", "Logistics plan drafted", "logistics", true, 8],
    ["venue_confirmed", "Venue confirmed", "venue", true, 10],
    ["site_survey", "Site survey complete", "venue", true, 8],
    ["floor_plan", "Floor plan approved", "venue", false, 8],
    ["permits_identified", "Required permits identified", "permits", true, 12],
    ["permits", "Permits in progress or issued", "permits", false, 8],
    ["production_schedule", "Production schedule available", "production", true, 12],
    ["run_of_show", "Run of show draft", "production", false, 8],
    ["power_plan", "Power / load plan", "production", true, 8],
    ["risk_assessment", "Risk assessment completed", "safety", true, 12],
    ["insurance", "Insurance certificate", "safety", true, 8],
    ["safety", "HSE briefing prepared", "safety", false, 8],
    ["comms", "Client comms cadence set", "approvals", true, 6],
    ["go_live_approval", "Go-live approval", "approvals", false, 12],
  ];
  const { error: readyErr } = await admin.from("event_readiness_items").insert(
    ready.map(([code, title, category, done, weight]) => ({
      event_id: eventId,
      code,
      title,
      category,
      is_required: true,
      is_complete: done,
      weight,
      completed_at: done ? "2026-07-15T10:00:00Z" : null,
    })),
  );
  must(readyErr, "night market readiness");

  const { error: issueErr } = await admin.from("event_issues").insert([
    {
      event_id: eventId,
      title: "Missing LED driver on glow lane unit 2",
      description: "Spare driver not in the crate. Block that lane until recertified.",
      severity: "high",
      status: "open",
      is_snag: true,
      is_safety: true,
      owner_staff_id: (siteLead ?? pm).id,
      due_date: "2026-08-24",
      wbs_id: wbsByCode["7.1"],
    },
    {
      event_id: eventId,
      title: "Mall ops stamp outstanding on fire-lane drawing",
      description: "Blocks the night-trading NOC. Escalated to City Center operations.",
      severity: "high",
      status: "in_progress",
      is_snag: false,
      is_safety: false,
      owner_staff_id: pm.id,
      due_date: "2026-08-18",
      wbs_id: wbsByCode.venue_permits,
    },
    {
      event_id: eventId,
      title: "Stall 4 canopy tear from last weekend trial",
      description: "Replacement canopy ordered. Not a live blocker.",
      severity: "medium",
      status: "resolved",
      is_snag: true,
      is_safety: false,
      owner_staff_id: (opsLead ?? pm).id,
      due_date: "2026-08-12",
      wbs_id: wbsByCode.production_fabrication,
    },
  ]);
  must(issueErr, "night market issues");

  const { error: docErr } = await admin.from("event_documents").insert([
    { event_id: eventId, title: "Courtyard layout v3", doc_type: "drawing", file_path: `events/${eventNumber}/courtyard-layout.pdf` },
    { event_id: eventId, title: "Night-trading NOC application", doc_type: "permit", file_path: `events/${eventNumber}/night-trading-noc.pdf` },
    { event_id: eventId, title: "City Center activation contract", doc_type: "contract", file_path: `events/${eventNumber}/cc-activation.pdf` },
    { event_id: eventId, title: "June courtyard survey photos", doc_type: "photo", url: "https://example.com/cc-courtyard-survey" },
    { event_id: eventId, title: "Glow-lane ops manual", doc_type: "manual", file_path: `events/${eventNumber}/glow-lane-manual.pdf` },
  ]);
  must(docErr, "night market documents");

  const { error: assetErr } = await admin.from("event_asset_movements").insert([
    { event_id: eventId, item_name: "Handheld POS kit", qty: 4, status: "planned", due_date: "2026-08-26" },
    { event_id: eventId, item_name: "Souq stall crates", qty: 8, status: "moved", due_date: "2026-08-25" },
    { event_id: eventId, item_name: "Lantern stringers", qty: 12, status: "on_site", due_date: "2026-08-20" },
    { event_id: eventId, item_name: "Glow-lane LED driver spare", qty: 1, status: "missing", due_date: "2026-08-22", notes: "Not in crate — see issue on unit 2" },
  ]);
  must(assetErr, "night market assets");

  const { error: payErr } = await admin.from("event_payables").insert([
    { event_id: eventId, kind: "po", title: "Glow-lane hire PO", reference: "PO-NM-001", vendor_name: "FunRigs", amount: 22000, currency: "QAR", status: "pending", due_date: "2026-08-20" },
    { event_id: eventId, kind: "payment", title: "Lighting deposit balance", reference: "PAY-NM-001", vendor_name: "LumenQatar", amount: 5000, currency: "QAR", status: "partial", due_date: "2026-08-22" },
    { event_id: eventId, kind: "payment", title: "DJ weekend hold", reference: "PAY-NM-002", vendor_name: "Dockside Audio", amount: 4500, currency: "QAR", status: "paid", due_date: "2026-07-10" },
  ]);
  must(payErr, "night market payables");

  const { error: scoreErr } = await admin
    .from("events")
    .update({
      health_rag: "amber",
      health_score: 68,
      readiness_pct: 74,
    })
    .eq("id", eventId);
  must(scoreErr, "night market scores");

  const { error: auditErr } = await admin.from("event_audit_logs").insert({
    event_id: eventId,
    action: "seed",
    entity_type: "event",
    entity_id: eventId,
    location_id: location.id,
    after: { event_number: eventNumber, name: NIGHT_MARKET_NAME },
    metadata: { script: "seed-event-projects", event: "night-market" },
  });
  must(auditErr, "night market audit");

  console.log(`${eventNumber} ${NIGHT_MARKET_NAME} @ ${location.name} (${location.code}) / PM ${pm.full_name}`);
  console.log(`  id=${eventId}`);
  console.log("  Budget original 130000 revised 134000 contracted 165000 + 8000 add-rev — from lines.");
  return { eventId, eventNumber, location, pm };
}

async function main() {
  const [{ data: locations, error: locErr }, { data: staff, error: staffErr }] = await Promise.all([
    admin.from("locations").select("id, code, name, region").eq("status", "active"),
    admin.from("staff").select("id, full_name, location_id").is("deleted_at", null).limit(20),
  ]);
  must(locErr, "locations");
  must(staffErr, "staff");

  const location =
    (locations ?? []).find((l) => l.code === "UA-DM") ??
    (locations ?? []).find((l) => /doha mall/i.test(`${l.name} ${l.region}`)) ??
    (locations ?? []).find((l) => l.code === "INF-CC") ??
    (locations ?? [])[0];
  if (!location) throw new Error("No active location found. Run seed:locations first.");

  const siteStaff = (staff ?? []).filter((s) => s.location_id === location.id);
  const pool = siteStaff.length ? siteStaff : (staff ?? []);
  if (!pool.length) throw new Error("No staff found. Seed staff before events.");
  const pm = pool[0];
  const crew = pool.slice(1, 4);

  const festival = await byCode("evt_event_types", "festival");
  const clientClass = await byCode("evt_classifications", "client");
  const preProd = await byCode("evt_stages", "pre_production");
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

  const { data: existing, error: existErr } = await admin
    .from("events")
    .select("id, event_number")
    .eq("name", EVENT_NAME)
    .is("deleted_at", null)
    .maybeSingle();
  must(existErr, "events lookup");

  let eventId = existing?.id;
  let eventNumber = existing?.event_number;
  if (eventId) {
    await clearChildren(eventId);
    const { error } = await admin
      .from("events")
      .update({
        client_name: "Doha Mall",
        event_name: EVENT_NAME,
        client_contact: "Mall Marketing — activations desk",
        business_unit: "Events & Activations",
        venue_name: "Doha Mall atrium + Urban Arena frontage",
        location_id: location.id,
        event_type_id: festival.id,
        classification_id: clientClass.id,
        stage_id: preProd.id,
        status: "active",
        priority: "high",
        country: "Qatar",
        city: location.region ?? "Doha",
        inquiry_date: "2026-05-12",
        contract_date: "2026-07-08",
        planning_start: "2026-07-10",
        venue_access: "2026-09-07",
        setup_start: "2026-09-08",
        setup_end: "2026-09-09",
        rehearsal_date: "2026-09-09",
        client_inspection_date: "2026-09-09",
        event_start: "2026-09-10",
        event_end: "2026-09-20",
        dismantle_start: "2026-09-21",
        dismantle_end: "2026-09-21",
        dismantle_date: "2026-09-21",
        handover_date: "2026-09-21",
        financial_close_target: "2026-10-15",
        final_closure_date: "2026-10-31",
        pm_staff_id: pm.id,
        currency: "QAR",
        contracted_value: 280000,
        description:
          "Back-to-school festival activation for Doha Mall: inflatables, school-supply village, weekend entertainment, and Urban Arena crossover.",
        notes: "seed:doha-mall-bts-2026",
        lessons_learned: "Load-in via service corridor 2 needs a dedicated marshal. Inflatable certs must be in-hand 72h before bump-in.",
        go_live_approved: false,
      })
      .eq("id", eventId);
    must(error, "update event");
    console.log(`Updating ${eventNumber}`);
  } else {
    const { data: number, error: numErr } = await admin.rpc("next_evt_number");
    must(numErr, "next_evt_number");
    eventNumber = number;
    const { data: created, error } = await admin
      .from("events")
      .insert({
        event_number: eventNumber,
        name: EVENT_NAME,
        event_name: EVENT_NAME,
        client_name: "Doha Mall",
        client_contact: "Mall Marketing — activations desk",
        business_unit: "Events & Activations",
        venue_name: "Doha Mall atrium + Urban Arena frontage",
        location_id: location.id,
        event_type_id: festival.id,
        classification_id: clientClass.id,
        stage_id: preProd.id,
        status: "active",
        priority: "high",
        country: "Qatar",
        city: location.region ?? "Doha",
        inquiry_date: "2026-05-12",
        contract_date: "2026-07-08",
        planning_start: "2026-07-10",
        venue_access: "2026-09-07",
        setup_start: "2026-09-08",
        setup_end: "2026-09-09",
        rehearsal_date: "2026-09-09",
        client_inspection_date: "2026-09-09",
        event_start: "2026-09-10",
        event_end: "2026-09-20",
        dismantle_start: "2026-09-21",
        dismantle_end: "2026-09-21",
        dismantle_date: "2026-09-21",
        handover_date: "2026-09-21",
        financial_close_target: "2026-10-15",
        final_closure_date: "2026-10-31",
        pm_staff_id: pm.id,
        currency: "QAR",
        contracted_value: 280000,
        description:
          "Back-to-school festival activation for Doha Mall: inflatables, school-supply village, weekend entertainment, and Urban Arena crossover.",
        notes: "seed:doha-mall-bts-2026",
        lessons_learned: "Load-in via service corridor 2 needs a dedicated marshal. Inflatable certs must be in-hand 72h before bump-in.",
        go_live_approved: false,
      })
      .select("id")
      .single();
    must(error, "insert event");
    eventId = created.id;
    console.log(`Created ${eventNumber}`);
  }

  const team = [
    { staff_id: pm.id, role_label: "Project Manager", is_pm: true },
    ...crew.map((s, i) => ({
      staff_id: s.id,
      role_label: ["Operations lead", "Creative lead", "Site supervisor"][i] ?? "Team",
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
    title: "Signed scope",
    is_baseline: true,
    sections: [
      {
        key: "inclusions",
        title: "Inclusions",
        body: "11-day festival footprint, weekend entertainment, inflatable village, school-supply pop-ups, Urban Arena crossover hours, overnight security during setup.",
      },
      {
        key: "exclusions",
        title: "Exclusions",
        body: "Mall common-area housekeeping after 22:00, paid media buy, celebrity appearances.",
      },
      {
        key: "assumptions",
        title: "Assumptions",
        body: "Mall provides power taps at columns A12–A18. Load-in via service corridor 2. Civil Defence NOC by 1 Sep.",
      },
      {
        key: "success",
        title: "Success criteria",
        body: "Zero safety incidents, contracted brand presence live by 10 Sep 10:00, daily photo pack to mall marketing.",
      },
    ],
  });
  must(scopeErr, "scope");

  const { error: delivErr } = await admin.from("event_deliverables").insert(
    [
      { title: "Approved floor plan + fire lanes", status: "done", due_date: "2026-08-01", sort_order: 1 },
      { title: "Inflatables on site and certified", status: "in_progress", due_date: "2026-09-07", sort_order: 2 },
      { title: "Weekend entertainment run of show", status: "done", due_date: "2026-08-20", sort_order: 3 },
      { title: "Client daily recap pack", status: "done", due_date: "2026-09-10", sort_order: 4 },
    ].map((row) => ({ event_id: eventId, owner_staff_id: pm.id, ...row })),
  );
  must(delivErr, "deliverables");

  const { data: depts } = await admin.from("master_departments").select("id").eq("active", true).limit(1);
  const deptId = depts?.[0]?.id ?? null;
  const assignee = crew[0] ?? pm;

  const standardWorkstreams = [
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
  const { data: phases, error: phaseErr } = await admin
    .from("event_wbs_nodes")
    .insert(
      standardWorkstreams.map(([code, title, sort_order]) => ({
        event_id: eventId,
        owner_staff_id: pm.id,
        code,
        title,
        node_type: "phase",
        sort_order,
        start_date: sort_order <= 11 ? "2026-07-01" : sort_order <= 13 ? "2026-09-08" : "2026-09-21",
        due_date: sort_order <= 11 ? "2026-09-07" : sort_order <= 13 ? "2026-09-20" : "2026-09-21",
      })),
    )
    .select("id, code");
  must(phaseErr, "wbs phases");
  const wbsByCode = aliasWbs(Object.fromEntries((phases ?? []).map((row) => [row.code, row.id])));
  wbsByCode["1"] = wbsByCode.project_management;
  wbsByCode["1.1"] = wbsByCode.mall_venue;
  wbsByCode["1.2"] = wbsByCode.marketing;
  wbsByCode["1.3"] = wbsByCode.production_technical;
  wbsByCode["2"] = wbsByCode.operations;

  const { data: wbsTasks, error: wbsTaskErr } = await admin
    .from("event_wbs_nodes")
    .insert({
      event_id: eventId,
      parent_id: wbsByCode.production_technical,
      node_type: "task",
      code: "1.3.1",
      title: "Inflatables package",
      sort_order: 1,
      owner_staff_id: assignee.id,
      budget_amount: 28000,
      start_date: "2026-07-15",
      due_date: "2026-09-07",
      documents: [{ title: "Supplier quote", url: "https://example.com/inflatables-quote" }],
    })
    .select("id, code")
    .single();
  must(wbsTaskErr, "wbs task");
  wbsByCode[wbsTasks.code] = wbsTasks.id;

  const { data: wbsSub, error: wbsSubErr } = await admin
    .from("event_wbs_nodes")
    .insert({
      event_id: eventId,
      parent_id: wbsTasks.id,
      node_type: "subtask",
      code: "1.3.1.1",
      title: "Certification pack",
      sort_order: 1,
      owner_staff_id: assignee.id,
      start_date: "2026-08-20",
      due_date: "2026-09-04",
    })
    .select("id, code")
    .single();
  must(wbsSubErr, "wbs subtask");
  wbsByCode[wbsSub.code] = wbsSub.id;

  async function nextTsk() {
    const { data, error } = await admin.rpc("next_tsk_number");
    must(error, "next_tsk_number");
    return data;
  }

  const taskDefs = [
    { title: "Client kickoff pack issued", status: "completed", priority: "normal", start: "2026-07-10", due: "2026-07-15", wbs: "1", pct: 100 },
    { title: "Contract countersigned", status: "completed", priority: "high", start: "2026-07-01", due: "2026-07-08", wbs: "1", pct: 100 },
    { title: "Budget v1 approved by finance", status: "completed", priority: "high", start: "2026-07-09", due: "2026-07-18", wbs: "1", pct: 100 },
    { title: "Scope baseline saved", status: "completed", priority: "normal", start: "2026-07-15", due: "2026-07-22", wbs: "1", pct: 100 },
    { title: "Site survey + load-in path", status: "completed", priority: "normal", start: "2026-07-20", due: "2026-07-28", wbs: "1.1", pct: 100 },
    { title: "Confirm mall license amendment", status: "in_progress", priority: "urgent", start: "2026-08-01", due: "2026-08-10", wbs: "1.1", pct: 40 },
    { title: "Finalize floor plan with mall ops", status: "in_progress", priority: "high", start: "2026-08-05", due: "2026-08-15", wbs: "1.1", pct: 55 },
    { title: "Print collateral at press", status: "completed", priority: "normal", start: "2026-08-01", due: "2026-08-18", wbs: "1.2", pct: 100 },
    { title: "Entertainment holds confirmed", status: "completed", priority: "normal", start: "2026-07-20", due: "2026-08-05", wbs: "1.2", pct: 100 },
    { title: "Inflatable supplier deposit paid", status: "completed", priority: "high", start: "2026-07-15", due: "2026-07-25", wbs: "1.3.1", pct: 100 },
    { title: "Confirm inflatable certs", status: "planned", priority: "high", start: "2026-08-20", due: "2026-09-04", wbs: "1.3.1.1", pct: 10, parentOf: "Inflatable supplier deposit paid" },
    { title: "Crew roster draft", status: "completed", priority: "normal", start: "2026-08-10", due: "2026-08-18", wbs: "staffing_training", pct: 100 },
    { title: "Setup call sheet", status: "not_started", priority: "normal", start: "2026-09-01", due: "2026-09-05", wbs: "bump_in", pct: 0 },
    { title: "POS + Wi-Fi circuit confirmed", status: "in_progress", priority: "high", start: "2026-08-12", due: "2026-08-25", wbs: "it_pos", pct: 40 },
    { title: "Critical PRs released", status: "in_progress", priority: "high", start: "2026-07-20", due: "2026-08-12", wbs: "procurement_finance", pct: 60 },
    { title: "Brand wall drawings issued", status: "completed", priority: "normal", start: "2026-07-18", due: "2026-08-01", wbs: "design_branding", pct: 100 },
    { title: "Truck plan Doha → mall", status: "planned", priority: "normal", start: "2026-08-28", due: "2026-09-06", wbs: "logistics_assets", pct: 15 },
    { title: "HSE briefing pack", status: "in_progress", priority: "critical", start: "2026-08-15", due: "2026-09-05", wbs: "safety_quality", pct: 35 },
    { title: "Opening day run-of-show", status: "not_started", priority: "high", start: "2026-09-08", due: "2026-09-10", wbs: "live_ops", pct: 0 },
    { title: "Bump-out crew confirmed", status: "not_started", priority: "normal", start: "2026-09-15", due: "2026-09-20", wbs: "bump_out", pct: 0 },
    { title: "Go-live checklist signed", status: "not_started", priority: "critical", start: "2026-09-08", due: "2026-09-09", wbs: "critical_controls", pct: 0 },
    { title: "Vendor appointment pack", status: "in_progress", priority: "high", start: "2026-07-20", due: "2026-08-10", wbs: "vendors_contractors", pct: 45 },
    { title: "Live-event maintenance cover", status: "not_started", priority: "normal", start: "2026-09-08", due: "2026-09-10", wbs: "maintenance", pct: 0 },
    { title: "Operations daily stand-up template", status: "planned", priority: "normal", start: "2026-09-01", due: "2026-09-09", wbs: "operations", pct: 5 },
  ];

  const taskRows = [];
  for (const row of taskDefs) {
    const number = await nextTsk();
    taskRows.push({
      event_id: eventId,
      task_number: number,
      wbs_id: wbsByCode[row.wbs] ?? null,
      title: row.title,
      status: row.status,
      priority: row.priority,
      start_date: row.start,
      due_date: row.due,
      duration_days: Math.max(1, Math.round((new Date(`${row.due}T00:00:00`) - new Date(`${row.start}T00:00:00`)) / 86400000) + 1),
      owner_staff_id: pm.id,
      assignee_staff_id: assignee.id,
      department_id: deptId,
      lifecycle_phase: PHASE_FOR[row.wbs] ?? null,
      percent_complete: row.pct,
      is_critical: row.priority === "urgent" || row.priority === "critical",
      is_milestone: row.title === "Scope baseline saved",
      estimated_hours: 8,
      actual_hours: row.pct === 100 ? 8 : 3,
      estimated_cost: 1200,
      actual_cost: row.pct === 100 ? 1100 : 400,
      cost_impact: 1200,
      approval_status: row.priority === "critical" || row.priority === "urgent" ? "pending" : "not_required",
      escalation_level: row.priority === "critical" ? "pm" : "none",
      evidence_url: row.title === "Brand wall drawings issued" ? "events/EVT-2026-0001/brand-wall.pdf" : null,
      checklist: row.title === "Finalize floor plan with mall ops"
        ? [
            { id: "c1", title: "Fire lanes marked", done: true },
            { id: "c2", title: "Mall ops sign-off", done: false },
          ]
        : [],
      documents: row.title === "Site survey + load-in path"
        ? [{ title: "Survey photos", url: "https://example.com/site-survey" }]
        : [],
      completed_at: row.status === "completed" ? `${row.due}T12:00:00Z` : null,
    });
  }

  const { data: tasks, error: taskErr } = await admin.from("event_tasks").insert(taskRows).select("id, title");
  must(taskErr, "tasks");
  const taskByTitle = Object.fromEntries((tasks ?? []).map((row) => [row.title, row.id]));

  if (crew[0] && taskByTitle["HSE briefing pack"]) {
    const { error: supErr } = await admin.from("event_task_supporters").insert({
      task_id: taskByTitle["HSE briefing pack"],
      staff_id: crew[0].id,
    });
    must(supErr, "task supporters");
  }

  const childId = taskByTitle["Confirm inflatable certs"];
  const parentId = taskByTitle["Inflatable supplier deposit paid"];
  if (childId && parentId) {
    const { error: parentErr } = await admin.from("event_tasks").update({ parent_task_id: parentId }).eq("id", childId);
    must(parentErr, "parent task");
  }

  const { error: depErr } = await admin.from("event_task_dependencies").insert([
    {
      event_id: eventId,
      predecessor_id: taskByTitle["Site survey + load-in path"],
      successor_id: taskByTitle["Finalize floor plan with mall ops"],
      dep_type: "FS",
      lag_days: 0,
    },
    {
      event_id: eventId,
      predecessor_id: taskByTitle["Inflatable supplier deposit paid"],
      successor_id: taskByTitle["Setup call sheet"],
      dep_type: "FS",
      lag_days: 7,
    },
    {
      event_id: eventId,
      predecessor_id: taskByTitle["Client kickoff pack issued"],
      successor_id: taskByTitle["Scope baseline saved"],
      dep_type: "SS",
      lag_days: 0,
    },
    {
      event_id: eventId,
      predecessor_id: taskByTitle["Entertainment holds confirmed"],
      successor_id: taskByTitle["Print collateral at press"],
      dep_type: "FS",
      lag_days: 0,
    },
  ]);
  must(depErr, "dependencies");

  const { data: miles, error: mileErr2 } = await admin
    .from("event_milestones")
    .insert(
      [
        { title: "Contract signed", due_date: "2026-07-08", status: "achieved", is_critical: true, achieved_at: "2026-07-08T10:00:00Z", wbs_id: wbsByCode["1"], task_id: taskByTitle["Contract countersigned"] },
        { title: "Scope baseline locked", due_date: "2026-07-22", status: "achieved", is_critical: true, achieved_at: "2026-07-22T10:00:00Z", wbs_id: wbsByCode["1"], task_id: taskByTitle["Scope baseline saved"] },
        { title: "Supplier deposits cleared", due_date: "2026-07-25", status: "achieved", is_critical: false, achieved_at: "2026-07-25T10:00:00Z", wbs_id: wbsByCode["1.3.1"], task_id: taskByTitle["Inflatable supplier deposit paid"] },
        { title: "Entertainment holds", due_date: "2026-08-05", status: "achieved", is_critical: false, achieved_at: "2026-08-05T10:00:00Z", wbs_id: wbsByCode["1.2"] },
        { title: "Civil Defence NOC", due_date: "2026-09-01", status: "pending", is_critical: true, wbs_id: wbsByCode["1.1"], task_id: taskByTitle["Confirm mall license amendment"] },
      ].map((row) => ({ event_id: eventId, owner_staff_id: pm.id, ...row })),
    )
    .select("id, title, due_date, status");
  must(mileErr2, "milestones2");

  const { error: baseErr } = await admin.from("event_baselines").insert({
    event_id: eventId,
    baseline_type: "schedule",
    snapshot: {
      saved_at: "2026-08-01T10:00:00Z",
      tasks: (tasks ?? []).map((row) => {
        const def = taskDefs.find((t) => t.title === row.title);
        return {
          id: row.id,
          title: row.title,
          start_date: def?.start ?? null,
          due_date: def?.due ?? null,
          percent_complete: def?.pct ?? 0,
          status: def?.status,
          wbs_id: wbsByCode[def?.wbs] ?? null,
        };
      }),
      wbs: Object.entries(wbsByCode).map(([code, nodeId]) => ({ id: nodeId, title: code, node_type: "phase", parent_id: null, start_date: null, due_date: null })),
      milestones: (miles ?? []).map((row) => ({ id: row.id, title: row.title, due_date: row.due_date, status: row.status })),
      scope_version_id: null,
    },
  });
  must(baseErr, "baseline");

  const slipId = taskByTitle["Finalize floor plan with mall ops"];
  if (slipId) {
    const { error: slipErr } = await admin
      .from("event_tasks")
      .update({ due_date: "2026-08-22", duration_days: 18 })
      .eq("id", slipId);
    must(slipErr, "schedule slip");
  }

  const { data: budget, error: budErr } = await admin
    .from("event_budgets")
    .insert({
      event_id: eventId,
      currency: "QAR",
      status: "approved",
      notes: "Revised after inflatable freight",
      contract_value: 280000,
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

  // Original 186k / revised 190k — same demo totals, now as category → subcategory → line.
  const lineDefs = [
    ["manpower", "crew", "Festival crew", 40000, 2000, 36000, 24000, 42000, 1],
    ["manpower", "supervisors", "Site supervisors", 15000, 1000, 14000, 8000, 16000, 2],
    ["equipment_rental", "inflatables", "Inflatables package", 28000, 2000, 22000, 20000, 29000, 3],
    ["equipment_rental", "av_kit", "AV / kit rental", 12000, 0, 8000, 8000, 12000, 4],
    ["decoration", "theming", "Atrium theming", 28000, 0, 20000, 12000, 27000, 5],
    ["transportation", "freight", "Inbound freight", 15000, 1000, 12000, 8000, 16000, 6],
    ["permits", "civil_defence", "Civil Defence / mall license", 8000, 0, 8000, 6000, 8000, 7],
    ["marketing", "print", "Print collateral", 18000, 0, 10000, 8000, 17000, 8],
    ["catering", "meals", "Crew meals", 12000, -2000, 4000, 2000, 10000, 9],
    ["contingency", "reserve", "Contingency reserve", 10000, 0, 0, 0, 8000, 10],
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
      invoice_number: "INV-EVT-0001",
      title: "Contract 50% on award",
      status: "submitted",
      amount: 140000,
      currency: "QAR",
      fx_rate: 1,
      base_amount: 140000,
      paid_amount: 70000,
      issue_date: "2026-07-15",
      due_date: "2026-08-15",
    },
    {
      event_id: eventId,
      invoice_number: "INV-EVT-0002",
      title: "Balance on opening",
      status: "draft",
      amount: 140000,
      currency: "QAR",
      fx_rate: 1,
      base_amount: 140000,
      paid_amount: 0,
      issue_date: "2026-09-10",
      due_date: "2026-09-30",
    },
  ]);
  must(invErr, "invoices");

  const { error: budBaseErr } = await admin.from("event_baselines").insert({
    event_id: eventId,
    baseline_type: "budget",
    snapshot: {
      saved_at: "2026-07-18T10:00:00Z",
      revenue: {
        contractValue: 280000,
        additionalRevenue: 0,
        changeOrders: 0,
        discounts: 0,
        taxes: 0,
        finalRevenue: 280000,
      },
      totals: { original: 186000, revised: 186000, forecast: 186000, marginPct: ((280000 - 186000) / 280000) * 100 },
    },
  });
  must(budBaseErr, "budget baseline");

  await admin.from("purchase_requisitions").update({ event_id: null, cost_category_id: null }).eq("event_id", eventId);
  const { data: requester } = await admin
    .from("staff")
    .select("id, user_id")
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (requester?.user_id) {
    async function nextPr() {
      const { data, error } = await admin.rpc("next_pr_number");
      must(error, "next_pr_number");
      return data;
    }
    const { error: prErr } = await admin.from("purchase_requisitions").insert([
      {
        pr_number: await nextPr(),
        requested_by: requester.user_id,
        requester_staff_id: requester.id,
        location_id: location.id,
        project_name: EVENT_NAME,
        event_id: eventId,
        cost_category_id: cats.equipment_rental.id,
        request_type: "services",
        justification: "Inflatable freight balance — seeded for event committed cost.",
        status: "submitted",
        total_amount: 8000,
        currency: "QAR",
        submitted_at: "2026-07-20T10:00:00Z",
      },
      {
        pr_number: await nextPr(),
        requested_by: requester.user_id,
        requester_staff_id: requester.id,
        location_id: location.id,
        project_name: EVENT_NAME,
        event_id: eventId,
        cost_category_id: cats.catering.id,
        request_type: "goods",
        justification: "Crew catering upgrade — seeded to demonstrate category overrun warning.",
        status: "draft",
        total_amount: 12000,
        currency: "QAR",
      },
    ]);
    must(prErr, "event PRs");
  }

  const { error: riskErr } = await admin.from("event_risks").insert([
    {
      event_id: eventId,
      title: "Mall fire-marshal inspection window still unconfirmed",
      severity: "high",
      status: "open",
      due_date: "2026-08-28",
    },
    {
      event_id: eventId,
      title: "Inflatable ocean freight delay from Jebel Ali",
      severity: "medium",
      status: "mitigating",
      due_date: "2026-09-04",
    },
  ]);
  must(riskErr, "risks");

  const ready = [
    ["client_brief", "Client brief signed", "scope", true, 10],
    ["scope_approved", "Client-approved scope", "approvals", true, 12],
    ["budget_ack", "Budget pack reviewed with finance", "budget", true, 8],
    ["critical_prs", "Critical purchase items approved", "procurement", true, 12],
    ["critical_suppliers", "Critical suppliers appointed", "suppliers", true, 12],
    ["kit_list", "Kit / inventory list drafted", "inventory", false, 8],
    ["manpower_plan", "Manpower requirement completed", "manpower", true, 12],
    ["logistics_plan", "Logistics plan drafted", "logistics", true, 8],
    ["venue_confirmed", "Venue confirmed", "venue", true, 10],
    ["site_survey", "Site survey complete", "venue", true, 8],
    ["floor_plan", "Floor plan approved", "venue", true, 8],
    ["permits_identified", "Required permits identified", "permits", true, 12],
    ["permits", "Permits in progress or issued", "permits", false, 8],
    ["production_schedule", "Production schedule available", "production", true, 12],
    ["run_of_show", "Run of show draft", "production", false, 8],
    ["power_plan", "Power / load plan", "production", true, 8],
    ["risk_assessment", "Risk assessment completed", "safety", true, 12],
    ["insurance", "Insurance certificate", "safety", true, 8],
    ["safety", "HSE briefing prepared", "safety", true, 8],
    ["comms", "Client comms cadence set", "approvals", true, 6],
    ["go_live_approval", "Go-live approval", "approvals", false, 12],
  ];
  const { error: readyErr } = await admin.from("event_readiness_items").insert(
    ready.map(([code, title, category, done, weight]) => ({
      event_id: eventId,
      code,
      title,
      category,
      is_required: true,
      is_complete: done,
      weight,
      completed_at: done ? "2026-08-01T10:00:00Z" : null,
    })),
  );
  must(readyErr, "readiness");

  const { error: issueErr } = await admin.from("event_issues").insert([
    {
      event_id: eventId,
      title: "Incomplete bumper pad on inflatable 3",
      description: "Pad seam open on unit 3. Block live until recertified.",
      severity: "high",
      status: "open",
      is_snag: true,
      is_safety: true,
      owner_staff_id: pm.id,
      due_date: "2026-09-05",
    },
  ]);
  must(issueErr, "issues");

  const { error: docErr } = await admin.from("event_documents").insert([
    { event_id: eventId, title: "Site layout v1", doc_type: "drawing", file_path: "events/EVT-2026-0001/site-layout.pdf" },
    { event_id: eventId, title: "Civil Defence application", doc_type: "permit", file_path: "events/EVT-2026-0001/civil-defence.pdf" },
  ]);
  must(docErr, "documents");

  const { error: assetErr } = await admin.from("event_asset_movements").insert([
    { event_id: eventId, item_name: "POS terminal kit", qty: 2, status: "planned", due_date: "2026-09-07" },
    { event_id: eventId, item_name: "Brand wall crates", qty: 4, status: "moved" },
  ]);
  must(assetErr, "assets");

  const { error: payErr } = await admin.from("event_payables").insert([
    { event_id: eventId, kind: "po", title: "Inflatable hire PO", reference: "PO-EVT-001", vendor_name: "FunRigs", amount: 28000, currency: "QAR", status: "pending", due_date: "2026-08-20" },
    { event_id: eventId, kind: "payment", title: "Deposit balance", reference: "PAY-EVT-001", vendor_name: "FunRigs", amount: 8000, currency: "QAR", status: "pending", due_date: "2026-09-01" },
  ]);
  must(payErr, "payables");

  // 9/12 tasks done = 75, 4/5 milestones = 80, 8/10 checklist = 80,
  // budget approved = 100, scope baseline = 100, 3/4 deliverables = 75 → 82%
  const readinessPct = 82;
  const { error: scoreErr } = await admin
    .from("events")
    .update({
      health_rag: "amber",
      health_score: 76,
      readiness_pct: readinessPct,
    })
    .eq("id", eventId);
  must(scoreErr, "scores");

  const { error: auditErr } = await admin.from("event_audit_logs").insert({
    event_id: eventId,
    action: "seed",
    entity_type: "event",
    entity_id: eventId,
    location_id: location.id,
    after: { event_number: eventNumber, name: EVENT_NAME },
    metadata: { script: "seed-event-projects" },
  });
  must(auditErr, "audit");

  console.log(`${eventNumber} @ ${location.name} / PM ${pm.full_name}`);
  console.log("Budget original 186000 revised 190000 contracted 280000 — from lines, not the view.");

  await seedNightMarket();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
