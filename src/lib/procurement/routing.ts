export type ApprovalStepRole = "dept_head" | "gm" | "ceo" | "finance";

export type DoaBand = {
  band_code: string;
  label: string;
  min_amount: number;
  max_amount: number | null;
  require_dept_head: boolean;
  require_gm: boolean;
  require_ceo: boolean;
  require_finance: boolean;
};

export type DoaSettings = {
  price_variance_pct_threshold: number;
  force_ceo_on_price_variance: boolean;
  force_ceo_on_budget_exception: boolean;
};

export const STEP_STATUS: Record<ApprovalStepRole, string> = {
  dept_head: "dept_review",
  gm: "gm_review",
  ceo: "ceo_review",
  finance: "finance_review",
};

export const STEP_CAPABILITY: Record<ApprovalStepRole, string> = {
  dept_head: "procurement.approve_dept",
  gm: "procurement.approve_gm",
  ceo: "procurement.approve_ceo",
  finance: "procurement.finance",
};

export function bandForAmount(amount: number, bands: DoaBand[]): DoaBand | null {
  const active = [...bands].sort((a, b) => a.min_amount - b.min_amount);
  for (const band of active) {
    const underMax = band.max_amount == null || amount <= Number(band.max_amount);
    if (amount >= Number(band.min_amount) && underMax) return band;
  }
  return active[active.length - 1] ?? null;
}

export function resolveApprovalRoute(opts: {
  amount: number;
  emergency: boolean;
  priceVariancePct: number | null;
  budgetException: boolean;
  bands: DoaBand[];
  settings: DoaSettings;
}): ApprovalStepRole[] {
  const band = bandForAmount(opts.amount, opts.bands);
  if (!band) return ["finance"];

  if (opts.emergency) {
    const emergency: ApprovalStepRole[] = [];
    if (band.require_dept_head) emergency.push("dept_head");
    emergency.push("finance");
    return emergency;
  }

  const steps: ApprovalStepRole[] = [];
  if (band.require_dept_head) steps.push("dept_head");
  if (band.require_gm) steps.push("gm");
  if (band.require_ceo) steps.push("ceo");

  const varianceOver =
    opts.priceVariancePct != null &&
    opts.settings.force_ceo_on_price_variance &&
    opts.priceVariancePct > Number(opts.settings.price_variance_pct_threshold);
  const budgetOver = opts.budgetException && opts.settings.force_ceo_on_budget_exception;
  if ((varianceOver || budgetOver) && !steps.includes("ceo")) {
    steps.push("ceo");
  }

  if (band.require_finance !== false) steps.push("finance");
  else steps.push("finance");

  return steps;
}

export function statusForStep(role: ApprovalStepRole | null | undefined): string {
  if (!role) return "approved";
  return STEP_STATUS[role];
}

export function isExecApprovalRole(role: ApprovalStepRole | string | null | undefined): boolean {
  return role === "gm" || role === "ceo";
}
