import { describe, expect, it } from "vitest";

import {
  CHAT_ATTACHMENT_MAX_PER_MESSAGE,
  CHAT_ATTACHMENT_RATE_PER_MINUTE,
  CHAT_IMAGE_DOCUMENT_MAX_BYTES,
  CHAT_VIDEO_MAX_BYTES,
  chatAttachmentByteLimit,
  chatAttachmentCaptionIssue,
  chatAttachmentCountAllowed,
  chatAttachmentFits,
  chatAttachmentMagicMatches,
  CHAT_VOICE_NOTE_MAX_MS,
  chatAttachmentObjectPath,
  chatMessageTypeForMimes,
  chatPreparedAttachment,
  chatVoiceNoteMessageType,
  chatVoiceNoteShouldStop,
  chatVoiceRecorderChoice,
  sanitizeChatFilename,
} from "./attachment-rules";

function bytesOf(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const GIF = bytesOf("GIF89a");
const WEBP = bytesOf("RIFF....WEBP");
const PDF = bytesOf("%PDF-1.7");
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14]);
const OLE = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const MP4 = Uint8Array.from([0x00, 0x00, 0x00, 0x18, ..."ftypisom".split("").map((char) => char.charCodeAt(0))]);
const WEBM = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]);
const WAV = bytesOf("RIFF....WAVE");
const MP3 = bytesOf("ID3");
const TEXT = bytesOf("shift notes, line 2");

const conversationId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";

describe("chat attachment mime and magic bytes", () => {
  it("accepts allowlisted signatures and rejects declared mismatches", () => {
    expect(chatAttachmentMagicMatches("image/png", PNG)).toBe(true);
    expect(chatAttachmentMagicMatches("image/jpeg", JPEG)).toBe(true);
    expect(chatAttachmentMagicMatches("image/gif", GIF)).toBe(true);
    expect(chatAttachmentMagicMatches("image/webp", WEBP)).toBe(true);
    expect(chatAttachmentMagicMatches("application/pdf", PDF)).toBe(true);
    expect(chatAttachmentMagicMatches("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ZIP)).toBe(
      true,
    );
    expect(chatAttachmentMagicMatches("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ZIP)).toBe(true);
    expect(chatAttachmentMagicMatches("application/msword", OLE)).toBe(true);
    expect(chatAttachmentMagicMatches("application/vnd.ms-excel", OLE)).toBe(true);
    expect(chatAttachmentMagicMatches("video/mp4", MP4)).toBe(true);
    expect(chatAttachmentMagicMatches("video/quicktime", MP4)).toBe(true);
    expect(chatAttachmentMagicMatches("audio/mp4", MP4)).toBe(true);
    expect(chatAttachmentMagicMatches("video/webm", WEBM)).toBe(true);
    expect(chatAttachmentMagicMatches("audio/webm", WEBM)).toBe(true);
    expect(chatAttachmentMagicMatches("audio/wav", WAV)).toBe(true);
    expect(chatAttachmentMagicMatches("audio/mpeg", MP3)).toBe(true);
    expect(chatAttachmentMagicMatches("audio/mp3", MP3)).toBe(true);
    expect(chatAttachmentMagicMatches("text/plain", TEXT)).toBe(true);
    expect(chatAttachmentMagicMatches("text/csv", TEXT)).toBe(true);

    expect(chatAttachmentMagicMatches("image/png", JPEG)).toBe(false);
    expect(chatAttachmentMagicMatches("image/jpeg", PNG)).toBe(false);
    expect(chatAttachmentMagicMatches("image/gif", PDF)).toBe(false);
    expect(chatAttachmentMagicMatches("image/webp", WAV)).toBe(false);
    expect(chatAttachmentMagicMatches("application/pdf", PNG)).toBe(false);
    expect(chatAttachmentMagicMatches("application/vnd.openxmlformats-officedocument.wordprocessingml.document", PDF)).toBe(
      false,
    );
    expect(chatAttachmentMagicMatches("video/mp4", WEBM)).toBe(false);
    expect(chatAttachmentMagicMatches("video/webm", MP4)).toBe(false);
    expect(chatAttachmentMagicMatches("audio/wav", WEBP)).toBe(false);
    expect(chatAttachmentMagicMatches("text/plain", PNG)).toBe(false);
    expect(chatAttachmentMagicMatches("text/plain", Uint8Array.from([0x68, 0x00, 0x69]))).toBe(false);
    expect(chatAttachmentMagicMatches("application/x-msdownload", ZIP)).toBe(false);
    expect(chatAttachmentMagicMatches("image/png", new Uint8Array())).toBe(false);
  });

  it("does not trust a mismatched image that only has an image extension", () => {
    const prepared = chatPreparedAttachment({ fileType: "image/png", bytes: JPEG, filename: "photo.png" });
    expect(prepared).toEqual({ ok: false, issue: "magic" });
    expect(chatPreparedAttachment({ fileType: "", bytes: PNG, filename: "x.bin" })).toMatchObject({
      ok: true,
      mimeType: "image/png",
    });
  });
});

describe("chat attachment size caps", () => {
  it("caps images, documents, and audio at 10 MB and video at the 25 MB table cap", () => {
    expect(chatAttachmentByteLimit("image/png")).toBe(CHAT_IMAGE_DOCUMENT_MAX_BYTES);
    expect(chatAttachmentByteLimit("application/pdf")).toBe(CHAT_IMAGE_DOCUMENT_MAX_BYTES);
    expect(chatAttachmentByteLimit("audio/mpeg")).toBe(CHAT_IMAGE_DOCUMENT_MAX_BYTES);
    expect(chatAttachmentByteLimit("video/mp4")).toBe(CHAT_VIDEO_MAX_BYTES);
    expect(CHAT_VIDEO_MAX_BYTES).toBe(26_214_400);
    expect(chatAttachmentFits("application/pdf", CHAT_IMAGE_DOCUMENT_MAX_BYTES)).toBe(true);
    expect(chatAttachmentFits("application/pdf", CHAT_IMAGE_DOCUMENT_MAX_BYTES + 1)).toBe(false);
    expect(chatAttachmentFits("image/jpeg", CHAT_VIDEO_MAX_BYTES)).toBe(false);
    expect(chatAttachmentFits("video/mp4", CHAT_VIDEO_MAX_BYTES)).toBe(true);
    expect(chatAttachmentFits("video/mp4", CHAT_VIDEO_MAX_BYTES + 1)).toBe(false);
    expect(chatAttachmentFits("video/webm", 0)).toBe(false);
    expect(chatPreparedAttachment({ fileType: "text/plain", bytes: TEXT, filename: "notes.txt" })).toMatchObject({
      ok: true,
      mimeType: "text/plain",
    });
  });
});

describe("chat attachment filenames and counts", () => {
  it("strips paths and html, caps length, and allows at most 5 files", () => {
    expect(sanitizeChatFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeChatFilename("C:\\Users\\a\\report.pdf")).toBe("report.pdf");
    expect(sanitizeChatFilename("<script>alert(1)</script>")).toBe("script");
    expect(sanitizeChatFilename("<b>note</b>.txt")).not.toMatch(/[<>]/);
    expect(sanitizeChatFilename("   ")).toBe("file");
    expect(sanitizeChatFilename("..")).toBe("file");
    expect(Array.from(sanitizeChatFilename(`${"a".repeat(300)}.pdf`)).length).toBe(255);
    expect(chatAttachmentObjectPath(conversationId, objectId)).toBe(`${conversationId}/${objectId}`);
    expect(chatAttachmentObjectPath("../x", objectId)).toBeNull();
    expect(chatAttachmentObjectPath(conversationId, "..")).toBeNull();

    expect(CHAT_ATTACHMENT_MAX_PER_MESSAGE).toBe(5);
    expect(CHAT_ATTACHMENT_RATE_PER_MINUTE).toBe(10);
    expect(chatAttachmentCountAllowed(1)).toBe(true);
    expect(chatAttachmentCountAllowed(5)).toBe(true);
    expect(chatAttachmentCountAllowed(0)).toBe(false);
    expect(chatAttachmentCountAllowed(6)).toBe(false);
    expect(chatMessageTypeForMimes(["image/png"])).toBe("IMAGE");
    expect(chatMessageTypeForMimes(["image/jpeg", "image/png"])).toBe("IMAGE");
    expect(chatMessageTypeForMimes(["video/mp4"])).toBe("VIDEO");
    expect(chatMessageTypeForMimes(["audio/mpeg"])).toBe("AUDIO");
    expect(chatMessageTypeForMimes(["application/pdf"])).toBe("DOCUMENT");
    expect(chatMessageTypeForMimes(["image/png", "application/pdf"])).toBe("DOCUMENT");
    expect(chatMessageTypeForMimes(["image/png", "image/png", "image/png", "image/png", "image/png", "image/png"])).toBe(
      null,
    );
  });

  it("accepts a recorded voice note and rejects a renamed non-audio file", () => {
    expect(CHAT_VOICE_NOTE_MAX_MS).toBe(180_000);
    expect(chatVoiceNoteShouldStop(179_999)).toBe(false);
    expect(chatVoiceNoteShouldStop(CHAT_VOICE_NOTE_MAX_MS)).toBe(true);
    expect(chatVoiceNoteShouldStop(Number.NaN)).toBe(false);
    expect(
      chatVoiceRecorderChoice((mime) => mime === "audio/webm;codecs=opus" || mime === "audio/mp4"),
    ).toEqual({
      mediaType: "audio/webm;codecs=opus",
      mimeType: "audio/webm",
      filename: "voice-note.webm",
    });
    expect(chatVoiceRecorderChoice((mime) => mime === "audio/webm")).toMatchObject({
      mediaType: "audio/webm",
      filename: "voice-note.webm",
    });
    expect(chatVoiceRecorderChoice((mime) => mime === "audio/mp4")).toEqual({
      mediaType: "audio/mp4",
      mimeType: "audio/mp4",
      filename: "voice-note.m4a",
    });
    expect(chatVoiceRecorderChoice(() => false)).toBeNull();
    expect(chatVoiceNoteMessageType(["audio/webm"])).toBe("VOICE_NOTE");
    expect(chatVoiceNoteMessageType(["audio/mp4"])).toBe("VOICE_NOTE");
    expect(chatVoiceNoteMessageType(["audio/webm;codecs=opus"])).toBe("VOICE_NOTE");
    expect(chatVoiceNoteMessageType(["audio/mpeg"])).toBeNull();
    expect(chatVoiceNoteMessageType(["audio/webm", "audio/mp4"])).toBeNull();
    expect(chatVoiceNoteMessageType(["application/pdf"])).toBeNull();
    expect(chatPreparedAttachment({ fileType: "audio/webm", bytes: WEBM, filename: "voice-note.webm" })).toMatchObject({
      ok: true,
      mimeType: "audio/webm",
      filename: "voice-note.webm",
    });
    expect(chatPreparedAttachment({ fileType: "audio/mp4", bytes: MP4, filename: "voice-note.m4a" })).toMatchObject({
      ok: true,
      mimeType: "audio/mp4",
      filename: "voice-note.m4a",
    });
    expect(chatPreparedAttachment({ fileType: "audio/webm", bytes: PNG, filename: "voice-note.webm" })).toEqual({
      ok: false,
      issue: "magic",
    });
    expect(chatPreparedAttachment({ fileType: "audio/mp4", bytes: PDF, filename: "voice-note.m4a" })).toEqual({
      ok: false,
      issue: "magic",
    });
    expect(chatAttachmentFits("audio/webm", CHAT_IMAGE_DOCUMENT_MAX_BYTES)).toBe(true);
    expect(chatAttachmentFits("audio/webm", CHAT_IMAGE_DOCUMENT_MAX_BYTES + 1)).toBe(false);
    expect(chatAttachmentFits("audio/mp4", CHAT_IMAGE_DOCUMENT_MAX_BYTES + 1)).toBe(false);
  });

  it("allows an empty caption and rejects html", () => {
    expect(chatAttachmentCaptionIssue("  ")).toBeNull();
    expect(chatAttachmentCaptionIssue("see attached")).toBeNull();
    expect(chatAttachmentCaptionIssue("<i>x</i>")).toBe("html");
    expect(chatAttachmentCaptionIssue("a".repeat(8001))).toBe("long");
  });
});
