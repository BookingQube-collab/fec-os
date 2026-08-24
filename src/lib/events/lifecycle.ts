export const LIFECYCLE_PHASES = [
  { code: "initiation", sort_order: 1, label_en: "Event initiation", label_ar: "بدء الفعالية", is_critical: false, is_terminal: false },
  { code: "feasibility", sort_order: 2, label_en: "Feasibility", label_ar: "الجدوى", is_critical: false, is_terminal: false },
  { code: "budget_approval", sort_order: 3, label_en: "Budget approval", label_ar: "اعتماد الميزانية", is_critical: true, is_terminal: false },
  { code: "design", sort_order: 4, label_en: "Design", label_ar: "التصميم", is_critical: false, is_terminal: false },
  { code: "procurement", sort_order: 5, label_en: "Procurement", label_ar: "المشتريات", is_critical: true, is_terminal: false },
  { code: "pre_production", sort_order: 6, label_en: "Pre-production", label_ar: "ما قبل الإنتاج", is_critical: true, is_terminal: false },
  { code: "staffing", sort_order: 7, label_en: "Staffing", label_ar: "التوظيف", is_critical: false, is_terminal: false },
  { code: "logistics", sort_order: 8, label_en: "Logistics", label_ar: "اللوجستيات", is_critical: false, is_terminal: false },
  { code: "bump_in", sort_order: 9, label_en: "Bump-in", label_ar: "الدخول والتركيب", is_critical: true, is_terminal: false },
  { code: "testing", sort_order: 10, label_en: "Testing", label_ar: "الاختبار", is_critical: true, is_terminal: false },
  { code: "go_live", sort_order: 11, label_en: "Go-live", label_ar: "الانطلاق", is_critical: true, is_terminal: false },
  { code: "operations", sort_order: 12, label_en: "Operations", label_ar: "التشغيل", is_critical: true, is_terminal: false },
  { code: "bump_out", sort_order: 13, label_en: "Bump-out", label_ar: "الخروج والفك", is_critical: true, is_terminal: false },
  { code: "closure", sort_order: 14, label_en: "Closure", label_ar: "الإغلاق", is_critical: false, is_terminal: true },
] as const;

export const SIDE_LIFECYCLE_STAGES = [
  { code: "cancelled", sort_order: 90, label_en: "Cancelled", label_ar: "ملغى", is_critical: false, is_terminal: true },
  { code: "on_hold", sort_order: 91, label_en: "On Hold", label_ar: "معلّق", is_critical: false, is_terminal: false },
] as const;

export type LifecyclePhaseCode = (typeof LIFECYCLE_PHASES)[number]["code"];

export const LIFECYCLE_PHASE_CODES = new Set<string>(LIFECYCLE_PHASES.map((p) => p.code));

/** Old 20-stage codes → canonical 14-phase (or side) code. */
export const STAGE_REMAP: Record<string, string> = {
  lead: "initiation",
  inquiry: "initiation",
  opportunity: "initiation",
  feasibility: "feasibility",
  proposal_prep: "budget_approval",
  proposal: "budget_approval",
  proposal_submitted: "budget_approval",
  negotiation: "budget_approval",
  awarded: "budget_approval",
  contracting: "budget_approval",
  contracted: "budget_approval",
  planning: "design",
  procurement: "procurement",
  pre_production: "pre_production",
  setup: "bump_in",
  bump_in: "bump_in",
  ready_for_opening: "go_live",
  go_live: "go_live",
  live_event: "operations",
  live: "operations",
  operations: "operations",
  staffing: "staffing",
  logistics: "logistics",
  testing: "testing",
  dismantling: "bump_out",
  dismantle: "bump_out",
  bump_out: "bump_out",
  financial_closure: "closure",
  post_evaluation: "closure",
  post_event: "closure",
  closed: "closure",
  closure: "closure",
  cancelled: "cancelled",
  on_hold: "on_hold",
};

export const WORKSTREAM_RENAMES: Record<string, string> = {
  project_approvals: "project_management",
  venue_permits: "mall_venue",
  design_branding: "creative_branding",
  production_fabrication: "production_technical",
  logistics_assets: "logistics_warehouse",
  staffing_training: "hr_staffing",
  marketing_comms: "marketing",
  safety_quality: "health_safety",
  live_ops: "operations",
};

export const WORKSTREAM_MERGES: Record<string, string> = {
  games_equipment: "production_technical",
  critical_controls: "health_safety",
  bump_in: "operations",
  bump_out: "operations",
};

export const WBS_TO_PHASE: Record<string, LifecyclePhaseCode> = {
  project_management: "initiation",
  project_approvals: "initiation",
  mall_venue: "feasibility",
  venue_permits: "feasibility",
  creative_branding: "design",
  design_branding: "design",
  procurement_finance: "procurement",
  vendors_contractors: "procurement",
  production_technical: "pre_production",
  production_fabrication: "pre_production",
  games_equipment: "pre_production",
  it_pos: "bump_in",
  logistics_warehouse: "logistics",
  logistics_assets: "logistics",
  hr_staffing: "staffing",
  staffing_training: "staffing",
  marketing: "design",
  marketing_comms: "design",
  health_safety: "testing",
  safety_quality: "testing",
  critical_controls: "testing",
  operations: "operations",
  live_ops: "operations",
  maintenance: "operations",
  bump_in: "bump_in",
  bump_out: "bump_out",
};

export function canonicalStageCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return STAGE_REMAP[code] ?? code;
}

export type StageGateTone = "clear" | "blocked" | "watch";

export function stageGateTone(
  code: string | null | undefined,
  facts: {
    budgetApproved: boolean;
    hasBudget: boolean;
    pendingPrs: number;
    linkedPrs: number;
  },
): StageGateTone | null {
  const mapped = canonicalStageCode(code);
  if (mapped === "budget_approval") {
    if (facts.budgetApproved) return "clear";
    if (facts.hasBudget) return "blocked";
    return "watch";
  }
  if (mapped === "procurement") {
    if (facts.linkedPrs === 0) return "watch";
    if (facts.pendingPrs > 0) return "blocked";
    return "clear";
  }
  return null;
}

export function phaseLabel(code: string | null | undefined, ar = false): string {
  const mapped = canonicalStageCode(code);
  const phase = LIFECYCLE_PHASES.find((p) => p.code === mapped);
  if (phase) return ar ? phase.label_ar : phase.label_en;
  const side = SIDE_LIFECYCLE_STAGES.find((p) => p.code === mapped);
  if (side) return ar ? side.label_ar : side.label_en;
  return code ?? "—";
}
