import {
  activeWeight,
  isKraRole,
  scoreReview,
  type KraCriticalStatus,
  type KraLineInput,
  type KraLineStatus,
  type KraReviewHeader,
  type KraRole,
} from "@/lib/kra-scorecard/score";

export const KRA_ROLE_TO_DB: Record<KraRole, "cashier" | "attendant" | "dual_role" | "supervisor"> = {
  Cashier: "cashier",
  Attendant: "attendant",
  "Dual Role": "dual_role",
  Supervisor: "supervisor",
};

export const KRA_ROLE_FROM_DB: Record<string, KraRole> = {
  cashier: "Cashier",
  attendant: "Attendant",
  dual_role: "Dual Role",
  supervisor: "Supervisor",
};

export const KRA_STATUS_TO_DB: Record<KraLineStatus, "pending" | "applicable" | "na"> = {
  Pending: "pending",
  Applicable: "applicable",
  "N/A": "na",
};

export const KRA_STATUS_FROM_DB: Record<string, KraLineStatus> = {
  pending: "Pending",
  applicable: "Applicable",
  na: "N/A",
};

export const KRA_CRITICAL_TO_DB: Record<KraCriticalStatus, "pending" | "clear" | "review_required"> = {
  Pending: "pending",
  Clear: "clear",
  "Review required": "review_required",
};

export const KRA_CRITICAL_FROM_DB: Record<string, KraCriticalStatus> = {
  pending: "Pending",
  clear: "Clear",
  review_required: "Review required",
};

export type KraSiteSop = {
  id: string;
  code: string;
  title: string;
  fileName: string | null;
};

export function expandSopCodes(reference: string): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();
  const add = (code: string) => {
    if (seen.has(code)) return;
    seen.add(code);
    codes.push(code);
  };
  for (const part of reference.split(/[;,]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const range = trimmed.match(/^([A-Z]+)(\d+)\s*[-–]\s*([A-Z]*)(\d+)$/);
    if (range && (range[3] === "" || range[3] === range[1])) {
      const start = Number(range[2]);
      const end = Number(range[4]);
      const width = Math.max(range[2].length, range[4].length);
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      for (let n = low; n <= high; n += 1) add(range[1] + String(n).padStart(width, "0"));
      continue;
    }
    for (const match of trimmed.matchAll(/\b([A-Z]{1,4}\d{2})\b/g)) add(match[1]);
  }
  return codes;
}

export type KraTemplateItem = {
  id: string;
  itemNo: number;
  title: string;
  sopReference: string;
  targetStandard: string;
  weightCashier: number;
  weightAttendant: number;
  weightSupervisor: number;
};

export type KraTemplate = {
  id: string;
  code: string;
  brand: string;
  placeName: string;
  sheetTitle: string;
  sopLabel: string;
  baselineNote: string;
  usageNote: string;
  sortOrder: number;
  locationId: string | null;
  items: KraTemplateItem[];
  sops: KraSiteSop[];
};

export type KraFrameworkItem = {
  id: string;
  roleCategory: "cashier" | "attendant" | "dual_role";
  sortOrder: number;
  title: string;
  expectedStandard: string;
  masterSheetMapping: string;
  points: number;
  howToRate: string;
  evidenceToKeep: string;
};

export type KraReviewLine = KraLineInput & {
  id: string;
  itemId: string;
  itemNo: number;
  title: string;
  sopReference: string;
  targetStandard: string;
  weightCashier: number;
  weightAttendant: number;
  weightSupervisor: number;
  rowCheck: string;
  points: number;
};

export type KraReviewDetail = {
  id: string;
  staffId: string;
  staffName: string;
  employeeCode: string | null;
  templateId: string;
  templateCode: string;
  brand: string;
  placeName: string;
  baselineNote: string;
  reviewPeriod: string;
  reviewerName: string;
  assignedPost: string;
  role: KraRole;
  cashierShare: number;
  criticalStatus: KraCriticalStatus;
  criticalEvidence: string;
  agreedAction: string;
  followUp: string;
  employeeAckNote: string | null;
  employeeAckAt: string | null;
  reviewerApprovalNote: string;
  reviewerApprovedAt: string | null;
  readiness: string;
  score: number | null;
  classification: string;
  lines: KraReviewLine[];
  sops: KraSiteSop[];
};

export function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function reviewHeader(input: {
  employeeLinked: boolean;
  reviewPeriod: string;
  reviewerName: string;
  assignedPost: string;
  role: string;
  cashierShare: number;
  criticalStatus: KraCriticalStatus;
}): KraReviewHeader {
  return {
    employeeLinked: input.employeeLinked,
    reviewPeriod: input.reviewPeriod,
    reviewerName: input.reviewerName,
    assignedPost: input.assignedPost,
    role: isKraRole(input.role) ? input.role : null,
    cashierShare: input.cashierShare,
    criticalStatus: input.criticalStatus,
  };
}

export function weightedLine(
  role: KraRole,
  cashierShare: number,
  item: Pick<KraTemplateItem, "weightCashier" | "weightAttendant" | "weightSupervisor">,
  entry: Pick<KraLineInput, "status" | "rating" | "actualResult" | "evidence">,
): KraLineInput {
  return {
    status: entry.status,
    activeWeight: activeWeight(
      role,
      item.weightCashier,
      item.weightAttendant,
      item.weightSupervisor,
      cashierShare,
    ),
    rating: entry.rating,
    actualResult: entry.actualResult,
    evidence: entry.evidence,
  };
}
