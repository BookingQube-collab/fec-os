/**
 * Display rules for the Learning & Training desk.
 * They do not enroll anyone, score a quiz, or complete a course.
 */

export type CourseDeskFilter = "all" | "induction" | "self" | "drafts";

export type DeskCourse = {
  status: string;
  trainingType: string | null;
  required: boolean;
};

export type RecordStatusFilter = "all" | "overdue" | "inProgress" | "completed" | "failed";

export type DeskRecord = {
  staffName: string;
  employeeCode: string;
  courseTitle: string;
  status: string;
  completedAt: string | null;
  dueOn: string | null;
  failedAttempt: boolean;
  /** Present only when a stored demo flag exists. Missing means a normal row. */
  demo?: boolean | null;
};

export function courseMatchesDeskFilter(course: DeskCourse, filter: CourseDeskFilter): boolean {
  if (filter === "drafts") return course.status === "DRAFT" || course.status === "UNDER_REVIEW";
  if (filter === "induction") return course.trainingType === "INDUCTION" || course.required;
  if (filter === "self") return course.status === "PUBLISHED" && !course.required;
  return true;
}

export function enrollmentIsOverdue(
  row: { status: string; completedAt: string | null; dueOn: string | null },
  today: string,
): boolean {
  if (row.status === "COMPLETED" || row.completedAt != null) return false;
  return row.dueOn != null && row.dueOn < today;
}

export function legacyEnrollmentIsOverdue(
  row: { status: string; completedOn: string | null; dueOn: string | null },
  today: string,
): boolean {
  if (row.status === "completed" || row.completedOn != null) return false;
  if (row.status === "overdue") return true;
  return row.dueOn != null && row.dueOn < today;
}

export function recordIsCompleted(row: Pick<DeskRecord, "status" | "completedAt">): boolean {
  return row.status === "COMPLETED" || row.status === "completed" || row.completedAt != null;
}

export function recordIsInProgress(row: Pick<DeskRecord, "status" | "completedAt">): boolean {
  return !recordIsCompleted(row) && (row.status === "IN_PROGRESS" || row.status === "in_progress" || row.status === "ENROLLED");
}

export function recordIsOverdue(row: Pick<DeskRecord, "status" | "completedAt" | "dueOn">, today: string): boolean {
  if (recordIsCompleted(row)) return false;
  if (row.status === "overdue") return true;
  return row.dueOn != null && row.dueOn < today;
}

export function recordMatchesStatus(row: DeskRecord, filter: RecordStatusFilter, today: string): boolean {
  if (filter === "completed") return recordIsCompleted(row);
  if (filter === "failed") return row.failedAttempt && !recordIsCompleted(row);
  if (filter === "overdue") return recordIsOverdue(row, today);
  if (filter === "inProgress") return recordIsInProgress(row);
  return true;
}

export function recordMatchesQuery(
  row: Pick<DeskRecord, "staffName" | "employeeCode" | "courseTitle">,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [row.staffName, row.employeeCode, row.courseTitle].join(" ").toLowerCase().includes(needle);
}

export function learningIsEmpty(counts: { assigned: number; inProgress: number; completed: number }): boolean {
  return counts.assigned === 0 && counts.inProgress === 0 && counts.completed === 0;
}

export type TeamTotals = {
  assigned: number;
  completed: number;
  inProgress: number;
  failed: number;
  overdue: number;
  averageScore: number | null;
};

export function teamTotals(
  rows: Array<DeskRecord & { score: number | null }>,
  today: string,
): TeamTotals {
  let completed = 0;
  let inProgress = 0;
  let failed = 0;
  let overdue = 0;
  const scores: number[] = [];
  for (const row of rows) {
    if (recordIsCompleted(row)) completed += 1;
    if (recordIsInProgress(row)) inProgress += 1;
    if (!recordIsCompleted(row) && row.failedAttempt) failed += 1;
    if (recordIsOverdue(row, today)) overdue += 1;
    if (row.score != null && Number.isFinite(row.score)) scores.push(row.score);
  }
  const averageScore = scores.length
    ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10
    : null;
  return { assigned: rows.length, completed, inProgress, failed, overdue, averageScore };
}

export function pageSlice<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safe = Math.min(Math.max(1, page), pages);
  const start = (safe - 1) * pageSize;
  return { page: safe, pages, total, rows: rows.slice(start, start + pageSize) };
}

/** A stored demo flag de-emphasizes a row. Absence of the flag leaves the row as a normal record. */
export function deskRowIsDemo(demo: boolean | null | undefined): boolean {
  return demo === true;
}

export function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Illustrations cropped from the Learning & Training reference screens. */
export const TRAINING_HERO = "/learning-art/hero-induction.jpg";

export const TRAINING_COVERS = [
  { id: "welcome", src: "/learning-art/cover-welcome.jpg" },
  { id: "safety", src: "/learning-art/cover-safety.jpg" },
  { id: "guest", src: "/learning-art/cover-guest.jpg" },
  { id: "team", src: "/learning-art/cover-team.jpg" },
  { id: "fire", src: "/learning-art/cover-fire.jpg" },
  { id: "firstAid", src: "/learning-art/cover-first-aid.jpg" },
] as const;

/**
 * Safety topics share the hard-hat cover. First aid and fire have their own art.
 * A real cover URL, or a stored learning-art path, wins over the title match.
 */
export function courseCoverSrc(input: {
  title: string;
  thumbnailPath?: string | null;
  index?: number;
}): string {
  const stored = input.thumbnailPath?.trim() ?? "";
  if (/^https?:\/\//i.test(stored) || stored.startsWith("/learning-art/")) return stored;
  const title = input.title.toLowerCase();
  if (/first[\s-]?aid/.test(title)) return "/learning-art/cover-first-aid.jpg";
  if (/fire|evacuat/.test(title)) return "/learning-art/cover-fire.jpg";
  if (/\bguest\b/.test(title)) return "/learning-art/cover-guest.jpg";
  if (/heat|crowd|manual|hse|\bsafe(?:ty)?\b|practical/.test(title)) return "/learning-art/cover-safety.jpg";
  if (/\bteam\b|builder/.test(title)) return "/learning-art/cover-team.jpg";
  if (/classroom|induction|welcome/.test(title)) return "/learning-art/cover-welcome.jpg";
  return TRAINING_COVERS[(input.index ?? 0) % TRAINING_COVERS.length]!.src;
}
