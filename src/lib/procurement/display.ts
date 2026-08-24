export type PrPaymentStructure = "full_advance" | "milestones" | "post_delivery";

const FREIGHT_RE = /freight|شحن/i;
const ADVANCE_RE = /full advance|advance settlement|دفعة مقدمة|يُصرف المبلغ كاملاً/i;
const MILESTONE_RE = /milestone|مراحل|مرحلي/i;
const POST_RE = /post-delivery|final delivery|بعد التسليم|التسليم النهائي|يُؤجَّل الدفع/i;

export function isFreightLine(name: string | null | undefined): boolean {
  return FREIGHT_RE.test(name ?? "");
}

export function splitJustification(text: string | null | undefined): {
  title: string;
  overview: string;
  rest: string;
} {
  const parts = (text ?? "")
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    title: parts[0] ?? "",
    overview: parts[1] ?? "",
    rest: parts.slice(2).join("\n\n"),
  };
}

export function prDisplayTitle(opts: {
  project_name?: string | null;
  justification?: string | null;
  pr_number?: string | null;
}): string {
  const parsed = splitJustification(opts.justification);
  if (parsed.title && parsed.title.length <= 160) return parsed.title;
  if (opts.project_name?.trim()) return opts.project_name.trim();
  return opts.pr_number?.trim() || "";
}

export function inferPaymentStructure(justification: string | null | undefined): PrPaymentStructure {
  const blob = justification ?? "";
  if (ADVANCE_RE.test(blob)) return "full_advance";
  if (MILESTONE_RE.test(blob)) return "milestones";
  if (POST_RE.test(blob)) return "post_delivery";
  return "post_delivery";
}

export function headerStatusChip(status: string): "pending" | "approved" | "rejected" | "other" {
  if (
    [
      "submitted",
      "dept_review",
      "gm_review",
      "ceo_review",
      "finance_review",
      "procurement_review",
    ].includes(status)
  ) {
    return "pending";
  }
  if (status === "approved" || status === "po_created") return "approved";
  if (status === "rejected" || status === "cancelled") return "rejected";
  return "other";
}

export function reviseRequisitionPath(id: string): string {
  return `/procurement/requisitions/${id}/edit`;
}

export function latestPrReturnOrReject<T extends { action: string }>(history: T[]): T | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].action === "returned" || history[i].action === "rejected") return history[i];
  }
  return null;
}

export function priorityKey(priority: string | null | undefined): "low" | "medium" | "high" | "emergency" {
  if (priority === "low") return "low";
  if (priority === "high") return "high";
  if (priority === "emergency") return "emergency";
  return "medium";
}
