import { describe, expect, it } from "vitest";

import { clipTtsPreviewText, toRestTtsVoiceId } from "./tts-preview-voice";

describe("toRestTtsVoiceId", () => {
  it("maps Polly Call Control ids to AWS.Polly REST ids (capital AWS)", () => {
    // Neural → standard for PSTN clarity, then AWS. prefix for REST.
    expect(toRestTtsVoiceId("Polly.Joanna-Neural")).toBe("AWS.Polly.Joanna");
    expect(toRestTtsVoiceId("Polly.Matthew-Neural")).toBe("AWS.Polly.Matthew");
    expect(toRestTtsVoiceId("Polly.Hala-Neural")).toBe("AWS.Polly.Hala");
    expect(toRestTtsVoiceId("Polly.Joanna")).toBe("AWS.Polly.Joanna");
  });

  it("normalizes lowercase aws.Polly prefix to capital AWS", () => {
    expect(toRestTtsVoiceId("aws.Polly.Joanna-Neural")).toBe("AWS.Polly.Joanna");
  });

  it("keeps AWS.Polly ids as-is after neural→standard", () => {
    expect(toRestTtsVoiceId("AWS.Polly.Joanna-Neural")).toBe("AWS.Polly.Joanna");
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
