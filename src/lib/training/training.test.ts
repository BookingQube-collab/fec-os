import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { canUserDo, CAPABILITIES, type Capability } from "@/lib/rbac";

import {
  LESSON_KINDS,
  SAVED_RULES_ARE_EXECUTED,
  assignmentCarriesClientOutcome,
  canAssignTarget,
  publishedVersionIsAssignable,
  siteAssignAllowed,
  capabilityForAssignmentTarget,
  decideCompletion,
  courseProgressPercent,
  enrollmentIsCompleted,
  enrollmentOwnedByStaff,
  evaluateCourseCompletion,
  groupLearning,
  heartbeatAccepted,
  mediaLessonCanComplete,
  openingLessonCompletes,
  readLessonCanComplete,
  answersMatchServedQuestions,
  canStartQuizAttempt,
  gradeQuestion,
  learnerPayloadHasAnswerKey,
  questionKeyIsUsable,
  quizPassed,
  quizScorePercent,
  appendPracticalAttempt,
  attendanceMarkAllowed,
  attendanceSatisfiesGate,
  practicalGradeAllowed,
  practicalLessonCompletes,
  practicalPassAllowed,
  sessionCapacityAllows,
  sessionVisible,
  submitCarriesClientScore,
  toLearnerQuestion,
  learnerCanReadCourse,
  learningCarriesClientOutcome,
  publicCertificateHasSensitiveFields,
  PUBLIC_CERTIFICATE_FIELDS,
  toPublicCertificateVerification,
  certificateDisplayCode,
  certificateMayIssue,
  revocationAllowed,
  expiryNoticeKind,
  retrainingDue,
  competencyFromEvidence,
  pathProgress,
  completionRate,
  trainingShareCard,
  requirementEnforcement,
  savedRuleEnrollsStaff,
  staffCanReceiveTraining,
  trainingEventDecision,
  TRAINING_PERMISSION_KEYS,
  trainingPermissionsMatchRbac,
} from "./engine";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20261002150000_training_engine.sql",
);

describe("training permissions", () => {
  it("matches the RBAC capability map", () => {
    expect(trainingPermissionsMatchRbac()).toBe(true);
    const fromRbac = (Object.keys(CAPABILITIES) as Capability[]).filter((key) => key.startsWith("training."));
    expect(fromRbac).toEqual([...TRAINING_PERMISSION_KEYS]);
  });

  it("keeps the SQL default role lists in sync with RBAC keys", () => {
    const sql = readFileSync(migrationPath, "utf8");
    for (const key of TRAINING_PERMISSION_KEYS) {
      expect(sql).toContain(`WHEN '${key}'`);
    }
    const company = sql.split("\n").find((line) => line.includes("WHEN 'training.assign.company'"));
    expect(company).toBeDefined();
    expect(company).toContain("'ceo'");
    expect(company).toContain("'coo'");
    expect(company).toContain("'regional_ops'");
    expect(company).toContain("'hr'");
    expect(company).not.toContain("auditor");
    expect(company).not.toContain("duty_manager");
    expect(company).not.toContain("branch_gm");
  });
});

describe("training assignment privilege", () => {
  it("requires training.assign.company for company-wide assignment", () => {
    expect(capabilityForAssignmentTarget("COMPANY")).toBe("training.assign.company");
    expect(canUserDo(["auditor"], "training.view")).toBe(true);
    expect(canAssignTarget(["auditor"], "COMPANY")).toBe(false);
    expect(canAssignTarget(["duty_manager"], "COMPANY")).toBe(false);
    expect(canAssignTarget(["branch_gm"], "COMPANY")).toBe(false);
    expect(canAssignTarget(["hr"], "COMPANY")).toBe(true);
    expect(canAssignTarget(["ceo"], "COMPANY")).toBe(true);
  });

  it("refuses a draft course as an assignment target", () => {
    expect(publishedVersionIsAssignable("DRAFT", "DRAFT")).toBe(false);
    expect(publishedVersionIsAssignable("PUBLISHED", "DRAFT")).toBe(false);
    expect(publishedVersionIsAssignable("UNDER_REVIEW", "UNDER_REVIEW")).toBe(false);
    expect(publishedVersionIsAssignable("PUBLISHED", "PUBLISHED")).toBe(true);
  });

  it("requires site scope as well as training.assign.site", () => {
    expect(siteAssignAllowed({ roles: ["duty_manager"], canAccessLocation: true })).toBe(false);
    expect(siteAssignAllowed({ roles: ["branch_gm"], canAccessLocation: false })).toBe(false);
    expect(siteAssignAllowed({ roles: ["branch_gm"], canAccessLocation: true })).toBe(true);
    expect(canAssignTarget(["auditor"], "SITE")).toBe(false);
  });

  it("rejects a client completion flag or score on an assignment payload", () => {
    expect(assignmentCarriesClientOutcome({ courseId: "x", completed: true })).toBe(true);
    expect(assignmentCarriesClientOutcome({ courseId: "x", score: 80 })).toBe(true);
    expect(assignmentCarriesClientOutcome({ courseId: "x", completed_at: "2026-10-02" })).toBe(true);
    expect(assignmentCarriesClientOutcome({ courseId: "x", clientCompleted: true })).toBe(true);
    expect(assignmentCarriesClientOutcome({ courseId: "x", required: true, score: null })).toBe(false);
    const source = readFileSync(path.resolve(process.cwd(), "src/lib/training/assignments.functions.ts"), "utf8");
    expect(source).not.toContain("completed: true");
    expect(source).not.toContain("score:");
    expect(source).toContain(".strict()");
  });

  it("keeps the original assignment file from installing a staff trigger", () => {
    const assignmentSql = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261002170000_training_assignments.sql"),
      "utf8",
    );
    expect(assignmentSql).toContain("JOIN_COMPANY");
    expect(assignmentSql).toContain("Stored only");
    expect(assignmentSql).not.toMatch(/CREATE TRIGGER[\s\S]*ON public\.staff/i);
    expect(assignmentSql).not.toContain("GRANT INSERT ON public.training_course_enrollments");
    expect(assignmentSql).not.toMatch(/training_apply_assignment\([^)]*score/i);
    expect(assignmentSql).toContain("user_can_access_location");
    expect(assignmentSql).toContain("training.assign.company");
  });

  it("enrolls matching saved rules and blocks only a required gap", () => {
    expect(SAVED_RULES_ARE_EXECUTED).toBe(true);
    const sql = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261002270000_training_execute_saved_rules.sql"),
      "utf8",
    );
    expect(sql).toContain("training_execute_saved_rules");
    expect(sql).toContain("JOIN_COMPANY");
    expect(sql).toContain("ROLE_CHANGE");
    expect(sql).toContain("MACHINE_ASSIGNMENT");
    expect(sql).toContain("ON CONFLICT (staff_id, version_id) DO NOTHING");
    expect(sql).not.toMatch(/NEW\.score|SET status = 'COMPLETED'|completed_at\s*=/);
    expect(staffCanReceiveTraining("probation")).toBe(true);
    expect(staffCanReceiveTraining("terminated")).toBe(false);
    const staff = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "active",
      locationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      departmentIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
      staffRole: "cashier_host",
      userRoles: [] as string[],
      employmentType: "permanent",
    };
    const base = {
      triggerKind: "MACHINE_ASSIGNMENT" as const,
      target: "ROLE" as const,
      staffId: null,
      departmentId: null,
      locationId: null,
      roleCode: "technician",
      employmentType: null,
    };
    expect(savedRuleEnrollsStaff(base, "MACHINE_ASSIGNMENT", staff, "technician")).toBe(true);
    expect(savedRuleEnrollsStaff(base, "JOIN_COMPANY", staff, "technician")).toBe(false);
    expect(savedRuleEnrollsStaff({ ...base, target: "BUSINESS_UNIT" }, "MACHINE_ASSIGNMENT", staff)).toBe(false);
    expect(savedRuleEnrollsStaff({ ...base, target: "SITE", locationId: staff.locationId, roleCode: null }, "MACHINE_ASSIGNMENT", staff)).toBe(true);
    expect(trainingEventDecision({
      trigger: "JOIN_COMPANY",
      requirements: [{ status: "NOT_TRAINED", enforceMode: "BLOCK", requirementType: "REQUIRED", courseTitle: "Induction" }],
    }).block).toBe(false);
    expect(trainingEventDecision({
      trigger: "MACHINE_ASSIGNMENT",
      requirements: [{ status: "NOT_TRAINED", enforceMode: "BLOCK", requirementType: "REQUIRED", courseTitle: "Machine safety" }],
    })).toEqual({ warn: false, block: true, blockingTitles: ["Machine safety"] });
    expect(trainingEventDecision({
      trigger: "ROLE_CHANGE",
      requirements: [{ status: "NOT_TRAINED", enforceMode: "WARN", requirementType: "REQUIRED", courseTitle: "Supervisor" }],
    }).block).toBe(false);
    expect(trainingEventDecision({
      trigger: "ROLE_CHANGE",
      requirements: [{ status: "VALID", enforceMode: "BLOCK", requirementType: "REQUIRED", courseTitle: "Supervisor" }],
    })).toEqual({ warn: false, block: false, blockingTitles: [] });
  });

  it("lets a duty manager assign a department but not a company", () => {
    expect(canAssignTarget(["duty_manager"], "DEPARTMENT")).toBe(true);
    expect(canAssignTarget(["duty_manager"], "SITE")).toBe(false);
    expect(canAssignTarget(["cashier_host"], "EMPLOYEE")).toBe(false);
  });
});

describe("training draft visibility", () => {
  it("hides drafts and in-review courses from learners", () => {
    expect(learnerCanReadCourse({ courseStatus: "DRAFT", versionStatus: "DRAFT", enrolled: true })).toBe(false);
    expect(learnerCanReadCourse({ courseStatus: "UNDER_REVIEW", versionStatus: "PUBLISHED", enrolled: true })).toBe(false);
    expect(learnerCanReadCourse({ courseStatus: "PUBLISHED", versionStatus: "DRAFT", enrolled: true })).toBe(false);
    expect(learnerCanReadCourse({ courseStatus: "PUBLISHED", versionStatus: "PUBLISHED", enrolled: false })).toBe(false);
    expect(learnerCanReadCourse({ courseStatus: "PUBLISHED", versionStatus: "PUBLISHED", enrolled: true })).toBe(true);
    expect(learnerCanReadCourse({ courseStatus: "ARCHIVED", versionStatus: "PUBLISHED", enrolled: true })).toBe(false);
  });
});

describe("training completion authority", () => {
  it("rejects a client completion flag even when evidence is present", () => {
    expect(
      decideCompletion({
        clientCompleted: true,
        authoritativeEvidence: { requiredLessonsComplete: true, assessmentPassed: true },
      }),
    ).toEqual({ granted: false, reason: "client_flag_rejected" });
  });

  it("does not grant completion in this phase", () => {
    const decision = decideCompletion({
      clientCompleted: false,
      authoritativeEvidence: { requiredLessonsComplete: true, assessmentPassed: true },
    });
    expect(decision.granted).toBe(false);
    expect(decision.reason).toBe("not_implemented");
  });
});

describe("training certificate public payload", () => {
  it("returns only verification fields and drops sensitive identity data", () => {
    const payload = toPublicCertificateVerification({
      status: "VALID",
      holder_name: "Amina Rahman",
      course_title: "Site induction",
      issued_at: "2026-10-01T00:00:00.000Z",
      valid_until: "2027-10-01",
      staff_id: "staff-1",
      employee_code: "E-100",
      qid: "28412345678",
      passport: "P1234567",
      salary: 9000,
      phone: "+97455550000",
      email: "amina@example.com",
    });
    expect(Object.keys(payload).sort()).toEqual([...PUBLIC_CERTIFICATE_FIELDS].sort());
    expect(payload.holderName).toBe("Amina Rahman");
    expect(payload.courseTitle).toBe("Site induction");
    expect(publicCertificateHasSensitiveFields(payload)).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("28412345678");
    expect(JSON.stringify(payload)).not.toContain("amina@example.com");
    expect(JSON.stringify(payload)).not.toContain("staff-1");
  });

  it("does not report a lapsed certificate as valid and keeps revoked", () => {
    expect(
      toPublicCertificateVerification(
        { status: "VALID", holder_name: "A", course_title: "B", issued_at: null, valid_until: "2020-01-01" },
        new Date("2026-10-02T00:00:00.000Z"),
      ).status,
    ).toBe("EXPIRED");
    expect(
      toPublicCertificateVerification(
        { status: "REVOKED", holder_name: "A", course_title: "B", issued_at: null, valid_until: "2020-01-01" },
        new Date("2026-10-02T00:00:00.000Z"),
      ).status,
    ).toBe("REVOKED");
  });
});

function sqlSlice(sql: string, start: string, end: string): string {
  const from = sql.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = sql.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return sql.slice(from, to);
}

describe("training SQL contract", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("hides non-published courses from the learner branch", () => {
    const reader = sqlSlice(sql, "FUNCTION public.training_can_read_course", "FUNCTION public.training_can_read_version");
    expect(reader).toContain("c.status = 'PUBLISHED'");
    expect(reader).toContain("v.status = 'PUBLISHED'");
    expect(reader).toContain("training.view");
  });

  it("refuses spoofed completion without writing", () => {
    const fn = sqlSlice(sql, "FUNCTION public.training_apply_completion", "FUNCTION public.training_issue_certificate");
    expect(fn).toContain("completion cannot be granted from a client flag");
    expect(fn.toLowerCase()).not.toContain("update ");
    expect(fn.toLowerCase()).not.toContain("insert ");
    expect(sql).not.toContain("FUNCTION public.complete_training");
  });

  it("projects only the public certificate columns", () => {
    const fn = sqlSlice(sql, "FUNCTION public.training_verify_certificate", "REVOKE ALL ON FUNCTION public.training_code_allows");
    expect(fn).toContain("holder_name");
    expect(fn).toContain("course_title");
    expect(fn).toContain("issued_at");
    expect(fn).toContain("valid_until");
    expect(fn).not.toMatch(/staff_id|qid|passport|salary|\bphone\b|\bemail\b/);
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.training_verify_certificate(text) TO anon, authenticated, service_role",
    );
    expect(sql).not.toContain("GRANT SELECT ON public.training_certificates TO anon");
  });

  it("does not grant authenticated writes on authoritative tables", () => {
    const privileges = sql.slice(sql.indexOf("-- Privileges"));
    const selectOnly = privileges.match(/GRANT SELECT ON\r?\n([\s\S]*?)TO authenticated;/);
    expect(selectOnly?.[1]).toContain("public.training_course_enrollments");
    expect(selectOnly?.[1]).toContain("public.training_certificates");
    expect(selectOnly?.[1]).toContain("public.training_attempts");
    const grants = privileges.match(/GRANT [\s\S]*?TO authenticated;/g) ?? [];
    for (const grant of grants) {
      if (/^GRANT SELECT ON\b/.test(grant.trim())) continue;
      expect(grant).not.toContain("training_course_enrollments");
      expect(grant).not.toContain("training_certificates");
      expect(grant).not.toContain("training_attempts");
      expect(grant).not.toContain("training_progress");
    }
    expect(sql).not.toMatch(/USING \(true\)/);
    expect(sql).not.toMatch(/nextval|generated always as identity/i);
  });

  it("keeps builder lesson kinds in the follow-up migration", () => {
    const builder = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261002160000_training_course_builder.sql"),
      "utf8",
    );
    for (const kind of LESSON_KINDS) {
      expect(builder).toContain(`'${kind}'`);
    }
  });

  it("gates company-wide rule inserts on training.assign.company", () => {
    const policy = sqlSlice(sql, "POLICY training_assignment_rules_insert", "POLICY training_enrollments_select");
    expect(policy).toContain("target = 'COMPANY'");
    expect(policy).toContain("training.assign.company");
    expect(policy).toContain("training.assign.site");
    expect(policy).toContain("user_can_access_location");
  });
});

describe("my learning", () => {
  const today = "2026-10-02";

  it("does not treat ENROLLED as completed", () => {
    expect(enrollmentIsCompleted({ status: "ENROLLED", completedAt: null })).toBe(false);
    expect(enrollmentIsCompleted({ status: "IN_PROGRESS", completedAt: null })).toBe(false);
    expect(enrollmentIsCompleted({ status: "COMPLETED", completedAt: null })).toBe(true);
    expect(enrollmentIsCompleted({ status: "ENROLLED", completedAt: "2026-10-01T00:00:00Z" })).toBe(true);
    const groups = groupLearning(
      [{ id: "enrolled", status: "ENROLLED", completedAt: null, dueOn: null, required: false }],
      today,
    );
    expect(groups.completed).toHaveLength(0);
    expect(groups.inProgress.map((row) => row.id)).toEqual(["enrolled"]);
  });

  it("groups overdue and due-soon courses without marking them complete", () => {
    const rows = [
      { id: "overdue", status: "ENROLLED", completedAt: null, dueOn: "2026-10-01", required: true },
      { id: "soon", status: "IN_PROGRESS", completedAt: null, dueOn: "2026-10-16", required: false },
      { id: "later", status: "ENROLLED", completedAt: null, dueOn: "2026-10-17", required: false },
      { id: "done", status: "COMPLETED", completedAt: "2026-09-01T00:00:00Z", dueOn: "2026-09-01", required: true },
    ];
    const groups = groupLearning(rows, today);
    expect(groups.overdue.map((row) => row.id)).toEqual(["overdue"]);
    expect(groups.dueSoon.map((row) => row.id)).toEqual(["soon"]);
    expect(groups.mandatory.map((row) => row.id)).toEqual(["overdue"]);
    expect(groups.completed.map((row) => row.id)).toEqual(["done"]);
    expect(groups.inProgress.map((row) => row.id)).toEqual(["overdue", "soon", "later"]);
  });

  it("refuses another staff member's enrollment id", () => {
    expect(enrollmentOwnedByStaff("staff-a", "staff-b")).toBe(false);
    expect(enrollmentOwnedByStaff(null, "staff-b")).toBe(false);
    expect(enrollmentOwnedByStaff("staff-a", "staff-a")).toBe(true);
  });

  it("cannot set completion or a score from the My Learning action", () => {
    expect(learningCarriesClientOutcome({ enrollmentId: "x", completed: true })).toBe(true);
    expect(learningCarriesClientOutcome({ enrollmentId: "x", score: 90 })).toBe(true);
    expect(learningCarriesClientOutcome({ enrollmentId: "x" })).toBe(false);
    expect(canUserDo(["cashier_host"], "training.learn")).toBe(true);
    expect(canUserDo(["cashier_host"], "training.view")).toBe(false);
    const source = readFileSync(path.resolve(process.cwd(), "src/lib/training/learning.functions.ts"), "utf8");
    expect(source).not.toContain("completed: true");
    expect(source).not.toContain("score:");
    expect(source).toContain(".strict()");
    expect(source).toContain('.eq("staff_id", staffId)');
    const sql = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261002180000_training_my_learning.sql"),
      "utf8",
    );
    expect(sql).toContain("training_mark_started(_enrollment_id uuid)");
    expect(sql).not.toMatch(/training_mark_started\([^)]*score/i);
    expect(sql).toContain("e.started_at IS NULL");
    expect(sql).toContain("enrollment belongs to another employee");
    expect(sql).not.toContain("GRANT UPDATE ON public.training_course_enrollments");
  });
});

describe("training player progress", () => {
  it("does not complete a video because the lesson was opened", () => {
    expect(openingLessonCompletes("VIDEO")).toBe(false);
    expect(openingLessonCompletes("AUDIO")).toBe(false);
    expect(openingLessonCompletes("TEXT")).toBe(false);
    expect(mediaLessonCanComplete(0, 100)).toBe(false);
    expect(mediaLessonCanComplete(89, 100)).toBe(false);
    expect(mediaLessonCanComplete(90, 100)).toBe(true);
    expect(mediaLessonCanComplete(90, null)).toBe(false);
    const sql = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261002190000_training_player.sql"),
      "utf8",
    );
    expect(sql).toContain("IF _event = 'VIEW' THEN");
    expect(sql).toContain("_should := false");
    expect(sql).toContain("position jump rejected");
  });

  it("rejects a heartbeat that claims a huge time jump", () => {
    expect(heartbeatAccepted(10)).toBe(true);
    expect(heartbeatAccepted(30)).toBe(true);
    expect(heartbeatAccepted(31)).toBe(false);
    expect(heartbeatAccepted(600)).toBe(false);
    expect(readLessonCanComplete(9, true)).toBe(false);
    expect(readLessonCanComplete(10, true)).toBe(true);
    expect(readLessonCanComplete(10, false)).toBe(false);
    const sql = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261002190000_training_player.sql"),
      "utf8",
    );
    expect(sql).toContain("_delta_seconds > 30");
    expect(sql).toContain("heartbeat rejected");
    expect(sql).toContain("_time < 10");
  });

  it("cannot set course completion or a score from the progress action", () => {
    expect(
      evaluateCourseCompletion({
        lessons: [{ kind: "TEXT", required: true, completed: true }],
        clientCompleted: true,
      }).reason,
    ).toBe("client_flag_rejected");
    expect(
      evaluateCourseCompletion({
        lessons: [{ kind: "TEXT", required: true, completed: true }],
        clientScore: 80,
      }).complete,
    ).toBe(false);
    const source = readFileSync(path.resolve(process.cwd(), "src/lib/training/player.functions.ts"), "utf8");
    expect(source).not.toContain("completed: true");
    expect(source).not.toContain("score:");
    expect(source).toContain(".strict()");
    expect(source).toContain('.eq("staff_id", staffId)');
    const sql = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261002190000_training_player.sql"),
      "utf8",
    );
    expect(sql).not.toMatch(/training_player_event\([^)]*score/i);
    expect(sql).not.toMatch(/\bscore\s*=/);
    expect(sql).not.toContain("INSERT INTO public.training_certificates");
    expect(sql).not.toContain("GRANT UPDATE ON public.training_progress");
    expect(sql).not.toContain("GRANT UPDATE ON public.training_course_enrollments");
  });

  it("refuses progress writes for another staff enrollment", () => {
    expect(enrollmentOwnedByStaff("staff-a", "staff-b")).toBe(false);
    const sql = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261002190000_training_player.sql"),
      "utf8",
    );
    expect(sql).toContain("enrollment belongs to another employee");
    expect(sql).toContain("training_actor_staff_id()");
  });

  it("keeps the course incomplete while a quiz lesson is unfinished", () => {
    const decision = evaluateCourseCompletion({
      lessons: [
        { kind: "TEXT", required: true, completed: true },
        { kind: "QUIZ", required: true, completed: false },
      ],
    });
    expect(decision.complete).toBe(false);
    expect(decision.reason).toBe("gated_lesson");
    expect(decision.certificateInserted).toBe(false);
    expect(decision.score).toBeNull();
    expect(
      courseProgressPercent([
        { kind: "TEXT", required: true, completed: true },
        { kind: "QUIZ", required: true, completed: false },
      ]),
    ).toBe(100);
  });

  it("completes the course only when required lessons are done and no gated lesson remains", () => {
    const blocked = evaluateCourseCompletion({
      lessons: [
        { kind: "TEXT", required: true, completed: true },
        { kind: "ACKNOWLEDGEMENT", required: true, completed: false },
      ],
    });
    expect(blocked.complete).toBe(false);
    const ready = evaluateCourseCompletion({
      lessons: [
        { kind: "TEXT", required: true, completed: true },
        { kind: "ACKNOWLEDGEMENT", required: true, completed: true },
      ],
    });
    expect(ready).toEqual({ complete: true, reason: "ready", certificateInserted: false, score: null });
    const optionalQuiz = evaluateCourseCompletion({
      lessons: [
        { kind: "TEXT", required: true, completed: true },
        { kind: "QUIZ", required: false, completed: false },
      ],
    });
    expect(optionalQuiz.complete).toBe(false);
    expect(optionalQuiz.reason).toBe("gated_lesson");
  });
});

describe("training quiz and question bank", () => {
  const sql = () =>
    readFileSync(path.resolve(process.cwd(), "supabase/migrations/20261002200000_training_question_bank.sql"), "utf8");

  it("keeps answer keys out of an in-progress learner payload", () => {
    const served = toLearnerQuestion({
      id: "q1",
      prompt: "Which exit?",
      kind: "MULTIPLE_CHOICE",
      options: [
        { id: "a", label: "North", is_correct: true },
        { id: "b", label: "South", correct: "no" },
      ],
    });
    expect(learnerPayloadHasAnswerKey(served)).toBe(false);
    expect(JSON.stringify(served)).not.toContain("is_correct");
    expect(served.options).toEqual([
      { id: "a", label: "North", side: null },
      { id: "b", label: "South", side: null },
    ]);
    expect(learnerPayloadHasAnswerKey({ correct: { optionId: "a" } })).toBe(true);
    const migration = sql();
    const payloadFn = migration.slice(
      migration.indexOf("FUNCTION public.training_quiz_public_questions"),
      migration.indexOf("FUNCTION public.training_quiz_start"),
    );
    expect(payloadFn).not.toContain("training_bank_question_keys");
    expect(payloadFn).not.toContain("explanation");
    const learner = readFileSync(path.resolve(process.cwd(), "src/lib/training/quiz.functions.ts"), "utf8");
    expect(learner).not.toContain("training_bank_question_keys");
    expect(learner).toContain("learnerPayloadHasAnswerKey");
  });

  it("rejects a submit that carries a score or a passed flag", () => {
    expect(submitCarriesClientScore({ answers: [] })).toBe(false);
    expect(submitCarriesClientScore({ score: 100 })).toBe(true);
    expect(submitCarriesClientScore({ passed: true })).toBe(true);
    const learner = readFileSync(path.resolve(process.cwd(), "src/lib/training/quiz.functions.ts"), "utf8");
    const schema = learner.slice(learner.indexOf("const submitInput"), learner.indexOf("function throwIf"));
    expect(schema).not.toContain("score");
    expect(schema).not.toContain("passed");
    expect(schema).toContain(".strict()");
    expect(sql()).toContain("client score rejected");
    expect(sql()).not.toMatch(/training_quiz_submit\([^)]*score/i);
  });

  it("rejects answers for questions that were not served and blocks extra attempts", () => {
    expect(answersMatchServedQuestions(["served"], [{ questionId: "served" }])).toBe(true);
    expect(answersMatchServedQuestions(["served"], [{ questionId: "other" }])).toBe(false);
    expect(canStartQuizAttempt(1, 2)).toBe(true);
    expect(canStartQuizAttempt(2, 2)).toBe(false);
    expect(canStartQuizAttempt(3, 2)).toBe(false);
    const migration = sql();
    expect(migration).toContain("answer is not for a served question");
    expect(migration).toContain("no attempts remaining");
    expect(migration).toContain("attempt belongs to another employee");
  });

  it("grades objective questions on the server and does not invent a pass", () => {
    expect(gradeQuestion("MULTIPLE_CHOICE", { optionId: "a" }, { value: "a" })).toBe(true);
    expect(gradeQuestion("MULTIPLE_CHOICE", { optionId: "a" }, { value: "b" })).toBe(false);
    expect(gradeQuestion("MULTIPLE_SELECT", { optionIds: ["a", "b"] }, { value: ["b", "a"] })).toBe(true);
    expect(gradeQuestion("MULTIPLE_SELECT", { optionIds: ["a", "b"] }, { value: ["a"] })).toBe(false);
    expect(gradeQuestion("TRUE_FALSE", { value: true }, { value: true })).toBe(true);
    expect(gradeQuestion("YES_NO", { value: "no" }, { value: "no" })).toBe(true);
    expect(gradeQuestion("SHORT_ANSWER", { answers: ["Pump"] }, { value: " pump " })).toBe(true);
    expect(gradeQuestion("ORDERING", { order: ["a", "b"] }, { order: ["a", "b"] })).toBe(true);
    expect(gradeQuestion("ORDERING", { order: ["a", "b"] }, { order: ["b", "a"] })).toBe(false);
    expect(gradeQuestion("MATCHING", { pairs: [{ left: "a", right: "1" }] }, { pairs: [{ left: "a", right: "1" }] })).toBe(true);
    expect(gradeQuestion("MATCHING", { pairs: [{ left: "a", right: "1" }] }, { pairs: [{ left: "a", right: "2" }] })).toBe(false);
    expect(gradeQuestion("SCENARIO", { optionId: "a" }, { value: "a" }, "MULTIPLE_CHOICE")).toBe(true);
    expect(gradeQuestion("ESSAY", { text: "anything" }, { value: "anything" })).toBe(false);
    expect(questionKeyIsUsable("ESSAY", { text: "x" })).toBe(false);
    expect(quizScorePercent(1, 2)).toBe(50);
    expect(quizPassed(69, 70)).toBe(false);
    expect(quizPassed(70, 70)).toBe(true);
    const migration = sql();
    expect(migration).toContain("training_grade_answer");
    expect(migration).not.toContain("INSERT INTO public.training_certificates");
    expect(migration).not.toMatch(/score\s*=\s*100/);
    expect(migration).not.toContain("GRANT UPDATE ON public.training_quiz_attempts");
  });

  it("lets only training.assessment.manage read answer keys", () => {
    expect(canUserDo(["auditor"], "training.view")).toBe(true);
    expect(canUserDo(["auditor"], "training.edit")).toBe(false);
    expect(canUserDo(["auditor"], "training.assessment.manage")).toBe(false);
    expect(canUserDo(["duty_manager"], "training.assessment.grade")).toBe(true);
    expect(canUserDo(["duty_manager"], "training.assessment.manage")).toBe(false);
    expect(canUserDo(["hr"], "training.assessment.manage")).toBe(true);
    const migration = sql();
    const keys = migration.slice(migration.indexOf("POLICY training_bank_question_keys_select"));
    expect(keys).toContain("training.assessment.manage");
    expect(keys.slice(0, keys.indexOf("CREATE POLICY training_bank_question_keys_write"))).not.toContain("training.edit");
    expect(keys.slice(0, keys.indexOf("CREATE POLICY training_bank_question_keys_write"))).not.toContain("training.view");
    const bank = readFileSync(path.resolve(process.cwd(), "src/lib/training/question-bank.functions.ts"), "utf8");
    expect(bank).toContain('requireCapability(context, "training.assessment.manage")');
    expect(bank).toContain("training_bank_question_keys");
    const learner = readFileSync(path.resolve(process.cwd(), "src/lib/training/quiz.functions.ts"), "utf8");
    expect(learner).toContain('.eq("staff_id", staffId)');
  });
});

describe("training practical assessments", () => {
  const sql = () =>
    readFileSync(path.resolve(process.cwd(), "supabase/migrations/20261002210000_training_practical.sql"), "utf8");
  const items = [
    { id: "ppe", required: true, met: true },
    { id: "belt", required: true, met: false },
  ];

  it("does not let a learner pass themselves", () => {
    expect(practicalGradeAllowed({ canGrade: false, actorStaffId: "learner", learnerStaffId: "learner", inScope: true })).toBe(false);
    expect(practicalGradeAllowed({ canGrade: true, actorStaffId: "learner", learnerStaffId: "learner", inScope: true })).toBe(false);
    expect(practicalGradeAllowed({ canGrade: true, actorStaffId: "assessor", learnerStaffId: "learner", inScope: true })).toBe(true);
    const migration = sql();
    expect(migration).toContain("learner cannot grade their own practical");
    expect(migration).toContain("training.assessment.grade required");
    const source = readFileSync(path.resolve(process.cwd(), "src/lib/training/practical.functions.ts"), "utf8");
    expect(source).toContain('requireCapability(context, "training.assessment.grade")');
    const schema = source.slice(source.indexOf("const gradeInput"), source.indexOf("function throwIf"));
    expect(schema).not.toContain("score");
    expect(schema).toContain(".strict()");
  });

  it("rejects a pass when a required item is unmet", () => {
    expect(practicalPassAllowed(items)).toBe(false);
    expect(practicalLessonCompletes("PASS", items)).toBe(false);
    expect(practicalPassAllowed([{ id: "ppe", required: true, met: true }])).toBe(true);
    expect(practicalPassAllowed([])).toBe(false);
    expect(sql()).toContain("required item not met");
  });

  it("rejects a grader outside staff scope and keeps a failure after a later pass", () => {
    expect(practicalGradeAllowed({ canGrade: true, actorStaffId: "assessor", learnerStaffId: "learner", inScope: false })).toBe(false);
    expect(sql()).toContain("grader is outside staff scope");
    expect(sql()).toContain("user_can_access_staff");
    const history = appendPracticalAttempt(
      [{ passed: false }],
      { passed: true },
    );
    expect(history).toEqual([{ passed: false }, { passed: true }]);
    const migration = sql();
    expect(migration).toContain("INSERT INTO public.training_practical_assessments");
    expect(migration).not.toContain("DELETE FROM public.training_practical_assessments");
    expect(migration).not.toContain("UPDATE public.training_practical_assessments");
  });

  it("does not complete the lesson on fail and does not insert a certificate on pass", () => {
    expect(practicalLessonCompletes("FAIL", [{ id: "ppe", required: true, met: true }])).toBe(false);
    expect(practicalLessonCompletes("PASS", [{ id: "ppe", required: true, met: true }])).toBe(true);
    const migration = sql();
    expect(migration).toContain("IF _passed THEN");
    expect(migration).not.toContain("INSERT INTO public.training_certificates");
    expect(migration).not.toMatch(/score\s*=\s*100/);
    expect(migration).not.toMatch(/SET[^;]*\bscore\b/);
    const decision = evaluateCourseCompletion({
      lessons: [
        { kind: "TEXT", required: true, completed: true },
        { kind: "PRACTICAL_ASSESSMENT", required: true, completed: false },
      ],
    });
    expect(decision.complete).toBe(false);
    expect(decision.certificateInserted).toBe(false);
    expect(decision.score).toBeNull();
  });
});

describe("training sessions and attendance", () => {
  const sql = () =>
    readFileSync(path.resolve(process.cwd(), "supabase/migrations/20261002220000_training_sessions.sql"), "utf8");
  const lessons = [{ kind: "TEXT", required: true, completed: true }];

  it("does not let a learner mark themselves present", () => {
    expect(attendanceMarkAllowed({
      canManageAttendance: true,
      canCreateSession: true,
      actorStaffId: "learner",
      trainerStaffId: "learner",
      participantStaffId: "learner",
      participantInScope: true,
    })).toBe(false);
    expect(attendanceMarkAllowed({
      canManageAttendance: true,
      canCreateSession: false,
      actorStaffId: "trainer",
      trainerStaffId: "trainer",
      participantStaffId: "learner",
      participantInScope: true,
    })).toBe(true);
    expect(attendanceMarkAllowed({
      canManageAttendance: false,
      canCreateSession: true,
      actorStaffId: "trainer",
      trainerStaffId: "other",
      participantStaffId: "learner",
      participantInScope: true,
    })).toBe(false);
    expect(sql()).toContain("learner cannot mark their own attendance");
    expect(sql()).toContain("staff_id IS DISTINCT FROM public.training_actor_staff_id()");
  });

  it("does not complete a course for an absence when attendance is required", () => {
    const decision = evaluateCourseCompletion({
      lessons,
      attendanceRequired: true,
      attendanceStatus: "ABSENT",
    });
    expect(decision.complete).toBe(false);
    expect(decision.reason).toBe("attendance_required");
    expect(decision.certificateInserted).toBe(false);
    expect(decision.score).toBeNull();
    expect(attendanceSatisfiesGate("ABSENT")).toBe(false);
    expect(attendanceSatisfiesGate("EXCUSED")).toBe(false);
    expect(sql()).toContain("requires_session_attendance");
  });

  it("does not let present attendance finish an open quiz or practical, or insert a certificate", () => {
    const decision = evaluateCourseCompletion({
      lessons: [
        { kind: "TEXT", required: true, completed: true },
        { kind: "QUIZ", required: true, completed: false },
        { kind: "PRACTICAL_ASSESSMENT", required: true, completed: false },
      ],
      attendanceRequired: true,
      attendanceStatus: "PRESENT",
    });
    expect(decision.complete).toBe(false);
    expect(decision.reason).toBe("gated_lesson");
    expect(decision.certificateInserted).toBe(false);
    expect(decision.score).toBeNull();
    const migration = sql();
    expect(migration).not.toContain("INSERT INTO public.training_certificates");
    expect(migration).not.toContain("INSERT INTO public.training_course_enrollments");
    const finish = migration.slice(
      migration.indexOf("FUNCTION public.training_try_complete_enrollment"),
      migration.indexOf("COMMENT ON FUNCTION public.training_try_complete_enrollment"),
    );
    expect(finish).not.toMatch(/\bscore\b/);
  });

  it("lets present or late satisfy attendance only as the last gate", () => {
    expect(evaluateCourseCompletion({
      lessons,
      attendanceRequired: true,
      attendanceStatus: "PRESENT",
    })).toEqual({ complete: true, reason: "ready", certificateInserted: false, score: null });
    expect(evaluateCourseCompletion({
      lessons,
      attendanceRequired: true,
      attendanceStatus: "LATE",
    }).complete).toBe(true);
    expect(evaluateCourseCompletion({
      lessons,
      attendanceRequired: false,
      attendanceStatus: "ABSENT",
    }).complete).toBe(true);
    expect(attendanceSatisfiesGate("PRESENT")).toBe(true);
    expect(attendanceSatisfiesGate("LATE")).toBe(true);
    expect(sql()).toContain("training_attendance_blocks_completion");
  });

  it("hides a session outside site, participant, and trainer scope", () => {
    expect(sessionVisible({
      canView: true,
      locationAllowed: false,
      actorStaffId: "viewer",
      trainerStaffId: "trainer",
      isParticipant: false,
    })).toBe(false);
    expect(sessionVisible({
      canView: false,
      locationAllowed: false,
      actorStaffId: "trainer",
      trainerStaffId: "trainer",
      isParticipant: false,
    })).toBe(true);
    expect(sessionVisible({
      canView: false,
      locationAllowed: false,
      actorStaffId: "learner",
      trainerStaffId: "trainer",
      isParticipant: true,
    })).toBe(true);
    const policy = sql().slice(sql().indexOf("CREATE POLICY training_sessions_select"));
    expect(policy).toContain("user_can_access_location(location_id)");
    expect(policy).toContain("trainer_staff_id = public.training_actor_staff_id()");
    expect(policy).toContain("training_session_participants");
  });

  it("rejects a roster over capacity", () => {
    expect(sessionCapacityAllows(2, 2, 1)).toBe(false);
    expect(sessionCapacityAllows(2, 1, 1)).toBe(true);
    expect(sessionCapacityAllows(0, 0, 0)).toBe(false);
    expect(sql()).toContain("capacity exceeded");
  });
});

function withoutSqlComments(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

describe("certificates, expiry, matrix, and links", () => {
  const certificateSql = readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261002230000_training_certificates.sql"),
    "utf8",
  );
  const expirySql = readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261002240000_training_expiry.sql"),
    "utf8",
  );
  const matrixSql = readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261002250000_training_matrix_paths.sql"),
    "utf8",
  );

  it("issues only from a completed enrollment and ignores a client score", () => {
    expect(certificateMayIssue({
      completed: false,
      certificateEnabled: true,
      holderName: "Amina",
    })).toEqual({ ok: false, reason: "enrollment_incomplete" });
    expect(certificateMayIssue({
      completed: true,
      certificateEnabled: true,
      holderName: "Amina",
      clientScore: 100,
    }).reason).toBe("client_score_rejected");
    expect(certificateMayIssue({
      completed: true,
      certificateEnabled: true,
      holderName: "Amina",
    })).toEqual({ ok: true, reason: "ready" });
    expect(certificateSql).toContain("enrollment is not complete");
    expect(certificateSql).not.toMatch(/training_issue_certificate\([^)]*score/i);
    expect(certificateSql).not.toContain("GRANT SELECT ON public.training_certificates TO anon");
    expect(revocationAllowed("  ")).toBe(false);
    expect(revocationAllowed("Issued in error")).toBe(true);
    expect(certificateSql).toContain("revocation requires a reason");
    expect(certificateSql).not.toMatch(/DELETE FROM public\.training_certificates/i);
  });

  it("keeps the public display code non-sequential and the share card free of identity fields", () => {
    const token = "a".repeat(64);
    expect(certificateDisplayCode(token)).toBe("FEC-AAAAAAAAAAAA");
    expect(certificateDisplayCode("1")).toBeNull();
    const card = trainingShareCard({
      title: "Fire safety",
      mandatory: true,
      durationMinutes: 35,
      dueOn: "2026-10-15",
      href: "/training/learning",
    });
    expect(card?.href).toBe("/training/learning");
    expect(JSON.stringify(card)).not.toMatch(/qid|passport|salary|email|phone/i);
    expect(trainingShareCard({
      title: "Fire safety",
      mandatory: true,
      durationMinutes: null,
      dueOn: null,
      href: "https://example.com/training",
    })).toBeNull();
  });

  it("buckets expiry once and assigns retraining only inside the lead window", () => {
    expect(expiryNoticeKind(40)).toBeNull();
    expect(expiryNoticeKind(20)).toBe("D30");
    expect(expiryNoticeKind(10)).toBe("D14");
    expect(expiryNoticeKind(3)).toBe("D7");
    expect(expiryNoticeKind(-1)).toBe("EXPIRED");
    expect(retrainingDue({
      daysUntil: 10,
      leadDays: 30,
      refresherCourseId: "course",
      alreadyAssigned: false,
    })).toBe(true);
    expect(retrainingDue({
      daysUntil: 40,
      leadDays: 30,
      refresherCourseId: "course",
      alreadyAssigned: false,
    })).toBe(false);
    expect(expirySql).toContain("training_apply_expiry");
    expect(withoutSqlComments(expirySql)).not.toMatch(/\bqid\b|\bpassport\b|\bsalary\b/);
    expect(competencyFromEvidence({
      hasEnrollment: true,
      completed: true,
      assessmentPending: false,
      certificateStatus: "REVOKED",
    })).toBe("REQUIRES_RETRAINING");
  });

  it("scopes the matrix and dashboard away from identity documents", () => {
    expect(pathProgress(5, 7)).toEqual({ done: 5, total: 7, percent: 71, certificateReady: false });
    expect(pathProgress(2, 2).certificateReady).toBe(true);
    expect(completionRate(0, 0)).toBeNull();
    expect(requirementEnforcement({
      status: "EXPIRED",
      enforceMode: "BLOCK",
      requirementType: "REQUIRED",
    })).toEqual({ warn: true, block: true });
    expect(requirementEnforcement({
      status: "VALID",
      enforceMode: "BLOCK",
      requirementType: "REQUIRED",
    }).block).toBe(false);
    expect(matrixSql).toContain("user_can_access_staff");
    expect(withoutSqlComments(matrixSql)).not.toMatch(/\bqid\b|\bpassport\b|\bsalary\b|\bphone\b|\bemail\b/);
    expect(matrixSql).toContain("training_issue_path_certificate");
    expect(matrixSql).toContain("forbidden");
  });
});
