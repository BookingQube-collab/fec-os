import { isArabicText } from "./ivr-tts-voice";

/** Qatar-style contact-center recording notice (English). */
export const RECORDING_DISCLOSURE_EN =
  "Please note that this call may be recorded for quality and training purposes.";

/**
 * Gulf/Qatari-leaning recording notice (Arabic).
 * Written for spoken IVR with Azure Fatima Neural (ar-AE Gulf) — not stiff MSA.
 */
export const RECORDING_DISCLOSURE_AR =
  "للعلم، المكالمة هذي ممكن تنسجل عشان الجودة والتدريب.";

/** Short connecting line after the disclosure (English). */
export const CONNECTING_TO_AGENT_EN = "Please wait. We are connecting you to an agent.";

/** Short connecting line after the disclosure (Gulf Arabic). */
export const CONNECTING_TO_AGENT_AR = "لحظة من فضلك، بنوصلك بالموظف الحين.";

export type CallerSpeakLang = "en" | "ar";

/**
 * Resolve caller's IVR language from call metadata.
 * Prefers explicit ivrLanguage / aiLanguage; falls back to Arabic-majority greeting text.
 */
export function resolveCallerSpeakLang(meta: Record<string, unknown> | null | undefined): CallerSpeakLang {
  const m = meta ?? {};
  if (m.ivrLanguage === "ar" || m.ivrLanguage === "en") return m.ivrLanguage;
  if (m.aiLanguage === "ar" || m.aiLanguage === "en") return m.aiLanguage;
  if (typeof m.ivrGreeting === "string" && isArabicText(m.ivrGreeting)) return "ar";
  return "en";
}

export function recordingDisclosureForLang(lang: CallerSpeakLang): string {
  return lang === "ar" ? RECORDING_DISCLOSURE_AR : RECORDING_DISCLOSURE_EN;
}

export function connectingPromptForLang(lang: CallerSpeakLang): string {
  return lang === "ar" ? CONNECTING_TO_AGENT_AR : CONNECTING_TO_AGENT_EN;
}

/**
 * Full pre-agent announcement: recording disclosure + connecting line.
 * Spoken immediately before bridging to a human agent.
 */
export function preAgentConnectAnnouncement(lang: CallerSpeakLang): string {
  return `${recordingDisclosureForLang(lang)} ${connectingPromptForLang(lang)}`;
}

/** Infer EN/AR from a Language-menu digit (1 EN / 2 AR). */
export function languageFromIvrDigit(
  digit: string,
  menuLabel?: string,
  digitLabels?: Array<{ digit: string; label: string }>,
): CallerSpeakLang | null {
  const label = menuLabel || "";
  const isLangMenu = /lang|language|لغة/i.test(label);
  if (isLangMenu) {
    if (digit === "2") return "ar";
    if (digit === "1") return "en";
  }
  if (
    digit === "2" &&
    (digitLabels ?? []).some((d) => /arab|عر/i.test(d.label))
  ) {
    return "ar";
  }
  if (
    digit === "1" &&
    (digitLabels ?? []).some((d) => /engl|إنج/i.test(d.label))
  ) {
    return "en";
  }
  return null;
}
