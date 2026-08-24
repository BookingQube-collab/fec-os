/**
 * Maintainable estimate map only — not invoices.
 * Amounts are USD per 1M tokens. Update when provider pricing pages change.
 */
const PER_MILLION: Record<string, { input: number; output: number }> = {
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "gemini-2.5-flash-lite": { input: 0.07, output: 0.3 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.0-flash-lite": { input: 0.07, output: 0.3 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
  "llama-3.1-70b-versatile": { input: 0.59, output: 0.79 },
  "mixtral-8x7b-32768": { input: 0.24, output: 0.24 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "openrouter/free": { input: 0, output: 0 },
  "openrouter/auto": { input: 0.15, output: 0.6 },
};

function lookup(model: string): { input: number; output: number } | null {
  const exact = PER_MILLION[model];
  if (exact) return exact;
  const lower = model.toLowerCase();
  for (const [key, value] of Object.entries(PER_MILLION)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return value;
  }
  if (lower.includes("free")) return { input: 0, output: 0 };
  return null;
}

export function estimateCostUsd(input: {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}): number | undefined {
  const rate = lookup(input.model);
  if (!rate) return undefined;
  const inTok = input.inputTokens ?? 0;
  const outTok = input.outputTokens ?? 0;
  return (inTok / 1_000_000) * rate.input + (outTok / 1_000_000) * rate.output;
}
