import { describe, expect, it } from "vitest";

import {
  assertPublicRecordingStorageBaseUrl,
  buildCallRecordingPublicUrl,
  extractCallCenterRecordingObjectKey,
  hasFinishedRecordingEgress,
  isCallRecordingPlaybackReady,
  isGuessedLiveKitRecordingUrl,
  isPrivateObjectStoreApiUrl,
  isUsableRecordingUrl,
  preferPlayableRecordingUrl,
  rewriteRecordingUrlToPublicBase,
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

describe("isPrivateObjectStoreApiUrl", () => {
  it("detects R2 API hosts", () => {
    expect(
      isPrivateObjectStoreApiUrl(
        "https://5943ff30718b0c415cee9c1d7a5e95b4.r2.cloudflarestorage.com/fec-call-recordings/call-center/x.mp4",
      ),
    ).toBe(true);
  });

  it("allows public r2.dev", () => {
    expect(
      isPrivateObjectStoreApiUrl("https://pub-ad91d95ff6c24b2a81431f371d3a298e.r2.dev/call-center/x.mp4"),
    ).toBe(false);
  });
});

describe("rewriteRecordingUrlToPublicBase", () => {
  it("rewrites private R2 API URLs onto the public base", () => {
    const privateUrl =
      "https://acct.r2.cloudflarestorage.com/fec-call-recordings/call-center/563d1df7-ca64-46ce-a681-2764d3f33290.mp4";
    expect(
      rewriteRecordingUrlToPublicBase(privateUrl, "https://pub-xxxx.r2.dev"),
    ).toBe(
      "https://pub-xxxx.r2.dev/call-center/563d1df7-ca64-46ce-a681-2764d3f33290.mp4",
    );
  });

  it("leaves public URLs unchanged", () => {
    const pub = "https://pub-xxxx.r2.dev/call-center/abc.mp4";
    expect(rewriteRecordingUrlToPublicBase(pub, "https://pub-xxxx.r2.dev")).toBe(pub);
  });
});

describe("preferPlayableRecordingUrl", () => {
  it("prefers public storage base over private API location", () => {
    expect(
      preferPlayableRecordingUrl({
        callId: "563d1df7-ca64-46ce-a681-2764d3f33290",
        storageBaseUrl: "https://pub-xxxx.r2.dev",
        location:
          "https://acct.r2.cloudflarestorage.com/fec-call-recordings/call-center/563d1df7-ca64-46ce-a681-2764d3f33290.mp4",
      }),
    ).toBe("https://pub-xxxx.r2.dev/call-center/563d1df7-ca64-46ce-a681-2764d3f33290.mp4");
  });
});

describe("assertPublicRecordingStorageBaseUrl", () => {
  it("rejects R2 API endpoints", () => {
    expect(() =>
      assertPublicRecordingStorageBaseUrl(
        "https://acct.r2.cloudflarestorage.com/fec-call-recordings",
      ),
    ).toThrow(/public CDN/);
  });

  it("accepts r2.dev", () => {
    expect(assertPublicRecordingStorageBaseUrl("https://pub-xxxx.r2.dev/")).toBe(
      "https://pub-xxxx.r2.dev",
    );
  });
});

describe("extractCallCenterRecordingObjectKey", () => {
  it("finds call-center key even when bucket is in the path", () => {
    expect(
      extractCallCenterRecordingObjectKey(
        "https://acct.r2.cloudflarestorage.com/bucket/call-center/563d1df7-ca64-46ce-a681-2764d3f33290.mp4",
      ),
    ).toBe("call-center/563d1df7-ca64-46ce-a681-2764d3f33290.mp4");
  });
});

describe("isUsableRecordingUrl", () => {
  it("rejects empty, placeholder, guessed LiveKit paths, and private API hosts", () => {
    expect(isUsableRecordingUrl("")).toBe(false);
    expect(isUsableRecordingUrl("https://recordings.example/fec/cc/x.mp4")).toBe(false);
    expect(isUsableRecordingUrl("https://proj.livekit.cloud/recordings/call-center/x.mp4")).toBe(
      false,
    );
    expect(
      isUsableRecordingUrl(
        "https://acct.r2.cloudflarestorage.com/bucket/call-center/x.mp4",
      ),
    ).toBe(false);
    expect(isUsableRecordingUrl("not-a-url")).toBe(false);
  });

  it("accepts https media URLs", () => {
    expect(isUsableRecordingUrl("https://cdn.example.org/calls/a.mp4")).toBe(true);
    expect(
      isUsableRecordingUrl("https://pub-xxxx.r2.dev/call-center/a.mp4"),
    ).toBe(true);
  });
});

describe("isCallRecordingPlaybackReady", () => {
  const callId = "563d1df7-ca64-46ce-a681-2764d3f33290";
  const base = "https://pub-xxxx.r2.dev";
  const predicted = `${base}/call-center/${callId}.mp4`;

  it("rejects predicted storage-base URLs until egress finishes", () => {
    expect(
      isCallRecordingPlaybackReady({
        recordingUrl: predicted,
        callId,
        storageBaseUrl: base,
        metadata: { egressStarted: true },
      }),
    ).toBe(false);
  });

  it("accepts predicted URLs after egressFinishedAt", () => {
    expect(
      isCallRecordingPlaybackReady({
        recordingUrl: predicted,
        callId,
        storageBaseUrl: base,
        metadata: { egressFinishedAt: "2026-11-18T10:00:00.000Z" },
      }),
    ).toBe(true);
  });

  it("accepts non-predicted public media URLs", () => {
    expect(
      isCallRecordingPlaybackReady({
        recordingUrl: "https://cdn.example.org/calls/a.mp4",
        callId,
        storageBaseUrl: base,
      }),
    ).toBe(true);
  });
});

describe("hasFinishedRecordingEgress", () => {
  it("requires finished timestamp, file location, or legacy rewrite marker", () => {
    expect(hasFinishedRecordingEgress({})).toBe(false);
    expect(hasFinishedRecordingEgress({ egressStarted: true })).toBe(false);
    expect(hasFinishedRecordingEgress({ egressFinishedAt: "2026-11-18T10:00:00.000Z" })).toBe(
      true,
    );
    expect(
      hasFinishedRecordingEgress({ egressFileLocation: "s3://bucket/call-center/x.mp4" }),
    ).toBe(true);
    expect(
      hasFinishedRecordingEgress({ recordingUrlRewrittenAt: "2026-11-18T10:00:00.000Z" }),
    ).toBe(true);
  });
});
