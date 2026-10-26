"use client";

import {
  SIGNATURE_MAX_BYTES,
  SIGNATURE_MAX_EDGE,
  isSignatureMime,
  knockOutSignatureWhiteBackground,
} from "@/lib/digital-signature";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read signature file."));
    };
    reader.onerror = () => reject(new Error("Could not read signature file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Prepare a signature upload as a transparent PNG data URL.
 * SVG passes through unchanged. Raster images are redrawn on a clear canvas and
 * near-white pixels are knocked out so JPEG / flat-white PNG exports do not stamp
 * a white rectangle on print forms.
 */
export async function prepareSignatureUploadDataUrl(file: File): Promise<string> {
  if (!isSignatureMime(file.type) || file.size > SIGNATURE_MAX_BYTES) {
    throw new Error("Signature must be a PNG, JPEG, WebP, or SVG image under 2 MB.");
  }

  if (file.type === "image/svg+xml") {
    return readFileAsDataUrl(file);
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, SIGNATURE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("Could not prepare signature.");

    // Transparent clear — never fill white under strokes.
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    knockOutSignatureWhiteBackground(imageData.data);
    ctx.putImageData(imageData, 0, 0);

    const dataUrl = canvas.toDataURL("image/png");
    const approxBytes = Math.floor((dataUrl.length - "data:image/png;base64,".length) * 0.75);
    if (approxBytes > SIGNATURE_MAX_BYTES) {
      throw new Error("Signature image must be 2 MB or smaller.");
    }
    return dataUrl;
  } finally {
    bitmap.close();
  }
}
