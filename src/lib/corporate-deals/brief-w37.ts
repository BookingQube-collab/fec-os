/**
 * Week 37 Corporate Deals brief narrative (HTML/PDF, 15 Sep 2026 meeting).
 * Figures live in weekly/month/trend tables; this holds meeting meta + decision text.
 */
export const BRIEF_W37_ISO_WEEK = "2026-W37";

export const BRIEF_W37_META = {
  iso_week: BRIEF_W37_ISO_WEEK,
  week_label: "7 to 13 September 2026",
  meeting_date: "2026-09-15",
  meeting_label: "Tuesday 15 September 2026",
  prepared_by: "Rajan Pathak, Head of Operations (FEC & IT)",
  reviewed_by: "Mr. Adil",
  source: "BookingQube event-wise promo-code export",
  next_review: "Tuesday 22 September 2026",
} as const;

export interface BriefIncidentItem {
  rank: number;
  title: string;
  detail: string;
  ask: string;
  status_label: string;
  severity: "ok" | "info" | "warn" | "crit" | "gold";
}

export interface BriefDecisionItem {
  rank: number;
  title: string;
  detail: string;
  ask: string;
  where: string;
  severity: "crit" | "gold" | "info";
}

/** §08 Incidents & important points — no new incidents; carry-forward status. */
export const BRIEF_W37_INCIDENTS_BANNER = {
  title: "No incidents this week",
  detail:
    "No customer, staff or equipment incidents reported at any of the four sites between 7 and 13 September.",
} as const;

export const BRIEF_W37_INCIDENT_POINTS: readonly BriefIncidentItem[] = [
  {
    rank: 1,
    title: "Commercial registration renewal, KDS and InflataPark",
    detail: "Already flagged as critical at last week's meeting. Abbas has been informed and is actioning the renewal.",
    ask: "Status: in hand with Abbas, no further action needed at this meeting.",
    status_label: "In progress",
    severity: "info",
  },
  {
    rank: 2,
    title: "Socks stock, KDS / InflataPark / Urban Arena",
    detail: "Stock has been received against the escalated shortage raised in the previous minutes.",
    ask: "Status: resolved. Reorder quantity and minimum stock level still to be proposed.",
    status_label: "Received",
    severity: "ok",
  },
  {
    rank: 3,
    title: "CCTV UPS replacement, KDS",
    detail: "Quotation has been shared and is ready for approval.",
    ask: "Ask: approve the quotation so the replacement can proceed.",
    status_label: "Awaiting approval",
    severity: "warn",
  },
  {
    rank: 4,
    title: "Camera 18 repositioning, InflataPark",
    detail: "Quotation requested from the supplier; not yet received.",
    ask: "Status: waiting on the supplier. No decision possible until the quote arrives.",
    status_label: "Waiting on supplier",
    severity: "info",
  },
  {
    rank: 5,
    title: "All remaining points from the 8 September minutes",
    detail:
      "Every other item carried from the previous minutes (training plan, spare parts, floats, uniforms, membership plan and the rest) is discussed and now needs approval at this meeting.",
    ask: "Ask: approve as a set, or flag any that need to be held back individually.",
    status_label: "Needs approval",
    severity: "gold",
  },
] as const;

/** §09 Needs your decision — four asks from this week's partner data. */
export const BRIEF_W37_DECISIONS: readonly BriefDecisionItem[] = [
  {
    rank: 1,
    title: "BOGO terms with the three aggregators",
    detail:
      "Urban Point, My Book and Entertainer account for 24% of redemptions this month but issue only one ticket each, against 3.7 for a staff-ID partner. Every free pass brings a single visitor, not a group.",
    ask: "Decision requested: approve a monthly redemption cap per aggregator, or a move to percentage discount at the next renewal.",
    where: "85 free passes month to date",
    severity: "crit",
  },
  {
    rank: 2,
    title: "Seven partners with no usage at all this month",
    detail:
      "Dar App, Classmate, MyBenefit, DHL, Huawei, Qatar Media Corporation and Snoonu. MyBenefit's four codes have never been redeemed since they were issued.",
    ask: "Ask: approve Operations to contact each partner HR or app owner within two weeks and confirm the offer is live and promoted.",
    where: "7 partners",
    severity: "gold",
  },
  {
    rank: 3,
    title: "Crayons & Bricks Vendome depends almost entirely on BOGO",
    detail:
      "23 of its 24 redemptions this week were aggregator free passes, against one staff-ID redemption. The site brought in 29 tickets in total, the lowest of the four.",
    ask: "Ask: agree a corporate push for Vendome, or accept the site as an aggregator acquisition channel.",
    where: "23 of 24 redemptions",
    severity: "info",
  },
  {
    rank: 4,
    title: "Two Imtiyazat partners on the master sheet",
    detail:
      "Imtyazat records 71 redemptions this month against 6 for Al Jazeera Imtiyazat. The gap suggests counters are applying one code for both cards.",
    ask: "Ask: confirm which ID the counters check, then merge the two offers or separate them clearly at the till.",
    where: "71 against 6",
    severity: "info",
  },
] as const;

export const BRIEF_W37_VENUE_NOTES = [
  {
    title: "Crayons & Bricks Vendome runs on BOGO",
    detail:
      "23 of its 24 redemptions were aggregator free passes, against a single staff-ID redemption all week. It is running as an aggregator channel, not a corporate one.",
  },
  {
    title: "Urban Arena carries the volume",
    detail:
      "67 redemptions and 241 tickets, the highest of the four sites, and 57 of the 67 came from staff-ID partners bringing groups.",
  },
  {
    title: "Free passes bring one visitor each",
    detail:
      "Every aggregator redemption issues a single ticket, at all four sites. Corporate redemptions bring 3.7 tickets on average.",
  },
] as const;

export function briefForWeek(isoWeek: string | null | undefined) {
  if (isoWeek !== BRIEF_W37_ISO_WEEK) return null;
  return {
    meta: BRIEF_W37_META,
    incidents_banner: BRIEF_W37_INCIDENTS_BANNER,
    incident_points: BRIEF_W37_INCIDENT_POINTS,
    decisions: BRIEF_W37_DECISIONS,
    venue_notes: BRIEF_W37_VENUE_NOTES,
  };
}
