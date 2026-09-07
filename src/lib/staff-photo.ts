/** Shared staff directory photo helpers (bytea in Postgres, not Storage). */

export const STAFF_PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type StaffPhotoMime = (typeof STAFF_PHOTO_MIMES)[number];

/** Max decoded bytes accepted by the server after client compress (~200 KB). */
export const STAFF_PHOTO_MAX_BYTES = 200_000;

/** Client resize target (longest edge). */
export const STAFF_PHOTO_MAX_EDGE = 512;

export const STAFF_PHOTO_JPEG_QUALITY = 0.7;

export function isStaffPhotoMime(value: string): value is StaffPhotoMime {
  return (STAFF_PHOTO_MIMES as readonly string[]).includes(value);
}

export function decodeImageDataUrl(raw: string): { bytes: Buffer; contentType: StaffPhotoMime } {
  const match = raw.trim().match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
  if (!match) throw new Error("Photo must be a JPEG, PNG, or WebP data URL.");
  const contentType = match[1].toLowerCase() as StaffPhotoMime;
  if (!isStaffPhotoMime(contentType)) throw new Error("Unsupported photo type.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < 80) throw new Error("Photo is empty.");
  if (bytes.length > STAFF_PHOTO_MAX_BYTES) {
    throw new Error(`Photo exceeds maximum size of ${Math.round(STAFF_PHOTO_MAX_BYTES / 1024)}KB.`);
  }
  return { bytes, contentType };
}

/** PostgREST / Supabase expects bytea as hex with \\x prefix. */
export function bufferToByteaHex(bytes: Buffer): string {
  return `\\x${bytes.toString("hex")}`;
}

/** Normalize bytea values returned by PostgREST (hex or base64). */
export function byteaToBuffer(value: unknown): Buffer | null {
  if (value == null) return null;
  if (typeof value === "string") {
    if (value.startsWith("\\x") || value.startsWith("\\\\x")) {
      const hex = value.replace(/^\\+x/, "");
      return Buffer.from(hex, "hex");
    }
    if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
      return Buffer.from(value, "hex");
    }
    return Buffer.from(value, "base64");
  }
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) return Buffer.from(value);
  return null;
}

export function staffPhotoUrl(staffId: string, updatedAt?: string | null): string {
  const base = `/api/people/staff/${staffId}/photo`;
  if (!updatedAt) return base;
  return `${base}?v=${encodeURIComponent(updatedAt)}`;
}
