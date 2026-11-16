import { describe, expect, it } from "vitest";

import { buildCallRecordingPublicUrl } from "./recording-url";

describe("buildCallRecordingPublicUrl", () => {
  it("prefers storage base URL", () => {
    expect(buildCallRecordingPublicUrl("https://cdn.example.com/rec/", "abc")).toBe(
      "https://cdn.example.com/rec/call-center/abc.mp4",
    );
  });

  it("falls back to LiveKit host recordings path", () => {
    expect(buildCallRecordingPublicUrl("", "abc", "https://proj.livekit.cloud")).toBe(
      "https://proj.livekit.cloud/recordings/call-center/abc.mp4",
    );
  });

  it("uses placeholder when nothing configured", () => {
    expect(buildCallRecordingPublicUrl("", "abc")).toBe(
      "https://recordings.example/fec/cc/abc.mp4",
    );
  });
});
