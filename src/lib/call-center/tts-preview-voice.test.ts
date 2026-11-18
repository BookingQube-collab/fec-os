import { describe, expect, it } from "vitest";

import { clipTtsPreviewText, toRestTtsVoiceId } from "./tts-preview-voice";

describe("toRestTtsVoiceId", () => {
  it("auto-upgrades EN Polly / Jenny to Azure Multilingual for REST preview", () => {
    expect(toRestTtsVoiceId("Polly.Joanna-Neural")).toBe(
      "Azure.en-US-AvaMultilingualNeural",
    );
    expect(toRestTtsVoiceId("Polly.Matthew-Neural")).toBe(
      "Azure.en-US-AndrewMultilingualNeural",
    );
    expect(toRestTtsVoiceId("Polly.Joanna")).toBe("Azure.en-US-AvaMultilingualNeural");
    expect(toRestTtsVoiceId("Azure.en-US-JennyNeural")).toBe(
      "Azure.en-US-AvaMultilingualNeural",
    );
  });

  it("keeps Arabic Polly Hala as AWS.Polly for REST until speak-time Azure upgrade", () => {
    // normalizeConfiguredTtsVoice leaves Hala (Arabic upgrade happens in pickSpeakVoice).
    expect(toRestTtsVoiceId("Polly.Hala-Neural")).toBe("AWS.Polly.Hala-Neural");
  });

  it("normalizes lowercase aws.Polly Joanna to Azure Ava", () => {
    expect(toRestTtsVoiceId("aws.Polly.Joanna-Neural")).toBe(
      "Azure.en-US-AvaMultilingualNeural",
    );
  });

  it("keeps AWS.Polly Joanna after upgrade path to Azure Ava", () => {
    expect(toRestTtsVoiceId("AWS.Polly.Joanna-Neural")).toBe(
      "Azure.en-US-AvaMultilingualNeural",
    );
    expect(toRestTtsVoiceId("AWS.Polly.Joanna")).toBe(
      "Azure.en-US-AvaMultilingualNeural",
    );
  });

  it("passes current Azure Ava / Fatima voices through", () => {
    expect(toRestTtsVoiceId("Azure.en-US-AvaMultilingualNeural")).toBe(
      "Azure.en-US-AvaMultilingualNeural",
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
