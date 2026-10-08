/**
 * Training engine rules. Pure functions mirror the SQL gates in
 * supabase/migrations/20261002150000_training_engine.sql.
 * They are not a second policy. Server stubs live in ./server.ts.
 *
 * Learner identity is public.staff. There is no learner profile table.
 * Engine rows live in public.training_course_enrollments.
 * Legacy public.training_enrollments (free-text course_name) is not this engine.
 */
import { CAPABILITIES, canUserDo, type AppRole, type Capability } from "@/lib/rbac";

export const TRAINING_PERMISSION_KEYS = [
  "training.view",
  "training.learn",
  "training.create",
  "training.edit",
  "training.publish",
  "training.archive",
  "training.assign",
  "training.assign.department",
  "training.assign.site",
  "training.assign.company",
  "training.assessment.manage",
  "training.assessment.grade",
  "training.session.create",
  "training.attendance.manage",
  "training.certificate.view",
  "training.certificate.issue",
  "training.certificate.revoke",
  "training.analytics.view",
  "training.reports.export",
] as const satisfies readonly Capability[];

export type TrainingPermission = (typeof TRAINING_PERMISSION_KEYS)[number];

export const LESSON_KINDS = [
  "TEXT",
  "RICH_TEXT",
  "VIDEO",
  "IMAGE",
  "PDF",
  "DOCUMENT",
  "PRESENTATION",
  "AUDIO",
  "EXTERNAL_LINK",
  "CHECKLIST",
  "ACKNOWLEDGEMENT",
  "QUIZ",
  "ASSESSMENT",
  "ASSIGNMENT",
  "PRACTICAL_ASSESSMENT",
] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

export const TRAINING_TYPES = ["INDUCTION", "COMPLIANCE", "SKILL", "SAFETY", "PRODUCT", "OTHER"] as const;
export const DIFFICULTY_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

export const COURSE_STATUSES = ["DRAFT", "UNDER_REVIEW", "PUBLISHED", "ARCHIVED"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const ASSIGNMENT_TARGETS = [
  "EMPLOYEE",
  "DEPARTMENT",
  "ROLE",
  "SITE",
  "BUSINESS_UNIT",
  "TEAM",
  "EMPLOYEE_TYPE",
  "CUSTOM",
  "COMPANY",
] as const;
export type AssignmentTarget = (typeof ASSIGNMENT_TARGETS)[number];

export const CERTIFICATE_STATUSES = ["VALID", "EXPIRING", "EXPIRED", "REVOKED"] as const;

export const PUBLIC_CERTIFICATE_FIELDS = [
  "status",
  "holderName",
  "courseTitle",
  "issuedAt",
  "validUntil",
] as const;

const SENSITIVE_CERTIFICATE_KEYS = [
  "staff_id",
  "staffId",
  "employee_id",
  "employeeId",
  "employee_code",
  "employeeCode",
  "qid",
  "passport",
  "passport_number",
  "salary",
  "phone",
  "email",
  "iban",
  "user_id",
] as const;

export function trainingPermissionsMatchRbac(): boolean {
  const fromRbac = (Object.keys(CAPABILITIES) as Capability[])
    .filter((key) => key.startsWith("training."))
    .sort();
  const declared = [...TRAINING_PERMISSION_KEYS].sort();
  return fromRbac.length === declared.length && fromRbac.every((key, index) => key === declared[index]);
}

/**
 * Mirrors training_can_read_course learner branch.
 * Drafts and in-review versions are never learner-visible, even if an enrollment row exists.
 */
export function learnerCanReadCourse(input: {
  courseStatus: CourseStatus;
  versionStatus: CourseStatus;
  enrolled: boolean;
}): boolean {
  return input.enrolled && input.courseStatus === "PUBLISHED" && input.versionStatus === "PUBLISHED";
}

/** Company-wide rules need training.assign.company. training.view is not enough. */
export function capabilityForAssignmentTarget(target: AssignmentTarget): TrainingPermission {
  switch (target) {
    case "COMPANY":
      return "training.assign.company";
    case "SITE":
      return "training.assign.site";
    case "DEPARTMENT":
      return "training.assign.department";
    default:
      return "training.assign";
  }
}

export function canAssignTarget(
  roles: AppRole[],
  target: AssignmentTarget,
  grants?: Parameters<typeof canUserDo>[2],
): boolean {
  return canUserDo(roles, capabilityForAssignmentTarget(target), grants);
}

export const ASSIGNMENT_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const ASSIGNMENT_REMINDER_DAYS = [0, 1, 2, 3, 7, 14, 21, 30, 60, 90] as const;
export const SAVED_RULE_TRIGGERS = ["JOIN_COMPANY", "ROLE_CHANGE", "MACHINE_ASSIGNMENT"] as const;

/**
 * JOIN_COMPANY, ROLE_CHANGE, and MACHINE_ASSIGNMENT are saved on training_saved_rules
 * and enrolled by training_execute_saved_rules when that event happens.
 * BUSINESS_UNIT, TEAM, and CUSTOM still have no employee master.
 */
export const SAVED_RULES_ARE_EXECUTED = true;

/** Employed people receive automatic enrollment. Closed and joker rows do not. */
export function staffCanReceiveTraining(status: string): boolean {
  return !["terminated", "resigned", "released", "joker"].includes(status);
}

export type SavedRuleShape = {
  triggerKind: (typeof SAVED_RULE_TRIGGERS)[number];
  target: AssignmentTarget;
  staffId: string | null;
  departmentId: string | null;
  locationId: string | null;
  roleCode: string | null;
  employmentType: string | null;
};

export type TrainingEventStaff = {
  id: string;
  status: string;
  locationId: string | null;
  departmentIds: readonly string[];
  staffRole: string | null;
  userRoles: readonly string[];
  employmentType: string | null;
};

/** Same match as training_execute_saved_rules. Stored-only targets never enroll. */
export function savedRuleEnrollsStaff(
  rule: SavedRuleShape,
  eventTrigger: (typeof SAVED_RULE_TRIGGERS)[number],
  staff: TrainingEventStaff,
  roleCode?: string | null,
): boolean {
  if (rule.triggerKind !== eventTrigger || !staffCanReceiveTraining(staff.status)) return false;
  if ((STORED_ONLY_ASSIGNMENT_TARGETS as readonly string[]).includes(rule.target)) return false;
  const nextRole = roleCode?.trim() || null;
  switch (rule.target) {
    case "COMPANY":
      return true;
    case "EMPLOYEE":
      return rule.staffId != null && rule.staffId === staff.id;
    case "DEPARTMENT":
      return rule.departmentId != null && staff.departmentIds.includes(rule.departmentId);
    case "SITE":
      return rule.locationId != null && rule.locationId === staff.locationId;
    case "ROLE": {
      if (!rule.roleCode) return false;
      if (nextRole) return rule.roleCode === nextRole;
      return staff.staffRole === rule.roleCode || staff.userRoles.includes(rule.roleCode);
    }
    case "EMPLOYEE_TYPE":
      return rule.employmentType != null && rule.employmentType === staff.employmentType;
    default:
      return false;
  }
}

export const TRAINING_EVENT_LINK_TYPES = {
  JOIN_COMPANY: [],
  ROLE_CHANGE: ["JOB_ROLE"],
  MACHINE_ASSIGNMENT: ["EQUIPMENT", "GAME", "ASSET"],
} as const;

/**
 * Hire enrolls and does not block creating the person.
 * Role change and machine assignment use requirementEnforcement:
 * REQUIRED + BLOCK refuses the change; WARN does not.
 */
export function trainingEventDecision(input: {
  trigger: (typeof SAVED_RULE_TRIGGERS)[number];
  requirements: readonly {
    courseTitle?: string;
    status: string;
    enforceMode: string;
    requirementType: string;
  }[];
}): { warn: boolean; block: boolean; blockingTitles: string[] } {
  if (input.trigger === "JOIN_COMPANY") return { warn: false, block: false, blockingTitles: [] };
  const blockingTitles: string[] = [];
  let warn = false;
  let block = false;
  for (const row of input.requirements) {
    const effect = requirementEnforcement({
      status: row.status,
      enforceMode: row.enforceMode === "BLOCK" ? "BLOCK" : "WARN",
      requirementType: row.requirementType === "RECOMMENDED" ? "RECOMMENDED" : "REQUIRED",
    });
    if (effect.block) {
      block = true;
      const title = row.courseTitle?.trim();
      if (title) blockingTitles.push(title);
    } else if (effect.warn) {
      warn = true;
    }
  }
  return { warn, block, blockingTitles };
}

/** BUSINESS_UNIT, TEAM, and CUSTOM have no employee master, so they are stored and not expanded. */
export const STORED_ONLY_ASSIGNMENT_TARGETS = ["BUSINESS_UNIT", "TEAM", "CUSTOM"] as const;

const ASSIGNMENT_CLIENT_OUTCOME_KEYS = ["completed", "completed_at", "score", "clientCompleted"] as const;

export function publishedVersionIsAssignable(courseStatus: string, versionStatus: string): boolean {
  return courseStatus === "PUBLISHED" && versionStatus === "PUBLISHED";
}

/** A site assignment needs both the site capability and access to that location. */
export function siteAssignAllowed(input: { roles: AppRole[]; canAccessLocation: boolean }): boolean {
  return canAssignTarget(input.roles, "SITE") && input.canAccessLocation;
}

/** Assignment payloads cannot carry a completion flag or a score. */
export function assignmentCarriesClientOutcome(input: object): boolean {
  const record = input as Record<string, unknown>;
  return ASSIGNMENT_CLIENT_OUTCOME_KEYS.some((key) => record[key] != null);
}

export type CompletionDecision = {
  granted: false;
  reason: "client_flag_rejected" | "not_implemented";
};

/**
 * Completion is server-authoritative. A client boolean never grants it.
 * This phase does not mark an enrollment complete even when evidence is present.
 */
export function decideCompletion(input: {
  clientCompleted?: boolean | null;
  authoritativeEvidence?: {
    requiredLessonsComplete: boolean;
    assessmentPassed: boolean;
  } | null;
}): CompletionDecision {
  if (input.clientCompleted === true) {
    return { granted: false, reason: "client_flag_rejected" };
  }
  void input.authoritativeEvidence;
  return { granted: false, reason: "not_implemented" };
}

export type PublicCertificate = {
  status: string;
  holderName: string;
  courseTitle: string;
  issuedAt: string | null;
  validUntil: string | null;
};

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map((part) => Number(part));
  const next = new Date(Date.UTC(year, month - 1, date + days));
  return next.toISOString().slice(0, 10);
}

/**
 * Public verification payload. Drops employee id, QID, passport, salary, phone, and email.
 * REVOKED stays revoked. A VALID row past valid_until is returned as EXPIRED.
 */
export function toPublicCertificateVerification(
  row: Record<string, unknown>,
  today = new Date(),
): PublicCertificate {
  const stored = typeof row.status === "string" ? row.status : "";
  const validUntil =
    typeof row.valid_until === "string"
      ? row.valid_until
      : typeof row.validUntil === "string"
        ? row.validUntil
        : null;
  let status = stored;
  if (stored !== "REVOKED" && validUntil) {
    const todayDay = utcDay(today);
    if (validUntil < todayDay) status = "EXPIRED";
    else if (stored === "VALID" && validUntil <= addUtcDays(todayDay, 30)) status = "EXPIRING";
  }
  const holder =
    typeof row.holder_name === "string"
      ? row.holder_name
      : typeof row.holderName === "string"
        ? row.holderName
        : "";
  const title =
    typeof row.course_title === "string"
      ? row.course_title
      : typeof row.courseTitle === "string"
        ? row.courseTitle
        : "";
  const issued =
    typeof row.issued_at === "string" ? row.issued_at : typeof row.issuedAt === "string" ? row.issuedAt : null;
  return {
    status,
    holderName: holder,
    courseTitle: title,
    issuedAt: issued,
    validUntil,
  };
}

export function publicCertificateHasSensitiveFields(payload: PublicCertificate): boolean {
  const keys = Object.keys(payload);
  return keys.some((key) => (SENSITIVE_CERTIFICATE_KEYS as readonly string[]).includes(key));
}

export const LEARNING_DUE_SOON_DAYS = 14;

const LEARNING_CLIENT_OUTCOME_KEYS = ["completed", "completed_at", "score", "clientCompleted"] as const;

export type LearningEnrollment = {
  status: string;
  completedAt: string | null;
  dueOn: string | null;
  required: boolean;
};

/** ENROLLED is not completion. A real completion is status COMPLETED or completed_at. */
export function enrollmentIsCompleted(row: { status: string; completedAt: string | null }): boolean {
  return row.status === "COMPLETED" || row.completedAt != null;
}

/** A caller may open an outline only for their own staff row. */
export function enrollmentOwnedByStaff(actorStaffId: string | null, enrollmentStaffId: string): boolean {
  return actorStaffId != null && actorStaffId === enrollmentStaffId;
}

/** My Learning payloads cannot carry a completion flag or a score. */
export function learningCarriesClientOutcome(input: object): boolean {
  const record = input as Record<string, unknown>;
  return LEARNING_CLIENT_OUTCOME_KEYS.some((key) => record[key] != null);
}

export function learningProgressPercent(completedLessons: number, lessonCount: number): number {
  if (lessonCount <= 0 || completedLessons <= 0) return 0;
  return Math.min(100, Math.round((completedLessons / lessonCount) * 100));
}

export const READ_LESSON_KINDS = [
  "TEXT",
  "RICH_TEXT",
  "IMAGE",
  "EXTERNAL_LINK",
  "PDF",
  "DOCUMENT",
  "PRESENTATION",
] as const;
export const MEDIA_LESSON_KINDS = ["VIDEO", "AUDIO"] as const;
export const GATED_LESSON_KINDS = ["QUIZ", "ASSESSMENT", "ASSIGNMENT", "PRACTICAL_ASSESSMENT"] as const;
export const MIN_READ_SECONDS = 10;
export const MAX_HEARTBEAT_SECONDS = 30;
export const MAX_POSITION_JUMP_SECONDS = 30;

export function isGatedLesson(kind: string): boolean {
  return (GATED_LESSON_KINDS as readonly string[]).includes(kind);
}

export function isReadLesson(kind: string): boolean {
  return (READ_LESSON_KINDS as readonly string[]).includes(kind);
}

/** Opening a lesson never completes it, including video and audio. */
export function openingLessonCompletes(_kind: string): boolean {
  return false;
}

/** One heartbeat may add at most 30 seconds. A 10 minute claim is rejected. */
export function heartbeatAccepted(deltaSeconds: number): boolean {
  return Number.isInteger(deltaSeconds) && deltaSeconds > 0 && deltaSeconds <= MAX_HEARTBEAT_SECONDS;
}

export function positionAdvanceAccepted(currentSeconds: number, nextSeconds: number): boolean {
  return (
    Number.isInteger(nextSeconds) &&
    nextSeconds >= 0 &&
    nextSeconds <= currentSeconds + MAX_POSITION_JUMP_SECONDS
  );
}

/** Video and audio finish only at 90% of a known duration. Missing duration cannot finish. */
export function mediaLessonCanComplete(positionSeconds: number, durationSeconds: number | null): boolean {
  if (durationSeconds == null || durationSeconds <= 0) return false;
  return positionSeconds * 10 >= durationSeconds * 9;
}

export function readLessonCanComplete(timeSpentSeconds: number, markRead: boolean): boolean {
  return markRead === true && timeSpentSeconds >= MIN_READ_SECONDS;
}

export function parseChecklist(body: string | null): { id: string; label: string; required: boolean }[] {
  if (!body || !body.trim()) return [];
  const trimmed = body.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.flatMap((item) => {
          if (typeof item === "string" && item.trim()) {
            return [{ id: item.trim(), label: item.trim(), required: true }];
          }
          if (item && typeof item === "object" && "label" in item && typeof item.label === "string" && item.label.trim()) {
            const id =
              "id" in item && typeof item.id === "string" && item.id.trim() ? item.id.trim() : item.label.trim();
            const required = !("required" in item) || item.required !== false;
            return [{ id, label: item.label.trim(), required }];
          }
          return [];
        });
      }
    } catch {
      /* plain lines */
    }
  }
  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ id: line, label: line, required: true }));
}

export function checklistIsComplete(
  items: { id: string; required: boolean }[],
  checkedIds: readonly string[],
): boolean {
  const required = items.filter((item) => item.required);
  if (required.length === 0) return false;
  return required.every((item) => checkedIds.includes(item.id));
}

export type LessonProgressInput = { kind: string; required: boolean; completed: boolean };

/** Required lessons the learner can finish in this phase. Gated lessons stay out of the percent. */
export function courseProgressPercent(lessons: LessonProgressInput[]): number {
  const viewable = lessons.filter((lesson) => lesson.required && !isGatedLesson(lesson.kind));
  if (viewable.length === 0) return 0;
  const done = viewable.filter((lesson) => lesson.completed).length;
  return Math.min(100, Math.round((done / viewable.length) * 100));
}

/**
 * Course completion is computed here. A client flag or score never grants it.
 * No certificate is inserted and no score is stored.
 */
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function evaluateCourseCompletion(input: {
  lessons: LessonProgressInput[];
  clientCompleted?: boolean | null;
  clientScore?: number | null;
  /** Default off. Existing courses do not gain an attendance gate. */
  attendanceRequired?: boolean;
  attendanceStatus?: AttendanceStatus | null;
}): { complete: boolean; reason: string; certificateInserted: false; score: null } {
  const refused = { certificateInserted: false as const, score: null };
  if (input.clientCompleted === true || input.clientScore != null) {
    return { complete: false, reason: "client_flag_rejected", ...refused };
  }
  if (input.lessons.length === 0) return { complete: false, reason: "no_lessons", ...refused };
  if (input.lessons.some((lesson) => isGatedLesson(lesson.kind) && !lesson.completed)) {
    return { complete: false, reason: "gated_lesson", ...refused };
  }
  if (input.lessons.some((lesson) => lesson.required && !lesson.completed)) {
    return { complete: false, reason: "required_incomplete", ...refused };
  }
  if (
    input.attendanceRequired === true &&
    input.attendanceStatus !== "PRESENT" &&
    input.attendanceStatus !== "LATE"
  ) {
    return { complete: false, reason: "attendance_required", ...refused };
  }
  return { complete: true, reason: "ready", ...refused };
}

export function progressCarriesClientOutcome(input: object): boolean {
  const record = input as Record<string, unknown>;
  return learningCarriesClientOutcome(input) || record.percent != null || record.progressPercent != null;
}

export const QUESTION_KINDS = [
  "MULTIPLE_CHOICE",
  "MULTIPLE_SELECT",
  "TRUE_FALSE",
  "YES_NO",
  "SHORT_ANSWER",
  "ORDERING",
  "MATCHING",
  "SCENARIO",
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const QUESTION_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

const LEARNER_FORBIDDEN_FIELDS = ["correct", "is_correct", "isCorrect", "explanation", "answerKey"] as const;

/** Stems served before submit. Drops keys, correctness, and explanations. */
export function toLearnerQuestion(row: {
  id: string;
  prompt: string;
  kind: string;
  scenarioPrompt?: string | null;
  innerKind?: string | null;
  options: unknown;
}): Record<string, unknown> {
  const options = Array.isArray(row.options)
    ? row.options.map((option) => {
        if (!option || typeof option !== "object") return option;
        const source = option as Record<string, unknown>;
        return { id: source.id ?? null, label: source.label ?? null, side: source.side ?? null };
      })
    : [];
  return {
    id: row.id,
    prompt: row.prompt,
    kind: row.kind,
    scenarioPrompt: row.scenarioPrompt ?? null,
    innerKind: row.innerKind ?? null,
    options,
  };
}

export function learnerPayloadHasAnswerKey(payload: object): boolean {
  const record = payload as Record<string, unknown>;
  return LEARNER_FORBIDDEN_FIELDS.some((key) => record[key] != null);
}

export function submitCarriesClientScore(input: object): boolean {
  const record = input as Record<string, unknown>;
  return record.score != null || record.passed != null || record.clientScore != null;
}

export function answersMatchServedQuestions(servedIds: readonly string[], answers: { questionId: string }[]): boolean {
  return answers.every((answer) => servedIds.includes(answer.questionId));
}

export function canStartQuizAttempt(submittedCount: number, maxAttempts: number): boolean {
  return submittedCount >= 0 && maxAttempts > 0 && submittedCount < maxAttempts;
}

function asTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const b = [...right].sort();
  return [...left].sort().every((item, index) => item === b[index]);
}

function samePairs(left: { left: string; right: string }[], right: { left: string; right: string }[]): boolean {
  const key = (pair: { left: string; right: string }) => `${pair.left}\u0000${pair.right}`;
  return sameStringSet(left.map(key), right.map(key));
}

/** Full points or zero. Matching and ordering are exact. A wrong shape does not pass. */
export function gradeQuestion(kind: string, correct: unknown, answer: unknown, innerKind?: string | null): boolean {
  if (!correct || typeof correct !== "object" || !answer || typeof answer !== "object") return false;
  const key = correct as Record<string, unknown>;
  const given = answer as Record<string, unknown>;
  if (kind === "SCENARIO") {
    if (!innerKind || innerKind === "SCENARIO") return false;
    return gradeQuestion(innerKind, correct, answer);
  }
  if (kind === "MULTIPLE_CHOICE") return typeof given.value === "string" && given.value === key.optionId;
  if (kind === "MULTIPLE_SELECT") return sameStringSet(asTextList(given.value), asTextList(key.optionIds));
  if (kind === "TRUE_FALSE") return typeof given.value === "boolean" && given.value === key.value;
  if (kind === "YES_NO") return given.value === "yes" || given.value === "no" ? given.value === key.value : false;
  if (kind === "SHORT_ANSWER") {
    const accepted = asTextList(key.answers).map((item) => item.trim().toLowerCase());
    return typeof given.value === "string" && accepted.includes(given.value.trim().toLowerCase());
  }
  if (kind === "ORDERING") {
    const expected = asTextList(key.order);
    const got = asTextList(given.order);
    return expected.length > 0 && expected.length === got.length && expected.every((item, index) => item === got[index]);
  }
  if (kind === "MATCHING") {
    const pairs = (value: unknown) =>
      Array.isArray(value)
        ? value.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const pair = item as Record<string, unknown>;
            if (typeof pair.left !== "string" || typeof pair.right !== "string") return [];
            return [{ left: pair.left, right: pair.right }];
          })
        : [];
    const expected = pairs(key.pairs);
    return expected.length > 0 && samePairs(expected, pairs(given.pairs));
  }
  return false;
}

export function questionKeyIsUsable(kind: string, correct: unknown, innerKind?: string | null): boolean {
  if (!correct || typeof correct !== "object" || Array.isArray(correct)) return false;
  const key = correct as Record<string, unknown>;
  if (kind === "SCENARIO") {
    if (!innerKind || innerKind === "SCENARIO") return false;
    return questionKeyIsUsable(innerKind, correct);
  }
  if (kind === "MULTIPLE_CHOICE") return typeof key.optionId === "string" && key.optionId.length > 0;
  if (kind === "MULTIPLE_SELECT") return Array.isArray(key.optionIds) && key.optionIds.length > 0;
  if (kind === "TRUE_FALSE") return typeof key.value === "boolean";
  if (kind === "YES_NO") return key.value === "yes" || key.value === "no";
  if (kind === "SHORT_ANSWER") return Array.isArray(key.answers) && key.answers.some((item) => typeof item === "string" && item.trim());
  if (kind === "ORDERING") return Array.isArray(key.order) && key.order.length > 0;
  if (kind === "MATCHING") return Array.isArray(key.pairs) && key.pairs.length > 0;
  return false;
}

export function quizScorePercent(earnedPoints: number, possiblePoints: number): number {
  if (possiblePoints <= 0 || earnedPoints <= 0) return 0;
  return Math.min(100, Math.round((earnedPoints / possiblePoints) * 100));
}

export function quizPassed(score: number, passingScore: number): boolean {
  return score >= passingScore;
}

export type PracticalItemResult = { id: string; required: boolean; met: boolean };

/** A learner cannot record their own practical result. Grading requires the grade capability and staff scope. */
export function practicalGradeAllowed(input: {
  canGrade: boolean;
  actorStaffId: string | null;
  learnerStaffId: string;
  inScope: boolean;
}): boolean {
  if (!input.canGrade || !input.inScope) return false;
  if (input.actorStaffId != null && input.actorStaffId === input.learnerStaffId) return false;
  return true;
}

/** PASS is allowed only when every required checklist item is met. An empty checklist cannot pass. */
export function practicalPassAllowed(items: PracticalItemResult[]): boolean {
  if (items.length === 0) return false;
  return items.every((item) => !item.required || item.met);
}

export function practicalLessonCompletes(result: "PASS" | "FAIL", items: PracticalItemResult[]): boolean {
  return result === "PASS" && practicalPassAllowed(items);
}

/** A new attempt is appended. A later pass does not remove an earlier failure. */
export function appendPracticalAttempt<T>(history: readonly T[], attempt: T): T[] {
  return [...history, attempt];
}

/** Present or Late satisfies a required attendance gate. Absent and Excused do not. */
export function attendanceSatisfiesGate(status: AttendanceStatus | null | undefined): boolean {
  return status === "PRESENT" || status === "LATE";
}

/**
 * Attendance is recorded by someone with training.attendance.manage who is the
 * session trainer, or who can create sessions and can access that participant.
 * A person cannot mark their own row.
 */
export function attendanceMarkAllowed(input: {
  canManageAttendance: boolean;
  canCreateSession: boolean;
  actorStaffId: string | null;
  trainerStaffId: string | null;
  participantStaffId: string;
  participantInScope: boolean;
}): boolean {
  if (!input.canManageAttendance) return false;
  if (input.actorStaffId != null && input.actorStaffId === input.participantStaffId) return false;
  if (input.actorStaffId != null && input.actorStaffId === input.trainerStaffId) return true;
  return input.canCreateSession && input.participantInScope;
}

/** Capacity is a positive cap. The roster cannot grow past it. */
export function sessionCapacityAllows(capacity: number, participantCount: number, adding: number): boolean {
  return (
    Number.isInteger(capacity) &&
    capacity > 0 &&
    Number.isInteger(participantCount) &&
    participantCount >= 0 &&
    Number.isInteger(adding) &&
    adding >= 0 &&
    participantCount + adding <= capacity
  );
}

/**
 * Trainers see their sessions. Participants see sessions they are on.
 * training.view sees sessions only at sites they can access.
 */
export function sessionVisible(input: {
  canView: boolean;
  locationAllowed: boolean;
  actorStaffId: string | null;
  trainerStaffId: string | null;
  isParticipant: boolean;
}): boolean {
  if (input.actorStaffId != null && input.actorStaffId === input.trainerStaffId) return true;
  if (input.isParticipant) return true;
  return input.canView && input.locationAllowed;
}

export function groupLearning<T extends LearningEnrollment>(rows: T[], today: string) {
  const completed = rows.filter((row) => enrollmentIsCompleted(row));
  const open = rows.filter((row) => !enrollmentIsCompleted(row));
  const horizon = addUtcDays(today, LEARNING_DUE_SOON_DAYS);
  return {
    mandatory: open.filter((row) => row.required),
    dueSoon: open.filter((row) => row.dueOn != null && row.dueOn >= today && row.dueOn <= horizon),
    overdue: open.filter((row) => row.dueOn != null && row.dueOn < today),
    inProgress: open.filter((row) => row.status === "ENROLLED" || row.status === "IN_PROGRESS"),
    completed,
  };
}

export const EXPIRY_NOTICE_DAYS = [30, 14, 7] as const;

export const COMPETENCY_LEVELS = [
  "NOT_TRAINED",
  "TRAINING_IN_PROGRESS",
  "TRAINED",
  "ASSESSMENT_PENDING",
  "COMPETENT",
  "EXPIRED",
  "REQUIRES_RETRAINING",
] as const;
export type CompetencyLevel = (typeof COMPETENCY_LEVELS)[number];

export const MATRIX_CELL_STATUSES = [
  "NOT_TRAINED",
  "IN_PROGRESS",
  "TRAINED",
  "VALID",
  "EXPIRING",
  "EXPIRED",
  "REVOKED",
] as const;

export const TRAINING_ENTITY_TYPES = [
  "SOP",
  "ASSET",
  "TICKET",
  "EVENT",
  "MAINTENANCE",
  "LOCATION",
  "DEPARTMENT",
  "INCIDENT",
  "POLICY",
  "JOB_ROLE",
  "EQUIPMENT",
  "PROCESS",
  "GAME",
  "SAFETY_REQUIREMENT",
] as const;

const SHARE_CARD_KEYS = ["title", "mandatory", "durationMinutes", "dueOn", "href"] as const;

/** Display code from the random token. Not a sequence and not the full token. */
export function certificateDisplayCode(publicToken: string): string | null {
  if (!/^[0-9a-f]{64}$/.test(publicToken)) return null;
  return `FEC-${publicToken.slice(0, 12).toUpperCase()}`;
}

/**
 * A certificate is issued only from a completed enrollment on a course that
 * issues certificates. A client score never qualifies.
 */
export function certificateMayIssue(input: {
  completed: boolean;
  certificateEnabled: boolean;
  holderName: string;
  clientScore?: number | null;
}): { ok: boolean; reason: string } {
  if (input.clientScore != null) return { ok: false, reason: "client_score_rejected" };
  if (!input.completed) return { ok: false, reason: "enrollment_incomplete" };
  if (!input.certificateEnabled) return { ok: false, reason: "certificates_disabled" };
  if (!input.holderName.trim()) return { ok: false, reason: "name_missing" };
  return { ok: true, reason: "ready" };
}

export function revocationAllowed(reason: string): boolean {
  return reason.trim().length > 0;
}

/** One notice bucket. A later day does not resend an earlier bucket. */
export function expiryNoticeKind(daysUntil: number | null): "D30" | "D14" | "D7" | "EXPIRED" | null {
  if (daysUntil == null) return null;
  if (daysUntil < 0) return "EXPIRED";
  if (daysUntil <= 7) return "D7";
  if (daysUntil <= 14) return "D14";
  if (daysUntil <= 30) return "D30";
  return null;
}

export function retrainingDue(input: {
  daysUntil: number | null;
  leadDays: number;
  refresherCourseId: string | null;
  alreadyAssigned: boolean;
}): boolean {
  if (!input.refresherCourseId || input.alreadyAssigned || input.daysUntil == null) return false;
  return input.daysUntil <= input.leadDays;
}

export function competencyFromEvidence(input: {
  hasEnrollment: boolean;
  completed: boolean;
  assessmentPending: boolean;
  certificateStatus: string | null;
}): CompetencyLevel {
  if (input.certificateStatus === "REVOKED") return "REQUIRES_RETRAINING";
  if (input.certificateStatus === "EXPIRED") return "EXPIRED";
  if (input.certificateStatus === "VALID" || input.certificateStatus === "EXPIRING") return "COMPETENT";
  if (input.assessmentPending) return "ASSESSMENT_PENDING";
  if (input.completed) return "TRAINED";
  if (input.hasEnrollment) return "TRAINING_IN_PROGRESS";
  return "NOT_TRAINED";
}

export function pathProgress(completedCourses: number, totalCourses: number): {
  done: number;
  total: number;
  percent: number;
  certificateReady: boolean;
} {
  const total = Math.max(0, totalCourses);
  const done = Math.min(Math.max(0, completedCourses), total);
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    certificateReady: total > 0 && done === total,
  };
}

export function completionRate(completed: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((completed / total) * 100);
}

/** Share text for chat. The card does not carry identity documents or a score. */
export function trainingShareCard(input: {
  title: string;
  mandatory: boolean;
  durationMinutes: number | null;
  dueOn: string | null;
  href: string;
}): { title: string; mandatory: boolean; durationMinutes: number | null; dueOn: string | null; href: string } | null {
  const title = input.title.trim();
  if (!title || !input.href.startsWith("/training/")) return null;
  const card = {
    title,
    mandatory: input.mandatory,
    durationMinutes: input.durationMinutes,
    dueOn: input.dueOn,
    href: input.href,
  };
  const extra = Object.keys(input).filter((key) => !(SHARE_CARD_KEYS as readonly string[]).includes(key));
  if (extra.length > 0) return null;
  return card;
}

export function requirementEnforcement(input: {
  status: string;
  enforceMode: "WARN" | "BLOCK";
  requirementType: "REQUIRED" | "RECOMMENDED";
}): { warn: boolean; block: boolean } {
  const satisfied = input.status === "VALID" || input.status === "EXPIRING" || input.status === "TRAINED";
  if (satisfied) return { warn: false, block: false };
  const gap =
    input.status === "NOT_TRAINED" ||
    input.status === "EXPIRED" ||
    input.status === "REVOKED" ||
    input.status === "IN_PROGRESS";
  if (!gap || input.requirementType === "RECOMMENDED" || input.enforceMode === "WARN") {
    return { warn: gap, block: false };
  }
  return { warn: true, block: true };
}

