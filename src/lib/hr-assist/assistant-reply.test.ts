import { describe, expect, it } from "vitest";

import { answerHrAssistant, type HrAssistantFacts } from "./assistant-reply";
import { INSUFFICIENT_HR_DATA } from "./types";

const facts: HrAssistantFacts = {
  periodFrom: "2026-09-28",
  periodTo: "2026-10-27",
  today: "2026-10-02",
  filters: "all sites",
  canPayroll: false,
  staffLinked: false,
  headcount: 40,
  presentToday: 31,
  onLeaveToday: 2,
  pendingLeave: 1,
  expiredDocs: 3,
  expiringDocs: 4,
  payrollBlocked: null,
  payrollExceptions: null,
  openJobs: 2,
  pendingJobRequests: 1,
  absentNames: ["Lina Haddad"],
  absentTotal: 1,
  missingNames: ["Omar Nasser"],
  missingTotal: 1,
  presentNames: ["Sara Ali"],
  onLeaveNames: ["Nora Saleh"],
  balances: null,
  balanceYear: null,
};

describe("HR assistant reply", () => {
  it("refuses a question the loaded records cannot answer", () => {
    const answer = answerHrAssistant("what is the meaning of the office plant", facts);
    expect(answer.status).toBe("insufficient");
    expect(answer.text).toBe(INSUFFICIENT_HR_DATA);
    expect(answer.text).toBe("Insufficient HR data to answer this reliably.");
  });

  it("does not decide firing, pay, or mood", () => {
    expect(answerHrAssistant("should we fire Lina", facts).text).toBe(INSUFFICIENT_HR_DATA);
    expect(answerHrAssistant("what is the team mood score", facts).text).toBe(INSUFFICIENT_HR_DATA);
    expect(answerHrAssistant("show the passport number", facts).status).toBe("insufficient");
  });

  it("answers present today from command counts without a percentage", () => {
    const answer = answerHrAssistant("who is present today", { ...facts, presentNames: ["Sara Ali", "Hadi Karim"] });
    expect(answer.text).toContain("Sara Ali");
    expect(answer.text).not.toContain("%");
    expect(answer.source).toBe("attendance");
    const count = answerHrAssistant("present today", facts);
    expect(count.text).toContain("31");
    expect(count.text).toContain("40");
    expect(count.messageKey).toBe("hrAssist.command.present.why");
  });

  it("names people with a missing punch and people marked absent", () => {
    expect(answerHrAssistant("missing punches", facts).text).toContain("Omar Nasser");
    expect(answerHrAssistant("who is absent today", facts).text).toContain("Lina Haddad");
    const none = answerHrAssistant("missing punches", { ...facts, missingNames: [], missingTotal: 0 });
    expect(none.text).toBe("No missing punches are stored for today.");
  });

  it("says plainly when leave remaining has no staff link", () => {
    const answer = answerHrAssistant("how much leave is remaining", facts);
    expect(answer.text).toContain("not linked to a staff record");
    expect(answer.status).toBe("ok");
  });

  it("uses stored leave balances and does not invent a balance", () => {
    const linked = answerHrAssistant("leave remaining", {
      ...facts,
      staffLinked: true,
      balanceYear: 2026,
      balances: [{ leaveType: "annual", available: 12 }],
    });
    expect(linked.text).toContain("12");
    expect(linked.text).toContain("2026");
    const empty = answerHrAssistant("leave remaining", {
      ...facts,
      staffLinked: true,
      balanceYear: 2026,
      balances: [],
    });
    expect(empty.text).toBe(INSUFFICIENT_HR_DATA);
  });

  it("counts expiring documents and omits passport numbers", () => {
    const answer = answerHrAssistant("documents expiring", facts);
    expect(answer.text).toContain("3");
    expect(answer.text).toContain("4");
    expect(answer.text).not.toMatch(/\b\d{11}\b|QA[0-9A-Z]{10}/);
    expect(answer.source).toBe("documents");
  });

  it("hides pay amounts and returns payroll status counts only with access", () => {
    const hidden = answerHrAssistant("payroll status", facts);
    expect(hidden.text).toContain("does not include pay amounts");
    expect(hidden.text).not.toMatch(/\d+\.\d{2}/);
    const allowed = answerHrAssistant("payroll status", {
      ...facts,
      canPayroll: true,
      payrollBlocked: 2,
      payrollExceptions: 5,
    });
    expect(allowed.text).toContain("Payroll blocked: 2");
    expect(allowed.text).toContain("Payroll exceptions: 5");
    expect(allowed.text).not.toMatch(/qar|iban|salary/i);
  });

  it("reports open jobs and the page to open", () => {
    expect(answerHrAssistant("open jobs", facts).text).toContain("Open jobs: 2");
    expect(answerHrAssistant("which page for attendance", facts).text).toContain("/people/attendance");
    expect(answerHrAssistant("open roster", facts).text).toContain("/people/roster");
    const missing = answerHrAssistant("open jobs", { ...facts, openJobs: null, pendingJobRequests: null });
    expect(missing.text).toBe(INSUFFICIENT_HR_DATA);
  });
});
