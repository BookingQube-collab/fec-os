import { describe, expect, it } from "vitest";

import {
  extractEgressRecordingLocation,
  resolveEgressS3FromEnv,
} from "./recording-egress-shared";

describe("extractEgressRecordingLocation", () => {
  it("prefers https fileResults", () => {
    expect(
      extractEgressRecordingLocation({
        fileResults: [
          { location: "s3://bucket/call-center/a.mp4" },
          { location: "https://cdn.example.org/call-center/a.mp4" },
        ],
      }),
    ).toBe("https://cdn.example.org/call-center/a.mp4");
  });

  it("falls back to s3:// when no https", () => {
    expect(
      extractEgressRecordingLocation({
        fileResults: [{ location: "s3://bucket/call-center/a.mp4" }],
      }),
    ).toBe("s3://bucket/call-center/a.mp4");
  });

  it("returns null when empty", () => {
    expect(extractEgressRecordingLocation({})).toBeNull();
  });
});

describe("resolveEgressS3FromEnv", () => {
  it("returns null when incomplete", () => {
    expect(resolveEgressS3FromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      resolveEgressS3FromEnv({
        LIVEKIT_EGRESS_S3_ACCESS_KEY: "ak",
        LIVEKIT_EGRESS_S3_SECRET: "sk",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("reads LIVEKIT_EGRESS_S3_* and defaults path-style when endpoint set", () => {
    const cfg = resolveEgressS3FromEnv({
      LIVEKIT_EGRESS_S3_ACCESS_KEY: "ak",
      LIVEKIT_EGRESS_S3_SECRET: "sk",
      LIVEKIT_EGRESS_S3_BUCKET: "rec",
      LIVEKIT_EGRESS_S3_ENDPOINT: "https://s3.example.com",
      LIVEKIT_EGRESS_S3_REGION: "auto",
    } as NodeJS.ProcessEnv);
    expect(cfg).toEqual({
      accessKey: "ak",
      secret: "sk",
      bucket: "rec",
      region: "auto",
      endpoint: "https://s3.example.com",
      forcePathStyle: true,
    });
  });
});
