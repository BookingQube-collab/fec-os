/**
 * Digital signature eligibility and print-stamp helpers.
 * Senior staff may upload a signature; auto-stamp on approval forms requires opt-in.
 */

import {
  isHeadOfOperationsTitle,
  isSiteSupervisorTitle,
} from "@/lib/attendance-hr/missed-punch-approval";
import { isGeneralManagerTitle } from "@/lib/attendance-hr/roster-punch-fill";
import { isArcadeSupervisor, isFnbManager } from "@/lib/arcade/access";
import type { AppRole } from "@/lib/rbac";

export const STAFF_SIGNATURES_BUCKET = "staff-signatures";

/** App roles that may manage a digital signature on their profile. */
export const DIGITAL_SIGNATURE_ROLES: readonly AppRole[] = [
  "ceo",
  "coo",
  "cfo",
  "regional_ops",
  "branch_gm",
  "hr",
] as const;

const CEO_TITLE = /\bceo\b|chief\s+executive/i;

/** PNG / JPEG / WebP / SVG; keep under 2 MB (bucket limit). */
export const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;
export const SIGNATURE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
] as const;

export type SignatureMime = (typeof SIGNATURE_MIME_TYPES)[number];

export function isSignatureMime(value: string | null | undefined): value is SignatureMime {
  const mime = (value ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  return (SIGNATURE_MIME_TYPES as readonly string[]).includes(mime);
}

/** data:image/...;base64,... — group 1 = mime, group 2 = payload (must be captured). */
const SIGNATURE_DATA_URL =
  /^data:(image\/(?:jpeg|jpg|png|webp|svg\+xml));base64,([a-z0-9+/=\s]+)$/i;

/** Decode a browser FileReader data URL into bytes for storage upload. */
export function decodeSignatureDataUrl(raw: string): { bytes: Buffer; contentType: SignatureMime } {
  const compact = raw.replace(/\s/g, "");
  const match = compact.match(SIGNATURE_DATA_URL);
  if (!match?.[1] || !match[2]) {
    throw new Error("Signature must be a PNG, JPEG, WebP, or SVG image.");
  }
  const contentType = (match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase()) as SignatureMime;
  if (!isSignatureMime(contentType)) {
    throw new Error("Signature must be a PNG, JPEG, WebP, or SVG image.");
  }
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < 32) throw new Error("Signature image is empty.");
  if (bytes.length > SIGNATURE_MAX_BYTES) {
    throw new Error("Signature image must be 2 MB or smaller.");
  }
  return { bytes, contentType };
}

/**
 * Senior positions: exec / GM / HR roles, plus HOO, GM, site supervisor,
 * F&B manager, and other supervisor titles.
 */
export function canUploadDigitalSignature(input: {
  roles?: readonly string[] | null;
  jobTitle?: string | null;
  staffRole?: string | null;
  department?: string | null;
}): boolean {
  const roles = input.roles ?? [];
  if (roles.some((role) => (DIGITAL_SIGNATURE_ROLES as readonly string[]).includes(role))) {
    return true;
  }
  if (isHeadOfOperationsTitle(input.jobTitle)) return true;
  if (isGeneralManagerTitle(input.jobTitle)) return true;
  if (isSiteSupervisorTitle(input.jobTitle, input.staffRole)) return true;
  if (isFnbManager(input.jobTitle, input.department)) return true;
  if (isArcadeSupervisor(input.jobTitle, input.staffRole)) return true;
  if (CEO_TITLE.test(input.jobTitle ?? "")) return true;
  return false;
}

export function signatureStoragePath(userId: string, ext: string): string {
  const safe = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
  return `${userId}/signature.${safe}`;
}

export function extensionForSignatureMime(mime: string): string {
  const normalized = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpg";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/svg+xml") return "svg";
  return "png";
}
