import { describe, expect, it } from "vitest";

import {
  atsScoreBand,
  filterRecruitmentRows,
  isAtsReviewed,
  isInterviewStage,
  isOfferStage,
  recruitmentNoteKeysByCandidate,
  type RecruitmentFilterRow,
} from "./hr-ats-review";

function row(partial: Partial<RecruitmentFilterRow> & Pick<RecruitmentFilterRow, "candidateName">): RecruitmentFilterRow {
  return {
    matchScore: 80,
    vacancyId: "job-1",
    stage: "shortlisted",
    departmentId: "dept-1",
    vacancyStatus: "open",
    jobTitle: "Events Coordinator",
    skills: "hosting",
    offerStatus: null,
    ...partial,
  };
}

describe("ATS reviewed desk filters", () => {
  const rows = [
    row({ candidateName: "Scored high", matchScore: 88, stage: "hr_interview" }),
    row({ candidateName: "Scored mid", matchScore: 55, vacancyId: "job-2", departmentId: "dept-2" }),
    row({ candidateName: "Scored low", matchScore: 20, vacancyStatus: "on_hold" }),
    row({ candidateName: "Not scored", matchScore: null, stage: "new" }),
  ];

  it("treats a finite match score as ATS-reviewed and ranks that set first", () => {
    expect(isAtsReviewed(88)).toBe(true);
    expect(isAtsReviewed(null)).toBe(false);
    expect(atsScoreBand(88)).toBe("strong");
    expect(atsScoreBand(55)).toBe("consider");
    expect(atsScoreBand(20)).toBe("gap");
    expect(atsScoreBand(null)).toBeNull();

    const reviewed = filterRecruitmentRows(rows, {
      pool: "reviewed",
      vacancyId: "",
      stage: "",
      departmentId: "",
      vacancyStatus: "",
      band: "",
      query: "",
    });
    expect(reviewed.map((r) => r.candidateName)).toEqual(["Scored high", "Scored mid", "Scored low"]);
  });

  it("narrows the reviewed set by job, stage, department, status, and score band", () => {
    const narrowed = filterRecruitmentRows(rows, {
      pool: "reviewed",
      vacancyId: "job-2",
      stage: "shortlisted",
      departmentId: "dept-2",
      vacancyStatus: "open",
      band: "consider",
      query: "mid",
    });
    expect(narrowed.map((r) => r.candidateName)).toEqual(["Scored mid"]);
  });

  it("keeps the full pool, including unscored applications, when asked", () => {
    const all = filterRecruitmentRows(rows, {
      pool: "all",
      vacancyId: "",
      stage: "",
      departmentId: "",
      vacancyStatus: "",
      band: "",
      query: "",
    });
    expect(all.map((r) => r.candidateName)).toEqual([
      "Scored high",
      "Scored mid",
      "Scored low",
      "Not scored",
    ]);
  });

  it("reads recruitment-match notes by candidate id", () => {
    const notes = recruitmentNoteKeysByCandidate([
      { id: "role:skill:cand-1", titleKey: "hrAssist.recruitment.skill.title" },
      { id: "role:exp:cand-1", titleKey: "hrAssist.recruitment.experience.title" },
    ]);
    expect(notes.get("cand-1")).toEqual([
      "hrAssist.recruitment.skill.title",
      "hrAssist.recruitment.experience.title",
    ]);
    expect(isInterviewStage("hr_interview")).toBe(true);
    expect(isOfferStage("selected", null)).toBe(true);
    expect(isOfferStage("on_hold", "expired")).toBe(true);
  });
});
