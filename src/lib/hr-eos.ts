/**
 * End-of-service workspace rules. Pure — no Supabase.
 * Stages group the real resignation and termination statuses.
 * They do not invent a shorter workflow than the one on the record.
 */

import { policyNumber } from "@/lib/hr-policy";

export const EOS_STAGES = ["draft", "review", "approved", "completed", "closed"] as const;
export type EosStage = (typeof EOS_STAGES)[number];

export type EosKind = "resignation" | "termination";

export const EOS_NEXT_ACTIONS = [
  "submit_resignation",
  "approve_resignation",
  "approve_notice_override",
  "await_serving_notice",
  "finish_clearance",
  "clearance_done_serving",
  "review_draft_termination",
  "approve_termination_hr",
  "approve_termination_exec",
  "apply_termination",
  "case_complete",
  "case_closed",
] as const;
export type EosNextAction = (typeof EOS_NEXT_ACTIONS)[number];

/** Settlement keys this workspace knows how to label. Other stored scalars still show. */
export const KNOWN_SETTLEMENT_KEYS = [
  "gratuity",
  "leave_encashment",
  "notice_pay",
  "deductions",
  "loan",
  "air_ticket",
  "unpaid_leave",
  "basic_salary",
  "net",
] as const;

export type SettlementLine = {
  key: string;
  value: string;
  known: boolean;
};

const NOTICE_RULES: Array<{ key: string; fallback: number; contractual: boolean | "policy" }> = [
  { key: "permanent_days", fallback: 30, contractual: true },
  { key: "operations_days", fallback: 30, contractual: true },
  { key: "family_visa_days", fallback: 30, contractual: true },
  { key: "joker_days", fallback: 7, contractual: true },
  { key: "secondment_days", fallback: 7, contractual: "policy" },
  { key: "higher_mgmt_lte_2y_days", fallback: 30, contractual: true },
  { key: "higher_mgmt_gt_2_lte_4y_days", fallback: 60, contractual: true },
  { key: "higher_mgmt_gt_4y_days", fallback: 90, contractual: true },
];

export type NoticeRuleRow = {
  key: string;
  days: number;
  contractual: boolean;
};

export function eosStage(kind: EosKind, status: string): EosStage {
  if (kind === "resignation") {
    if (status === "draft") return "draft";
    if (status === "submitted" || status === "pending_override_approval") return "review";
    if (status === "approved" || status === "serving_notice") return "approved";
    if (status === "completed") return "completed";
    return "closed";
  }
  if (status === "draft") return "draft";
  if (status === "pending_hr_approval" || status === "pending_exec_approval") return "review";
  if (status === "approved") return "approved";
  if (status === "applied") return "completed";
  return "closed";
}

export function countEosStages(statuses: EosStage[]): Record<EosStage, number> {
  const counts = {
    draft: 0,
    review: 0,
    approved: 0,
    completed: 0,
    closed: 0,
  } satisfies Record<EosStage, number>;
  for (const stage of statuses) counts[stage] += 1;
  return counts;
}

function clearanceStillOpen(input: {
  assetClearance: boolean;
  deptClearance: boolean;
  financeClearance: boolean;
  clearanceRemaining?: number | null;
}): boolean {
  if (input.clearanceRemaining != null) return input.clearanceRemaining > 0;
  return !(input.assetClearance && input.deptClearance && input.financeClearance);
}

export function eosNextAction(input: {
  kind: EosKind;
  status: string;
  assetClearance: boolean;
  deptClearance: boolean;
  financeClearance: boolean;
  clearanceRemaining?: number | null;
}): EosNextAction {
  const open = clearanceStillOpen(input);
  if (input.kind === "resignation") {
    if (input.status === "draft") return "submit_resignation";
    if (input.status === "pending_override_approval") return "approve_notice_override";
    if (input.status === "submitted") return "approve_resignation";
    if (input.status === "approved") return "await_serving_notice";
    if (input.status === "serving_notice") return open ? "finish_clearance" : "clearance_done_serving";
    if (input.status === "completed") return "case_complete";
    return "case_closed";
  }
  if (input.status === "draft") return "review_draft_termination";
  if (input.status === "pending_hr_approval") return "approve_termination_hr";
  if (input.status === "pending_exec_approval") return "approve_termination_exec";
  if (input.status === "approved") return "apply_termination";
  if (input.status === "applied") return open ? "finish_clearance" : "case_complete";
  return "case_closed";
}

function scalarText(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "boolean") return value ? "yes" : "no";
  return null;
}

/** Stored settlement figures only. Does not calculate gratuity or fill missing lines. */
export function settlementLines(stub: Record<string, unknown> | null | undefined): SettlementLine[] {
  if (!stub) return [];
  const present = new Map<string, string>();
  for (const [key, value] of Object.entries(stub)) {
    const text = scalarText(value);
    if (text != null) present.set(key, text);
  }
  const lines: SettlementLine[] = [];
  for (const key of KNOWN_SETTLEMENT_KEYS) {
    const value = present.get(key);
    if (value == null) continue;
    lines.push({ key, value, known: true });
    present.delete(key);
  }
  const rest = [...present.keys()].sort((a, b) => a.localeCompare(b));
  for (const key of rest) {
    lines.push({ key, value: present.get(key)!, known: false });
  }
  return lines;
}

/** Notice bands a new resignation will use. Days come from policy, with the built-in fallback. */
export function noticeRuleRows(policy: Record<string, unknown>): NoticeRuleRow[] {
  const secondmentContractual = policy.secondment_contractual === true;
  return NOTICE_RULES.map((rule) => ({
    key: rule.key,
    days: policyNumber(policy[rule.key], rule.fallback),
    contractual: rule.contractual === "policy" ? secondmentContractual : rule.contractual,
  }));
}
