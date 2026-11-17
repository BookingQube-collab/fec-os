import { describe, expect, it } from "vitest";

import {
  buildCallRecordingPublicUrl,
  isGuessedLiveKitRecordingUrl,
  isUsableRecordingUrl,
} from "./recording-url";

describe("buildCallRecordingPublicUrl", () => {
  it("prefers storage base URL", () => {
    expect(buildCallRecordingPublicUrl("https://cdn.example.com/rec/", "abc")).toBe(
      "https://cdn.example.com/rec/call-center/abc.mp4",
    );
  });

  it("uses placeholder when storage base is missing", () => {
    expect(buildCallRecordingPublicUrl("", "abc")).toBe(
      "https://recordings.example/fec/cc/abc.mp4",
    );
  });
});

describe("isGuessedLiveKitRecordingUrl", () => {
  it("detects LiveKit Cloud /recordings paths", () => {
    expect(
      isGuessedLiveKitRecordingUrl("https://proj.livekit.cloud/recordings/call-center/abc.mp4"),
    ).toBe(true);
  });

  it("ignores real CDN hosts", () => {
    expect(isGuessedLiveKitRecordingUrl("https://cdn.example.org/call-center/abc.mp4")).toBe(false);
  });
});

describe("isUsableRecordingUrl", () => {
  it("rejects empty, placeholder, and guessed LiveKit paths", () => {
    expect(isUsableRecordingUrl("")).toBe(false);
    expect(isUsableRecordingUrl("https://recordings.example/fec/cc/x.mp4")).toBe(false);
    expect(isUsableRecordingUrl("https://proj.livekit.cloud/recordings/call-center/x.mp4")).toBe(
      false,
    );
    expect(isUsableRecordingUrl("not-a-url")).toBe(false);
  });

  it("accepts https media URLs", () => {
    expect(isUsableRecordingUrl("https://cdn.example.org/calls/a.mp4")).toBe(true);
  });
});
