/** Statuses that consume department budget (approved + still in the pipeline). */
export const DEPT_BUDGET_COUNT_STATUSES = [
  "submitted",
  "dept_review",
  "gm_review",
  "ceo_review",
  "finance_review",
  "procurement_review",
  "on_hold",
  "approved",
  "po_created",
] as const;

export type DeptBudgetCountStatus = (typeof DEPT_BUDGET_COUNT_STATUSES)[number];

export function isDeptBudgetCountStatus(status: string): status is DeptBudgetCountStatus {
  return (DEPT_BUDGET_COUNT_STATUSES as readonly string[]).includes(status);
}

/** Calendar year — matches existing finance period usage (`fiscal_year` = calendar year). */
export function departmentBudgetYear(date: Date = new Date()): number {
  return date.getFullYear();
}

export function yearOfPrDate(iso: string | null | undefined, fallback = departmentBudgetYear()): number {
  if (!iso) return fallback;
  const year = Number(String(iso).slice(0, 4));
  return Number.isFinite(year) && year >= 2000 ? year : fallback;
}

export type DepartmentBudgetCheck = {
  year: number;
  cap: number | null;
  spent: number;
  remaining: number | null;
  overBudget: boolean;
  excessAmount: number;
  exception: boolean;
  label: string;
};

/**
 * Leaf-department check: remaining = cap − spent (other PRs in the same year).
 * No budget row → no cap (not over-budget), so existing depts are not forced through excess.
 */
export function computeDepartmentBudgetCheck(opts: {
  year: number;
  budgetAmount: number | null;
  spent: number;
  requested: number;
}): DepartmentBudgetCheck {
  const spent = Math.max(0, Number(opts.spent) || 0);
  const requested = Math.max(0, Number(opts.requested) || 0);
  if (opts.budgetAmount == null) {
    return {
      year: opts.year,
      cap: null,
      spent,
      remaining: null,
      overBudget: false,
      excessAmount: 0,
      exception: false,
      label: "No budget record",
    };
  }
  const cap = Math.max(0, Number(opts.budgetAmount) || 0);
  const remaining = cap - spent;
  const excessAmount = Math.max(0, requested - remaining);
  const overBudget = excessAmount > 0;
  return {
    year: opts.year,
    cap,
    spent,
    remaining,
    overBudget,
    excessAmount,
    exception: overBudget,
    label: overBudget
      ? `Over remaining budget (${remaining.toFixed(0)} QAR)`
      : `Remaining ${remaining.toFixed(0)} QAR of ${cap.toFixed(0)}`,
  };
}
