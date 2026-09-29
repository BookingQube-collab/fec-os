const IDENTITY_FILE_MAX_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export const IDENTITY_FILE_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp";

export function identityFileContentType(file: { name: string; type: string }): string | null {
  const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
  if (file.type && allowed.has(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? null;
}

export async function fileToBase64(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export { IDENTITY_FILE_MAX_BYTES };
