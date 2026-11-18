/**
 * Telnyx Call Control / TeXML TTS voice selection for IVR speak / gather_using_speak.
 *
 * English stays on AWS Polly Joanna Neural (natural PSTN EN).
 * Arabic uses Azure Fatima Neural (UAE Gulf ar-AE) — Polly Hala/Zayd still sound
 * synthetic on phone; Azure neural is the best Gulf voice already wired on Telnyx
 * premium TTS without BYOK (ElevenLabs needs a Telnyx-side API key).
 *
 * Call Control / TeXML accept `Polly.*` and `Azure.*`. Language is ignored for
 * Polly on Call Control; Azure still benefits from `ar-AE`.
 */

/** Natural Neural default for English (and mixed EN+AR Language menus). */
export const DEFAULT_TTS_VOICE = "Polly.Joanna-Neural";

/**
 * Best Gulf Arabic voice available on this stack without extra credentials.
 * Telnyx premium speak/Say → Azure Speech (no Azure account required on FEC).
 */
export const DEFAULT_AR_TTS_VOICE = "Azure.ar-AE-FatimaNeural";

/** Male Gulf counterpart when upgrading Polly Zayd. */
export const DEFAULT_AR_MALE_TTS_VOICE = "Azure.ar-AE-HamdanNeural";

/** Gulf Arabic locale for Azure ar-AE / Polly Hala legacy (not MSA `arb`). */
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
 * Already-Neural ids pass through unchanged (Arabic Polly is upgraded later → Azure).
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

/** Voices that can speak Arabic (kept only if already Azure Gulf / basic male|female). */
const ARABIC_CAPABLE_VOICE_RE =
  /^(male|female)$|Polly\.(Hala|Zayd|Zeina)|AWS\.Polly\.(Hala|Zayd|Zeina)|Azure\.ar[-_]|[\u0600-\u06FF]/i;

/** Polly Arabic voices that still sound AI — upgrade to Azure Gulf Neural. */
const LEGACY_AR_POLLY_VOICE_RE =
  /^(AWS\.)?Polly\.(Hala|Zayd|Zeina)(-Neural)?$/i;

/** Arabic-only configured voices must not stay on English prompts. */
const ARABIC_ONLY_VOICE_RE =
  /^(AWS\.)?Polly\.(Hala|Zayd|Zeina)(-Neural)?$|^Azure\.ar[-_]/i;

/** MSA-only Polly voice — never keep for live Qatar IVR. */
const MSA_ARABIC_VOICE_RE = /Polly\.Zeina|AWS\.Polly\.Zeina/i;

const MALE_AR_POLLY_VOICE_RE = /^(AWS\.)?Polly\.Zayd(-Neural)?$/i;

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
  {
    id: "Azure.ar-AE-FatimaNeural",
    label: "Azure Fatima Neural (AR female — UAE Gulf, recommended)",
  },
  { id: "Azure.ar-AE-HamdanNeural", label: "Azure Hamdan Neural (AR male — UAE Gulf)" },
  { id: "Polly.Hala-Neural", label: "Polly Hala Neural (AR female — Gulf; legacy, more synthetic)" },
  { id: "Polly.Zayd-Neural", label: "Polly Zayd Neural (AR male — Gulf; legacy)" },
  { id: "Azure.en-US-JennyNeural", label: "Azure Jenny Neural (EN female)" },
  { id: "Azure.en-US-GuyNeural", label: "Azure Guy Neural (EN male)" },
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

function isArabicOnlyVoice(voice: string): boolean {
  return ARABIC_ONLY_VOICE_RE.test(voice);
}

/**
 * Upgrade legacy Polly Arabic (Hala / Zayd / Zeina) → Azure Gulf Neural.
 * Saved Settings that still force Polly.Hala get Fatima automatically on Arabic speak.
 */
export function upgradeArabicPollyToAzure(voice: string): string {
  if (!LEGACY_AR_POLLY_VOICE_RE.test(voice) && !MSA_ARABIC_VOICE_RE.test(voice)) {
    return voice;
  }
  if (MALE_AR_POLLY_VOICE_RE.test(voice)) return DEFAULT_AR_MALE_TTS_VOICE;
  return DEFAULT_AR_TTS_VOICE;
}

/** Language code for Arabic TTS: Gulf ar-AE by default; MSA arb only if Zeina somehow remains. */
export function arabicTtsLanguageForVoice(voice: string): string {
  return MSA_ARABIC_VOICE_RE.test(voice) ? "arb" : DEFAULT_AR_TTS_LANGUAGE;
}

/**
 * Pick Telnyx voice/language for speak / gather_using_speak.
 * English → Joanna (or configured EN voice). Arabic-majority → Azure Fatima
 * (auto-upgrades Polly Hala/Zayd/Zeina). Mixed Language menus stay en-US.
 */
export function pickSpeakVoice(
  text: string,
  configuredVoice?: string,
): { voice: string; language: string } {
  const configured = normalizeConfiguredTtsVoice(configuredVoice);

  if (!isArabicText(text)) {
    // Don't leave English prompts on an Arabic-only saved voice (e.g. Polly.Hala).
    if (isArabicOnlyVoice(configured)) {
      return { voice: DEFAULT_TTS_VOICE, language: "en-US" };
    }
    return { voice: configured, language: "en-US" };
  }

  if (configured === "male" || configured === "female") {
    return { voice: configured, language: DEFAULT_AR_TTS_LANGUAGE };
  }

  // Polly Arabic (incl. Zeina MSA + saved Hala) → Azure Gulf Neural.
  if (LEGACY_AR_POLLY_VOICE_RE.test(configured) || MSA_ARABIC_VOICE_RE.test(configured)) {
    const voice = upgradeArabicPollyToAzure(configured);
    return { voice, language: DEFAULT_AR_TTS_LANGUAGE };
  }

  if (isArabicCapableVoice(configured)) {
    return { voice: configured, language: arabicTtsLanguageForVoice(configured) };
  }

  return { voice: DEFAULT_AR_TTS_VOICE, language: DEFAULT_AR_TTS_LANGUAGE };
}

function escapeSsmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build Call Control speak / gather payload.
 * Azure Arabic gets mild conversational prosody (slightly slower, warmer) so
 * phone playback is less clipped/robotic than bare neural defaults.
 */
export function buildSpeakPayload(
  text: string,
  voice: string,
): { payload: string; payload_type: "text" | "ssml" } {
  if (!/^Azure\.ar[-_]/i.test(voice)) {
    return { payload: text, payload_type: "text" };
  }
  const inner = escapeSsmlText(text);
  // rate/pitch tuned for PSTN IVR — not exaggerated; avoid chipmunk / dirge extremes.
  return {
    payload: `<speak><prosody rate="95%" pitch="-2%">${inner}</prosody></speak>`,
    payload_type: "ssml",
  };
}
