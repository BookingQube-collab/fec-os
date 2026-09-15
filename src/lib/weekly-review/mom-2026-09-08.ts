import type { ActionStatus } from "./constants";

/**
 * FEC Management & Operations Review — 8 Sep 2026 minutes.
 * Lives on the shared weekly_review_actions register (Weekly Management Review).
 * Corporate Deals Report alone uses source_module corporate_deals_mom.
 *
 * Status enum is open | wip | done. Richer Tuesday labels go in update_note.
 */
export const MOM_MEETING = {
  week_label: "Week 37",
  week_start: "2026-09-07",
  week_end: "2026-09-13",
  meeting_date: "2026-09-08",
  notes:
    "FEC Management & Operations Review MoM 8 Sep 2026. Status updates applied from Tuesday follow-up.",
} as const;

export const SOURCE_WEEKLY_MOM = "weekly_review_mom";
export const SOURCE_CORPORATE_MOM = "corporate_deals_mom";

/** Rich label → enum + update_note prefix. */
export const STATUS_LABEL_MAP = {
  "In progress": { status: "wip" as const, label: "In progress" },
  Received: { status: "done" as const, label: "Received" },
  "Awaiting approval": { status: "open" as const, label: "Awaiting approval" },
  "Waiting on supplier": { status: "wip" as const, label: "Waiting on supplier" },
  "Needs approval": { status: "open" as const, label: "Needs approval" },
} as const;

export type MomStatusLabel = keyof typeof STATUS_LABEL_MAP;

export interface MomActionSeed {
  /** Deterministic id for idempotent upsert. */
  id: string;
  venue_text: string;
  action: string;
  owner: string;
  due: string;
  status_label: MomStatusLabel;
  update_detail: string;
  source_module: typeof SOURCE_WEEKLY_MOM | typeof SOURCE_CORPORATE_MOM;
  sort_order: number;
}

function row(
  sort: number,
  idSuffix: string,
  venue_text: string,
  action: string,
  owner: string,
  due: string,
  status_label: MomStatusLabel,
  update_detail: string,
  source_module: MomActionSeed["source_module"] = SOURCE_WEEKLY_MOM,
): MomActionSeed {
  return {
    id: `a0860908-0000-4000-8000-${idSuffix.padStart(12, "0")}`,
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

const NEEDS = "Needs approval" as const;
const needsDetail =
  "Needs approval — approve as a set, or flag any to hold back (Tuesday follow-up).";

/** Decisions 1–11 (split where Tuesday status targets a sub-item), not-discussed 1–4, additional 1–5. */
export const MOM_ACTIONS_2026_09_08: readonly MomActionSeed[] = [
  row(
    1,
    "1",
    "KDS",
    "Q-Balloon backside safety grill (critical safety) — final quotation for budget release and install",
    "Operations / Maintenance",
    "Earliest",
    NEEDS,
    needsDetail,
  ),
  row(
    2,
    "2",
    "KDS / InflataPark / Urban Arena",
    "Socks stock — submit reorder qty by size and propose minimum stock level",
    "Operations",
    "This week",
    "Received",
    "Received; reorder qty & min stock still to propose. Stock received against escalated shortage.",
  ),
  row(
    3,
    "3",
    "InflataPark",
    "Blowers service (5× 2500 W) and Inflata Kids additional white lighting — PR once quotations received",
    "Maintenance",
    "This week",
    NEEDS,
    needsDetail,
  ),
  row(
    4,
    "4",
    "KDS / InflataPark",
    "Commercial registration renewal (CR expires 13 Sep) — sign-off by 12 Sep",
    "Abbas",
    "12 Sep 2026",
    "In progress",
    "In hand with Abbas; no further action needed at this meeting.",
  ),
  row(
    5,
    "5",
    "Urban Arena",
    "Qatar Tourism license renewal (expires 15 Sep)",
    "Operations / Compliance",
    "15 Sep 2026",
    NEEDS,
    needsDetail,
  ),
  row(
    6,
    "6",
    "Multi-venue",
    "Consolidated training plan — mandatory safety (first aid/CPR/fire/HSE) + Training Development Programme",
    "HR / Operations",
    "Mid-Sep schedule",
    NEEDS,
    needsDetail,
  ),
  row(
    7,
    "7",
    "KDS",
    "CCTV UPS replacement — approve shared quotation so replacement can proceed",
    "Operations / Quasain",
    "This week",
    "Awaiting approval",
    "Awaiting approval — quotation shared; approve so replacement can proceed.",
  ),
  row(
    8,
    "8",
    "Urban Arena / KDS",
    "Additional usable wristbands (~150 for Urban Arena)",
    "Operations / Quasain",
    "TBC",
    NEEDS,
    needsDetail,
  ),
  row(
    9,
    "9",
    "KDS",
    "Yalla Wall rubber protection — confirm alternative sourcing (unavailable locally)",
    "Quasain",
    "TBC",
    NEEDS,
    needsDetail,
  ),
  row(
    10,
    "10",
    "Multi-venue",
    "Spare parts consolidation (Dream Football, NFS, Toon Quest, RC Cars, ID printer, Interactive Wall, Ball Pit LED, E-Graffiti)",
    "Russell",
    "This week",
    NEEDS,
    needsDetail,
  ),
  row(
    11,
    "11",
    "Multi-venue",
    "Operational floats — submit PR for approved QAR 1,000 birthday (Louie) and QAR 300 UA supervisor floats",
    "Operations / Louie",
    "This week",
    NEEDS,
    `${needsDetail} Maintenance float QAR 2,000 was not approved.`,
  ),
  row(
    12,
    "12",
    "Estate",
    "Team-building and employee incentive plan — submit for approval; sales targets next 4 months from higher management",
    "Operations / HR",
    "September",
    NEEDS,
    needsDetail,
  ),
  row(
    13,
    "13",
    "KDS",
    "Photo Booth pricing revision — submit proposed structure for final approval",
    "Operations",
    "TBC",
    NEEDS,
    needsDetail,
  ),
  row(
    14,
    "14",
    "Estate",
    "Uniforms and name badges — Ahmad revised design (supervisor vs crew); quotations after design/qty",
    "Ahmad",
    "September",
    NEEDS,
    needsDetail,
  ),
  row(
    15,
    "15",
    "Estate",
    "Other commercial/operational proposals (companion fees, branding, activity concepts) — submit with pricing and impact",
    "Operations",
    "TBC",
    NEEDS,
    needsDetail,
  ),
  row(
    16,
    "16",
    "InflataPark",
    "Camera 18 repositioning — quotation from ALFOG for final approval before execution",
    "Operations / Security",
    "This week",
    "Waiting on supplier",
    "Waiting on supplier — quotation requested; not yet received. No decision until quote arrives.",
  ),
  row(
    17,
    "17",
    "KDS",
    "CCTV room storage racks — Quasain confirm preferred design, then quotation and higher-management approval",
    "Operations / Quasain",
    "TBC",
    NEEDS,
    needsDetail,
  ),
  row(
    18,
    "18",
    "KDS",
    "Cheap toys sale — confirm buyer, selling price and completion timeline",
    "Awada",
    "TBC",
    NEEDS,
    needsDetail,
  ),
  row(
    19,
    "19",
    "KDS",
    "Entrance/exit floor branding and barriers — design and costing for approval",
    "Operations / Ahmad",
    "TBC",
    NEEDS,
    needsDetail,
  ),
  row(
    20,
    "20",
    "Aspire Park Carousel / Urban Arena",
    "Safety barrier modifications — designs and quotations for Aspire Carousel and Urban Arena fixed barriers",
    "Maintenance / Operations",
    "TBC",
    NEEDS,
    needsDetail,
  ),
  row(
    21,
    "21",
    "Urban Arena",
    "Membership plan — prepare and submit to Mr. Adil for review",
    "Rajan Pathak / Lucian",
    "TBC",
    NEEDS,
    needsDetail,
  ),
  row(
    22,
    "22",
    "Estate",
    "FEC HR solution — demonstrate to HR and incorporate required changes",
    "Rajan Pathak / HR",
    "TBC",
    NEEDS,
    `${needsDetail} Demo pending.`,
  ),
  row(
    23,
    "23",
    "Estate",
    "FEC Project Management Tool — rework client approval workflow; finalize with hired expert",
    "Rajan Pathak",
    "TBC",
    NEEDS,
    needsDetail,
  ),
  row(
    24,
    "24",
    "Corporate deals",
    "Standardized weekly Corporate Deals Report — deals and performance by company",
    "Rajan Pathak",
    "Weekly",
    NEEDS,
    needsDetail,
    SOURCE_CORPORATE_MOM,
  ),
  row(
    25,
    "25",
    "C&B Vendome",
    "Activity plan — slime, acrylic painting, figurine painting, small slides + proposed pricing",
    "C&B Vendome Operations / Rajan Pathak",
    "September",
    NEEDS,
    needsDetail,
  ),
];

export function momActionToRow(seed: MomActionSeed, reviewId: string): {
  id: string;
  review_id: string;
  venue_text: string;
  action: string;
  owner: string;
  due: string;
  status: ActionStatus;
  update_note: string;
  carried_from: null;
  sort_order: number;
  source_module: string;
} {
  const mapped = STATUS_LABEL_MAP[seed.status_label];
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
