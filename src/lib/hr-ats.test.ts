import { describe, expect, it } from "vitest";

import {
  assertStageChangeAllowed,
  findDuplicateCandidates,
  mergeMatchWeights,
  parseCvText,
  redactCandidatePii,
  scoreCandidateMatch,
} from "./hr-ats";

describe("AT#13 scoring explains why", () => {
  const vacancy = {
    skills: "React, TypeScript, PostgreSQL, Arabic",
    experienceYears: 3,
    education: "Bachelor",
    requiredLocation: "Doha",
    requiresQid: true,
    requiresVisa: false,
  };

  it("returns match_score with matched/missing skills and dimension breakdown", () => {
    const explanation = scoreCandidateMatch(vacancy, {
      skills: "React, TypeScript, Excel",
      experienceYears: 4,
      education: "BSc Computer Science",
      location: "Doha, Qatar",
      qid: "28912345678",
      visaStatus: "resident",
    });

    expect(explanation.score).toBeGreaterThan(50);
    expect(explanation.matchedSkills).toEqual(expect.arrayContaining(["react", "typescript"]));
    expect(explanation.missingSkills).toEqual(expect.arrayContaining(["postgresql", "arabic"]));
    expect(explanation.experience.ok).toBe(true);
    expect(explanation.education.ok).toBe(true);
    expect(explanation.location.ok).toBe(true);
    expect(explanation.visaQid.ok).toBe(true);
    expect(explanation.summary).toMatch(/Skills/i);
    expect(explanation.summary).toMatch(/missing/i);
    expect(explanation.weights.skills).toBe(40);
  });

  it("respects recruiter-adjustable filter weights", () => {
    const heavySkills = scoreCandidateMatch(
      vacancy,
      {
        skills: "React",
        experienceYears: 0,
        education: "High school",
        location: "Dubai",
        qid: null,
      },
      { skills: 80, experience: 5, education: 5, location: 5, visa_qid: 5 },
    );
    const heavyExp = scoreCandidateMatch(
      vacancy,
      {
        skills: "React",
        experienceYears: 0,
        education: "High school",
        location: "Dubai",
        qid: null,
      },
      { skills: 5, experience: 80, education: 5, location: 5, visa_qid: 5 },
    );
    expect(heavySkills.score).toBeGreaterThan(heavyExp.score);
    expect(
      mergeMatchWeights({
        skills: 50,
        experience: 50,
        education: 0,
        location: 0,
        visa_qid: 0,
      }).skills,
    ).toBe(50);
  });

  it("explains experience and visa/QID gaps", () => {
    const explanation = scoreCandidateMatch(vacancy, {
      skills: "React, TypeScript, PostgreSQL, Arabic",
      experienceYears: 1,
      education: "Diploma",
      location: "Dubai",
      qid: null,
    });
    expect(explanation.experience.ok).toBe(false);
    expect(explanation.visaQid.ok).toBe(false);
    expect(explanation.location.ok).toBe(false);
    expect(explanation.summary).toMatch(/Experience short/i);
    expect(explanation.summary).toMatch(/Visa\/QID incomplete/i);
  });
});

describe("AT#14 AI/score cannot auto-reject applicant", () => {
  it("refuses basedOnScoreAlone / autoReject to rejected", () => {
    expect(() =>
      assertStageChangeAllowed({
        toStage: "rejected",
        reason: "Not a fit for team culture",
        basedOnScoreAlone: true,
        matchScore: 12,
      }),
    ).toThrow(/AT#14/);

    expect(() =>
      assertStageChangeAllowed({
        toStage: "rejected",
        reason: "Anything",
        autoReject: true,
        aiScore: 8,
      }),
    ).toThrow(/AT#14/);
  });

  it("refuses rejection without human reason", () => {
    expect(() =>
      assertStageChangeAllowed({
        toStage: "rejected",
        matchScore: 5,
      }),
    ).toThrow(/explicit human reason/i);
  });

  it("refuses score-only reason strings", () => {
    expect(() =>
      assertStageChangeAllowed({
        toStage: "rejected",
        reason: "low score",
        matchScore: 10,
      }),
    ).toThrow(/score alone/i);
  });

  it("allows recruiter rejection with substantive reason regardless of score", () => {
    expect(() =>
      assertStageChangeAllowed({
        toStage: "rejected",
        reason: "Failed technical interview — incomplete SQL task",
        matchScore: 15,
        aiScore: 20,
      }),
    ).not.toThrow();
  });

  it("allows non-reject stage changes without reason", () => {
    expect(() =>
      assertStageChangeAllowed({ toStage: "shortlisted", matchScore: 40 }),
    ).not.toThrow();
  });
});

describe("ATS helpers", () => {
  it("parses email/phone/name from CV text", () => {
    const parsed = parseCvText(
      "Jane Doe\nSoftware Engineer\njane.doe@example.com\n+974 5555 1212\nSkills: React, Node",
    );
    expect(parsed.fullName).toBe("Jane Doe");
    expect(parsed.email).toBe("jane.doe@example.com");
    expect(parsed.phone).toMatch(/974/);
    expect(parsed.skillsHint).toMatch(/React/i);
  });

  it("detects duplicates by email/phone/qid and optional CV similarity", () => {
    const hits = findDuplicateCandidates({
      email: "a@x.com",
      phone: "+974-1111-2222",
      qid: "28999",
      cvText: "alpha beta gamma delta epsilon zeta",
      existing: [
        {
          id: "1",
          fullName: "A",
          email: "a@x.com",
          phone: null,
          qid: null,
          cvText: null,
        },
        {
          id: "2",
          fullName: "B",
          email: null,
          phone: "97411112222",
          qid: "28999",
          cvText: "alpha beta gamma delta epsilon zeta eta",
        },
      ],
      cvSimilarityThreshold: 0.5,
    });
    expect(hits.find((h) => h.id === "1")?.matchOn).toContain("email");
    const b = hits.find((h) => h.id === "2");
    expect(b?.matchOn).toEqual(expect.arrayContaining(["phone", "qid", "cv_similarity"]));
  });

  it("redacts PII for request-only trackers", () => {
    const redacted = redactCandidatePii({
      email: "secret@x.com",
      phone: "123",
      qid: "qid",
      cvPath: "path",
      expectedSalaryQar: 9000,
    });
    expect(redacted.email).toBe("[redacted]");
    expect(redacted.expectedSalaryQar).toBeNull();
    expect(redacted.cvPath).toBeNull();
  });
});
