import { describe, expect, it } from "vitest";

import {
  courseCoverSrc,
  courseMatchesDeskFilter,
  csvCell,
  deskRowIsDemo,
  enrollmentIsOverdue,
  learningIsEmpty,
  legacyEnrollmentIsOverdue,
  pageSlice,
  recordMatchesQuery,
  recordMatchesStatus,
  teamTotals,
} from "./desk";

const course = {
  status: "PUBLISHED",
  trainingType: "SAFETY",
  required: false,
};

describe("learning desk filters", () => {
  it("keeps induction and required courses on the induction filter", () => {
    expect(courseMatchesDeskFilter({ ...course, trainingType: "INDUCTION" }, "induction")).toBe(true);
    expect(courseMatchesDeskFilter({ ...course, required: true }, "induction")).toBe(true);
    expect(courseMatchesDeskFilter(course, "induction")).toBe(false);
  });

  it("treats published optional courses as self-enrollment", () => {
    expect(courseMatchesDeskFilter(course, "self")).toBe(true);
    expect(courseMatchesDeskFilter({ ...course, required: true }, "self")).toBe(false);
    expect(courseMatchesDeskFilter({ ...course, status: "DRAFT" }, "self")).toBe(false);
  });

  it("limits drafts to draft and review", () => {
    expect(courseMatchesDeskFilter({ ...course, status: "DRAFT" }, "drafts")).toBe(true);
    expect(courseMatchesDeskFilter({ ...course, status: "UNDER_REVIEW" }, "drafts")).toBe(true);
    expect(courseMatchesDeskFilter(course, "drafts")).toBe(false);
  });

  it("marks an open enrollment overdue only after the due date", () => {
    const row = { status: "IN_PROGRESS", completedAt: null, dueOn: "2026-09-29" };
    expect(enrollmentIsOverdue(row, "2026-10-07")).toBe(true);
    expect(enrollmentIsOverdue({ ...row, status: "COMPLETED", completedAt: "2026-09-01" }, "2026-10-07")).toBe(false);
    expect(legacyEnrollmentIsOverdue({ status: "in_progress", completedOn: null, dueOn: "2026-09-29" }, "2026-10-07")).toBe(true);
  });

  it("searches employee, code, and course together", () => {
    const row = { staffName: "Amaan Malik", employeeCode: "6", courseTitle: "Heat stress awareness" };
    expect(recordMatchesQuery(row, "amaan")).toBe(true);
    expect(recordMatchesQuery(row, "heat")).toBe(true);
    expect(recordMatchesQuery(row, "99")).toBe(false);
  });

  it("keeps in progress and overdue as separate row states", () => {
    const row = {
      staffName: "Amaan Malik",
      employeeCode: "6",
      courseTitle: "Heat stress awareness",
      status: "IN_PROGRESS",
      completedAt: null,
      dueOn: "2026-09-29",
      failedAttempt: false,
    };
    expect(recordMatchesStatus(row, "inProgress", "2026-10-07")).toBe(true);
    expect(recordMatchesStatus(row, "overdue", "2026-10-07")).toBe(true);
    expect(recordMatchesStatus(row, "failed", "2026-10-07")).toBe(false);
  });

  it("uses one empty check instead of zero count chips", () => {
    expect(learningIsEmpty({ assigned: 0, inProgress: 0, completed: 0 })).toBe(true);
    expect(learningIsEmpty({ assigned: 1, inProgress: 0, completed: 0 })).toBe(false);
  });

  it("summarises real totals, including a null average", () => {
    const totals = teamTotals(
      [
        {
          staffName: "Amaan Malik",
          employeeCode: "6",
          courseTitle: "Heat stress",
          status: "IN_PROGRESS",
          completedAt: null,
          dueOn: "2026-09-29",
          failedAttempt: false,
          score: null,
        },
      ],
      "2026-10-07",
    );
    expect(totals).toMatchObject({ assigned: 1, completed: 0, inProgress: 1, failed: 0, overdue: 1, averageScore: null });
  });

  it("pages a long enrolment list without dropping rows", () => {
    const rows = Array.from({ length: 133 }, (_, index) => index + 1);
    const first = pageSlice(rows, 1, 25);
    const last = pageSlice(rows, 6, 25);
    expect(first.total).toBe(133);
    expect(first.rows).toHaveLength(25);
    expect(last.page).toBe(6);
    expect(last.rows).toEqual([126, 127, 128, 129, 130, 131, 132, 133]);
  });

  it("de-emphasizes a row only when a demo flag is stored", () => {
    expect(deskRowIsDemo(true)).toBe(true);
    expect(deskRowIsDemo(false)).toBe(false);
    expect(deskRowIsDemo(undefined)).toBe(false);
  });

  it("escapes csv cells", () => {
    expect(csvCell("Heat stress")).toBe("Heat stress");
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
  });

  it("maps safety topics onto the shared covers and keeps a real cover url", () => {
    expect(courseCoverSrc({ title: "Heat stress awareness for site and event teams" })).toBe("/learning-art/cover-safety.jpg");
    expect(courseCoverSrc({ title: "Event, mall activation and FEC crowd safety" })).toBe("/learning-art/cover-safety.jpg");
    expect(courseCoverSrc({ title: "Safe manual handling awareness" })).toBe("/learning-art/cover-safety.jpg");
    expect(courseCoverSrc({ title: "First aid awareness for employees" })).toBe("/learning-art/cover-first-aid.jpg");
    expect(courseCoverSrc({ title: "Fire safety and evacuation awareness" })).toBe("/learning-art/cover-fire.jpg");
    expect(courseCoverSrc({ title: "Phase 8 Practical Draft" })).toBe("/learning-art/cover-safety.jpg");
    expect(courseCoverSrc({ title: "Phase 3 Builder Course" })).toBe("/learning-art/cover-team.jpg");
    expect(courseCoverSrc({ title: "Phase 9 Classroom" })).toBe("/learning-art/cover-welcome.jpg");
    expect(courseCoverSrc({ title: "Anything", thumbnailPath: "https://cdn.example/cover.jpg" })).toBe("https://cdn.example/cover.jpg");
    expect(courseCoverSrc({ title: "Unmatched topic", index: 2 })).toBe("/learning-art/cover-guest.jpg");
  });
});
