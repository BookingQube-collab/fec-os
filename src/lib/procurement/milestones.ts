import type { PrPaymentStructure } from "@/lib/procurement/constants";

export type PrMilestoneDraft = {
  key: string;
  title: string;
  amount: number;
  due_date: string;
  due_timing: string;
  conditions: string;
};

export function newMilestoneKey(): string {
  return `ms-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultMilestones(
  structure: PrPaymentStructure,
  total: number,
  requiredBy?: string | null,
): PrMilestoneDraft[] {
  const due = requiredBy ?? "";
  if (structure === "full_advance") {
    return [
      {
        key: newMilestoneKey(),
        title: "Full advance settlement",
        amount: roundMoney(total),
        due_date: due,
        due_timing: "On approval",
        conditions: "Released after approval so the vendor can mobilize.",
      },
    ];
  }
  if (structure === "post_delivery") {
    return [
      {
        key: newMilestoneKey(),
        title: "Final delivery settlement",
        amount: roundMoney(total),
        due_date: due,
        due_timing: "On final handover",
        conditions: "Paid after delivery and acceptance evidence.",
      },
    ];
  }
  const first = roundMoney(total * 0.5);
  return [
    {
      key: newMilestoneKey(),
      title: "Mobilization",
      amount: first,
      due_date: due,
      due_timing: "On approval",
      conditions: "Against quotation / kickoff deliverable.",
    },
    {
      key: newMilestoneKey(),
      title: "Completion",
      amount: roundMoney(total - first),
      due_date: due,
      due_timing: "On delivery",
      conditions: "Against acceptance of remaining deliverables.",
    },
  ];
}

export function milestoneSum(rows: Array<{ amount: number }>): number {
  return roundMoney(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
}

export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function vendorComplianceTone(
  status: string | null | undefined,
): "ok" | "warn" | "block" {
  const value = (status ?? "").toLowerCase();
  if (value === "blocked" || value === "expired" || value === "inactive") return "block";
  if (value === "warning" || value === "grace" || value === "unassessed") return "warn";
  return "ok";
}
