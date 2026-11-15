import "server-only";

import { pickSpeakVoice } from "./ivr-tts-voice";
import { clipTtsPreviewText, toRestTtsVoiceId } from "./tts-preview-voice";

export { clipTtsPreviewText, toRestTtsVoiceId, TTS_PREVIEW_FALLBACK_TEXT } from "./tts-preview-voice";

const TELNYX_TTS_URL = "https://api.telnyx.com/v2/text-to-speech/speech";

export async function synthesizeTelnyxTtsPreview(input: {
  apiKey: string;
  voice: string;
  text: string;
}): Promise<{ contentType: string; dataBase64: string }> {
  const sample = clipTtsPreviewText(input.text);
  const { language } = pickSpeakVoice(sample, input.voice);
  const restVoice = toRestTtsVoiceId(input.voice);

  const response = await fetch(TELNYX_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg, application/json",
    },
    body: JSON.stringify({
      text: sample,
      voice: restVoice,
      language,
      output_type: "base64_output",
    }),
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const json = (await response.json()) as {
        errors?: Array<{ detail?: string; title?: string }>;
        message?: string;
      };
      detail =
        json.errors?.[0]?.detail ||
        json.errors?.[0]?.title ||
        json.message ||
        detail;
    } catch {
      /* ignore */
    }
    throw new Error(`Telnyx voice preview failed: ${detail}`);
  }

  if (contentType.includes("application/json")) {
    const json = (await response.json()) as {
      data?: { audio_base64?: string; content_type?: string; base64?: string };
      audio_base64?: string;
      base64?: string;
      content_type?: string;
    };
    const dataBase64 =
      json.data?.audio_base64 ||
      json.data?.base64 ||
      json.audio_base64 ||
      json.base64 ||
      "";
    if (!dataBase64) {
      throw new Error("Telnyx voice preview returned empty audio.");
    }
    return {
      contentType: json.data?.content_type || json.content_type || "audio/mpeg",
      dataBase64: dataBase64.replace(/\s/g, ""),
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 32) {
    throw new Error("Telnyx voice preview returned empty audio.");
  }
  return {
    contentType: contentType.startsWith("audio/") ? contentType : "audio/mpeg",
    dataBase64: buffer.toString("base64"),
  };
}
