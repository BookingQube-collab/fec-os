/**
 * Telnyx Call Control TTS voice selection for IVR speak / gather_using_speak.
 *
 * Basic `female`/`male` sounds robotic. Prefer AWS Polly Neural via Telnyx
 * (`Polly.*-Neural`). Language is ignored for Polly voices, so Arabic-majority
 * prompts must switch to an Arabic Polly voice (Hala / Zayd / Zeina).
 */

/** Professional default for English (and mixed EN+AR Language menus). */
export const DEFAULT_TTS_VOICE = "Polly.Joanna-Neural";

/** Professional default when the prompt is predominantly Arabic. */
export const DEFAULT_AR_TTS_VOICE = "Polly.Hala-Neural";

/** Legacy / invalid values that must not be sent to Telnyx as-is. */
export const LEGACY_TTS_VOICE_IDS = new Set([
  "en-US-Neural2-A",
  "en-US-Neural2-C",
  "en-US-Neural2-E",
  "en-US-Neural2-F",
  "en-US-Neural2-G",
  "en-US-Neural2-H",
  "en-US-Neural2-I",
  "en-US-Neural2-J",
  "en-GB-Neural2-A",
  "en-GB-Neural2-B",
]);

const PROVIDER_VOICE_RE =
  /^(Polly|AWS\.Polly|Azure|Google|Telnyx|ElevenLabs|Minimax|Resemble|Inworld|Soniox)\./i;

const ARABIC_CAPABLE_VOICE_RE =
  /^(male|female)$|Polly\.(Hala|Zayd|Zeina)|AWS\.Polly\.(Hala|Zayd|Zeina)|Azure\.ar[-_]|[\u0600-\u06FF]/i;

export type TtsVoicePreset = {
  id: string;
  label: string;
};

/** Presets shown in Call Center → Settings (plus free-text custom). */
export const TTS_VOICE_PRESETS: TtsVoicePreset[] = [
  { id: "Polly.Joanna-Neural", label: "Polly Joanna Neural (EN female — recommended)" },
  { id: "Polly.Matthew-Neural", label: "Polly Matthew Neural (EN male)" },
  { id: "Polly.Amy-Neural", label: "Polly Amy Neural (EN-GB female)" },
  { id: "Polly.Brian-Neural", label: "Polly Brian Neural (EN-GB male)" },
  { id: "Azure.en-US-JennyNeural", label: "Azure Jenny Neural (EN female)" },
  { id: "Azure.en-US-GuyNeural", label: "Azure Guy Neural (EN male)" },
  { id: "female", label: "Telnyx basic female (legacy)" },
  { id: "male", label: "Telnyx basic male (legacy)" },
];

/** Normalize stored settings / UI value to a Telnyx-usable English voice id. */
export function normalizeConfiguredTtsVoice(configuredVoice?: string | null): string {
  const configured = configuredVoice?.trim() ?? "";
  if (!configured || LEGACY_TTS_VOICE_IDS.has(configured)) return DEFAULT_TTS_VOICE;
  if (configured === "male" || configured === "female") return configured;
  if (PROVIDER_VOICE_RE.test(configured)) return configured;
  // Unknown bare ids (e.g. old Google-style) → professional Polly default.
  return DEFAULT_TTS_VOICE;
}

/** True when the prompt is predominantly Arabic script (not merely bilingual with a few Arabic words). */
export function isArabicText(text: string): boolean {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).join("").length;
  if (arabic === 0) return false;
  const latin = (text.match(/[A-Za-z]/g) ?? []).join("").length;
  // Mixed Language IVR prompts (EN + short AR lines) must stay en-US so Telnyx
  // gather_using_speak keeps DTMF barge-in reliable. Only switch when Arabic dominates.
  return arabic >= 12 && arabic >= latin;
}

function isArabicCapableVoice(voice: string): boolean {
  return ARABIC_CAPABLE_VOICE_RE.test(voice);
}

/**
 * Pick Telnyx voice/language for speak / gather_using_speak.
 * Provider-prefixed voices pass through; Arabic-majority text uses Hala Neural
 * unless the configured voice is already Arabic-capable.
 */
export function pickSpeakVoice(
  text: string,
  configuredVoice?: string,
): { voice: string; language: string } {
  const language = isArabicText(text) ? "arb" : "en-US";
  const configured = normalizeConfiguredTtsVoice(configuredVoice);

  if (language === "arb") {
    if (configured === "male" || configured === "female") {
      return { voice: configured, language };
    }
    if (isArabicCapableVoice(configured)) {
      return { voice: configured, language };
    }
    return { voice: DEFAULT_AR_TTS_VOICE, language };
  }

  return { voice: configured, language };
}
