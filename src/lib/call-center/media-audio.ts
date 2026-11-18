/** Call Center welcome / hold audio uploads (Supabase public bucket for Telnyx fetch). */

export const CALL_CENTER_MEDIA_BUCKET = "call-center-media";
export const CALL_CENTER_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export const CALL_CENTER_AUDIO_KINDS = ["welcome", "hold", "ivr", "bridge"] as const;
export type CallCenterAudioKind = (typeof CALL_CENTER_AUDIO_KINDS)[number];

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
};

const ALLOWED_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
]);

export function normalizeCallCenterAudioMime(
  contentType: string | null | undefined,
  filename: string,
): string {
  const raw = (contentType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  if (ALLOWED_AUDIO_MIMES.has(raw)) {
    if (raw === "audio/mp3") return "audio/mpeg";
    if (raw === "audio/x-wav" || raw === "audio/wave") return "audio/wav";
    if (raw === "audio/x-m4a" || raw === "audio/m4a") return "audio/mp4";
    return raw;
  }
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const fromExt = AUDIO_MIME_BY_EXT[ext];
  if (fromExt) return fromExt;
  throw new Error("Audio must be MP3, WAV, or M4A.");
}

export function extensionForCallCenterAudioMime(mime: string): string {
  if (mime === "audio/mpeg" || mime === "audio/mp3") return "mp3";
  if (mime === "audio/wav" || mime === "audio/x-wav" || mime === "audio/wave") return "wav";
  if (mime === "audio/mp4" || mime === "audio/x-m4a" || mime === "audio/m4a") return "m4a";
  if (mime === "audio/aac") return "aac";
  return "mp3";
}

export function sanitizeCallCenterAudioFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() || "audio";
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "audio";
}

export function callCenterMediaStoragePath(kind: CallCenterAudioKind, filename: string, mime: string): string {
  const safe = sanitizeCallCenterAudioFilename(filename);
  const hasExt = /\.(mp3|wav|m4a|aac)$/i.test(safe);
  const withExt = hasExt ? safe : `${safe}.${extensionForCallCenterAudioMime(mime)}`;
  return `audio/${kind}/${Date.now()}-${withExt}`;
}
