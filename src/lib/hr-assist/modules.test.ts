import { describe, expect, it } from "vitest";

import { describeComplianceItem, buildDocumentNotes, buildWarningNotes } from "./compliance-notes";
import { answerHrCopilot, buildActionCards, describeCopilotItem } from "./copilot";
import { describeOnboardingItem, buildOnboardingNotes } from "./onboarding-notes";
import { buildPayrollReview, describePayrollItem, payrollReviewLineFromRow } from "./payroll-review";
import { buildPerformanceNotes, describePerformanceItem } from "./performance-notes";
import { candidateMatchFacts, buildRecruitmentMatch, describeRecruitmentItem } from "./recruitment-match";
import {
  PAYROLL_ASSIST_SELECT,
  RECRUITMENT_CANDIDATE_SELECT,
  RECRUITMENT_QID_PRESENCE_SELECT,
  describeReportItem,
  explainHrReport,
} from "./report-notes";
import { buildTrainingGaps, describeTrainingItem } from "./training-gaps";
import { INSUFFICIENT_HR_DATA } from "./types";
import { buildWorkforceNotes, describeWorkforceItem } from "./workforce-notes";

const emptyBundle = {
  periodFrom: "2026-09-28",
  periodTo: "2026-10-27",
  filters: "all sites",
  canPayroll: false,
  payroll: { status: "empty" as const, items: [] },
  attendance: { status: "empty" as const, items: [] },
  roster: { status: "empty" as const, items: [] },
  leave: { status: "empty" as const, items: [] },
  recruitment: { status: "empty" as const, items: [] },
  performance: { status: "empty" as const, items: [] },
  training: { status: "empty" as const, items: [] },
  documents: { status: "empty" as const, items: [] },
  warnings: { status: "empty" as const, items: [] },
  workforce: { status: "empty" as const, items: [] },
};

describe("payroll review", () => {
  const line = {
    staffId: "s1",
    staffName: "Amina",
    grossQar: 5000,
    netQar: 4200,
    earnings: [{ code: "basic", amountQar: 5000 }],
    deductions: [{ code: "loan_advance", amountQar: 800 }],
    varianceVsPrev: 700,
    hasPrevious: true,
    previousDeductionCodes: [] as string[],
    previousOtQar: 0,
    otQar: 250,
    importedNetQar: 4000,
    systemNetQar: 4200,
  };

  it("explains variance, a new deduction, overtime, and an import gap in QAR", () => {
    const result = buildPayrollReview({ periodLabel: "2026-09-28–2026-10-27", lines: [line] });
    const variance = result.items.find((item) => item.id.startsWith("pay:variance"));
    const deduction = result.items.find((item) => item.id.startsWith("pay:deduction"));
    const overtime = result.items.find((item) => item.id.startsWith("pay:ot"));
    const imported = result.items.find((item) => item.id.startsWith("pay:recon-import"));
    expect(describePayrollItem(variance!).why).toContain("700.00 QAR");
    expect(describePayrollItem(variance!).why).toContain("3500.00 QAR");
    expect(describePayrollItem(deduction!).why).toContain("loan_advance");
    expect(describePayrollItem(overtime!).why).toContain("250.00 QAR");
    expect(describePayrollItem(imported!).why).toContain("imported net is 4000.00 QAR");
    expect(describePayrollItem(variance!).why).not.toContain("%");
  });

  it("does not carry bank or identity values out of a payroll snapshot", () => {
    const mapped = payrollReviewLineFromRow({
      staff_id: "s1",
      staffName: "Amina",
      gross_qar: 100,
      net_qar: 100,
      earnings: [],
      deductions: [],
      snapshot: { otPayReg: 20, iban: "QA00SECRET", qid: "28400000001" },
    });
    expect(mapped.otQar).toBe(20);
    expect(JSON.stringify(mapped)).not.toContain("QA00SECRET");
    expect(JSON.stringify(mapped)).not.toContain("28400000001");
  });
});

describe("recruitment match", () => {
  it("lists a missing skill and keeps the document number off the note", () => {
    const facts = candidateMatchFacts({ qid: "28400000001", visa_status: "" });
    expect(facts.qidOnFile).toBe(true);
    const result = buildRecruitmentMatch({
      rows: [
        {
          candidateId: "c1",
          candidateName: "Nora",
          jobTitle: "Attendant",
          requiredSkills: "guest service, cash handling",
          candidateSkills: "cash handling",
          cvText: "",
          requiredExperienceYears: 2,
          candidateExperienceYears: 4,
          requiredEducation: "",
          candidateEducation: "",
          requiresQid: true,
          qidOnFile: false,
          requiresVisa: false,
          visaOnFile: false,
        },
      ],
    });
    const skill = result.items.find((item) => item.id.includes("skill"));
    expect(describeRecruitmentItem(skill!).why).toContain("guest service");
    expect(describeRecruitmentItem(skill!).why).toContain("supporting analysis");
    expect(JSON.stringify(result)).not.toContain("28400000001");
    expect(result.items.some((item) => item.id.includes("qid"))).toBe(true);
  });

  it("says the data is insufficient when the role has no requirements", () => {
    const result = buildRecruitmentMatch({
      rows: [
        {
          candidateId: "c1",
          candidateName: "Nora",
          jobTitle: "Attendant",
          requiredSkills: "",
          candidateSkills: "cash",
          cvText: "",
          requiredExperienceYears: null,
          candidateExperienceYears: 1,
          requiredEducation: "",
          candidateEducation: "",
          requiresQid: false,
          qidOnFile: false,
          requiresVisa: false,
          visaOnFile: false,
        },
      ],
    });
    expect(result.status).toBe("insufficient");
  });
});

describe("onboarding, performance, and training", () => {
  it("names open checklist items", () => {
    const result = buildOnboardingNotes({
      rows: [{ staffId: "s1", staffName: "Hana", kind: "onboarding", openItems: ["Uniform", "ID copy"] }],
    });
    expect(describeOnboardingItem(result.items[0]!).why).toContain("Uniform");
  });

  it("describes a KPI drop and disagreeing comments without a promotion decision", () => {
    const result = buildPerformanceNotes({
      rows: [
        {
          staffId: "s1",
          staffName: "Hana",
          cycleName: "Q4",
          kpiLabel: "Guest comments",
          earlier: 12,
          later: 8,
          earlierLabel: "2026-09-30",
          laterLabel: "2026-10-15",
          supervisorComments: "Excellent floor work",
          managerComments: "Needs improvement on closing",
        },
      ],
    });
    const trend = result.items.find((item) => item.id.startsWith("perf:trend"));
    const comments = result.items.find((item) => item.id.startsWith("perf:comments"));
    expect(describePerformanceItem(trend!).why).toContain("12");
    expect(describePerformanceItem(trend!).why).toContain("8");
    expect(describePerformanceItem(comments!).why).toContain("not a health assessment");
    expect(describePerformanceItem(trend!).why.toLowerCase()).not.toContain("promote");
  });

  it("flags an overdue required course and a published course for a missing skill", () => {
    const result = buildTrainingGaps({
      today: "2026-10-02",
      publishedCourses: ["Guest service basics"],
      enrollments: [
        {
          staffId: "s1",
          staffName: "Hana",
          courseName: "Safety",
          required: true,
          status: "enrolled",
          dueOn: "2026-09-01",
          skills: "guest service",
        },
      ],
    });
    expect(describeTrainingItem(result.items.find((item) => item.id.startsWith("train:due"))!).why).toContain("Safety");
    expect(describeTrainingItem(result.items.find((item) => item.id.startsWith("train:skill"))!).why).toContain("Guest service basics");
  });
});

describe("documents, warnings, and workforce", () => {
  it("counts days to expiry and does not print a document number", () => {
    const result = buildDocumentNotes({
      today: "2026-10-02",
      rows: [{ staffId: "s1", staffName: "Hana", docType: "passport", expiryDate: "2026-10-10" }],
    });
    expect(describeComplianceItem(result.items[0]!).why).toContain("8");
    expect(JSON.stringify(result)).not.toMatch(/passport number|iban/i);
  });

  it("summarizes warnings and asks HR to review a repeated pattern", () => {
    const rows = [1, 2, 3].map((n) => ({
      staffId: "s1",
      staffName: "Hana",
      category: "attendance",
      level: "written",
      issuedOn: `2026-10-0${n}`,
      status: "issued",
      hasEmployeeExplanation: n === 1,
    }));
    const result = buildWarningNotes({ periodFrom: "2026-10-01", periodTo: "2026-10-27", rows });
    const pattern = result.items.find((item) => item.id.startsWith("warn:pattern"));
    expect(describeComplianceItem(pattern!).why.startsWith("Pattern requires HR review")).toBe(true);
    expect(describeComplianceItem(pattern!).why.toLowerCase()).not.toContain("fraud");
    expect(describeComplianceItem(pattern!).why.toLowerCase()).not.toContain("guilt");
  });

  it("states a headcount gap and a workload concern without a score", () => {
    const result = buildWorkforceNotes({
      periodFrom: "2026-09-28",
      periodTo: "2026-10-27",
      midpoint: "2026-10-12",
      site: "Mall",
      approvedHeadcount: 8,
      rosteredPeople: 5,
      otFirstHalfMinutes: 40,
      otSecondHalfMinutes: 260,
      missedPunchDays: 1,
      leaveDays: 2,
      overdueRequiredCourses: 0,
      kpiDropCount: 0,
    });
    const quota = result.items.find((item) => item.id.startsWith("wf:quota"));
    const overtime = result.items.find((item) => item.id.startsWith("wf:ot"));
    expect(describeWorkforceItem(quota!).why).toContain("gap is 3");
    expect(describeWorkforceItem(overtime!).why).toContain("Workload concern");
    expect(describeWorkforceItem(overtime!).why).not.toContain("%");
  });
});

describe("copilot, actions, and reports", () => {
  it("refuses an ungrounded question", () => {
    const answer = answerHrCopilot({ ...emptyBundle, question: "what is the meaning of the office plant" });
    expect(answer.status).toBe("insufficient");
    expect(INSUFFICIENT_HR_DATA).toBe("Insufficient HR data to answer this reliably.");
  });

  it("hides payroll amounts from a role that cannot view payroll", () => {
    const answer = answerHrCopilot({
      ...emptyBundle,
      question: "why did salary change",
      canPayroll: false,
      payroll: {
        status: "ok",
        items: [
          {
            id: "secret",
            titleKey: "hrAssist.payroll.variance.title",
            whyKey: "hrAssist.payroll.variance.why",
            evidenceKey: "hrAssist.payroll.variance.evidence",
            actionKey: "hrAssist.payroll.action",
            values: { netQar: "99999.00", staffName: "Amina", deltaQar: "1.00", previousNetQar: "1.00", periodLabel: "x" },
          },
        ],
      },
    });
    expect(describeCopilotItem(answer.items[0]!).why).toContain("does not include pay amounts");
    expect(JSON.stringify(answer)).not.toContain("99999");
  });

  it("keeps action cards as links and explains a report without sensitive values", () => {
    const cards = buildActionCards([
      {
        status: "ok",
        items: [
          {
            id: "a",
            titleKey: "hrAssist.documents.expiry.title",
            whyKey: "hrAssist.documents.expiry.why",
            evidenceKey: "hrAssist.documents.expiry.evidence",
            actionKey: "hrAssist.documents.action",
            href: "/people/hr/documents",
            values: {},
          },
          {
            id: "b",
            titleKey: "hrAssist.documents.expiry.title",
            whyKey: "hrAssist.documents.expiry.why",
            evidenceKey: "hrAssist.documents.expiry.evidence",
            actionKey: "hrAssist.documents.action",
            values: { secret: "should-drop" },
          },
        ],
      },
    ]);
    expect(cards.items).toHaveLength(1);
    expect(cards.items[0]?.href).toBe("/people/hr/documents");
    const report = explainHrReport("payroll");
    expect(describeReportItem(report.items[0]!).evidence).not.toMatch(/\d{11}|QA[0-9A-Z]{10}/);
    expect(explainHrReport("not-a-report").status).toBe("insufficient");
  });

  it("keeps assist selects off identity and bank columns", () => {
    expect(PAYROLL_ASSIST_SELECT).not.toMatch(/qid|iban|passport|bank/i);
    expect(RECRUITMENT_CANDIDATE_SELECT).not.toMatch(/qid|nationality|gender|religion/i);
    expect(RECRUITMENT_QID_PRESENCE_SELECT).toBe("id, qid");
  });
});
