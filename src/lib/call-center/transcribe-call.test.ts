import { describe, expect, it } from "vitest";

import {
  buildCdrSummaryTranscript,
  formatAiHistoryTranscript,
  isUsableRecordingUrl,
} from "./transcribe-call";
import type { CallCenterCall } from "./types";

function baseCall(overrides: Partial<CallCenterCall> = {}): CallCenterCall {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    direction: "internal_test",
    status: "ended",
    fromE164: "+97400000000",
    toE164: "test",
    didId: null,
    agentUserId: null,
    queueId: null,
    eventId: null,
    ivrDigit: null,
    ivrMenuId: null,
    livekitRoom: "cc-test",
    hangupReason: "",
    offeredAt: null,
    answeredAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    metadata: {},
    recordingUrl: "",
    transferType: null,
    transferTarget: "",
    transferredAt: null,
    campaignId: null,
    talkSeconds: 7,
    transcriptText: "",
    transcriptStatus: "none",
    transcriptUpdatedAt: null,
    whisperActive: false,
    bargeActive: false,
    agentNotes: "",
    dispositionCode: "",
    dispositionNotes: "",
    recordingEnabled: false,
    tags: [],
    parkedSlot: "",
    parkedAt: null,
    parkedBy: null,
    conferenceActive: false,
    keywordHits: [],
    provider: "test",
    providerCallId: "",
    ...overrides,
  };
}

describe("isUsableRecordingUrl", () => {
  it("rejects empty and placeholder hosts", () => {
    expect(isUsableRecordingUrl("")).toBe(false);
    expect(isUsableRecordingUrl("https://recordings.example/fec/cc/x.mp4")).toBe(false);
    expect(isUsableRecordingUrl("not-a-url")).toBe(false);
  });

  it("accepts https media URLs", () => {
    expect(isUsableRecordingUrl("https://cdn.example.org/calls/a.mp4")).toBe(true);
  });
});

describe("formatAiHistoryTranscript", () => {
  it("formats caller/agent turns", () => {
    const text = formatAiHistoryTranscript(
      baseCall({
        metadata: {
          aiHistory: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi there" },
          ],
        },
      }),
    );
    expect(text).toContain("Caller: Hello");
    expect(text).toContain("Agent: Hi there");
  });

  it("returns null when history is empty", () => {
    expect(formatAiHistoryTranscript(baseCall())).toBeNull();
  });
});

describe("buildCdrSummaryTranscript", () => {
  it("explains missing recording on internal test", () => {
    const text = buildCdrSummaryTranscript(baseCall());
    expect(text).toContain("internal test");
    expect(text).toContain("No recording was captured");
    expect(text).toContain("Talk time: 7s");
  });
});
