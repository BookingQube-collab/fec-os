/**
 * SendPulse webhook secret reveal helpers (admin settings).
 * Kept free of `server-only` / DB so unit tests can cover Reveal vs env fallback.
 */

import { decryptSecret } from "@/lib/ai/crypto";

import { resolveSendPulseWebhookSecret } from "./sendpulse";

export const SENDPULSE_WEBHOOK_SECRET_DECRYPT_ERROR =
  "Could not decrypt SendPulse webhook secret. Check AI_CREDENTIALS_ENCRYPTION_KEY.";

function isSealed(value: string): boolean {
  const parts = value.trim().split(":");
  return parts[0] === "v1" && parts.length >= 4 && Boolean(parts[1] && parts[2] && parts[3]);
}

/** Decrypt sealed admin secrets; pass through legacy plaintext. */
function unsealSendPulseSecret(stored: string): string {
  const trimmed = stored.trim();
  if (!trimmed) return "";
  if (!isSealed(trimmed)) return trimmed;
  return decryptSecret(trimmed);
}

/**
 * Admin Reveal / Copy-URL-with-secret: decrypt sealed admin value when present;
 * otherwise fall back to the same effective secret webhook auth uses (env / shared).
 * Decrypt failure is an explicit error — never reported as "nothing saved".
 */
export function revealSendPulseWebhookSecretFromSettings(row: {
  sendpulse_webhook_secret?: string | null;
  webhook_shared_secret?: string | null;
} | null): string {
  const raw = row?.sendpulse_webhook_secret?.trim() ?? "";
  if (raw) {
    try {
      return unsealSendPulseSecret(raw);
    } catch {
      throw new Error(SENDPULSE_WEBHOOK_SECRET_DECRYPT_ERROR);
    }
  }
  return resolveSendPulseWebhookSecret({
    sendpulseWebhookSecret: "",
    webhookSharedSecret: row?.webhook_shared_secret,
  });
}
