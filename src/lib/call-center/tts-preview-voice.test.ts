import { describe, expect, it } from "vitest";

import { clipTtsPreviewText, toRestTtsVoiceId } from "./tts-preview-voice";

describe("toRestTtsVoiceId", () => {
  it("keeps EN Polly Neural for REST preview (Multilingual Azure remapped to Polly)", () => {
    expect(toRestTtsVoiceId("Polly.Joanna-Neural")).toBe("AWS.Polly.Joanna-Neural");
    expect(toRestTtsVoiceId("Polly.Matthew-Neural")).toBe("AWS.Polly.Matthew-Neural");
    expect(toRestTtsVoiceId("Polly.Joanna")).toBe("AWS.Polly.Joanna-Neural");
    expect(toRestTtsVoiceId("Azure.en-US-JennyNeural")).toBe("Azure.en-US-JennyNeural");
    expect(toRestTtsVoiceId("Azure.en-US-AvaMultilingualNeural")).toBe(
      "AWS.Polly.Joanna-Neural",
    );
    expect(toRestTtsVoiceId("Azure.en-US-AndrewMultilingualNeural")).toBe(
      "AWS.Polly.Matthew-Neural",
    );
  });

  it("keeps Arabic Polly Hala as AWS.Polly for REST until speak-time Azure upgrade", () => {
    // normalizeConfiguredTtsVoice leaves Hala (Arabic upgrade happens in pickSpeakVoice).
    expect(toRestTtsVoiceId("Polly.Hala-Neural")).toBe("AWS.Polly.Hala-Neural");
  });

  it("normalizes lowercase aws.Polly Joanna to AWS.Polly Neural", () => {
    expect(toRestTtsVoiceId("aws.Polly.Joanna-Neural")).toBe("AWS.Polly.Joanna-Neural");
  });

  it("keeps AWS.Polly Joanna Neural for REST", () => {
    expect(toRestTtsVoiceId("AWS.Polly.Joanna-Neural")).toBe("AWS.Polly.Joanna-Neural");
    expect(toRestTtsVoiceId("AWS.Polly.Joanna")).toBe("AWS.Polly.Joanna-Neural");
  });

  it("passes Azure Fatima through; remaps Multilingual Ava to Polly", () => {
    expect(toRestTtsVoiceId("Azure.en-US-AvaMultilingualNeural")).toBe(
      "AWS.Polly.Joanna-Neural",
    );
    expect(toRestTtsVoiceId("Azure.ar-AE-FatimaNeural")).toBe("Azure.ar-AE-FatimaNeural");
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
