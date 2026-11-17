import { describe, expect, it } from "vitest";

import {
  CONNECTING_TO_AGENT_AR,
  CONNECTING_TO_AGENT_EN,
  RECORDING_DISCLOSURE_AR,
  RECORDING_DISCLOSURE_EN,
  languageFromIvrDigit,
  preAgentConnectAnnouncement,
  resolveCallerSpeakLang,
} from "./recording-disclosure";

describe("recording disclosure", () => {
  it("resolves language from metadata", () => {
    expect(resolveCallerSpeakLang({ ivrLanguage: "ar" })).toBe("ar");
    expect(resolveCallerSpeakLang({ aiLanguage: "en" })).toBe("en");
    expect(
      resolveCallerSpeakLang({
        ivrGreeting: "مرحباً بكم في إي ثري اختر المركز",
      }),
    ).toBe("ar");
    expect(resolveCallerSpeakLang({})).toBe("en");
  });

  it("builds bilingual pre-agent announcements", () => {
    const en = preAgentConnectAnnouncement("en");
    expect(en).toContain(RECORDING_DISCLOSURE_EN);
    expect(en).toContain(CONNECTING_TO_AGENT_EN);

    const ar = preAgentConnectAnnouncement("ar");
    expect(ar).toContain(RECORDING_DISCLOSURE_AR);
    expect(ar).toContain(CONNECTING_TO_AGENT_AR);
  });

  it("infers language from Language menu digits", () => {
    expect(languageFromIvrDigit("1", "Language")).toBe("en");
    expect(languageFromIvrDigit("2", "Language")).toBe("ar");
    expect(languageFromIvrDigit("2", "لغة")).toBe("ar");
    expect(languageFromIvrDigit("0", "Language")).toBeNull();
  });
});
