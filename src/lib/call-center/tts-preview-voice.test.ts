import { describe, expect, it } from "vitest";

import { clipTtsPreviewText, toRestTtsVoiceId } from "./tts-preview-voice";

describe("toRestTtsVoiceId", () => {
  it("maps Polly Call Control ids to AWS.Polly REST ids (capital AWS, keeps Neural)", () => {
    expect(toRestTtsVoiceId("Polly.Joanna-Neural")).toBe("AWS.Polly.Joanna-Neural");
    expect(toRestTtsVoiceId("Polly.Matthew-Neural")).toBe("AWS.Polly.Matthew-Neural");
    expect(toRestTtsVoiceId("Polly.Hala-Neural")).toBe("AWS.Polly.Hala-Neural");
    // Standard Joanna upgrades to Neural, then AWS. prefix for REST.
    expect(toRestTtsVoiceId("Polly.Joanna")).toBe("AWS.Polly.Joanna-Neural");
  });

  it("normalizes lowercase aws.Polly prefix to capital AWS", () => {
    expect(toRestTtsVoiceId("aws.Polly.Joanna-Neural")).toBe("AWS.Polly.Joanna-Neural");
  });

  it("keeps AWS.Polly Neural ids (after standard→Neural normalize)", () => {
    expect(toRestTtsVoiceId("AWS.Polly.Joanna-Neural")).toBe("AWS.Polly.Joanna-Neural");
    expect(toRestTtsVoiceId("AWS.Polly.Joanna")).toBe("AWS.Polly.Joanna-Neural");
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
