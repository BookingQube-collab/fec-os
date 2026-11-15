/**
 * Telnyx Call Control TTS voice selection for IVR speak / gather_using_speak.
 *
 * Prefer clear AWS Polly **standard** voices on PSTN. Neural (`*-Neural`) can sound
 * quiet/garbled on phone legs; Call Control docs accept both `Polly.Joanna` and
 * `Polly.Joanna-Neural`. Language is ignored for Polly voices, so Arabic-majority
 * prompts must switch to an Arabic Polly voice (Hala / Zayd / Zeina).
 */

/** Clear professional default for English (and mixed EN+AR Language menus). */
export const DEFAULT_TTS_VOICE = "Polly.Joanna";

/** Clear professional default when the prompt is predominantly Arabic. */
export const DEFAULT_AR_TTS_VOICE = "Polly.Hala";

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

/** Neural Polly ids that sounded poor on PSTN — map to standard counterparts. */
const POLLY_NEURAL_TO_STANDARD: Record<string, string> = {
  "Polly.Joanna-Neural": "Polly.Joanna",
  "Polly.Matthew-Neural": "Polly.Matthew",
  "Polly.Amy-Neural": "Polly.Amy",
  "Polly.Brian-Neural": "Polly.Brian",
  "Polly.Hala-Neural": "Polly.Hala",
  "Polly.Zayd-Neural": "Polly.Zayd",
  "AWS.Polly.Joanna-Neural": "Polly.Joanna",
  "AWS.Polly.Matthew-Neural": "Polly.Matthew",
  "AWS.Polly.Amy-Neural": "Polly.Amy",
  "AWS.Polly.Brian-Neural": "Polly.Brian",
  "AWS.Polly.Hala-Neural": "Polly.Hala",
  "AWS.Polly.Zayd-Neural": "Polly.Zayd",
};

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
  { id: "Polly.Joanna", label: "Polly Joanna (EN female — recommended, clear on phone)" },
  { id: "Polly.Matthew", label: "Polly Matthew (EN male)" },
  { id: "Polly.Amy", label: "Polly Amy (EN-GB female)" },
  { id: "Polly.Brian", label: "Polly Brian (EN-GB male)" },
  { id: "Polly.Hala", label: "Polly Hala (AR female)" },
  { id: "Azure.en-US-JennyNeural", label: "Azure Jenny Neural (EN female)" },
  { id: "Azure.en-US-GuyNeural", label: "Azure Guy Neural (EN male)" },
  { id: "Polly.Joanna-Neural", label: "Polly Joanna Neural (EN — may be quieter on PSTN)" },
  { id: "female", label: "Telnyx basic female (legacy)" },
  { id: "male", label: "Telnyx basic male (legacy)" },
];

/** Strip AWS. prefix — Call Control speak uses Polly.* (REST TTS uses AWS.Polly.*). */
function toCallControlVoiceId(voice: string): string {
  if (voice.startsWith("AWS.Polly.")) return `Polly.${voice.slice("AWS.Polly.".length)}`;
  if (voice.startsWith("aws.Polly.")) return `Polly.${voice.slice("aws.Polly.".length)}`;
  return voice;
}

/** Normalize stored settings / UI value to a Telnyx Call Control speak voice id. */
export function normalizeConfiguredTtsVoice(configuredVoice?: string | null): string {
  const raw = configuredVoice?.trim() ?? "";
  if (!raw || LEGACY_TTS_VOICE_IDS.has(raw)) return DEFAULT_TTS_VOICE;
  if (raw === "male" || raw === "female") return raw;
  const configured = toCallControlVoiceId(raw);
  if (POLLY_NEURAL_TO_STANDARD[configured]) return POLLY_NEURAL_TO_STANDARD[configured];
  if (POLLY_NEURAL_TO_STANDARD[raw]) return POLLY_NEURAL_TO_STANDARD[raw];
  if (PROVIDER_VOICE_RE.test(configured)) return configured;
  // Unknown bare ids (e.g. old Google-style) → clear Polly default.
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
 * Provider-prefixed voices pass through; Arabic-majority text uses Hala
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
