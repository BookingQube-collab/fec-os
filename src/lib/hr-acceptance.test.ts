/**
 * Phase 12 — HRMS acceptance pack (AT#1–20).
 * Reuses pure helpers from phase unit tests; titles map 1:1 to the brief.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { annualAccrualFromHireDate, assertHrSensitiveDocAccess, redactStaffIdentityNumbers } from "./hr-advanced";
import {
  airTicketPolicyFromSection,
  computeEntitlementDatesFromPolicy,
} from "./hr-air-ticket";
import { scoreCandidateMatch, assertStageChangeAllowed } from "./hr-ats";
import { allHrAuditSpotCheckActions, buildHrAuditRpcArgs, HR_AUDIT_SPOT_CHECK } from "./hr-audit";
import {
  alertPeriodsForDocType,
  documentExpiryPolicyFromSection,
  passportAlertPeriods,
  qidAlertPeriods,
  shouldSendExpiryReminder,
} from "./hr-document-expiry";
import { filterEmployeeTimeline } from "./hr-employee-events";
import { assertNoticeOverrideAllowed, suggestNoticePeriod } from "./hr-exit";
import {
  assertMinClaimableMinutes,
  assertCanMarkPayrollPosted,
  canMarkPayrollPosted,
} from "./hr-ot";
import {
  computePayrollLineAmounts,
  computeProrationFactor,
  filterConsumableOtClaims,
  lockedLineResistsPolicyChange,
  partitionByPaymentMethod,
  resolvePaymentMethod,
} from "./hr-payroll";
import { HR_POLICY_DEFAULTS } from "./hr-policy";
import {
  evaluateJobRequestAgainstQuota,
  assertQuotaOverrideAllowed,
  buildQuotaEmployeeRows,
} from "./hr-recruitment";
import { evaluateWarningEscalation, warningPolicyFromSection } from "./hr-warnings";
import { isOnProbation } from "./hr-probation";
import {
  dispatchHrEmailIfConfigured,
  emailProvider,
  HR_NOTIFICATION_CATEGORIES,
  isHrNotificationCategory,
} from "./notifications/providers";
import { canUserDo, isFloorSupervisorView, type AppRole } from "./rbac";

const FLOOR: AppRole[] = ["tech_supervisor"];
const HR: AppRole[] = ["hr"];

describe("HR acceptance AT#1–20 (Phase 12)", () => {
  describe("AT#1 QID alerts 30 days before expiry", () => {
    it("uses policy default 30-day QID window", () => {
      const policy = documentExpiryPolicyFromSection(HR_POLICY_DEFAULTS.document);
      expect(qidAlertPeriods(policy)).toEqual([30]);
      expect(
        shouldSendExpiryReminder({
          daysUntil: 30,
          alertPeriods: alertPeriodsForDocType("qid", policy),
          frequencyDays: policy.reminderFrequencyDays,
          todayYmd: "2026-09-20",
          lastSentAtYmd: null,
          acknowledged: false,
        }),
      ).toBe(true);
    });
  });

  describe("AT#2 Passport reminder periods change without code (policy)", () => {
    it("reads passport periods from policy section", () => {
      const custom = documentExpiryPolicyFromSection({
        qid_alert_days: 30,
        passport_alert_days: [120, 45],
        reminder_frequency_days: 7,
      });
      expect(passportAlertPeriods(custom)).toEqual([120, 45]);
      expect(passportAlertPeriods(custom)).not.toEqual(
        passportAlertPeriods(documentExpiryPolicyFromSection(HR_POLICY_DEFAULTS.document)),
      );
    });
  });

  describe("AT#3 OT below one hour rejected", () => {
    it("rejects sub-hour claims after rounding", () => {
      expect(HR_POLICY_DEFAULTS.ot.min_claimable_minutes).toBe(60);
      expect(() => assertMinClaimableMinutes(59, 60, "down")).toThrow(/below minimum/);
    });
  });

  describe("AT#4 Eligible approved OT enters payroll only once", () => {
    it("consumes only hr_approved and blocks re-post", () => {
      expect(canMarkPayrollPosted("hr_approved")).toBe(true);
      expect(filterConsumableOtClaims([{ status: "hr_approved" }, { status: "payroll_posted" }])).toHaveLength(
        1,
      );
      expect(() => assertCanMarkPayrollPosted("payroll_posted")).toThrow(/already payroll_posted/);
    });
  });

  describe("AT#5 Three active warnings → management review, NOT auto-terminate", () => {
    it("escalates to formal review without terminating", () => {
      const policy = warningPolicyFromSection(HR_POLICY_DEFAULTS.warning);
      const escalation = evaluateWarningEscalation({
        activeCount: 3,
        onProbation: false,
        policy,
      });
      expect(escalation.requiresFormalReview).toBe(true);
      expect(escalation.autoTerminate).toBe(false);
      expect(escalation.staffStatusTerminated).toBe(false);
    });
  });

  describe("AT#6 One probation warning → probation review", () => {
    it("triggers probation review only", () => {
      expect(
        isOnProbation({ probationStart: "2026-06-01", probationEnd: "2026-12-01", today: "2026-09-20" }),
      ).toBe(true);
      const escalation = evaluateWarningEscalation({
        activeCount: 1,
        onProbation: true,
        policy: warningPolicyFromSection(HR_POLICY_DEFAULTS.warning),
      });
      expect(escalation.triggersProbationReview).toBe(true);
      expect(escalation.staffStatusTerminated).toBe(false);
    });
  });

  describe("AT#7 Status changes appear in employee history/timeline", () => {
    it("filters status_change into the timeline feed", () => {
      const feed = [
        { id: "1", eventType: "joining", effectiveOn: "2024-01-01" },
        { id: "2", eventType: "status_change", effectiveOn: "2026-09-01" },
      ];
      expect(filterEmployeeTimeline(feed, "status_change")[0]?.eventType).toBe("status_change");
    });
  });

  describe("AT#8 Annual leave & air-ticket eligibility from joining date", () => {
    it("pro-rates annual leave from hire_date", () => {
      const r = annualAccrualFromHireDate({
        hireDate: "2026-07-01",
        year: 2026,
        annualDays: 21,
        fromHireDate: true,
        asOfDate: "2026-12-31",
      });
      expect(r.monthsAccrued).toBe(6);
      expect(r.accruedDays).toBe(10.5);
    });

    it("computes air-ticket eligibility from hire_date + policy", () => {
      const policy = airTicketPolicyFromSection(HR_POLICY_DEFAULTS.air_ticket);
      const elig = computeEntitlementDatesFromPolicy({
        hireDate: "2024-09-20",
        asOfDate: "2026-09-20",
        policy,
        cycleIndex: 1,
      });
      expect(elig).not.toBeNull();
      expect(elig!.eligibilityOn).toBe("2025-09-20");
    });
  });

  describe("AT#9 Resignation notice suggested from category + service length", () => {
    it("suggests notice days from category and service", () => {
      const s = suggestNoticePeriod({
        category: "permanent",
        hireDate: "2020-01-01",
        asOf: "2026-09-20",
        policy: HR_POLICY_DEFAULTS.notice,
      });
      expect(s.suggestedDays).toBeGreaterThan(0);
    });
  });

  describe("AT#10 HR override notice only with reason + approval", () => {
    it("requires reason and approval to override", () => {
      expect(() =>
        assertNoticeOverrideAllowed({
          suggestedDays: 30,
          requiredNoticeDays: 15,
          overrideReason: null,
          approved: false,
        }),
      ).toThrow(/AT#10/);
      expect(
        assertNoticeOverrideAllowed({
          suggestedDays: 30,
          requiredNoticeDays: 15,
          overrideReason: "GM agreed shorter notice",
          approved: true,
        }).overridden,
      ).toBe(true);
    });
  });

  describe("AT#11 Payroll separates WPS / cheque / bank-transfer", () => {
    it("partitions by payment method", () => {
      expect(resolvePaymentMethod({ employmentCategory: "permanent" })).toBe("wps");
      const parts = partitionByPaymentMethod([
        { paymentMethod: "wps" as const },
        { paymentMethod: "cheque" as const },
        { paymentMethod: "bank_transfer" as const },
      ]);
      expect(parts.wps).toHaveLength(1);
      expect(parts.cheque).toHaveLength(1);
      expect(parts.bank_transfer).toHaveLength(1);
    });
  });

  describe("AT#12 Leave & unpaid absence affect payroll", () => {
    it("reduces net for unpaid leave days", () => {
      const proration = computeProrationFactor({
        dateFrom: "2026-08-28",
        dateTo: "2026-09-27",
        unpaidLeaveDays: 0,
      });
      const full = computePayrollLineAmounts({
        basicQar: 3000,
        proration,
        paymentMethod: "wps",
        unpaidLeaveDays: 0,
        dailyRateQar: 100,
      });
      const withLeave = computePayrollLineAmounts({
        basicQar: 3000,
        proration: { ...proration, unpaidLeaveDays: 3 },
        paymentMethod: "wps",
        unpaidLeaveDays: 3,
        dailyRateQar: 100,
      });
      expect(withLeave.netQar).toBeLessThan(full.netQar);
    });
  });

  describe("AT#13 ATS scoring explains score", () => {
    it("returns match explanation with score breakdown", () => {
      const result = scoreCandidateMatch(
        {
          skills: "React, TypeScript",
          experienceYears: 2,
          education: "Bachelor",
          requiredLocation: null,
          requiresQid: true,
          requiresVisa: false,
        },
        {
          skills: "React, TypeScript, Excel",
          experienceYears: 3,
          education: "BSc",
          location: "Doha",
          qid: "28912345678",
          visaStatus: "resident",
        },
      );
      expect(result.score).toBeGreaterThan(0);
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.matchedSkills.length).toBeGreaterThan(0);
    });
  });

  describe("AT#14 AI scoring cannot auto-reject", () => {
    it("blocks score-only rejection", () => {
      expect(() =>
        assertStageChangeAllowed({ toStage: "rejected", basedOnScoreAlone: true, reason: "low" }),
      ).toThrow(/AT#14/);
      expect(() => assertStageChangeAllowed({ toStage: "rejected", reason: "" })).toThrow(/AT#14/);
    });
  });

  describe("AT#15 Job requests checked vs dept/location quota", () => {
    it("flags exceed when projected headcount over approved", () => {
      const r = evaluateJobRequestAgainstQuota({
        request: {
          departmentId: "d1",
          locationId: "l1",
          vacanciesCount: 2,
          designation: null,
          employmentCategory: null,
        },
        quotas: [
          {
            departmentId: "d1",
            locationId: "l1",
            designation: null,
            employmentCategory: null,
            approvedHeadcount: 5,
            id: "q1",
          },
        ],
        occupiedCount: 4,
        openVacanciesCount: 0,
        selectedNotJoinedCount: 0,
      });
      expect(r.exceeds).toBe(true);
    });
  });

  describe("AT#16 Quota overrides need higher approval", () => {
    it("requires quota.override_approve capability", () => {
      expect(() =>
        assertQuotaOverrideAllowed({
          exceedsQuota: true,
          overrideStatus: "pending",
          actorHasOverrideCapability: false,
          action: "grant_override",
        }),
      ).toThrow(/AT#16/);
      expect(
        assertQuotaOverrideAllowed({
          exceedsQuota: true,
          overrideStatus: "pending",
          actorHasOverrideCapability: true,
          action: "grant_override",
        }),
      ).toEqual({ requiresOverride: true, canProceed: true });
    });
  });

  describe("AT#17 Quota views show names, CV status, QID status", () => {
    it("builds employee rows with name / CV / QID fields", () => {
      const [row] = buildQuotaEmployeeRows([
        {
          staffId: "s1",
          fullName: "Sara Ali",
          employmentCategory: "permanent",
          staffQid: "123",
          asOfDate: "2026-09-20",
          documents: [
            { docType: "cv", filePath: "cv.pdf", expiryDate: null },
            { docType: "qid", filePath: "qid.pdf", expiryDate: "2027-01-01" },
          ],
        },
      ]);
      expect(row?.fullName).toBe("Sara Ali");
      expect(row?.cvAvailable).toBe(true);
      expect(row?.qidAvailable).toBe(true);
      expect(row?.qidExpiry).toBe("2027-01-01");
    });
  });

  describe("AT#18 Approvals/rejections/status/finance in audit_log", () => {
    it("builds shared log_audit rpc args for key HR paths", () => {
      const args = buildHrAuditRpcArgs({
        action: "hr.payroll.lock",
        tableName: "hr_payroll_periods",
        rowId: "period-1",
        after: { status: "locked" },
      });
      expect(args._action).toBe("hr.payroll.lock");
      expect(args._table_name).toBe("hr_payroll_periods");
      expect(args._row_id).toBe("period-1");
      expect(HR_AUDIT_SPOT_CHECK.approvals.length).toBeGreaterThan(0);
      expect(HR_AUDIT_SPOT_CHECK.finance).toContain("hr.payroll.export.wps");
      expect(allHrAuditSpotCheckActions().every((a) => a.startsWith("hr"))).toBe(true);
    });
  });

  describe("AT#19 Unauthorized cannot access salary/passport/QID/disciplinary/payroll docs", () => {
    it("denies floor roles on salary, sensitive profile, payroll, termination", () => {
      expect(isFloorSupervisorView(FLOOR)).toBe(true);
      expect(canUserDo(FLOOR, "people.view_salary")).toBe(false);
      expect(canUserDo(FLOOR, "hr.profile.view_sensitive")).toBe(false);
      expect(canUserDo(FLOOR, "payroll.view")).toBe(false);
      expect(canUserDo(FLOOR, "hr.termination.initiate")).toBe(false);
      expect(canUserDo(FLOOR, "hr.warnings.manage")).toBe(false);
      expect(canUserDo(HR, "payroll.view")).toBe(true);
    });

    it("denies site/ops supervisors and employees on salary + sensitive docs", () => {
      for (const role of ["branch_gm", "duty_manager", "cashier_host"] as const) {
        expect(canUserDo([role], "people.view_salary")).toBe(false);
        expect(canUserDo([role], "people.edit_salary")).toBe(false);
        expect(canUserDo([role], "hr.profile.view_sensitive")).toBe(false);
        expect(canUserDo([role], "hr.docs.manage")).toBe(false);
        expect(canUserDo([role], "payroll.view")).toBe(false);
      }
      for (const role of ["ceo", "hr"] as const) {
        expect(canUserDo([role], "people.view_salary")).toBe(true);
        expect(canUserDo([role], "hr.profile.view_sensitive")).toBe(true);
      }
    });

    it("redacts QID/passport numbers without sensitive cap", () => {
      const raw = { qid: "29440401419", passport_number: "P1234567", name: "Ada" };
      expect(redactStaffIdentityNumbers(raw, false)).toEqual({
        qid: "••••••••",
        passport_number: "••••••••",
        name: "Ada",
      });
      expect(redactStaffIdentityNumbers(raw, true)).toEqual(raw);
    });

    it("blocks floor-equivalent flags on passport/QID/disciplinary/salary docs", () => {
      const denied = {
        isSelf: false,
        canManageDocs: false,
        canViewSensitive: false,
        canViewSalary: false,
      };
      expect(() => assertHrSensitiveDocAccess({ ...denied, docType: "qid" })).toThrow(/elevated/);
      expect(() => assertHrSensitiveDocAccess({ ...denied, docType: "passport" })).toThrow(/elevated/);
      expect(() => assertHrSensitiveDocAccess({ ...denied, docType: "warning_letter" })).toThrow(/elevated/);
      expect(() => assertHrSensitiveDocAccess({ ...denied, docType: "loan_document" })).toThrow(/salary/);
      expect(() =>
        assertHrSensitiveDocAccess({
          ...denied,
          canViewSensitive: true,
          docType: "qid",
        }),
      ).not.toThrow();
    });
  });

  describe("AT#20 Historical employee/payroll unchanged after policy updates", () => {
    it("locked payroll line snapshot ignores new basic", () => {
      const locked = lockedLineResistsPolicyChange(
        {
          grossQar: 5000,
          netQar: 4800,
          earnings: [],
          deductions: [],
        },
        9999,
      );
      expect(locked).toEqual({ grossQar: 5000, netQar: 4800 });
    });
  });
});

describe("Phase 12 email provider (HR categories)", () => {
  afterEach(() => {
    delete process.env.NOTIFICATION_EMAIL_WEBHOOK;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists all hr_* notification categories", () => {
    expect(HR_NOTIFICATION_CATEGORIES).toEqual(
      expect.arrayContaining([
        "hr_documents",
        "hr_leave",
        "hr_ot",
        "hr_disciplinary",
        "hr_payroll",
        "hr_recruitment",
      ]),
    );
    expect(isHrNotificationCategory("hr_payroll")).toBe(true);
    expect(isHrNotificationCategory("procurement")).toBe(false);
  });

  it("skips email when webhook unset", async () => {
    delete process.env.NOTIFICATION_EMAIL_WEBHOOK;
    const result = await dispatchHrEmailIfConfigured({
      notificationId: "n1",
      userId: "u1",
      title: "Test",
    });
    expect(result.status).toBe("skipped");
  });

  it("POSTs to NOTIFICATION_EMAIL_WEBHOOK when configured", async () => {
    process.env.NOTIFICATION_EMAIL_WEBHOOK = "https://hooks.example/email";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const result = await emailProvider.dispatch({
      notificationId: "n1",
      userId: "u1",
      title: "QID expiring",
      body: "Renew soon",
      actionUrl: "/people/hr/documents",
    });
    expect(result.status).toBe("sent");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.example/email",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
