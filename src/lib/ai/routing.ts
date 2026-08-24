import { canFallback, isAuthFailure } from "@/lib/ai/sanitize";
import type { AiErrorKind, AiProviderCode, AiRoutingSettings } from "@/lib/ai/types";

export type RoutingCandidate = {
  provider: AiProviderCode;
  eligible: boolean;
  overLimit?: boolean;
};

export function buildFallbackChain(
  routing: AiRoutingSettings,
  candidates: RoutingCandidate[],
): AiProviderCode[] {
  const eligible = new Set(
    candidates.filter((c) => c.eligible && !c.overLimit).map((c) => c.provider),
  );
  const ordered = [routing.primary, routing.secondary, routing.tertiary].filter(
    (code): code is AiProviderCode => code != null && eligible.has(code),
  );
  const unique: AiProviderCode[] = [];
  for (const code of ordered) {
    if (!unique.includes(code)) unique.push(code);
  }
  if (!routing.auto_fallback) return unique.slice(0, 1);
  return unique;
}

export type AttemptDecision =
  | { action: "succeed" }
  | { action: "retry_same" }
  | { action: "fallback" }
  | { action: "stop" };

export function decideAfterFailure(input: {
  kind: AiErrorKind;
  attempt: number;
  maxRetries: number;
  autoFallback: boolean;
  hasNext: boolean;
}): AttemptDecision {
  if (isAuthFailure(input.kind)) return { action: "stop" };
  const retryable = canFallback(input.kind);
  if (retryable && input.attempt < input.maxRetries) return { action: "retry_same" };
  if (retryable && input.autoFallback && input.hasNext) return { action: "fallback" };
  return { action: "stop" };
}

export function isOverMonthlyLimit(spentUsd: number, limitUsd: number | null | undefined): boolean {
  if (limitUsd == null) return false;
  return spentUsd >= limitUsd;
}
