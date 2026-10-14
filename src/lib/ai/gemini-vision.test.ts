import { describe, expect, it } from "vitest";

import {
  geminiGenerationConfig,
  geminiImageModelAttempts,
  geminiImageReadModel,
  geminiVisibleText,
  imageThinkingOffAttempts,
  shouldAdvanceGeminiImageModel,
  shouldRetryImageThinking,
} from "./gemini-vision";

describe("gemini image reads", () => {
  it("turns thinking off for a photo so the transcription is returned", () => {
    expect(
      geminiGenerationConfig({ temperature: 0, maxTokens: 4096, disableThinking: true }),
    ).toMatchObject({ thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 4096 });
  });

  it("uses a zero budget for flash, and the minimal level when flash-lite rejects that budget", () => {
    expect(imageThinkingOffAttempts("gemini-flash-latest")[0]).toBe("budget");
    expect(imageThinkingOffAttempts("gemini-2.5-flash")[0]).toBe("budget");
    expect(imageThinkingOffAttempts("gemini-3.5-flash-lite")[0]).toBe("minimal");
    expect(imageThinkingOffAttempts("gemini-2.5-flash-lite")[0]).toBe("budget");
    expect(imageThinkingOffAttempts("gemini-2.0-flash")).toEqual(["omit"]);
  });

  it("reads a card photo with flash when the selected model cannot turn thinking off", () => {
    expect(geminiImageReadModel("gemini-2.5-pro")).toBe("gemini-2.5-flash");
    expect(geminiImageReadModel("models/gemini-2.5-flash")).toBe("gemini-2.5-flash");
  });

  it("tries pinned 2.5 Flash before the moving alias that answers 503", () => {
    expect(geminiImageModelAttempts("gemini-flash-latest")).toEqual([
      "gemini-2.5-flash",
      "gemini-flash-latest",
    ]);
    expect(geminiImageModelAttempts("gemini-2.5-pro")).toEqual(["gemini-2.5-flash"]);
    expect(geminiImageModelAttempts("gemini-2.0-flash")).toEqual([
      "gemini-2.0-flash",
      "gemini-2.5-flash",
    ]);
  });

  it("does not try another Gemini model when the API key was rejected", () => {
    expect(shouldAdvanceGeminiImageModel("server")).toBe(true);
    expect(shouldAdvanceGeminiImageModel("unavailable_model")).toBe(true);
    expect(shouldAdvanceGeminiImageModel("timeout")).toBe(true);
    expect(shouldAdvanceGeminiImageModel("auth")).toBe(false);
  });

  it("retries a rejected thinking switch and does not treat a timeout as another switch", () => {
    expect(
      shouldRetryImageThinking({
        status: 400,
        message: "The request was rejected by the provider. thinkingBudget is not supported",
      }),
    ).toBe(true);
    expect(shouldRetryImageThinking({ message: "The provider timed out. The request was not completed." })).toBe(
      false,
    );
    for (const model of ["gemini-flash-latest", "gemini-2.5-pro", "gemini-3.5-flash-lite"]) {
      expect(imageThinkingOffAttempts(geminiImageReadModel(model))).not.toContain("on");
    }
  });

  it("sends each off switch without enabling thinking", () => {
    expect(geminiGenerationConfig({ thinkingOff: "minimal" }).thinkingConfig).toEqual({
      thinkingLevel: "minimal",
    });
    expect(geminiGenerationConfig({ thinkingOff: "low" }).thinkingConfig).toEqual({ thinkingLevel: "low" });
    expect(geminiGenerationConfig({ thinkingOff: "omit" })).not.toHaveProperty("thinkingConfig");
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
