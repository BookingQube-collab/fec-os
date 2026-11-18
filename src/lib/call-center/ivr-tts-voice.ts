/**
 * Telnyx Call Control / TeXML TTS voice selection for IVR speak / gather_using_speak.
 *
 * When `TELNYX_ELEVENLABS_API_KEY_REF` is set, Joanna / Fatima auto-upgrade to ElevenLabs
 * (near-human EN + multilingual AR). Soft-fail Speak retries Joanna / Fatima.
 *
 * Without the secret: English → AWS Polly Joanna Neural; Arabic → Azure Fatima Neural
 * (UAE Gulf ar-AE). Polly Hala/Zayd/Zeina auto-upgrade to Azure Gulf.
 *
 * For true Qatari accent: prefer recorded MP3/WAV Play URLs on IVR nodes / bridge settings
 * (non-/ivr/ HTTPS uploads — Supabase/CDN). Piper `/ivr/` Play stays dual-flag gated.
 *
 * SSML / telecom EQ / voiceSpeed are intentionally NOT applied: nesting SSML inside TeXML
 * `<Say>` and sending Azure `voice_settings.effect` correlated with total inbound silence
 * after 210cbb1. Plain text + known-good voice ids restore audio.
 *
 * Call Control / TeXML accept `Polly.*` and `Azure.*` without BYOK on Telnyx premium TTS.
 * ElevenLabs needs Telnyx Integration Secret → env `TELNYX_ELEVENLABS_API_KEY_REF`.
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

/**
 * Rachel (ElevenLabs) — Telnyx docs example; clear multilingual EN female.
 * Format: ElevenLabs.<model_id>.<voice_id>
 */
export const DEFAULT_ELEVENLABS_EN_VOICE =
  "ElevenLabs.eleven_multilingual_v2.21m00Tcm4TlvDq8ikWAM";

/**
 * Charlotte (ElevenLabs) — multilingual female; stronger Arabic than EN-only presets.
 * Swap voice id in Settings after you pick a preferred Gulf/Qatari clone.
 */
export const DEFAULT_ELEVENLABS_AR_VOICE =
  "ElevenLabs.eleven_multilingual_v2.XB0fDUnXU5powFXDhCwa";

/** Soft-fail Polly/Azure when ElevenLabs (or preferred) speak fails on Call Control. */
export const FALLBACK_EN_TTS_VOICE = "Polly.Joanna-Neural";
export const FALLBACK_AR_TTS_VOICE = "Azure.ar-AE-FatimaNeural";

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
 * after 210cbb1. Prefer proven Polly Neural for live IVR (or ElevenLabs when keyed).
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

const ELEVENLABS_VOICE_RE = /^ElevenLabs\./i;

/** Default Joanna / Fatima (and remapped Ava) that auto-upgrade when ElevenLabs key is set. */
const AUTO_UPGRADE_EN_VOICE_RE =
  /^(AWS\.)?Polly\.Joanna(-Neural)?$|^Azure\.en-US-(Ava|Emma)MultilingualNeural$/i;
const AUTO_UPGRADE_AR_VOICE_RE =
  /^Azure\.ar-AE-FatimaNeural$|^(AWS\.)?Polly\.(Hala|Zeina)(-Neural)?$/i;

export type TtsVoicePreset = {
  id: string;
  label: string;
};

/** Presets shown in Call Center → Settings (plus free-text custom). */
export const TTS_VOICE_PRESETS: TtsVoicePreset[] = [
  {
    id: DEFAULT_ELEVENLABS_EN_VOICE,
    label: "ElevenLabs Rachel (EN — humanized; needs TELNYX_ELEVENLABS_API_KEY_REF)",
  },
  {
    id: DEFAULT_ELEVENLABS_AR_VOICE,
    label: "ElevenLabs Charlotte (AR multilingual — needs TELNYX_ELEVENLABS_API_KEY_REF)",
  },
  { id: "Polly.Joanna-Neural", label: "Polly Joanna Neural (EN female — safe fallback)" },
  { id: "Polly.Matthew-Neural", label: "Polly Matthew Neural (EN male)" },
  { id: "Polly.Amy-Neural", label: "Polly Amy Neural (EN-GB female)" },
  { id: "Polly.Brian-Neural", label: "Polly Brian Neural (EN-GB male)" },
  {
    id: "Azure.ar-AE-FatimaNeural",
    label: "Azure Fatima Neural (AR female — UAE Gulf, safe fallback)",
  },
  { id: "Azure.ar-AE-HamdanNeural", label: "Azure Hamdan Neural (AR male — UAE Gulf)" },
  { id: "Azure.en-US-JennyNeural", label: "Azure Jenny Neural (EN female)" },
  { id: "Azure.en-US-GuyNeural", label: "Azure Guy Neural (EN male)" },
  { id: "Polly.Hala-Neural", label: "Polly Hala Neural (AR female — Gulf; legacy, more synthetic)" },
  { id: "Polly.Zayd-Neural", label: "Polly Zayd Neural (AR male — Gulf; legacy)" },
  { id: "female", label: "Telnyx basic female (legacy)" },
  { id: "male", label: "Telnyx basic male (legacy)" },
];

/** English-oriented presets (Settings EN picker). */
export const TTS_VOICE_PRESETS_EN: TtsVoicePreset[] = TTS_VOICE_PRESETS.filter(
  (p) =>
    !/^Azure\.ar[-_]/i.test(p.id) &&
    !/^(AWS\.)?Polly\.(Hala|Zayd|Zeina)/i.test(p.id),
);

/** Arabic-oriented presets (Settings AR picker). */
export const TTS_VOICE_PRESETS_AR: TtsVoicePreset[] = TTS_VOICE_PRESETS.filter(
  (p) =>
    /^Azure\.ar[-_]/i.test(p.id) ||
    /^(AWS\.)?Polly\.(Hala|Zayd|Zeina)/i.test(p.id) ||
    ELEVENLABS_VOICE_RE.test(p.id) ||
    p.id === "female" ||
    p.id === "male",
);

/** Strip AWS. prefix — Call Control speak uses Polly.* (REST TTS uses AWS.Polly.*). */
function toCallControlVoiceId(voice: string): string {
  if (voice.startsWith("AWS.Polly.")) return `Polly.${voice.slice("AWS.Polly.".length)}`;
  if (voice.startsWith("aws.Polly.")) return `Polly.${voice.slice("aws.Polly.".length)}`;
  return voice;
}

export function isAzureTtsVoice(voice: string): boolean {
  return AZURE_VOICE_RE.test(voice);
}

export function isElevenLabsTtsVoice(voice: string): boolean {
  return ELEVENLABS_VOICE_RE.test(voice);
}

/**
 * Telnyx Integration Secret identifier for ElevenLabs BYOK (not the raw API key).
 * Prefer settings-saved ref; fall back to process.env `TELNYX_ELEVENLABS_API_KEY_REF`.
 */
export function elevenLabsApiKeyRef(settingsRef?: string | null): string {
  const fromSettings = settingsRef?.trim() || "";
  if (fromSettings) return fromSettings;
  return process.env.TELNYX_ELEVENLABS_API_KEY_REF?.trim() || "";
}

export function isElevenLabsKeyRefConfigured(settingsRef?: string | null): boolean {
  return Boolean(elevenLabsApiKeyRef(settingsRef));
}

/**
 * When the Telnyx ElevenLabs secret is present, upgrade default Joanna / Fatima (and legacy
 * Hala/Zeina / remapped Ava) to known-good multilingual ElevenLabs voice ids.
 * Explicit custom Polly/Azure/ElevenLabs selections are left alone.
 */
export function maybeUpgradeToElevenLabs(
  voice: string,
  lang: "en" | "ar",
  settingsRef?: string | null,
): string {
  if (!isElevenLabsKeyRefConfigured(settingsRef)) return voice;
  if (ELEVENLABS_VOICE_RE.test(voice)) return voice;
  if (lang === "en" && AUTO_UPGRADE_EN_VOICE_RE.test(voice)) {
    return DEFAULT_ELEVENLABS_EN_VOICE;
  }
  if (lang === "ar" && AUTO_UPGRADE_AR_VOICE_RE.test(voice)) {
    return DEFAULT_ELEVENLABS_AR_VOICE;
  }
  return voice;
}

/**
 * TeXML `<Say>` extras for ElevenLabs — `api_key_ref` required by Telnyx.
 * Empty when voice is not ElevenLabs or the secret ref is missing.
 */
export function texmlElevenLabsSayAttrs(voice: string, settingsRef?: string | null): string {
  if (!ELEVENLABS_VOICE_RE.test(voice)) return "";
  const ref = elevenLabsApiKeyRef(settingsRef);
  if (!ref) return "";
  return ` api_key_ref="${ref.replace(/"/g, "&quot;")}"`;
}

/**
 * Call Control speak / gather_using_speak `language` enum (Telnyx OpenAPI).
 * Notably **missing** Gulf `ar-AE` — only MSA `arb` for Arabic.
 * Sending `ar-AE` with Azure Fatima causes invalid_enumerated_value and silent IVR.
 * Azure voice ids already embed locale (`Azure.ar-AE-FatimaNeural`), so omit language.
 */
const CALL_CONTROL_SPEAK_LANGUAGES = new Set([
  "arb",
  "cmn-CN",
  "cy-GB",
  "da-DK",
  "de-DE",
  "en-AU",
  "en-GB",
  "en-GB-WLS",
  "en-IN",
  "en-US",
  "es-ES",
  "es-MX",
  "es-US",
  "fr-CA",
  "fr-FR",
  "hi-IN",
  "is-IS",
  "it-IT",
  "ja-JP",
  "ko-KR",
  "nb-NO",
  "nl-NL",
  "pl-PL",
  "pt-BR",
  "pt-PT",
  "ro-RO",
  "ru-RU",
  "sv-SE",
  "tr-TR",
]);

/**
 * Sanitize language for Call Control Speak/Gather.
 * Polly ignores language — omit. Azure embeds locale in the voice id — omit when not in enum
 * (fixes Fatima + `ar-AE` rejects). Valid enum values pass through.
 */
export function callControlSpeakLanguage(
  voice: string,
  language: string,
): string | undefined {
  const lang = language.trim();
  if (!lang) return undefined;
  // Polly.* ignores language; omit to avoid enum surprises.
  if (/^(AWS\.)?Polly\./i.test(voice)) return undefined;
  // Azure.* embeds locale in the voice id (e.g. Azure.ar-AE-FatimaNeural).
  // Never send ar-AE — it is not in the Call Control enum and caused silent IVR.
  if (AZURE_VOICE_RE.test(voice)) return undefined;
  if (CALL_CONTROL_SPEAK_LANGUAGES.has(lang)) return lang;
  // ElevenLabs / etc. — voice id carries locale; do not send invalid enum.
  return undefined;
}

/**
 * Sanitize language for TeXML `<Say>`.
 * Polly docs ignore language; Azure voice ids embed locale — omit both so TeXML never
 * rejects Gulf `ar-AE` the way Call Control Speak did (silent Arabic after digit 2).
 * Keep language for alice / basic man|woman / ElevenLabs when a valid BCP-47 is known.
 */
export function texmlSayLanguage(voice: string, language: string): string | undefined {
  const lang = language.trim();
  if (!lang) return undefined;
  if (/^(AWS\.)?Polly\./i.test(voice)) return undefined;
  if (AZURE_VOICE_RE.test(voice)) return undefined;
  // alice / man / woman / ElevenLabs — pass through known codes only.
  if (CALL_CONTROL_SPEAK_LANGUAGES.has(lang) || lang === "en" || lang === "ar") return lang;
  return undefined;
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

export type PickSpeakVoiceOptions = {
  /** Settings or env Telnyx Integration Secret id for ElevenLabs BYOK. */
  elevenLabsApiKeyRef?: string | null;
  /**
   * When set from call metadata `ivrLanguage`, force EN/AR voice path even if
   * text detection would disagree (e.g. short AR prompts).
   */
  preferLang?: "en" | "ar";
};

/**
 * Pick Telnyx voice/language for speak / gather_using_speak.
 * With ElevenLabs secret (env or settings): Joanna/Fatima → ElevenLabs Rachel/Charlotte.
 * Without: English → Settings EN (default Polly Joanna); Arabic-majority → Settings AR
 * (default Azure Fatima) with Polly Hala/Zayd/Zeina → Fatima/Hamdan.
 * Mixed Language menus stay en-US with the EN voice.
 *
 * Note: returned `language` may be `ar-AE` (semantic / TeXML / REST). Call Control must
 * run it through {@link callControlSpeakLanguage} before Speak/Gather.
 */
export function pickSpeakVoice(
  text: string,
  configuredVoice?: string,
  configuredVoiceAr?: string,
  options?: PickSpeakVoiceOptions,
): { voice: string; language: string } {
  const configuredEn = normalizeConfiguredTtsVoice(configuredVoice);
  const arRaw = configuredVoiceAr?.trim() ?? "";
  const configuredAr = arRaw ? normalizeConfiguredTtsVoice(arRaw) : "";
  const elevenRef = options?.elevenLabsApiKeyRef;
  const elevenReady = isElevenLabsKeyRefConfigured(elevenRef);
  const preferAr = options?.preferLang === "ar" || (options?.preferLang !== "en" && isArabicText(text));

  if (!preferAr) {
    // Don't leave English prompts on an Arabic-only saved voice (e.g. Polly.Hala / Fatima).
    if (isArabicOnlyVoice(configuredEn)) {
      return {
        voice: maybeUpgradeToElevenLabs(DEFAULT_TTS_VOICE, "en", elevenRef),
        language: "en-US",
      };
    }
    // Explicit ElevenLabs without secret → safe Polly (avoid silent/failed Speak).
    if (ELEVENLABS_VOICE_RE.test(configuredEn) && !elevenReady) {
      return { voice: DEFAULT_TTS_VOICE, language: "en-US" };
    }
    return {
      voice: maybeUpgradeToElevenLabs(configuredEn, "en", elevenRef),
      language: "en-US",
    };
  }

  // Prefer explicit Arabic voice from Settings when present.
  const configured = configuredAr || configuredEn;

  if (configured === "male" || configured === "female") {
    return { voice: configured, language: DEFAULT_AR_TTS_LANGUAGE };
  }

  // Explicit ElevenLabs AR (or shared) voice — keep when secret present.
  if (ELEVENLABS_VOICE_RE.test(configured)) {
    if (!elevenReady) {
      return { voice: DEFAULT_AR_TTS_VOICE, language: DEFAULT_AR_TTS_LANGUAGE };
    }
    return { voice: configured, language: DEFAULT_AR_TTS_LANGUAGE };
  }

  // Polly Arabic (incl. Zeina MSA + saved Hala) → Azure Gulf Neural, then maybe ElevenLabs.
  if (LEGACY_AR_POLLY_VOICE_RE.test(configured) || MSA_ARABIC_VOICE_RE.test(configured)) {
    const azure = upgradeArabicPollyToAzure(configured);
    return {
      voice: maybeUpgradeToElevenLabs(azure, "ar", elevenRef),
      language: DEFAULT_AR_TTS_LANGUAGE,
    };
  }

  if (isArabicCapableVoice(configured)) {
    // EN Azure / Polly must not speak Arabic menus — switch to Fatima
    // (unless an explicit AR voice was configured separately).
    if (
      !configuredAr &&
      !isArabicOnlyVoice(configured) &&
      configured !== "male" &&
      configured !== "female"
    ) {
      if (/^Azure\.en[-_]/i.test(configured) || /^(AWS\.)?Polly\./i.test(configured)) {
        return {
          voice: maybeUpgradeToElevenLabs(DEFAULT_AR_TTS_VOICE, "ar", elevenRef),
          language: DEFAULT_AR_TTS_LANGUAGE,
        };
      }
    }
    return {
      voice: maybeUpgradeToElevenLabs(configured, "ar", elevenRef),
      language: arabicTtsLanguageForVoice(configured),
    };
  }

  return {
    voice: maybeUpgradeToElevenLabs(DEFAULT_AR_TTS_VOICE, "ar", elevenRef),
    language: DEFAULT_AR_TTS_LANGUAGE,
  };
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

/**
 * Known-good Polly/Azure fallback when preferred voice (incl. ElevenLabs) fails.
 * Always Joanna (EN) / Fatima (AR) — never leave the caller in silence.
 * Honors preferLang so short Arabic prompts after digit 2 still retry Fatima.
 */
export function fallbackSpeakVoice(
  text: string,
  preferLang?: "en" | "ar",
): { voice: string; language: string } {
  const preferAr =
    preferLang === "ar" || (preferLang !== "en" && isArabicText(text));
  if (preferAr) {
    return { voice: FALLBACK_AR_TTS_VOICE, language: DEFAULT_AR_TTS_LANGUAGE };
  }
  return { voice: FALLBACK_EN_TTS_VOICE, language: "en-US" };
}
