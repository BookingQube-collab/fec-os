import { classifyProviderStatus, sanitizeProviderError } from "@/lib/ai/sanitize";
import type { AiErrorKind } from "@/lib/ai/types";

export class ProviderCallError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;
  readonly sanitized: string;

  constructor(kind: AiErrorKind, raw?: unknown, status?: number) {
    const sanitized = sanitizeProviderError(raw, kind);
    super(sanitized);
    this.name = "ProviderCallError";
    this.kind = kind;
    this.status = status;
    this.sanitized = sanitized;
  }

  static fromHttp(status: number, bodyText: string): ProviderCallError {
    const kind = classifyProviderStatus(status, bodyText);
    return new ProviderCallError(kind, bodyText, status);
  }
}

export function asProviderError(error: unknown): ProviderCallError {
  if (error instanceof ProviderCallError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ProviderCallError("timeout", error);
  }
  if (error instanceof Error && /aborted|timeout/i.test(error.message)) {
    return new ProviderCallError("timeout", error);
  }
  return new ProviderCallError("unknown", error);
}
