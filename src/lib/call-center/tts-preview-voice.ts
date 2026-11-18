import { normalizeConfiguredTtsVoice } from "./ivr-tts-voice";

/** Short sample when TTS greeting text is empty. */
export const TTS_PREVIEW_FALLBACK_TEXT =
  "Welcome. Thank you for calling. This is a sample of the selected voice.";

/**
 * Map Call Control speak voice ids to Telnyx REST TTS voice ids.
 * Call Control / TeXML use `Azure.*` / `Polly.*`; REST Polly needs `AWS.Polly.*`
 * (capital AWS). Lowercase `aws.Polly.*` returns HTTP 500 from Telnyx.
 * EN Polly Joanna is normalized to Azure Ava before this mapping runs.
 */
export function toRestTtsVoiceId(callControlVoice: string): string {
  const voice = normalizeConfiguredTtsVoice(callControlVoice);
  if (voice === "female") return "Telnyx.KokoroTTS.af_heart";
  if (voice === "male") return "Telnyx.KokoroTTS.am_adam";
  if (voice.startsWith("Polly.")) return `AWS.${voice}`;
  if (voice.startsWith("aws.Polly.")) return `AWS.Polly.${voice.slice("aws.Polly.".length)}`;
  if (voice.startsWith("AWS.Polly.")) return voice;
  return voice;
}

export function clipTtsPreviewText(text: string, max = 280): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return TTS_PREVIEW_FALLBACK_TEXT;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}
