/**
 * Joining and exit journey rules. Pure: the server and the case screen share this.
 * Overdue is a due date before today, not a stored badge.
 */

export const JOURNEY_KINDS = ["onboarding", "offboarding"] as const;
export type JourneyKind = (typeof JOURNEY_KINDS)[number];

export const JOURNEY_STATUSES = ["open", "completed", "cancelled"] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

export const TASK_STATUSES = ["pending", "done", "skipped"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const EXIT_CAUSES = ["resignation", "end_of_contract", "termination"] as const;
export type ExitCause = (typeof EXIT_CAUSES)[number];

export const OWNER_ROLES = ["hr", "manager", "it", "finance", "employee"] as const;
export type OwnerRole = (typeof OWNER_ROLES)[number];

export const JOURNEY_SECTIONS = [
  "preboarding",
  "day1",
  "first30",
  "handover",
  "access",
  "equipment",
  "finance",
  "leave",
  "end_of_service",
  "interview",
  "documents",
  "payroll",
  "general",
] as const;
export type JourneySection = (typeof JOURNEY_SECTIONS)[number];

export const ONBOARDING_SECTIONS: JourneySection[] = ["preboarding", "day1", "first30"];
export const EXIT_SECTIONS: JourneySection[] = [
  "handover",
  "access",
  "equipment",
  "finance",
  "leave",
  "end_of_service",
  "interview",
  "documents",
  "payroll",
];

export const REVIEW_STATUSES = ["not_required", "awaiting", "cleared"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const TRAINING_STATUSES = ["assigned", "completed", "waived"] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

export type JourneyTask = {
  id: string;
  title: string;
  section: JourneySection;
  required: boolean;
  status: TaskStatus;
  ownerRole: OwnerRole;
  ownerStaffId: string | null;
  dueOn: string | null;
  evidence: string | null;
  needsReview: boolean;
  reviewStatus: ReviewStatus;
  reviewerStaffId: string | null;
};

export type JourneyAck = {
  id: string;
  title: string;
  required: boolean;
  status: "pending" | "acknowledged";
};

export type JourneyTraining = {
  id: string;
  title: string;
  required: boolean;
  status: TrainingStatus;
  enrollmentStatus: string | null;
};

export type SalaryPackage = {
  id: string;
  effectiveOn: string;
  createdAt: string;
  basicQar: number;
  housingQar: number;
  transportationQar: number;
  foodQar: number;
  otherQar: number;
  monthlyTotalQar: number;
  currency: string;
  reason: string | null;
  source: "history" | "compensation";
};

export type ExpiryDocument = {
  id: string;
  title: string;
  docType: string;
  expiryDate: string;
};

export type JourneyGateId =
  | "tasks"
  | "handbook"
  | "reviews"
  | "compensation"
  | "training"
  | "documents";

export type JourneyGate = {
  id: JourneyGateId;
  state: "clear" | "outstanding";
  outstanding: number;
};

export type TaskDisplayStatus = "awaiting" | "overdue" | "completed" | "waived" | "review_due";

const SECTION_SET = new Set<string>(JOURNEY_SECTIONS);
const ROLE_SET = new Set<string>(OWNER_ROLES);

export function asSection(value: unknown): JourneySection {
  const text = String(value ?? "");
  return SECTION_SET.has(text) ? (text as JourneySection) : "general";
}

export function asRole(value: unknown): OwnerRole {
  const text = String(value ?? "");
  return ROLE_SET.has(text) ? (text as OwnerRole) : "hr";
}

export function todayInQatar(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A pending task is overdue only when its due date is before today. Due today is still open. */
export function isTaskOverdue(task: Pick<JourneyTask, "status" | "dueOn">, today: string): boolean {
  if (task.status !== "pending" || !task.dueOn) return false;
  return task.dueOn < today;
}

export function taskDisplayStatus(task: JourneyTask, today: string): TaskDisplayStatus {
  if (task.status === "skipped") return "waived";
  if (task.status === "done" && task.needsReview && task.reviewStatus !== "cleared") return "review_due";
  if (task.status === "done") return "completed";
  if (isTaskOverdue(task, today)) return "overdue";
  return "awaiting";
}

export function taskSatisfied(task: JourneyTask): boolean {
  if (!task.required) return task.status === "done" || task.status === "skipped";
  return task.status === "done";
}

export function trainingSatisfied(row: JourneyTraining): boolean {
  if (!row.required) return true;
  if (row.status === "completed" || row.status === "waived") return true;
  const enrollment = (row.enrollmentStatus ?? "").toUpperCase();
  return enrollment === "COMPLETED" || enrollment === "WAIVED";
}

export function allowanceAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
}

export function readAllowances(raw: unknown): Pick<
  SalaryPackage,
  "housingQar" | "transportationQar" | "foodQar" | "otherQar"
> {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    housingQar: allowanceAmount(record.housing),
    transportationQar: allowanceAmount(record.transportation),
    foodQar: allowanceAmount(record.food),
    otherQar: allowanceAmount(record.other),
  };
}

export function monthlyTotal(parts: {
  basicQar: number;
  housingQar: number;
  transportationQar: number;
  foodQar: number;
  otherQar: number;
}): number {
  return (
    Math.round(
      (parts.basicQar + parts.housingQar + parts.transportationQar + parts.foodQar + parts.otherQar) * 100,
    ) / 100
  );
}

export function packageRecorded(packages: SalaryPackage[]): boolean {
  const latest = packages[0];
  if (!latest) return false;
  return latest.basicQar > 0 || latest.monthlyTotalQar > 0;
}

export function payrollReviewCurrent(packages: SalaryPackage[], payrollReviewedAt: string | null): boolean {
  if (!packageRecorded(packages) || !payrollReviewedAt) return false;
  const latest = packages[0];
  if (!latest || latest.source === "compensation") return true;
  return payrollReviewedAt >= latest.createdAt;
}

export function sectionsFor(kind: JourneyKind): JourneySection[] {
  return kind === "offboarding" ? EXIT_SECTIONS : ONBOARDING_SECTIONS;
}

export function journeyGates(input: {
  tasks: JourneyTask[];
  acknowledgments: JourneyAck[];
  training: JourneyTraining[];
  packages: SalaryPackage[];
  payrollReviewedAt: string | null;
  expiredDocuments: ExpiryDocument[];
}): { gates: JourneyGate[]; canComplete: boolean; requiredDone: number; requiredTotal: number; percent: number } {
  const required = input.tasks.filter((task) => task.required);
  const requiredDone = required.filter((task) => task.status === "done").length;
  const openTasks = required.filter((task) => !taskSatisfied(task)).length;
  const openAcks = input.acknowledgments.filter((ack) => ack.required && ack.status !== "acknowledged").length;
  const openReviews = input.tasks.filter(
    (task) => task.needsReview && task.status === "done" && task.reviewStatus !== "cleared",
  ).length;
  const compensationOutstanding = packageRecorded(input.packages) && payrollReviewCurrent(input.packages, input.payrollReviewedAt) ? 0 : 1;
  const openTraining = input.training.filter((row) => row.required && !trainingSatisfied(row)).length;
  const openDocuments = input.expiredDocuments.length;

  const gates: JourneyGate[] = [
    { id: "tasks", state: openTasks === 0 ? "clear" : "outstanding", outstanding: openTasks },
    { id: "handbook", state: openAcks === 0 ? "clear" : "outstanding", outstanding: openAcks },
    { id: "reviews", state: openReviews === 0 ? "clear" : "outstanding", outstanding: openReviews },
    { id: "compensation", state: compensationOutstanding === 0 ? "clear" : "outstanding", outstanding: compensationOutstanding },
    { id: "training", state: openTraining === 0 ? "clear" : "outstanding", outstanding: openTraining },
    { id: "documents", state: openDocuments === 0 ? "clear" : "outstanding", outstanding: openDocuments },
  ];

  return {
    gates,
    canComplete: gates.every((gate) => gate.state === "clear"),
    requiredDone,
    requiredTotal: required.length,
    percent: required.length === 0 ? 0 : Math.round((requiredDone / required.length) * 100),
  };
}

export function sectionOutstanding(tasks: JourneyTask[], section: JourneySection): number {
  return tasks.filter((task) => task.section === section && task.required && !taskSatisfied(task)).length;
}

export function formatQar(amount: number): string {
  return new Intl.NumberFormat("en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}
