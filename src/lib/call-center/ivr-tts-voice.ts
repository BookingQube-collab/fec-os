/**
 * Telnyx Call Control / TeXML TTS voice selection for IVR speak / gather_using_speak.
 *
 * Prefer AWS Polly **Neural** voices for more natural, human-sounding PSTN prompts.
 * Call Control and TeXML accept `Polly.Joanna-Neural` / `Polly.Hala-Neural`.
 * Language is ignored for Polly voices on Call Control (voice id selects the model),
 * but REST TTS / Azure still use language. Hala/Zayd are Gulf Arabic (ar-AE);
 * Zeina is MSA (arb). Prefer ar-AE for Arabic-majority prompts so previews and
 * non-Polly paths stay Gulf-leaning.
 */

/** Natural Neural default for English (and mixed EN+AR Language menus). */
export const DEFAULT_TTS_VOICE = "Polly.Joanna-Neural";

/** Natural Neural default when the prompt is predominantly Arabic (Gulf). */
export const DEFAULT_AR_TTS_VOICE = "Polly.Hala-Neural";

/** Gulf Arabic locale for Hala / Zayd / Azure ar-AE (not MSA `arb`). */
export const DEFAULT_AR_TTS_LANGUAGE = "ar-AE";

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

/**
 * Upgrade known Polly standard voices to Neural counterparts (more natural on phone).
 * Already-Neural ids pass through unchanged.
 */
const POLLY_STANDARD_TO_NEURAL: Record<string, string> = {
  "Polly.Joanna": "Polly.Joanna-Neural",
  "Polly.Matthew": "Polly.Matthew-Neural",
  "Polly.Amy": "Polly.Amy-Neural",
  "Polly.Brian": "Polly.Brian-Neural",
  "Polly.Hala": "Polly.Hala-Neural",
  "Polly.Zayd": "Polly.Zayd-Neural",
  "AWS.Polly.Joanna": "Polly.Joanna-Neural",
  "AWS.Polly.Matthew": "Polly.Matthew-Neural",
  "AWS.Polly.Amy": "Polly.Amy-Neural",
  "AWS.Polly.Brian": "Polly.Brian-Neural",
  "AWS.Polly.Hala": "Polly.Hala-Neural",
  "AWS.Polly.Zayd": "Polly.Zayd-Neural",
};

const PROVIDER_VOICE_RE =
  /^(Polly|AWS\.Polly|Azure|Google|Telnyx|ElevenLabs|Minimax|Resemble|Inworld|Soniox)\./i;

const ARABIC_CAPABLE_VOICE_RE =
  /^(male|female)$|Polly\.(Hala|Zayd|Zeina)|AWS\.Polly\.(Hala|Zayd|Zeina)|Azure\.ar[-_]|[\u0600-\u06FF]/i;

/** MSA-only Polly voice — keep `arb` when configured. */
const MSA_ARABIC_VOICE_RE = /Polly\.Zeina|AWS\.Polly\.Zeina/i;

export type TtsVoicePreset = {
  id: string;
  label: string;
};

/** Presets shown in Call Center → Settings (plus free-text custom). */
export const TTS_VOICE_PRESETS: TtsVoicePreset[] = [
  { id: "Polly.Joanna-Neural", label: "Polly Joanna Neural (EN female — recommended, natural)" },
  { id: "Polly.Matthew-Neural", label: "Polly Matthew Neural (EN male)" },
  { id: "Polly.Amy-Neural", label: "Polly Amy Neural (EN-GB female)" },
  { id: "Polly.Brian-Neural", label: "Polly Brian Neural (EN-GB male)" },
  { id: "Polly.Hala-Neural", label: "Polly Hala Neural (AR female — Gulf ar-AE, recommended)" },
  { id: "Polly.Zayd-Neural", label: "Polly Zayd Neural (AR male — Gulf ar-AE)" },
  { id: "Azure.en-US-JennyNeural", label: "Azure Jenny Neural (EN female)" },
  { id: "Azure.en-US-GuyNeural", label: "Azure Guy Neural (EN male)" },
  { id: "Azure.ar-AE-FatimaNeural", label: "Azure Fatima Neural (AR female — UAE Gulf)" },
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
  // Prefer Neural when a standard Polly id is stored (old defaults / presets).
  if (POLLY_STANDARD_TO_NEURAL[configured]) return POLLY_STANDARD_TO_NEURAL[configured];
  if (POLLY_STANDARD_TO_NEURAL[raw]) return POLLY_STANDARD_TO_NEURAL[raw];
  if (PROVIDER_VOICE_RE.test(configured)) return configured;
  // Unknown bare ids (e.g. old Google-style) → natural Polly Neural default.
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

/** Language code for Arabic TTS: Gulf ar-AE by default; MSA arb only for Zeina. */
export function arabicTtsLanguageForVoice(voice: string): string {
  return MSA_ARABIC_VOICE_RE.test(voice) ? "arb" : DEFAULT_AR_TTS_LANGUAGE;
}

/**
 * Pick Telnyx voice/language for speak / gather_using_speak.
 * Provider-prefixed voices pass through; Arabic-majority text uses Hala Neural
 * unless the configured voice is already Arabic-capable.
 * Arabic language defaults to Gulf `ar-AE` (Hala/Zayd); Zeina stays `arb`.
 */
export function pickSpeakVoice(
  text: string,
  configuredVoice?: string,
): { voice: string; language: string } {
  const configured = normalizeConfiguredTtsVoice(configuredVoice);

  if (!isArabicText(text)) {
    return { voice: configured, language: "en-US" };
  }

  if (configured === "male" || configured === "female") {
    return { voice: configured, language: DEFAULT_AR_TTS_LANGUAGE };
  }
  if (isArabicCapableVoice(configured)) {
    return { voice: configured, language: arabicTtsLanguageForVoice(configured) };
  }
  return { voice: DEFAULT_AR_TTS_VOICE, language: DEFAULT_AR_TTS_LANGUAGE };
}
