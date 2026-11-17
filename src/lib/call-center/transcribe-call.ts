import { isUsableRecordingUrl } from "./recording-url";
import type { CallCenterCall } from "./types";

export type TranscriptGenerateSource = "whisper" | "ai_history" | "cdr_summary";

export type TranscriptGenerateResult = {
  text: string;
  status: "final" | "stub";
  source: TranscriptGenerateSource;
  message: string;
};

export { isUsableRecordingUrl };

function metaOf(call: CallCenterCall): Record<string, unknown> {
  return (call.metadata as Record<string, unknown> | null) ?? {};
}

export function formatAiHistoryTranscript(call: CallCenterCall): string | null {
  const history = metaOf(call).aiHistory;
  if (!Array.isArray(history) || history.length === 0) return null;
  const lines: string[] = [];
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const trimmed = content.trim();
    if (!trimmed) continue;
    const label = role === "user" ? "Caller" : "Agent";
    lines.push(`${label}: ${trimmed}`);
  }
  return lines.length > 0 ? lines.join("\n\n") : null;
}

export function buildCdrSummaryTranscript(call: CallCenterCall): string {
  const hasRecording = isUsableRecordingUrl(call.recordingUrl);
  const flagged = call.recordingEnabled && !hasRecording;
  const reasons: string[] = [];
  if (call.direction === "internal_test" || call.provider === "test") {
    reasons.push(
      "This was an internal test ring. Speech-to-text needs a LiveKit recording of the softphone room.",
    );
  }
  if (!hasRecording && !call.recordingEnabled) {
    reasons.push(
      "No recording was captured. Turn Recording on during the call (softphone) so LiveKit egress can store audio, then Generate again.",
    );
  } else if (flagged) {
    reasons.push(
      "Recording was flagged but no playable media URL is stored yet (egress still pending or storage not configured).",
    );
  }
  if (reasons.length === 0) {
    reasons.push("No speech-to-text provider could produce a transcript for this call.");
  }

  return [
    `[Call summary — ${new Date().toISOString()}]`,
    `Direction: ${call.direction}`,
    `Provider: ${call.provider}`,
    `From: ${call.fromE164 || "—"}`,
    `To: ${call.toE164 || "—"}`,
    `Status: ${call.status}`,
    call.talkSeconds != null ? `Talk time: ${call.talkSeconds}s` : "Talk time: —",
    call.transferType
      ? `Transfer: ${call.transferType} → ${call.transferTarget}`
      : "Transfer: none",
    "",
    ...reasons,
  ].join("\n");
}

async function resolveOpenAiKey(): Promise<string | null> {
  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) return envKey;
  try {
    const { loadSettingsRow } = await import("./db");
    const settings = await loadSettingsRow();
    const fromSettings = settings?.ai_api_key?.trim() ?? "";
    if (
      fromSettings &&
      (settings?.ai_provider === "openai" ||
        settings?.ai_provider === "openai_compatible" ||
        Boolean(settings?.ai_base_url?.trim()))
    ) {
      return fromSettings;
    }
  } catch {
    // Settings optional for env-only Whisper.
  }
  return null;
}

async function resolveTranscriptionEndpoint(): Promise<{ url: string; key: string } | null> {
  const key = await resolveOpenAiKey();
  if (!key) return null;
  try {
    const { loadSettingsRow } = await import("./db");
    const settings = await loadSettingsRow();
    const base = settings?.ai_base_url?.trim().replace(/\/+$/, "") ?? "";
    if (base && (settings?.ai_provider === "openai_compatible" || settings?.ai_provider === "openai")) {
      return { url: `${base}/audio/transcriptions`, key };
    }
  } catch {
    // Fall through to OpenAI public API.
  }
  return { url: "https://api.openai.com/v1/audio/transcriptions", key };
}

/**
 * Fetch call recording and run Whisper (OpenAI or compatible).
 * Throws with a clear message when STT is configured but fails.
 */
export async function transcribeRecordingUrl(recordingUrl: string): Promise<string> {
  if (!isUsableRecordingUrl(recordingUrl)) {
    throw new Error("Recording URL is missing or not playable.");
  }
  const endpoint = await resolveTranscriptionEndpoint();
  if (!endpoint) {
    throw new Error(
      "Speech-to-text is not configured. Set OPENAI_API_KEY (or Call Center AI OpenAI key) to transcribe recordings.",
    );
  }

  const audioRes = await fetch(recordingUrl, { redirect: "follow" });
  if (!audioRes.ok) {
    throw new Error(`Could not download recording (${audioRes.status}).`);
  }
  const contentType = audioRes.headers.get("content-type") || "audio/mpeg";
  const bytes = await audioRes.arrayBuffer();
  if (bytes.byteLength < 256) {
    throw new Error("Recording file is empty or too short to transcribe.");
  }

  const ext = contentType.includes("wav")
    ? "wav"
    : contentType.includes("mp4") || contentType.includes("m4a")
      ? "m4a"
      : contentType.includes("ogg")
        ? "ogg"
        : contentType.includes("webm")
          ? "webm"
          : "mp3";

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentType }), `recording.${ext}`);
  form.append("model", "whisper-1");
  form.append("response_format", "text");

  const sttRes = await fetch(endpoint.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${endpoint.key}` },
    body: form,
  });
  if (!sttRes.ok) {
    const detail = (await sttRes.text().catch(() => "")).slice(0, 240);
    throw new Error(
      detail
        ? `Whisper transcription failed (${sttRes.status}): ${detail}`
        : `Whisper transcription failed (${sttRes.status}).`,
    );
  }

  const text = (await sttRes.text()).trim();
  if (!text) throw new Error("Whisper returned an empty transcript.");
  return text;
}

/**
 * Build the best available transcript for a call.
 * Prefer Whisper on a real recording, then AI session history, then a CDR summary.
 */
export async function generateCallTranscriptContent(
  call: CallCenterCall,
): Promise<TranscriptGenerateResult> {
  if (isUsableRecordingUrl(call.recordingUrl)) {
    try {
      const text = await transcribeRecordingUrl(call.recordingUrl);
      return {
        text,
        status: "final",
        source: "whisper",
        message: "Transcript generated from the call recording (Whisper).",
      };
    } catch (e) {
      // If STT is configured but fails, surface that — do not hide behind a stub.
      const msg = e instanceof Error ? e.message : "Transcription failed.";
      if (/not configured/i.test(msg)) {
        // Fall through to AI history / CDR summary when Whisper is unavailable.
      } else {
        throw e;
      }
    }
  }

  const fromAi = formatAiHistoryTranscript(call);
  if (fromAi) {
    return {
      text: fromAi,
      status: "final",
      source: "ai_history",
      message: "Transcript filled from the AI session conversation.",
    };
  }

  return {
    text: buildCdrSummaryTranscript(call),
    status: "stub",
    source: "cdr_summary",
    message: isUsableRecordingUrl(call.recordingUrl)
      ? "Recording found but speech-to-text is not configured; saved a CDR summary instead."
      : "No playable recording on this call; saved a CDR summary. Enable Recording during the call for speech transcripts.",
  };
}
