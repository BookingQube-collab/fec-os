import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { parseEncryptionKey } from "@/lib/ai/crypto";

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

export function getAttendanceFileKey(): Buffer {
  const raw =
    process.env.ATTENDANCE_FILE_ENCRYPTION_KEY?.trim() ||
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY?.trim() ||
    "";
  if (!raw) {
    throw new Error(
      "ATTENDANCE_FILE_ENCRYPTION_KEY (or AI_CREDENTIALS_ENCRYPTION_KEY) is required to encrypt attendance files.",
    );
  }
  return parseEncryptionKey(raw);
}

export function hasAttendanceFileKey(): boolean {
  return Boolean(
    process.env.ATTENDANCE_FILE_ENCRYPTION_KEY?.trim() || process.env.AI_CREDENTIALS_ENCRYPTION_KEY?.trim(),
  );
}

/** AES-256-GCM: version(1) + iv(12) + tag(16) + ciphertext */
export function encryptFileBuffer(plain: Buffer, key = getAttendanceFileKey()): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, encrypted]);
}

export function decryptFileBuffer(payload: Buffer, key = getAttendanceFileKey()): Buffer {
  if (payload.length < 1 + IV_LEN + TAG_LEN) {
    throw new Error("Invalid encrypted attendance file");
  }
  const version = payload[0];
  if (version !== VERSION) throw new Error("Unsupported attendance file encryption version");
  const iv = payload.subarray(1, 1 + IV_LEN);
  const tag = payload.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const data = payload.subarray(1 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
