/**
 * Seeds Employee Performance & Recognition demo rows for a few real
 * Inflatapark (INF-CC) staff. Idempotent — safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-performance-inflatapark.mjs
 *   node --env-file=.env.local scripts/seed-performance-inflatapark.mjs --dry-run
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const LOCATION_CODE = "INF-CC";
const SEED_NS = "fec-perf-inflatapark-v1";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

if (!dryRun && (!url || !serviceKey)) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = dryRun
  ? null
  : createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

/** Preferred real Inflatapark roster (employee_code → scorecard + story). */
const PREFERRED = [
  {
    employee_code: "29440401419",
    jobRoleKey: "supervisor",
    persona: "star",
    currentStatus: "finalized",
    eom: "winner_prev",
  },
  {
    employee_code: "28460819794",
    jobRoleKey: "cashier",
    persona: "solid",
    currentStatus: "finalized",
    eom: "shortlist_current",
  },
  {
    employee_code: "28214407767",
    jobRoleKey: "attraction_operator",
    persona: "star",
    currentStatus: "finalized",
    eom: "shortlist_current",
  },
  {
    employee_code: "28352414399",
    jobRoleKey: "ride_operator",
    persona: "watch",
    currentStatus: "manager_review",
    eom: null,
  },
  {
    employee_code: "28328800915",
    jobRoleKey: "attraction_operator",
    persona: "draft",
    currentStatus: "draft",
    eom: null,
  },
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const HIB_MULT = { star: 1.08, solid: 0.78, watch: 0.68, draft: 0.86 };
const LIB_ZERO = { star: 0, solid: 0, watch: 2, draft: 1 };
const LIB_MULT = { star: 0.55, solid: 1.05, watch: 1.75, draft: 1.12 };

function seedUuid(key) {
  const h = createHash("sha256").update(`${SEED_NS}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function monthBounds(year, monthIndex) {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return { start: ymd(start), end: ymd(end) };
}

function computeAchievementPct({ actual, target, higherIsBetter = true, maxCapPct = 120 }) {
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return 0;
  let pct;
  if (higherIsBetter) {
    if (target === 0) return actual === 0 ? 100 : maxCapPct;
    pct = (actual / target) * 100;
  } else {
    if (actual <= 0 && target <= 0) return 100;
    if (actual <= 0) return maxCapPct;
    if (target === 0) return actual === 0 ? 100 : 0;
    pct = (target / actual) * 100;
  }
  return Math.min(Math.max(pct, 0), maxCapPct);
}

function normalizeScore(input) {
  const pct = computeAchievementPct(input);
  const cap = input.maxCapPct ?? 120;
  return Math.min((pct / 100) * 100, cap);
}

function weightedScore(normalized, weightPct) {
  if (!Number.isFinite(normalized) || !Number.isFinite(weightPct) || weightPct <= 0) return 0;
  return (normalized * weightPct) / 100;
}

function blendEvaluationScore(kraScore, kpiScore, kraWeightPct = 40, kpiWeightPct = 60) {
  const totalW = kraWeightPct + kpiWeightPct || 100;
  return (kraScore * kraWeightPct + kpiScore * kpiWeightPct) / totalW;
}

function ratingBandForScore(score) {
  if (score >= 90) return "excellent";
  if (score >= 80) return "good";
  if (score >= 70) return "needs_attention";
  return "poor";
}

function actualForKpi(item, persona) {
  const target = Number(item.target_value ?? 0);
  const hib = item.higher_is_better !== false;
  if (!hib) {
    if (target === 0) return LIB_ZERO[persona] ?? 1;
    return round2(target * (LIB_MULT[persona] ?? 1));
  }
  if (target === 0) return persona === "star" ? 0 : 1;
  return round2(target * (HIB_MULT[persona] ?? 1));
}

function resolveJobRole(staff) {
  const title = (staff.job_title ?? "").toLowerCase();
  const role = (staff.staff_role ?? "").toLowerCase();
  const dept = (staff.department ?? "").toLowerCase();
  if (title.includes("branch manager") || role === "branch_manager") return "branch_manager";
  if (title.includes("duty manager") || title.includes("shift supervisor")) return "duty_manager";
  if (title.includes("venue supervisor") || role === "venue_supervisor") return "supervisor";
  if (title.includes("cashier") || role === "cashier") return "cashier";
  if (title.includes("party") || title.includes("birthday")) return "birthday_coordinator";
  if (title.includes("technician")) return "technician";
  if (title.includes("housekeep") || title.includes("floor attendant")) return "housekeeping";
  if (title.includes("cafe") || title.includes("f&b") || title.includes("f & b")) return "cafe_staff";
  if (title.includes("security")) return "security";
  if (title.includes("guest")) return "guest_relations";
  if (title.includes("ride") || dept.includes("battle")) return "ride_operator";
  if (title.includes("attraction") || title.includes("crew") || title.includes("attendant") || role === "crew") {
    return "attraction_operator";
  }
  return "attraction_operator";
}

const ACHIEVEMENTS = {
  "29440401419": [
    {
      title: "Coached eight crew through a peak weekend",
      description: "Documented coaching on queue control and inflatable safety during City Center Friday peak.",
      category: "coaching",
      points: 40,
      offsetDays: 12,
    },
    {
      title: "100% shift-readiness week",
      description: "Opening and floor checklists completed on time every day of the week.",
      category: "operations",
      points: 35,
      offsetDays: 6,
    },
  ],
  "28460819794": [
    {
      title: "Perfect cash close streak",
      description: "Six consecutive closes with zero unexplained POS variance.",
      category: "cash",
      points: 30,
      offsetDays: 9,
    },
    {
      title: "Weekday upsell lift",
      description: "Highest add-on attachment among Inflatapark cashiers in the first half of the month.",
      category: "sales",
      points: 20,
      offsetDays: 4,
    },
  ],
  "28214407767": [
    {
      title: "Attraction safety champion",
      description: "Zero missed pre-session safety checks on the main inflatable park.",
      category: "safety",
      points: 45,
      offsetDays: 8,
    },
    {
      title: "Guest compliment shout-out",
      description: "Family complimented her for helping a nervous first-time rider.",
      category: "guest",
      points: 25,
      offsetDays: 3,
    },
  ],
  "28352414399": [
    {
      title: "Completed safety refresh training",
      description: "Finished Battle Arena SOP refresh after a late start to the month.",
      category: "training",
      points: 15,
      offsetDays: 5,
    },
  ],
  "28328800915": [
    {
      title: "Onboarding checklists complete",
      description: "Finished Space Tribe induction and first-month attendance card.",
      category: "general",
      points: 10,
      offsetDays: 14,
    },
  ],
};

const EVAL_COMMENTS = {
  "29440401419": {
    supervisor: "Mary ran tight, calm shifts and spent real time coaching floor crew.",
    manager: "Strong leadership month. Approved as July Employee of the Month.",
    employee: "Thank you — will keep the coaching logs going.",
  },
  "28460819794": {
    supervisor: "Cash integrity is excellent. Push add-ons a bit harder on weekday afternoons.",
    manager: "Solid, reliable cashier. Shortlisted for August EOM.",
    employee: "Noted on weekday upsell.",
  },
  "28214407767": {
    supervisor: "Safety checks are exemplary. Guests notice her energy on the inflatables.",
    manager: "Stand-out operator this cycle. Shortlisted for August EOM.",
    employee: "Happy to keep the same standard.",
  },
  "28352414399": {
    supervisor: "Attendance and ride readiness slipped. Needs closer daily coaching.",
    manager: "Agree — keep on a watch list this month, no EOM nomination.",
  },
  "28328800915": {},
};

function scoreFromActuals(kpiItems, persona) {
  const items = kpiItems.map((item) => {
    const actual = actualForKpi(item, persona);
    const target = Number(item.target_value ?? 0);
    const normalized = normalizeScore({
      actual,
      target,
      higherIsBetter: item.higher_is_better !== false,
      maxCapPct: Number(item.max_cap_pct ?? 120),
    });
    const weightPct = Number(item.weight ?? item.weight_pct ?? 0);
    return { actual, normalized, weighted: weightedScore(normalized, weightPct), weightPct, item };
  });
  const kpiScore = items.reduce((s, i) => s + i.weighted, 0);
  const kraScore = 100;
  const total = blendEvaluationScore(kraScore, kpiScore);
  return { items, kraScore, kpiScore, total, ratingBand: ratingBandForScore(total) };
}

async function ensureCycle(spec) {
  const { data: existing, error } = await admin
    .from("performance_cycles")
    .select("id, status")
    .eq("code", spec.code)
    .maybeSingle();
  if (error) throw error;
  if (existing) {
    const patch = {
      name: spec.name,
      period_kind: "month",
      period_start: spec.period_start,
      period_end: spec.period_end,
    };
    if (spec.status && existing.status !== spec.status) {
      // Keep an already-open current cycle open; only close historical ones.
      if (!(spec.code === spec.keepOpenCode && existing.status === "open")) {
        patch.status = spec.status;
      }
    }
    const { error: updErr } = await admin.from("performance_cycles").update(patch).eq("id", existing.id);
    if (updErr) throw updErr;
    return existing.id;
  }
  const { data, error: insErr } = await admin
    .from("performance_cycles")
    .insert({
      code: spec.code,
      name: spec.name,
      period_kind: "month",
      period_start: spec.period_start,
      period_end: spec.period_end,
      status: spec.status,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return data.id;
}

async function main() {
  const now = new Date();
  const curYear = now.getUTCFullYear();
  const curMonth = now.getUTCMonth();
  const prev = curMonth === 0 ? { year: curYear - 1, month: 11 } : { year: curYear, month: curMonth - 1 };
  const currentBounds = monthBounds(curYear, curMonth);
  const previousBounds = monthBounds(prev.year, prev.month);
  const currentCode = `${curYear}-${String(curMonth + 1).padStart(2, "0")}`;
  const previousCode = `${prev.year}-${String(prev.month + 1).padStart(2, "0")}`;
  const currentName = `${MONTH_NAMES[curMonth]} ${curYear} Performance Cycle`;
  const previousName = `${MONTH_NAMES[prev.month]} ${prev.year} Performance Cycle`;

  if (dryRun) {
    console.log("Dry run — would seed Inflatapark performance for:");
    console.log(JSON.stringify({ currentCode, previousCode, preferred: PREFERRED.map((p) => p.employee_code) }, null, 2));
    return;
  }

  const { data: location, error: locErr } = await admin
    .from("locations")
    .select("id, code, name, region, status")
    .eq("code", LOCATION_CODE)
    .eq("status", "active")
    .maybeSingle();
  if (locErr) throw locErr;
  if (!location) {
    console.error(`Active location ${LOCATION_CODE} (Inflatapark) was not found.`);
    process.exit(1);
  }

  const { data: allStaff, error: staffErr } = await admin
    .from("staff")
    .select("id, employee_code, full_name, job_title, department, staff_role, location_id, status")
    .eq("location_id", location.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("employee_code");
  if (staffErr) throw staffErr;

  const byCode = new Map((allStaff ?? []).map((s) => [s.employee_code, s]));
  const picked = [];
  for (const pref of PREFERRED) {
    const staff = byCode.get(pref.employee_code);
    if (staff) picked.push({ ...pref, staff });
  }

  if (!picked.length) {
    const fallback = (allStaff ?? []).slice(0, 5);
    if (!fallback.length) {
      console.error("No active Inflatapark staff found. Import the roster first.");
      process.exit(1);
    }
    console.warn("Preferred employee codes not found; using first active Inflatapark staff.");
    for (const staff of fallback) {
      picked.push({
        employee_code: staff.employee_code,
        jobRoleKey: resolveJobRole(staff),
        persona: "solid",
        currentStatus: "finalized",
        eom: null,
        staff,
      });
    }
  }

  const [{ data: kraTemplates, error: kraErr }, { data: kpiTemplates, error: kpiErr }] = await Promise.all([
    admin.from("kra_templates").select("id, code, job_role_key").eq("active", true),
    admin.from("kpi_templates").select("id, code, job_role_key").eq("active", true).not("job_role_key", "is", null),
  ]);
  if (kraErr) throw kraErr;
  if (kpiErr) throw kpiErr;

  const kraByRole = new Map((kraTemplates ?? []).map((t) => [t.job_role_key, t]));
  const kpiByRole = new Map((kpiTemplates ?? []).map((t) => [t.job_role_key, t]));
  const kraIds = (kraTemplates ?? []).map((t) => t.id);
  const kpiIds = (kpiTemplates ?? []).map((t) => t.id);

  const [{ data: kraItems, error: kraItemErr }, { data: kpiItems, error: kpiItemErr }] = await Promise.all([
    kraIds.length
      ? admin
          .from("kra_template_items")
          .select("id, template_id, code, title, description, weight_pct, sort_order")
          .in("template_id", kraIds)
          .order("sort_order")
      : Promise.resolve({ data: [], error: null }),
    kpiIds.length
      ? admin
          .from("kpi_template_items")
          .select(
            "id, template_id, code, label, description, weight, target_value, unit, higher_is_better, max_cap_pct, data_source, auto_query_key, sort_order",
          )
          .in("template_id", kpiIds)
          .order("sort_order")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (kraItemErr) throw kraItemErr;
  if (kpiItemErr) throw kpiItemErr;

  const kraItemsByTemplate = new Map();
  for (const item of kraItems ?? []) {
    const list = kraItemsByTemplate.get(item.template_id) ?? [];
    list.push(item);
    kraItemsByTemplate.set(item.template_id, list);
  }
  const kpiItemsByTemplate = new Map();
  for (const item of kpiItems ?? []) {
    const list = kpiItemsByTemplate.get(item.template_id) ?? [];
    list.push(item);
    kpiItemsByTemplate.set(item.template_id, list);
  }

  const currentCycleId = await ensureCycle({
    code: currentCode,
    name: currentName,
    period_start: currentBounds.start,
    period_end: currentBounds.end,
    status: "open",
    keepOpenCode: currentCode,
  });
  const previousCycleId = await ensureCycle({
    code: previousCode,
    name: previousName,
    period_start: previousBounds.start,
    period_end: previousBounds.end,
    status: "closed",
  });

  const staffIds = picked.map((p) => p.staff.id);
  const cycleIds = [currentCycleId, previousCycleId];

  const { error: delKpiErr } = await admin.from("employee_kpis").delete().in("staff_id", staffIds).in("cycle_id", cycleIds);
  if (delKpiErr) throw delKpiErr;
  const { error: delKraErr } = await admin.from("employee_kras").delete().in("staff_id", staffIds).in("cycle_id", cycleIds);
  if (delKraErr) throw delKraErr;
  const { error: delEvalErr } = await admin
    .from("employee_evaluations")
    .delete()
    .in("staff_id", staffIds)
    .in("cycle_id", cycleIds);
  if (delEvalErr) throw delEvalErr;

  const krasToInsert = [];
  const kpisToInsert = [];
  const evalsToInsert = [];
  const reviewsToInsert = [];
  const actualsToInsert = [];
  const achievementsToInsert = [];
  const nominationsToInsert = [];
  const awardsToInsert = [];
  const assignmentsNeeded = [];
  const summaryRows = [];

  for (const pick of picked) {
    const staff = pick.staff;
    const kraTemplate = kraByRole.get(pick.jobRoleKey);
    const kpiTemplate = kpiByRole.get(pick.jobRoleKey);
    const roleKras = kraTemplate ? (kraItemsByTemplate.get(kraTemplate.id) ?? []) : [];
    const roleKpis = kpiTemplate ? (kpiItemsByTemplate.get(kpiTemplate.id) ?? []) : [];
    if (!roleKras.length || !roleKpis.length) {
      throw new Error(`Missing KRA/KPI template items for job role ${pick.jobRoleKey}`);
    }
    if (kpiTemplate) assignmentsNeeded.push({ staff, templateId: kpiTemplate.id });

    const comments = EVAL_COMMENTS[pick.employee_code] ?? {};
    const scoredCurrent = scoreFromActuals(roleKpis, pick.persona);
    const prevPersona =
      pick.persona === "star" ? "solid" : pick.persona === "solid" ? "star" : pick.persona === "watch" ? "solid" : "solid";
    const scoredPrev = scoreFromActuals(roleKpis, prevPersona);

    for (const cycle of [
      { id: previousCycleId, bounds: previousBounds, scored: scoredPrev, status: "finalized", scoreIt: true },
      {
        id: currentCycleId,
        bounds: currentBounds,
        scored: scoredCurrent,
        status: pick.currentStatus,
        scoreIt: pick.currentStatus !== "draft",
      },
    ]) {
      for (const item of roleKras) {
        krasToInsert.push({
          id: seedUuid(`kra:${staff.id}:${cycle.id}:${item.code}`),
          staff_id: staff.id,
          cycle_id: cycle.id,
          kra_template_item_id: item.id,
          title: item.title,
          description: item.description,
          weight_pct: item.weight_pct,
          status: "active",
        });
      }
      for (const item of roleKpis) {
        const empKpiId = seedUuid(`kpi:${staff.id}:${cycle.id}:${item.code}`);
        kpisToInsert.push({
          id: empKpiId,
          staff_id: staff.id,
          cycle_id: cycle.id,
          kpi_template_item_id: item.id,
          code: item.code,
          label: item.label,
          weight_pct: item.weight,
          target_value: item.target_value,
          unit: item.unit,
          higher_is_better: item.higher_is_better,
          max_cap_pct: item.max_cap_pct ?? 120,
          data_source: item.data_source ?? "manual",
          auto_query_key: item.auto_query_key,
          status: "active",
        });
        if (cycle.scoreIt) {
          const scoredItem = cycle.scored.items.find((i) => i.item.code === item.code);
          actualsToInsert.push({
            id: seedUuid(`actual:${empKpiId}:${cycle.bounds.start}`),
            employee_kpi_id: empKpiId,
            period_start: cycle.bounds.start,
            period_end: cycle.bounds.end,
            actual_value: scoredItem?.actual ?? actualForKpi(item, pick.persona),
            normalized_score: round2(scoredItem?.normalized ?? 0),
            weighted_score: round2(scoredItem?.weighted ?? 0),
            source: "manual",
            notes: "Inflatapark performance demo seed",
          });
        }
      }

      const evalId = seedUuid(`eval:${staff.id}:${cycle.id}`);
      const evalRow = {
        id: evalId,
        staff_id: staff.id,
        cycle_id: cycle.id,
        location_id: location.id,
        status: cycle.status,
        supervisor_comments: comments.supervisor ?? null,
        manager_comments: comments.manager ?? null,
        employee_comments: comments.employee ?? null,
        finalized_at: cycle.status === "finalized" ? `${cycle.bounds.end}T16:00:00+03:00` : null,
      };
      if (cycle.scoreIt) {
        evalRow.kra_score = round2(cycle.scored.kraScore);
        evalRow.kpi_score = round2(cycle.scored.kpiScore);
        evalRow.total_score = round2(cycle.scored.total);
        evalRow.rating_band = cycle.scored.ratingBand;
      }
      evalsToInsert.push(evalRow);

      if (cycle.status === "finalized") {
        reviewsToInsert.push(
          {
            id: seedUuid(`rev:${evalId}:1`),
            evaluation_id: evalId,
            from_status: "draft",
            to_status: "supervisor_review",
            comments: "Submitted for supervisor review",
          },
          {
            id: seedUuid(`rev:${evalId}:2`),
            evaluation_id: evalId,
            from_status: "supervisor_review",
            to_status: "manager_review",
            comments: comments.supervisor ?? "Supervisor signed off",
          },
          {
            id: seedUuid(`rev:${evalId}:3`),
            evaluation_id: evalId,
            from_status: "manager_review",
            to_status: "employee_ack",
            comments: comments.manager ?? "Manager approved",
          },
          {
            id: seedUuid(`rev:${evalId}:4`),
            evaluation_id: evalId,
            from_status: "employee_ack",
            to_status: "finalized",
            comments: comments.employee ?? "Acknowledged",
          },
        );
      } else if (cycle.status === "manager_review") {
        reviewsToInsert.push(
          {
            id: seedUuid(`rev:${evalId}:1`),
            evaluation_id: evalId,
            from_status: "draft",
            to_status: "supervisor_review",
            comments: "Submitted for supervisor review",
          },
          {
            id: seedUuid(`rev:${evalId}:2`),
            evaluation_id: evalId,
            from_status: "supervisor_review",
            to_status: "manager_review",
            comments: comments.supervisor ?? "Escalated to manager",
          },
        );
      }
    }

    const achDefs = ACHIEVEMENTS[pick.employee_code] ?? [];
    for (const ach of achDefs) {
      const achieved = new Date(Date.UTC(curYear, curMonth, Math.max(1, Math.min(28, 22 - ach.offsetDays))));
      achievementsToInsert.push({
        id: seedUuid(`ach:${staff.id}:${ach.title}`),
        staff_id: staff.id,
        location_id: location.id,
        title: ach.title,
        description: ach.description,
        achieved_on: ymd(achieved),
        category: ach.category,
        points: ach.points,
      });
    }

    if (pick.eom === "winner_prev") {
      const nomId = seedUuid(`nom:${staff.id}:${previousCode}`);
      nominationsToInsert.push({
        id: nomId,
        staff_id: staff.id,
        cycle_id: previousCycleId,
        location_id: location.id,
        award_type: "employee_of_month",
        nomination_month: previousBounds.start,
        rationale:
          "Led Inflatapark through a busy City Center month with full checklist compliance and strong crew coaching.",
        status: "approved",
        reviewed_at: `${previousBounds.end}T15:00:00+03:00`,
      });
      awardsToInsert.push({
        id: seedUuid(`award:${staff.id}:${previousCode}`),
        nomination_id: nomId,
        staff_id: staff.id,
        location_id: location.id,
        award_type: "employee_of_month",
        award_month: previousBounds.start,
        title: "Employee of the Month",
        citation: `${staff.full_name} — ${MONTH_NAMES[prev.month]} ${prev.year} Employee of the Month, Inflatapark.`,
      });
    }
    if (pick.eom === "shortlist_current") {
      nominationsToInsert.push({
        id: seedUuid(`nom:${staff.id}:${currentCode}`),
        staff_id: staff.id,
        cycle_id: currentCycleId,
        location_id: location.id,
        award_type: "employee_of_month",
        nomination_month: currentBounds.start,
        rationale:
          pick.jobRoleKey === "cashier"
            ? "Consistently accurate cash closes and a visible weekday upsell lift."
            : "Guest compliments plus a perfect attraction safety record this cycle.",
        status: "shortlisted",
      });
    }

    summaryRows.push({
      name: staff.full_name,
      employee_code: staff.employee_code,
      job_title: staff.job_title,
      role: pick.jobRoleKey,
      current_status: pick.currentStatus,
      current_score: pick.currentStatus === "draft" ? null : round2(scoredCurrent.total),
      current_band: pick.currentStatus === "draft" ? null : scoredCurrent.ratingBand,
      previous_score: round2(scoredPrev.total),
    });
  }

  const { error: kraInsErr } = await admin.from("employee_kras").insert(krasToInsert);
  if (kraInsErr) throw kraInsErr;
  const { error: kpiInsErr } = await admin.from("employee_kpis").insert(kpisToInsert);
  if (kpiInsErr) throw kpiInsErr;
  if (actualsToInsert.length) {
    const { error: actErr } = await admin.from("kpi_actuals").insert(actualsToInsert);
    if (actErr) throw actErr;
  }
  const { error: evalInsErr } = await admin.from("employee_evaluations").insert(evalsToInsert);
  if (evalInsErr) throw evalInsErr;
  if (reviewsToInsert.length) {
    const { error: revErr } = await admin.from("evaluation_reviews").insert(reviewsToInsert);
    if (revErr) throw revErr;
  }

  if (achievementsToInsert.length) {
    const { error: achErr } = await admin.from("employee_achievements").upsert(achievementsToInsert, { onConflict: "id" });
    if (achErr) throw achErr;
  }
  if (nominationsToInsert.length) {
    const { error: nomErr } = await admin.from("employee_nominations").upsert(nominationsToInsert, { onConflict: "id" });
    if (nomErr) throw nomErr;
  }
  if (awardsToInsert.length) {
    const { error: awErr } = await admin.from("employee_awards").upsert(awardsToInsert, { onConflict: "id" });
    if (awErr) throw awErr;
  }

  for (const row of assignmentsNeeded) {
    const { data: existing } = await admin
      .from("kpi_assignments")
      .select("id")
      .eq("template_id", row.templateId)
      .eq("staff_id", row.staff.id)
      .eq("active", true)
      .maybeSingle();
    if (!existing) {
      const { error: asErr } = await admin.from("kpi_assignments").insert({
        template_id: row.templateId,
        staff_id: row.staff.id,
        location_id: location.id,
        active: true,
      });
      if (asErr) throw asErr;
    }
  }

  console.log(`Seeded Inflatapark performance (${location.name} / ${location.code}, ${location.region}).`);
  console.log(`Cycles: ${previousCode} (closed), ${currentCode} (open).`);
  console.log(`Staff: ${picked.length}`);
  for (const row of summaryRows) {
    const score = row.current_score != null ? `${row.current_score} ${row.current_band}` : "draft (unscored)";
    console.log(`  - ${row.name} (${row.employee_code}, ${row.job_title}) → ${row.role} · ${row.current_status} · ${score}`);
  }
  console.log(
    `Rows: ${krasToInsert.length} KRAs, ${kpisToInsert.length} KPIs, ${actualsToInsert.length} actuals, ${evalsToInsert.length} evaluations, ${reviewsToInsert.length} reviews, ${achievementsToInsert.length} achievements, ${nominationsToInsert.length} nominations, ${awardsToInsert.length} awards.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
