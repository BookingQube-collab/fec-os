/**
 * Pure attachment rules for chat. Postgres remains authoritative for membership,
 * scan_status, and the 25 MiB column cap. These checks run before an object is
 * written so other members never see an unvalidated file.
 *
 * Voice notes use the same audio allowlist and 10 MB cap. Recording lives in the
 * composer. This module only chooses the mime and checks the bytes.
 */
import { CHAT_TEXT_BODY_MAX } from "@/lib/chat/message-rules";

export const CHAT_ATTACHMENT_MAX_PER_MESSAGE = 5;
export const CHAT_ATTACHMENT_RATE_PER_MINUTE = 10;
export const CHAT_ATTACHMENT_URL_SECONDS = 600;
export const CHAT_ATTACHMENT_BUCKET = "chat-attachments";
export const CHAT_THREAD_MESSAGE_TYPES = [
  "TEXT",
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "VOICE_NOTE",
  "DOCUMENT",
  "FEC_ENTITY",
  "ANNOUNCEMENT",
  "POLL",
] as const;
export const CHAT_VOICE_NOTE_MAX_MS = 3 * 60 * 1000;
export const CHAT_IMAGE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_VIDEO_MAX_BYTES = 26_214_400;

const HTML_TAG = /<\/?[a-z][^>]*>/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "audio/mp3": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "video/mov": "video/quicktime",
};

const ALLOWED_MIME = {
  "application/pdf": "document",
  "text/plain": "document",
  "text/csv": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/wav": "audio",
  "audio/webm": "audio",
} as const;

export type ChatAttachmentKind = (typeof ALLOWED_MIME)[keyof typeof ALLOWED_MIME];
export type ChatAttachmentMessageType = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
export type ChatAttachmentIssue = "type" | "magic" | "large" | "empty";

const MESSAGE_TYPE: Record<ChatAttachmentKind, ChatAttachmentMessageType> = {
  image: "IMAGE",
  video: "VIDEO",
  audio: "AUDIO",
  document: "DOCUMENT",
};

export function chatCanonicalAttachmentMime(mimeType: string): string | null {
  const base = mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const canonical = MIME_ALIASES[base] ?? base;
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_MIME, canonical)) return null;
  return canonical;
}

export function chatAttachmentKind(mimeType: string): ChatAttachmentKind | null {
  const canonical = chatCanonicalAttachmentMime(mimeType);
  if (!canonical) return null;
  return ALLOWED_MIME[canonical as keyof typeof ALLOWED_MIME];
}

export function chatAttachmentByteLimit(mimeType: string): number | null {
  const kind = chatAttachmentKind(mimeType);
  if (!kind) return null;
  if (kind === "video") return CHAT_VIDEO_MAX_BYTES;
  return CHAT_IMAGE_DOCUMENT_MAX_BYTES;
}

export function chatAttachmentFits(mimeType: string, byteSize: number): boolean {
  const limit = chatAttachmentByteLimit(mimeType);
  if (limit == null || !Number.isFinite(byteSize)) return false;
  return byteSize > 0 && byteSize <= limit;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) return false;
  }
  return true;
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

function isPng(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function isJpeg(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0xff, 0xd8, 0xff]);
}

function isGif(bytes: Uint8Array): boolean {
  return asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a");
}

function isWebp(bytes: Uint8Array): boolean {
  return asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP");
}

function isZip(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
  );
}

function isOle(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
}

function isPdf(bytes: Uint8Array): boolean {
  return asciiAt(bytes, 0, "%PDF");
}

function isFtyp(bytes: Uint8Array): boolean {
  return asciiAt(bytes, 4, "ftyp");
}

function isEbml(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
}

function isWav(bytes: Uint8Array): boolean {
  return asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WAVE");
}

function isMpegAudio(bytes: Uint8Array): boolean {
  if (asciiAt(bytes, 0, "ID3")) return true;
  if (bytes.length < 2 || bytes[0] !== 0xff) return false;
  return (bytes[1] & 0xe0) === 0xe0;
}

function isKnownImage(bytes: Uint8Array): boolean {
  return isPng(bytes) || isJpeg(bytes) || isGif(bytes) || isWebp(bytes);
}

function isPlainText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  if (isKnownImage(bytes) || isPdf(bytes) || isZip(bytes) || isOle(bytes) || isEbml(bytes)) return false;
  if (asciiAt(bytes, 0, "RIFF") || isFtyp(bytes)) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte === 9 || byte === 10 || byte === 13) continue;
    if (byte < 32) return false;
  }
  return true;
}

/** True when the bytes match the declared allowlisted type. Extension is ignored. */
export function chatAttachmentMagicMatches(mimeType: string, bytes: Uint8Array): boolean {
  const canonical = chatCanonicalAttachmentMime(mimeType);
  if (!canonical || bytes.length === 0) return false;
  switch (canonical) {
    case "image/png":
      return isPng(bytes);
    case "image/jpeg":
      return isJpeg(bytes);
    case "image/gif":
      return isGif(bytes);
    case "image/webp":
      return isWebp(bytes);
    case "application/pdf":
      return isPdf(bytes);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return isZip(bytes);
    case "application/msword":
    case "application/vnd.ms-excel":
      return isOle(bytes);
    case "video/mp4":
    case "video/quicktime":
    case "audio/mp4":
      return isFtyp(bytes);
    case "video/webm":
    case "audio/webm":
      return isEbml(bytes);
    case "audio/wav":
      return isWav(bytes);
    case "audio/mpeg":
      return isMpegAudio(bytes);
    case "text/plain":
    case "text/csv":
      return isPlainText(bytes);
    default:
      return false;
  }
}

/** Used only when the browser did not supply an allowlisted type. Office zips stay ambiguous. */
export function chatMimeFromMagic(bytes: Uint8Array): string | null {
  if (isPng(bytes)) return "image/png";
  if (isJpeg(bytes)) return "image/jpeg";
  if (isGif(bytes)) return "image/gif";
  if (isWebp(bytes)) return "image/webp";
  if (isPdf(bytes)) return "application/pdf";
  if (isWav(bytes)) return "audio/wav";
  if (isEbml(bytes)) return "video/webm";
  if (isFtyp(bytes)) return "video/mp4";
  if (isMpegAudio(bytes)) return "audio/mpeg";
  if (isPlainText(bytes)) return "text/plain";
  return null;
}

export function sanitizeChatFilename(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base
    .replace(/[<>/\\]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const capped = Array.from(cleaned).slice(0, 255).join("");
  if (!capped || capped === "." || capped === "..") return "file";
  return capped;
}

export function chatAttachmentObjectPath(conversationId: string, objectId: string): string | null {
  if (!UUID_RE.test(conversationId) || !UUID_RE.test(objectId)) return null;
  return `${conversationId.toLowerCase()}/${objectId.toLowerCase()}`;
}

export function chatAttachmentCountAllowed(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= CHAT_ATTACHMENT_MAX_PER_MESSAGE;
}

const VOICE_RECORD_WEBM_OPUS = "audio/webm;codecs=opus";
const VOICE_RECORD_WEBM = "audio/webm";
const VOICE_RECORD_MP4 = "audio/mp4";

/** Prefer Opus in WebM. Fall back to audio/mp4. Null when the browser can record neither. */
export function chatVoiceRecorderChoice(isSupported: (mime: string) => boolean): {
  mediaType: string;
  mimeType: "audio/webm" | "audio/mp4";
  filename: "voice-note.webm" | "voice-note.m4a";
} | null {
  if (isSupported(VOICE_RECORD_WEBM_OPUS) || isSupported(VOICE_RECORD_WEBM)) {
    return {
      mediaType: isSupported(VOICE_RECORD_WEBM_OPUS) ? VOICE_RECORD_WEBM_OPUS : VOICE_RECORD_WEBM,
      mimeType: "audio/webm",
      filename: "voice-note.webm",
    };
  }
  if (isSupported(VOICE_RECORD_MP4)) {
    return { mediaType: VOICE_RECORD_MP4, mimeType: "audio/mp4", filename: "voice-note.m4a" };
  }
  return null;
}

/** True once the recording has reached the 3 minute limit and must stop. */
export function chatVoiceNoteShouldStop(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= CHAT_VOICE_NOTE_MAX_MS;
}

/** One audio/webm or audio/mp4 attachment. Other files stay on the normal attachment type. */
export function chatVoiceNoteMessageType(mimeTypes: readonly string[]): "VOICE_NOTE" | null {
  if (mimeTypes.length !== 1) return null;
  const canonical = chatCanonicalAttachmentMime(mimeTypes[0] ?? "");
  if (canonical !== "audio/webm" && canonical !== "audio/mp4") return null;
  return "VOICE_NOTE";
}

export function chatMessageTypeForMimes(mimeTypes: readonly string[]): ChatAttachmentMessageType | null {
  if (!chatAttachmentCountAllowed(mimeTypes.length)) return null;
  const types = mimeTypes.map((mime) => {
    const kind = chatAttachmentKind(mime);
    return kind ? MESSAGE_TYPE[kind] : null;
  });
  if (types.some((type) => type == null)) return null;
  const first = types[0];
  if (!first) return null;
  return types.every((type) => type === first) ? first : "DOCUMENT";
}

/** Empty caption is allowed. HTML and over-long captions are not. */
export function chatAttachmentCaptionIssue(body: string): "long" | "html" | null {
  const trimmed = body.trim();
  if (trimmed.length === 0) return null;
  if (Array.from(trimmed).length > CHAT_TEXT_BODY_MAX) return "long";
  if (HTML_TAG.test(trimmed)) return "html";
  return null;
}

export function chatPreparedAttachment(input: {
  fileType: string;
  bytes: Uint8Array;
  filename: string;
}): { ok: true; mimeType: string; filename: string } | { ok: false; issue: ChatAttachmentIssue } {
  if (input.bytes.length === 0) return { ok: false, issue: "empty" };
  const mimeType = chatCanonicalAttachmentMime(input.fileType) ?? chatMimeFromMagic(input.bytes);
  if (!mimeType) return { ok: false, issue: "type" };
  if (!chatAttachmentFits(mimeType, input.bytes.length)) return { ok: false, issue: "large" };
  if (!chatAttachmentMagicMatches(mimeType, input.bytes)) return { ok: false, issue: "magic" };
  return { ok: true, mimeType, filename: sanitizeChatFilename(input.filename) };
}

export function formatChatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${Math.trunc(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function encodeChatBytesBase64(bytes: Uint8Array): string {
  let binary = "";
  const stride = 0x4000;
  for (let index = 0; index < bytes.length; index += stride) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + stride, bytes.length)));
  }
  return btoa(binary);
}
