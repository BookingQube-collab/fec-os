/** Event PM Phase 7 — budget approval + escalation helpers (pure). */

import {
  BUDGET_STATUSES,
  CLOSED_TASK_STATUSES,
  OPEN_ISSUE_STATUSES,
  RISK_STATUSES,
  TASK_ESCALATION_LEVELS,
  type BudgetStatus,
  type TaskEscalationLevel,
} from "@/lib/events/constants";

export { BUDGET_STATUSES, type BudgetStatus };

export const BUDGET_TRANSITION_ACTIONS = [
  "submit",
  "approve",
  "reject",
  "lock",
  "reopen",
] as const;

export type BudgetTransitionAction = (typeof BUDGET_TRANSITION_ACTIONS)[number];

export type BudgetTransitionCapability = "events.finance" | "events.approve" | "events.manage";

/** Statuses where finance may edit header/lines. */
export const BUDGET_EDITABLE_STATUSES = new Set<BudgetStatus>(["draft", "rejected"]);

/** Statuses that satisfy stage-gate / readiness budget checks. */
export const BUDGET_APPROVED_STATUSES = new Set<BudgetStatus>(["approved", "locked"]);

export type BudgetTransitionRule = {
  from: BudgetStatus;
  action: BudgetTransitionAction;
  to: BudgetStatus;
  /** Any listed capability is enough. */
  anyCapability: BudgetTransitionCapability[];
  requiresReason?: boolean;
};

export const BUDGET_TRANSITION_MATRIX: BudgetTransitionRule[] = [
  { from: "draft", action: "submit", to: "submitted", anyCapability: ["events.finance"] },
  {
    from: "submitted",
    action: "approve",
    to: "approved",
    anyCapability: ["events.approve", "events.manage"],
  },
  {
    from: "submitted",
    action: "reject",
    to: "rejected",
    anyCapability: ["events.approve", "events.manage"],
    requiresReason: true,
  },
  { from: "rejected", action: "reopen", to: "draft", anyCapability: ["events.finance"] },
  {
    from: "approved",
    action: "lock",
    to: "locked",
    anyCapability: ["events.approve", "events.manage"],
  },
  {
    from: "approved",
    action: "reopen",
    to: "draft",
    anyCapability: ["events.approve", "events.manage"],
    requiresReason: true,
  },
  {
    from: "locked",
    action: "reopen",
    to: "draft",
    anyCapability: ["events.approve", "events.manage"],
    requiresReason: true,
  },
];

export function isBudgetStatus(value: string): value is BudgetStatus {
  return (BUDGET_STATUSES as readonly string[]).includes(value);
}

export function budgetLinesEditable(status: string | null | undefined): boolean {
  return BUDGET_EDITABLE_STATUSES.has((status ?? "draft") as BudgetStatus);
}

export function budgetIsApprovedLike(status: string | null | undefined): boolean {
  return BUDGET_APPROVED_STATUSES.has((status ?? "draft") as BudgetStatus);
}

export function findBudgetTransition(
  from: string,
  action: BudgetTransitionAction,
): BudgetTransitionRule | null {
  if (!isBudgetStatus(from)) return null;
  return BUDGET_TRANSITION_MATRIX.find((r) => r.from === from && r.action === action) ?? null;
}

export function allowedBudgetActions(from: string): BudgetTransitionAction[] {
  if (!isBudgetStatus(from)) return [];
  return BUDGET_TRANSITION_MATRIX.filter((r) => r.from === from).map((r) => r.action);
}

export function assertBudgetTransition(opts: {
  from: string;
  action: BudgetTransitionAction;
  capabilities: string[];
  reason?: string | null;
}): BudgetTransitionRule {
  const rule = findBudgetTransition(opts.from, opts.action);
  if (!rule) {
    throw new Error(`Budget cannot ${opts.action} from status "${opts.from}".`);
  }
  const ok = rule.anyCapability.some((cap) => opts.capabilities.includes(cap));
  if (!ok) {
    throw new Error(`Budget ${opts.action} requires ${rule.anyCapability.join(" or ")}.`);
  }
  if (rule.requiresReason && !(opts.reason && opts.reason.trim().length >= 4)) {
    throw new Error(`Budget ${opts.action} requires a reason (at least 4 characters).`);
  }
  return rule;
}

/** Simple severity matrix cell: likelihood × impact → composite band. */
export type RiskMatrixBand = "low" | "medium" | "high" | "critical";

const BAND_RANK: Record<RiskMatrixBand, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function riskMatrixBand(
  likelihood: string | null | undefined,
  impact: string | null | undefined,
  fallbackSeverity?: string | null,
): RiskMatrixBand {
  const l = (likelihood ?? fallbackSeverity ?? "medium") as RiskMatrixBand;
  const i = (impact ?? fallbackSeverity ?? "medium") as RiskMatrixBand;
  const lr = BAND_RANK[l] ?? 2;
  const ir = BAND_RANK[i] ?? 2;
  const product = lr * ir;
  if (product >= 12) return "critical";
  if (product >= 8) return "high";
  if (product >= 4) return "medium";
  return "low";
}

export function nextEscalationLevel(
  current: string | null | undefined,
): TaskEscalationLevel {
  const order = TASK_ESCALATION_LEVELS;
  const idx = order.indexOf((current ?? "none") as TaskEscalationLevel);
  if (idx < 0 || idx >= order.length - 1) return order[order.length - 1];
  return order[idx + 1];
}

export type EscalationItemKind = "risk" | "task" | "gate" | "issue";

export type EscalationItem = {
  kind: EscalationItemKind;
  id: string;
  title: string;
  due_date: string | null;
  severity?: string | null;
  escalation_level?: string | null;
  overdue: boolean;
};

export function collectEventEscalations(input: {
  today: string;
  risks?: Array<{
    id: string;
    title: string;
    status: string;
    due_date?: string | null;
    severity?: string | null;
    escalation_level?: string | null;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
    due_date?: string | null;
    escalation_level?: string | null;
    priority?: string | null;
  }>;
  gates?: Array<{
    requirementId: string;
    labelEn: string;
    blocking: boolean;
    satisfied: boolean;
  }>;
  issues?: Array<{
    id: string;
    title: string;
    status: string;
    due_date?: string | null;
    sla_due_date?: string | null;
    severity?: string | null;
  }>;
}): EscalationItem[] {
  const items: EscalationItem[] = [];
  for (const risk of input.risks ?? []) {
    if (risk.status === "closed") continue;
    const overdue = Boolean(risk.due_date && risk.due_date < input.today);
    const escalated = Boolean(risk.escalation_level && risk.escalation_level !== "none");
    if (overdue || escalated || risk.severity === "critical") {
      items.push({
        kind: "risk",
        id: risk.id,
        title: risk.title,
        due_date: risk.due_date ?? null,
        severity: risk.severity ?? null,
        escalation_level: risk.escalation_level ?? null,
        overdue,
      });
    }
  }
  for (const task of input.tasks ?? []) {
    if (CLOSED_TASK_STATUSES.has(task.status)) continue;
    const overdue = Boolean(task.due_date && task.due_date < input.today);
    const escalated = Boolean(task.escalation_level && task.escalation_level !== "none");
    if (overdue || escalated) {
      items.push({
        kind: "task",
        id: task.id,
        title: task.title,
        due_date: task.due_date ?? null,
        severity: task.priority ?? null,
        escalation_level: task.escalation_level ?? null,
        overdue,
      });
    }
  }
  for (const gate of input.gates ?? []) {
    if (gate.blocking && !gate.satisfied) {
      items.push({
        kind: "gate",
        id: gate.requirementId,
        title: gate.labelEn,
        due_date: null,
        overdue: true,
      });
    }
  }
  for (const issue of input.issues ?? []) {
    if (!OPEN_ISSUE_STATUSES.has(issue.status)) continue;
    const due = issue.sla_due_date ?? issue.due_date ?? null;
    const overdue = Boolean(due && due < input.today);
    if (overdue || issue.severity === "critical") {
      items.push({
        kind: "issue",
        id: issue.id,
        title: issue.title,
        due_date: due,
        severity: issue.severity ?? null,
        overdue,
      });
    }
  }
  return items.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
  });
}

export function openRiskStatuses(): Set<string> {
  return new Set(RISK_STATUSES.filter((s) => s !== "closed"));
}
