/**
 * Telnyx Call Control / TeXML TTS voice selection for IVR speak / gather_using_speak.
 *
 * English → AWS Polly Joanna Neural (proven on this PSTN path; Multilingual Azure caused silence).
 * Arabic → Azure Fatima Neural (UAE Gulf ar-AE). Polly Hala/Zayd/Zeina auto-upgrade.
 *
 * SSML / telecom EQ / voiceSpeed are intentionally NOT applied: nesting SSML inside TeXML
 * `<Say>` and sending Azure `voice_settings.effect` correlated with total inbound silence
 * after 210cbb1. Plain text + known-good voice ids restore audio.
 *
 * ElevenLabs is supported when voice is `ElevenLabs.*` and
 * `TELNYX_ELEVENLABS_API_KEY_REF` points at a Telnyx Integration Secret — not the default
 * (needs a paid ElevenLabs key stored in Telnyx Mission Control).
 *
 * Call Control / TeXML accept `Polly.*` and `Azure.*` without BYOK on Telnyx premium TTS.
 */

/** Proven Neural default for English (and mixed EN+AR Language menus). */
export const DEFAULT_TTS_VOICE = "Polly.Joanna-Neural";

/** Male EN counterpart. */
export const DEFAULT_EN_MALE_TTS_VOICE = "Polly.Matthew-Neural";

/**
 * Best Gulf Arabic voice available on this stack without extra credentials.
 * Telnyx premium speak/Say → Azure Speech (no Azure account required on FEC).
 */
export const DEFAULT_AR_TTS_VOICE = "Azure.ar-AE-FatimaNeural";

/** Male Gulf counterpart when upgrading Polly Zayd. */
export const DEFAULT_AR_MALE_TTS_VOICE = "Azure.ar-AE-HamdanNeural";

/** Gulf Arabic locale for Azure ar-AE / Polly Hala legacy (not MSA `arb`). */
export const DEFAULT_AR_TTS_LANGUAGE = "ar-AE";

/** Last-resort Polly voices when preferred Azure speak fails on Call Control. */
export const FALLBACK_EN_TTS_VOICE = "Polly.Joanna-Neural";
export const FALLBACK_AR_TTS_VOICE = "Polly.Hala-Neural";

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
 * Upgrade known Polly standard voices to Neural counterparts.
 * Already-Neural ids pass through (Arabic Polly upgraded later → Azure Fatima).
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

/**
 * Remap Multilingual Azure EN ids that produced inbound silence on TeXML/Call Control
 * after 210cbb1. Prefer proven Polly Neural for live IVR.
 */
const UNSAFE_EN_VOICE_REMAP: Record<string, string> = {
  "Azure.en-US-AvaMultilingualNeural": DEFAULT_TTS_VOICE,
  "Azure.en-US-AndrewMultilingualNeural": DEFAULT_EN_MALE_TTS_VOICE,
  "Azure.en-US-EmmaMultilingualNeural": DEFAULT_TTS_VOICE,
  "Azure.en-US-BrianMultilingualNeural": DEFAULT_EN_MALE_TTS_VOICE,
};

const PROVIDER_VOICE_RE =
  /^(Polly|AWS\.Polly|Azure|Google|Telnyx|ElevenLabs|Minimax|Resemble|Inworld|Soniox)\./i;

/** Voices that can speak Arabic (kept only if already Azure Gulf / basic male|female). */
const ARABIC_CAPABLE_VOICE_RE =
  /^(male|female)$|Polly\.(Hala|Zayd|Zeina)|AWS\.Polly\.(Hala|Zayd|Zeina)|Azure\.ar[-_]|[\u0600-\u06FF]|ElevenLabs\./i;

/** Polly Arabic voices that still sound AI — upgrade to Azure Gulf Neural. */
const LEGACY_AR_POLLY_VOICE_RE =
  /^(AWS\.)?Polly\.(Hala|Zayd|Zeina)(-Neural)?$/i;

/** Arabic-only configured voices must not stay on English prompts. */
const ARABIC_ONLY_VOICE_RE =
  /^(AWS\.)?Polly\.(Hala|Zayd|Zeina)(-Neural)?$|^Azure\.ar[-_]/i;

/** MSA-only Polly voice — never keep for live Qatar IVR. */
const MSA_ARABIC_VOICE_RE = /Polly\.Zeina|AWS\.Polly\.Zeina/i;

const MALE_AR_POLLY_VOICE_RE = /^(AWS\.)?Polly\.Zayd(-Neural)?$/i;

const AZURE_VOICE_RE = /^Azure\./i;

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
  { id: "Azure.en-US-JennyNeural", label: "Azure Jenny Neural (EN female)" },
  { id: "Azure.en-US-GuyNeural", label: "Azure Guy Neural (EN male)" },
  { id: "Polly.Hala-Neural", label: "Polly Hala Neural (AR female — Gulf; legacy, more synthetic)" },
  { id: "Polly.Zayd-Neural", label: "Polly Zayd Neural (AR male — Gulf; legacy)" },
  { id: "female", label: "Telnyx basic female (legacy)" },
  { id: "male", label: "Telnyx basic male (legacy)" },
];

/** Strip AWS. prefix — Call Control speak uses Polly.* (REST TTS uses AWS.Polly.*). */
function toCallControlVoiceId(voice: string): string {
  if (voice.startsWith("AWS.Polly.")) return `Polly.${voice.slice("AWS.Polly.".length)}`;
  if (voice.startsWith("aws.Polly.")) return `Polly.${voice.slice("aws.Polly.".length)}`;
  return voice;
}

export function isAzureTtsVoice(voice: string): boolean {
  return AZURE_VOICE_RE.test(voice);
}

/** Normalize stored settings / UI value to a Telnyx Call Control speak voice id. */
export function normalizeConfiguredTtsVoice(configuredVoice?: string | null): string {
  const raw = configuredVoice?.trim() ?? "";
  if (!raw || LEGACY_TTS_VOICE_IDS.has(raw)) return DEFAULT_TTS_VOICE;
  if (raw === "male" || raw === "female") return raw;
  const configured = toCallControlVoiceId(raw);
  // Prefer Neural when a standard Polly id is stored (old defaults / presets).
  let next = POLLY_STANDARD_TO_NEURAL[configured] ?? POLLY_STANDARD_TO_NEURAL[raw] ?? configured;
  // Multilingual Azure EN → proven Polly (fixes DB/settings saved after 210cbb1).
  if (UNSAFE_EN_VOICE_REMAP[next]) return UNSAFE_EN_VOICE_REMAP[next];
  if (PROVIDER_VOICE_RE.test(next)) return next;
  // Unknown bare ids (e.g. old Google-style) → Polly Joanna Neural.
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
 * English → Polly Joanna (or configured EN voice; Multilingual Azure remapped).
 * Arabic-majority → Azure Fatima (auto-upgrades Polly Hala/Zayd/Zeina).
 * Mixed Language menus stay en-US with the EN voice.
 */
export function pickSpeakVoice(
  text: string,
  configuredVoice?: string,
): { voice: string; language: string } {
  const configured = normalizeConfiguredTtsVoice(configuredVoice);

  if (!isArabicText(text)) {
    // Don't leave English prompts on an Arabic-only saved voice (e.g. Polly.Hala / Fatima).
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
    // EN Azure / Polly must not speak Arabic menus — switch to Fatima.
    if (
      !isArabicOnlyVoice(configured) &&
      !/^ElevenLabs\./i.test(configured) &&
      configured !== "male" &&
      configured !== "female"
    ) {
      if (/^Azure\.en[-_]/i.test(configured) || /^(AWS\.)?Polly\./i.test(configured)) {
        return { voice: DEFAULT_AR_TTS_VOICE, language: DEFAULT_AR_TTS_LANGUAGE };
      }
    }
    return { voice: configured, language: arabicTtsLanguageForVoice(configured) };
  }

  return { voice: DEFAULT_AR_TTS_VOICE, language: DEFAULT_AR_TTS_LANGUAGE };
}

/**
 * Build Call Control speak / gather payload.
 * Always plain text — SSML inside TeXML `<Say>` and Azure SSML on Call Control
 * caused silent IVR after the Ava Multilingual push. Natural voice > broken markup.
 */
export function buildSpeakPayload(
  text: string,
  _voice: string,
): { payload: string; payload_type: "text" | "ssml" } {
  return { payload: text, payload_type: "text" };
}

/**
 * Call Control `voice_settings` for Azure — disabled.
 * `effect: eq_telecomhp8k` was part of the silent-IVR regression; keep Azure plain.
 */
export function azureSpeakVoiceSettings(
  _voice: string,
): { type: "azure"; effect: "eq_telecomhp8k" } | undefined {
  return undefined;
}

/**
 * TeXML `<Say>` extras for Azure — none.
 * `effect` / `voiceSpeed` with SSML bodies produced silent menus; plain escaped text only.
 */
export function texmlAzureSayAttrs(_voice: string): string {
  return "";
}

/** Known-good Polly fallback when preferred voice fails on Call Control. */
export function fallbackSpeakVoice(text: string): { voice: string; language: string } {
  if (isArabicText(text)) {
    return { voice: FALLBACK_AR_TTS_VOICE, language: DEFAULT_AR_TTS_LANGUAGE };
  }
  return { voice: FALLBACK_EN_TTS_VOICE, language: "en-US" };
}
