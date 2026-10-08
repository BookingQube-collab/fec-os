import { describe, expect, it } from "vitest";

import { buildCommandInsights, buildSmartKpiSummary, describeCommandItem } from "./command-insights";
import { buildEngagementSummary, describeEngagementItem } from "./engagement-summary";
import { answerEssQuestion, describeEssItem } from "./ess-answers";

describe("engagement screen", () => {
  it("says surveys are missing and lists recognition and a repeated warning category", () => {
    const result = buildEngagementSummary({
      periodFrom: "2026-09-28",
      periodTo: "2026-10-27",
      surveysStored: false,
      recognition: [{ title: "Guest compliment", on: "2026-10-02" }],
      warningCategories: [{ category: "attendance", count: 2 }],
      missedPunchDays: 4,
      leaveDays: 1,
    });
    const survey = result.items.find((item) => item.id === "eng:surveys");
    const recognition = result.items.find((item) => item.id === "eng:recognition");
    const concern = result.items.find((item) => item.id.startsWith("eng:warn"));
    expect(describeEngagementItem(survey!).why).toContain("no survey table");
    expect(describeEngagementItem(recognition!).why).toContain("Guest compliment");
    expect(describeEngagementItem(recognition!).why).toContain("not a ranking");
    expect(describeEngagementItem(concern!).why).toContain("Engagement risk");
    expect(describeEngagementItem(concern!).why).toContain("Workload concern");
    expect(describeEngagementItem(concern!).why).toContain("Pattern requires HR review");
    expect(describeEngagementItem(concern!).why.toLowerCase()).not.toContain("guilt");
    expect(JSON.stringify(result)).not.toContain("%");
  });
});

describe("employee self-service answers", () => {
  it("states remaining leave days from the stored balance", () => {
    const result = answerEssQuestion({
      question: "how much annual leave do I have left",
      year: 2026,
      balances: [{ leaveType: "annual", available: 12 }],
      documents: [],
    });
    expect(describeEssItem(result.items[0]!).why).toContain("annual 12");
    expect(describeEssItem(result.items[0]!).why).toContain("2026");
  });

  it("points a document or insurance question at the existing upload", () => {
    const result = answerEssQuestion({
      question: "how do I update my insurance",
      year: 2026,
      balances: [],
      documents: [{ docType: "medical_certificate", expiryDate: "2027-01-01" }],
    });
    expect(describeEssItem(result.items[0]!).why).toContain("no separate insurance request");
    expect(describeEssItem(result.items[0]!).why).toContain("medical_certificate");
  });

  it("does not invent an answer", () => {
    expect(answerEssQuestion({ question: "who should I promote", year: 2026, balances: [], documents: [] }).status).toBe(
      "insufficient",
    );
  });
});

describe("command center insights", () => {
  it("explains only the counts that were loaded", () => {
    const result = buildCommandInsights({
      periodFrom: "2026-09-28",
      periodTo: "2026-10-27",
      today: "2026-10-02",
      headcount: 80,
      onLeaveToday: 3,
      expiredDocs: 0,
      expiringDocs: null,
      pendingLeave: 0,
      presentToday: 40,
    });
    const leave = result.items.find((item) => item.id === "cmd:leave");
    const present = result.items.find((item) => item.id === "cmd:present");
    expect(describeCommandItem(leave!).why).toContain("3");
    expect(describeCommandItem(present!).why).toContain("40");
    expect(describeCommandItem(present!).why).toContain("80");
    expect(describeCommandItem(present!).why).not.toContain("%");
    expect(result.items.some((item) => item.id === "cmd:expiring")).toBe(false);
  });

  it("stays quiet when the loaded review counts are zero", () => {
    const result = buildCommandInsights({
      periodFrom: "2026-09-28",
      periodTo: "2026-10-27",
      today: "2026-10-02",
      headcount: 10,
      onLeaveToday: 0,
      expiredDocs: 0,
      expiringDocs: 0,
      pendingLeave: 0,
      presentToday: null,
    });
    expect(describeCommandItem(result.items[0]!).why).toContain("Headcount is 10");
  });

  it("recaps loaded counts and refuses a summary when a count is missing", () => {
    const result = buildSmartKpiSummary({
      periodFrom: "2026-09-28",
      periodTo: "2026-10-27",
      headcount: 93,
      presentToday: 0,
      onLeaveToday: 2,
      pendingLeave: 1,
      expiredDocs: 4,
    });
    const why = describeCommandItem(result.items[0]!).why;
    expect(why).toContain("93");
    expect(why).toContain("Present today is 0");
    expect(why).not.toContain("%");
    expect(why.toLowerCase()).not.toContain("burnout");
    expect(why.toLowerCase()).not.toContain("attrition");
    const thin = buildSmartKpiSummary({
      periodFrom: "2026-09-28",
      periodTo: "2026-10-27",
      headcount: 93,
      presentToday: null,
      onLeaveToday: 2,
      pendingLeave: 1,
      expiredDocs: 4,
    });
    expect(thin.status).toBe("insufficient");
    expect(thin.items).toHaveLength(0);
  });
});
