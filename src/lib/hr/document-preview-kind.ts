export type DocumentPreviewKind = "image" | "pdf" | "file";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function extensionOf(fileName: string | null | undefined) {
  const base = (fileName ?? "").split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** How a staff document can be shown. Images and PDFs render inline; anything else is a file card. */
export function documentPreviewKind(
  mime: string | null | undefined,
  fileName: string | null | undefined,
): DocumentPreviewKind {
  const type = (mime ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  const ext = extensionOf(fileName);
  if (IMAGE_EXT.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "file";
}
