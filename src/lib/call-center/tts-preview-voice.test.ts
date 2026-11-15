import { describe, expect, it } from "vitest";

import { clipTtsPreviewText, toRestTtsVoiceId } from "./tts-preview-voice";

describe("toRestTtsVoiceId", () => {
  it("maps Polly Call Control ids to aws.Polly REST ids", () => {
    expect(toRestTtsVoiceId("Polly.Joanna-Neural")).toBe("aws.Polly.Joanna-Neural");
    expect(toRestTtsVoiceId("Polly.Matthew-Neural")).toBe("aws.Polly.Matthew-Neural");
  });

  it("passes Azure voices through", () => {
    expect(toRestTtsVoiceId("Azure.en-US-JennyNeural")).toBe("Azure.en-US-JennyNeural");
  });

  it("maps legacy female/male to Telnyx Kokoro voices", () => {
    expect(toRestTtsVoiceId("female")).toBe("Telnyx.KokoroTTS.af_heart");
    expect(toRestTtsVoiceId("male")).toBe("Telnyx.KokoroTTS.am_adam");
  });
});

describe("clipTtsPreviewText", () => {
  it("uses fallback when empty", () => {
    expect(clipTtsPreviewText("")).toMatch(/Welcome/);
  });

  it("truncates long text", () => {
    const long = "a".repeat(400);
    expect(clipTtsPreviewText(long, 50).length).toBeLessThanOrEqual(50);
  });
});
