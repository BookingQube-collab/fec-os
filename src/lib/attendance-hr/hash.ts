import { createHash } from "node:crypto";

export { mappingKey, subjectKey } from "./keys";

/** Idempotency key: company + device + user ID + timestamp. Never company-wide user ID alone. */
export function punchHash(input: {
  companyId: string;
  deviceId: string;
  biometricUserId: string;
  punchAt: string;
}): string {
  const canonical = [
    input.companyId.trim().toLowerCase(),
    input.deviceId.trim().toLowerCase(),
    input.biometricUserId.trim(),
    input.punchAt,
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export function fileSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
