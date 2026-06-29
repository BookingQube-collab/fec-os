const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_DOCUMENT_MIMES = new Set([
  "application/pdf",
  ...ALLOWED_IMAGE_MIMES,
]);

export function validateUploadMimeList(contentType: string, allowed: string[]): void {
  if (!allowed.includes(contentType)) {
    throw new Error(`Unsupported file type: ${contentType}`);
  }
}

export function validateUploadMime(
  contentType: string,
  kind: "image" | "document" = "image",
): void {
  const allowed = kind === "document" ? ALLOWED_DOCUMENT_MIMES : ALLOWED_IMAGE_MIMES;
  if (!allowed.has(contentType)) {
    throw new Error(`Unsupported file type: ${contentType}`);
  }
}

export function validateBase64Size(dataBase64: string, maxBytes: number): void {
  const padding = dataBase64.endsWith("==") ? 2 : dataBase64.endsWith("=") ? 1 : 0;
  const size = Math.floor((dataBase64.length * 3) / 4) - padding;
  if (size > maxBytes) {
    throw new Error(`File exceeds maximum size of ${Math.round(maxBytes / 1024 / 1024)}MB`);
  }
}
