import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const KEY_BYTES = 32;

export class AiCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiCryptoError";
  }
}

export function parseEncryptionKey(raw: string | undefined | null): Buffer {
  const value = raw?.trim() ?? "";
  if (!value) {
    throw new AiCryptoError("AI_CREDENTIALS_ENCRYPTION_KEY is not configured");
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }
  try {
    const buf = Buffer.from(value, "base64");
    if (buf.length === KEY_BYTES) return buf;
  } catch {
    /* fall through */
  }
  throw new AiCryptoError(
    "AI_CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (generate with: openssl rand -hex 32)",
  );
}

export function getEncryptionKey(): Buffer {
  return parseEncryptionKey(process.env.AI_CREDENTIALS_ENCRYPTION_KEY);
}

export function encryptSecret(plaintext: string, key = getEncryptionKey()): string {
  if (!plaintext) throw new AiCryptoError("Cannot encrypt an empty secret");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string, key = getEncryptionKey()): string {
  if (!payload) throw new AiCryptoError("Cannot decrypt an empty payload");
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new AiCryptoError("Invalid ciphertext format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

export function lastFourOfKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length < 4) return trimmed;
  return trimmed.slice(-4);
}

export function maskApiKey(key: string): string {
  return `••••••••••••${lastFourOfKey(key)}`;
}

export function maskFromLastFour(lastFour: string | null | undefined): string | null {
  if (!lastFour) return null;
  return `••••••••••••${lastFour}`;
}
