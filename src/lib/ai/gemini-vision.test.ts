import { describe, expect, it } from "vitest";

import { geminiGenerationConfig, geminiVisibleText } from "./gemini-vision";

describe("gemini image reads", () => {
  it("turns thinking off for a photo so the transcription is returned", () => {
    expect(
      geminiGenerationConfig({ temperature: 0, maxTokens: 4096, disableThinking: true }),
    ).toMatchObject({ thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 4096 });
  });

  it("leaves thinking available for ordinary text", () => {
    expect(geminiGenerationConfig({ disableThinking: false })).not.toHaveProperty("thinkingConfig");
  });

  it("ignores thought text and keeps the printed card transcription", () => {
    expect(
      geminiVisibleText([
        { thought: true, text: "I should look for an 11 digit ID." },
        { text: "ID.No: 28412345678\nExpiry: 15/03/2028" },
      ]),
    ).toBe("ID.No: 28412345678\nExpiry: 15/03/2028");
  });

  it("is empty when the model only thought and never transcribed the photo", () => {
    expect(geminiVisibleText([{ thought: true, text: "still looking" }])).toBe("");
  });
});
