"use client";

import {
  STAFF_PHOTO_JPEG_QUALITY,
  STAFF_PHOTO_MAX_EDGE,
  STAFF_PHOTO_MAX_BYTES,
  isStaffPhotoMime,
} from "@/lib/staff-photo";

/**
 * Resize/compress a staff photo in the browser before upload.
 * Returns a JPEG data URL when possible to keep DB bytea small.
 */
export async function compressStaffPhotoFile(file: File): Promise<string> {
  if (!isStaffPhotoMime(file.type) && !file.type.startsWith("image/")) {
    throw new Error("Use a JPEG, PNG, or WebP image.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, STAFF_PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare photo.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", STAFF_PHOTO_JPEG_QUALITY);
    const approxBytes = Math.floor((dataUrl.length - "data:image/jpeg;base64,".length) * 0.75);
    if (approxBytes > STAFF_PHOTO_MAX_BYTES) {
      throw new Error("Photo is still too large after compression. Try a smaller image.");
    }
    return dataUrl;
  } finally {
    bitmap.close();
  }
}
