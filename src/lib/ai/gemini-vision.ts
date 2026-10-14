import type { AiErrorKind } from "@/lib/ai/types";

/**
 * Image reads (QID, passport, visa photos) go through Gemini.
 * The default Flash model spends the whole request on hidden thinking and
 * never returns the transcription before the upload times out. Photos need
 * the visible text only, with thinking turned off.
 *
 * The off switch is not the same on every Flash model. A zero token budget
 * works on 2.5 Flash and current 3.x Flash. 3.x Flash-Lite rejects that
 * budget and wants thinkingLevel "minimal". A 400 must try the other off
 * switch. Turning thinking back on makes the photo time out again.
 */

export type GeminiResponsePart = {
  text?: string;
  thought?: boolean;
};

/** How a photo request asks Gemini not to spend the call on hidden thinking. */
export type ImageThinkingOff = "budget" | "minimal" | "low" | "omit" | "on";

export function geminiThinkingConfig(mode: ImageThinkingOff): Record<string, unknown> | undefined {
  if (mode === "on" || mode === "omit") return undefined;
  if (mode === "budget") return { thinkingBudget: 0 };
  if (mode === "minimal") return { thinkingLevel: "minimal" };
  return { thinkingLevel: "low" };
}

/**
 * Pro models cannot turn thinking off, so a card photo is read with Flash.
 * Flash itself is left on the model the workspace already selected.
 */
export function geminiImageReadModel(model: string): string {
  const id = model.replace(/^models\//, "");
  if (/pro/i.test(id) && !/flash/i.test(id)) return "gemini-2.5-flash";
  return id;
}

/**
 * Models to try for one photo. `gemini-flash-latest` is a moving alias that
 * can answer 503 or spend the whole call on thinking. A pinned 2.5 Flash
 * accepts a zero thinking budget and returns the transcription, so that
 * alias tries the pinned model first.
 */
export function geminiImageModelAttempts(model: string): string[] {
  const preferred = geminiImageReadModel(model);
  const stable = "gemini-2.5-flash";
  if (preferred === "gemini-flash-latest") return [stable, preferred];
  return [...new Set([preferred, stable])];
}

/** A rejected API key must not be retried against another Gemini model. */
export function shouldAdvanceGeminiImageModel(kind: AiErrorKind): boolean {
  return kind !== "auth";
}

/**
 * Ordered off-switches for one image read. The first entry is the one that
 * model family documents. Later entries are only used after a 400.
 */
export function imageThinkingOffAttempts(model: string): ImageThinkingOff[] {
  const id = model.toLowerCase().replace(/^models\//, "");
  if (id.includes("image") || /gemini-2\.0|gemini-1\./.test(id)) return ["omit"];
  if (id.includes("flash-lite")) {
    return id.includes("2.5") ? ["budget", "minimal", "low"] : ["minimal", "budget", "low"];
  }
  return ["budget", "low", "minimal"];
}

export function shouldRetryImageThinking(input: { status?: number; message: string }): boolean {
  if (input.status === 400 && /thinking/i.test(input.message)) return true;
  return /empty model response/i.test(input.message);
}

export function geminiGenerationConfig(input: {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  /** When true, do not let a thinking model consume the image transcription. */
  disableThinking?: boolean;
  /** Photo reads. Takes precedence over disableThinking. */
  thinkingOff?: ImageThinkingOff;
}): Record<string, unknown> {
  const mode: ImageThinkingOff =
    input.thinkingOff ?? (input.disableThinking ? "budget" : "on");
  const thinkingConfig = geminiThinkingConfig(mode);
  return {
    temperature: input.temperature ?? 0.3,
    maxOutputTokens: input.maxTokens ?? 4096,
    ...(input.jsonMode ? { responseMimeType: "application/json" } : {}),
    ...(thinkingConfig ? { thinkingConfig } : {}),
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
