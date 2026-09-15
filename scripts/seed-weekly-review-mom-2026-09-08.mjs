/**
 * Upsert 8 Sep 2026 Management & Operations Review MoM into weekly_review_actions.
 *
 * Usage: node --env-file=.env.local scripts/seed-weekly-review-mom-2026-09-08.mjs
 *
 * Shared register only — no duplicate table. source_module:
 *   weekly_review_mom     → Weekly Management Review pack
 *   corporate_deals_mom   → Corporate Deals Report row (MoM tab)
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(url, key);

/** Inline mirror of src/lib/weekly-review/mom-2026-09-08.ts (seed runs without TS loader). */
const MOM_MEETING = {
  week_label: "Week 37",
  week_start: "2026-09-07",
  week_end: "2026-09-13",
  meeting_date: "2026-09-08",
  notes:
    "FEC Management & Operations Review MoM 8 Sep 2026. Status updates applied from Tuesday follow-up.",
};

const SOURCE_WEEKLY_MOM = "weekly_review_mom";
const SOURCE_CORPORATE_MOM = "corporate_deals_mom";

const STATUS_LABEL_MAP = {
  "In progress": { status: "wip", label: "In progress" },
  Received: { status: "done", label: "Received" },
  "Awaiting approval": { status: "open", label: "Awaiting approval" },
  "Waiting on supplier": { status: "wip", label: "Waiting on supplier" },
  "Needs approval": { status: "open", label: "Needs approval" },
};

const NEEDS = "Needs approval";
const needsDetail =
  "Needs approval — approve as a set, or flag any to hold back (Tuesday follow-up).";

function row(sort, idSuffix, venue_text, action, owner, due, status_label, update_detail, source_module = SOURCE_WEEKLY_MOM) {
  return {
    id: `a0860908-0000-4000-8000-${String(idSuffix).padStart(12, "0")}`,
    venue_text,
    action,
    owner,
    due,
    status_label,
    update_detail,
    source_module,
    sort_order: sort,
  };
}

const MOM_ACTIONS = [
  row(1, 1, "KDS", "Q-Balloon backside safety grill (critical safety) — final quotation for budget release and install", "Operations / Maintenance", "Earliest", NEEDS, needsDetail),
  row(2, 2, "KDS / InflataPark / Urban Arena", "Socks stock — submit reorder qty by size and propose minimum stock level", "Operations", "This week", "Received", "Received; reorder qty & min stock still to propose. Stock received against escalated shortage."),
  row(3, 3, "InflataPark", "Blowers service (5× 2500 W) and Inflata Kids additional white lighting — PR once quotations received", "Maintenance", "This week", NEEDS, needsDetail),
  row(4, 4, "KDS / InflataPark", "Commercial registration renewal (CR expires 13 Sep) — sign-off by 12 Sep", "Abbas", "12 Sep 2026", "In progress", "In hand with Abbas; no further action needed at this meeting."),
  row(5, 5, "Urban Arena", "Qatar Tourism license renewal (expires 15 Sep)", "Operations / Compliance", "15 Sep 2026", NEEDS, needsDetail),
  row(6, 6, "Multi-venue", "Consolidated training plan — mandatory safety (first aid/CPR/fire/HSE) + Training Development Programme", "HR / Operations", "Mid-Sep schedule", NEEDS, needsDetail),
  row(7, 7, "KDS", "CCTV UPS replacement — approve shared quotation so replacement can proceed", "Operations / Quasain", "This week", "Awaiting approval", "Awaiting approval — quotation shared; approve so replacement can proceed."),
  row(8, 8, "Urban Arena / KDS", "Additional usable wristbands (~150 for Urban Arena)", "Operations / Quasain", "TBC", NEEDS, needsDetail),
  row(9, 9, "KDS", "Yalla Wall rubber protection — confirm alternative sourcing (unavailable locally)", "Quasain", "TBC", NEEDS, needsDetail),
  row(10, 10, "Multi-venue", "Spare parts consolidation (Dream Football, NFS, Toon Quest, RC Cars, ID printer, Interactive Wall, Ball Pit LED, E-Graffiti)", "Russell", "This week", NEEDS, needsDetail),
  row(11, 11, "Multi-venue", "Operational floats — submit PR for approved QAR 1,000 birthday (Louie) and QAR 300 UA supervisor floats", "Operations / Louie", "This week", NEEDS, `${needsDetail} Maintenance float QAR 2,000 was not approved.`),
  row(12, 12, "Estate", "Team-building and employee incentive plan — submit for approval; sales targets next 4 months from higher management", "Operations / HR", "September", NEEDS, needsDetail),
  row(13, 13, "KDS", "Photo Booth pricing revision — submit proposed structure for final approval", "Operations", "TBC", NEEDS, needsDetail),
  row(14, 14, "Estate", "Uniforms and name badges — Ahmad revised design (supervisor vs crew); quotations after design/qty", "Ahmad", "September", NEEDS, needsDetail),
  row(15, 15, "Estate", "Other commercial/operational proposals (companion fees, branding, activity concepts) — submit with pricing and impact", "Operations", "TBC", NEEDS, needsDetail),
  row(16, 16, "InflataPark", "Camera 18 repositioning — quotation from ALFOG for final approval before execution", "Operations / Security", "This week", "Waiting on supplier", "Waiting on supplier — quotation requested; not yet received. No decision until quote arrives."),
  row(17, 17, "KDS", "CCTV room storage racks — Quasain confirm preferred design, then quotation and higher-management approval", "Operations / Quasain", "TBC", NEEDS, needsDetail),
  row(18, 18, "KDS", "Cheap toys sale — confirm buyer, selling price and completion timeline", "Awada", "TBC", NEEDS, needsDetail),
  row(19, 19, "KDS", "Entrance/exit floor branding and barriers — design and costing for approval", "Operations / Ahmad", "TBC", NEEDS, needsDetail),
  row(20, 20, "Aspire Park Carousel / Urban Arena", "Safety barrier modifications — designs and quotations for Aspire Carousel and Urban Arena fixed barriers", "Maintenance / Operations", "TBC", NEEDS, needsDetail),
  row(21, 21, "Urban Arena", "Membership plan — prepare and submit to Mr. Adil for review", "Rajan Pathak / Lucian", "TBC", NEEDS, needsDetail),
  row(22, 22, "Estate", "FEC HR solution — demonstrate to HR and incorporate required changes", "Rajan Pathak / HR", "TBC", NEEDS, `${needsDetail} Demo pending.`),
  row(23, 23, "Estate", "FEC Project Management Tool — rework client approval workflow; finalize with hired expert", "Rajan Pathak", "TBC", NEEDS, needsDetail),
  row(24, 24, "Corporate deals", "Standardized weekly Corporate Deals Report — deals and performance by company", "Rajan Pathak", "Weekly", NEEDS, needsDetail, SOURCE_CORPORATE_MOM),
  row(25, 25, "C&B Vendome", "Activity plan — slime, acrylic painting, figurine painting, small slides + proposed pricing", "C&B Vendome Operations / Rajan Pathak", "September", NEEDS, needsDetail),
];

function toDbRow(seed, reviewId) {
  const mapped = STATUS_LABEL_MAP[seed.status_label];
  if (!mapped) throw new Error(`Unknown status_label: ${seed.status_label}`);
  return {
    id: seed.id,
    review_id: reviewId,
    venue_text: seed.venue_text,
    action: seed.action,
    owner: seed.owner,
    due: seed.due,
    status: mapped.status,
    update_note: seed.update_detail,
    carried_from: null,
    sort_order: seed.sort_order,
    source_module: seed.source_module,
  };
}

// ponytail: one assert-based check — status map + count
{
  const counts = { open: 0, wip: 0, done: 0 };
  for (const a of MOM_ACTIONS) counts[STATUS_LABEL_MAP[a.status_label].status]++;
  if (MOM_ACTIONS.length !== 25) throw new Error(`expected 25 actions, got ${MOM_ACTIONS.length}`);
  if (counts.done !== 1) throw new Error(`expected 1 done (socks), got ${counts.done}`);
  if (counts.wip !== 2) throw new Error(`expected 2 wip (CR + Camera 18), got ${counts.wip}`);
  const cr = MOM_ACTIONS.find((a) => a.sort_order === 4);
  const socks = MOM_ACTIONS.find((a) => a.sort_order === 2);
  const ups = MOM_ACTIONS.find((a) => a.sort_order === 7);
  const cam = MOM_ACTIONS.find((a) => a.sort_order === 16);
  if (STATUS_LABEL_MAP[cr.status_label].status !== "wip") throw new Error("CR must be wip");
  if (STATUS_LABEL_MAP[socks.status_label].status !== "done") throw new Error("socks must be done");
  if (STATUS_LABEL_MAP[ups.status_label].status !== "open") throw new Error("UPS must be open");
  if (STATUS_LABEL_MAP[cam.status_label].status !== "wip") throw new Error("Camera 18 must be wip");
  console.log("self-check ok", counts);
}

async function main() {
  const { data: existing, error: findErr } = await sb
    .from("weekly_reviews")
    .select("id")
    .eq("week_start", MOM_MEETING.week_start)
    .maybeSingle();
  if (findErr) throw findErr;

  let reviewId = existing?.id;
  if (!reviewId) {
    const { data: created, error } = await sb
      .from("weekly_reviews")
      .insert({
        week_label: MOM_MEETING.week_label,
        week_start: MOM_MEETING.week_start,
        week_end: MOM_MEETING.week_end,
        meeting_date: MOM_MEETING.meeting_date,
        status: "presented",
        notes: MOM_MEETING.notes,
      })
      .select("id")
      .single();
    if (error) throw error;
    reviewId = created.id;
    console.log("created weekly_reviews", reviewId);
  } else {
    const { error } = await sb
      .from("weekly_reviews")
      .update({
        week_label: MOM_MEETING.week_label,
        week_end: MOM_MEETING.week_end,
        meeting_date: MOM_MEETING.meeting_date,
        notes: MOM_MEETING.notes,
        status: "presented",
      })
      .eq("id", reviewId);
    if (error) throw error;
    console.log("updated weekly_reviews", reviewId);
  }

  const rows = MOM_ACTIONS.map((a) => toDbRow(a, reviewId));
  const { error: upsertErr } = await sb.from("weekly_review_actions").upsert(rows, { onConflict: "id" });
  if (upsertErr) throw upsertErr;

  console.log(`upserted ${rows.length} weekly_review_actions`);
  console.log(
    "status map: In progress→wip, Received→done, Awaiting approval→open, Waiting on supplier→wip, Needs approval→open (detail in update_note)",
  );
  console.log("UI: /operations/weekly-review (Follow-up actions) · Corporate Deals MoM tab shows corporate_deals_mom row");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
