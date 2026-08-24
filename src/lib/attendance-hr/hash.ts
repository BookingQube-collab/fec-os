import { createHash } from "node:crypto";

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

export function mappingKey(input: {
  companyId: string;
  locationId: string;
  deviceId: string;
  biometricUserId: string;
}): string {
  return [input.companyId, input.locationId, input.deviceId, input.biometricUserId.trim()].join(":");
}

export function subjectKey(staffId: string | null | undefined, deviceId: string, biometricUserId: string): string {
  if (staffId) return `staff:${staffId}`;
  return `bio:${deviceId}:${biometricUserId.trim()}`;
}
