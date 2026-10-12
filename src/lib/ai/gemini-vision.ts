/**
 * Image reads (QID, passport, visa photos) go through Gemini.
 * The default Flash model spends the whole request on hidden thinking and
 * never returns the transcription before the upload times out. Photos need
 * the visible text only, with thinking turned off.
 */

export type GeminiResponsePart = {
  text?: string;
  thought?: boolean;
};

export function geminiGenerationConfig(input: {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  /** When true, do not let a thinking model consume the image transcription. */
  disableThinking?: boolean;
}): Record<string, unknown> {
  return {
    temperature: input.temperature ?? 0.3,
    maxOutputTokens: input.maxTokens ?? 4096,
    ...(input.jsonMode ? { responseMimeType: "application/json" } : {}),
    ...(input.disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
  };
}

/** Drop thought parts. They are not the printed card text. */
export function geminiVisibleText(parts: GeminiResponsePart[] | undefined): string {
  return (parts ?? [])
    .filter((part) => part.thought !== true && typeof part.text === "string" && part.text.trim())
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}
