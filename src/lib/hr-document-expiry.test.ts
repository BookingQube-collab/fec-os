import { describe, expect, it } from "vitest";

import {
  alertPeriodsForDocType,
  documentExpiryPolicyFromSection,
  passportAlertPeriods,
  qidAlertPeriods,
  shouldSendExpiryReminder,
} from "./hr-document-expiry";
import { HR_POLICY_DEFAULTS } from "./hr-policy";

describe("document expiry alerts (AT#1 / AT#2 / AT#19)", () => {
  const policy = documentExpiryPolicyFromSection(HR_POLICY_DEFAULTS.document);

  it("AT#1: QID alert selection uses policy 30-day window", () => {
    expect(policy.qidAlertDays).toBe(30);
    expect(qidAlertPeriods(policy)).toEqual([30]);
    expect(alertPeriodsForDocType("qid", policy)).toEqual([30]);
    expect(
      shouldSendExpiryReminder({
        daysUntil: 30,
        alertPeriods: qidAlertPeriods(policy),
        frequencyDays: policy.reminderFrequencyDays,
        todayYmd: "2026-09-20",
        lastSentAtYmd: null,
        acknowledged: false,
      }),
    ).toBe(true);
    expect(
      shouldSendExpiryReminder({
        daysUntil: 31,
        alertPeriods: qidAlertPeriods(policy),
        frequencyDays: policy.reminderFrequencyDays,
        todayYmd: "2026-09-20",
        lastSentAtYmd: null,
        acknowledged: false,
      }),
    ).toBe(false);
  });

  it("AT#2: passport periods come from policy, not hardcoded callers", () => {
    expect(passportAlertPeriods(policy)).toEqual([180, 90, 60, 30]);
    const custom = documentExpiryPolicyFromSection({
      qid_alert_days: 30,
      passport_alert_days: [120, 45],
      reminder_frequency_days: 7,
    });
    expect(passportAlertPeriods(custom)).toEqual([120, 45]);
    expect(alertPeriodsForDocType("passport", custom)).toEqual([120, 45]);
    expect(alertPeriodsForDocType("passport", custom)).not.toEqual([180, 90, 60, 30]);
  });

  it("AT#19: acknowledgement stops reminder cadence", () => {
    const base = {
      daysUntil: 20,
      alertPeriods: passportAlertPeriods(policy),
      frequencyDays: 7,
      todayYmd: "2026-09-20",
      lastSentAtYmd: "2026-09-01" as string | null,
      acknowledged: false,
    };
    expect(shouldSendExpiryReminder(base)).toBe(true);
    expect(shouldSendExpiryReminder({ ...base, acknowledged: true })).toBe(false);
  });

  it("re-sends only after policy frequency days when still in window", () => {
    expect(
      shouldSendExpiryReminder({
        daysUntil: 25,
        alertPeriods: qidAlertPeriods(policy),
        frequencyDays: 7,
        todayYmd: "2026-09-20",
        lastSentAtYmd: "2026-09-18",
        acknowledged: false,
      }),
    ).toBe(false);
    expect(
      shouldSendExpiryReminder({
        daysUntil: 25,
        alertPeriods: qidAlertPeriods(policy),
        frequencyDays: 7,
        todayYmd: "2026-09-20",
        lastSentAtYmd: "2026-09-13",
        acknowledged: false,
      }),
    ).toBe(true);
  });
});
