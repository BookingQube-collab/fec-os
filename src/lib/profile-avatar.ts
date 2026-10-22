/**
 * Profile header avatars are stored on `profiles.avatar_url` as data URLs (or
 * rare https OAuth URLs). Session JSON must never ship the data URL — browsers
 * and proxies choke on 200–350KB payloads, and the topbar falls back to initials.
 */

export const PROFILE_AVATAR_API_PATH = "/api/auth/avatar";

const AVATAR_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i;

export function isProfileAvatarDataUrl(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return AVATAR_DATA_URL.test(value.replace(/\s/g, ""));
}

export function decodeProfileAvatarDataUrl(value: string): {
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
} {
  const compact = value.replace(/\s/g, "");
  const match = compact.match(AVATAR_DATA_URL);
  if (!match) throw new Error("Photo must be a JPEG, PNG, or WebP data URL.");
  const contentType = match[1].toLowerCase() as "image/jpeg" | "image/png" | "image/webp";
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < 80) throw new Error("Photo is empty.");
  return { bytes, contentType };
}

/** Cache-busted same-origin URL for `<img src>` after a profile photo save. */
export function profileAvatarApiUrl(updatedAt?: string | null): string {
  const version = updatedAt?.trim();
  if (!version) return PROFILE_AVATAR_API_PATH;
  return `${PROFILE_AVATAR_API_PATH}?v=${encodeURIComponent(version)}`;
}

/**
 * Map a DB `profiles.avatar_url` value to something safe for session / `<img>`.
 * Data URLs become `/api/auth/avatar`; http(s) and app paths pass through.
 */
export function resolveSessionAvatarUrl(
  raw: string | null | undefined,
  updatedAt?: string | null,
  staffPhotoFallback?: string | null,
): string | null {
  const value = raw?.trim() || null;
  if (!value) return staffPhotoFallback?.trim() || null;
  if (isProfileAvatarDataUrl(value)) return profileAvatarApiUrl(updatedAt);
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value;
  return staffPhotoFallback?.trim() || null;
}
