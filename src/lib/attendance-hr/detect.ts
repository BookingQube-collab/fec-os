import { looksLikeTemplatePayload } from "./file-guard";
import { parseAttlogBuffer } from "./parse-attlog";
import { parseUserDat } from "./parse-user-dat";
import type { ImportFileType } from "./constants";

export type DetectedContent =
  | { kind: "user_dat" }
  | { kind: "attlog" }
  | { kind: "spreadsheet" }
  | { kind: "template"; message: string }
  | { kind: "unknown"; message: string };

export function detectBufferKind(buffer: Buffer, fileType: ImportFileType | "unknown"): DetectedContent {
  if (looksLikeTemplatePayload(buffer)) {
    return { kind: "template", message: "File content looks like a biometric template." };
  }
  if (fileType === "user_dat") {
    return { kind: "user_dat" };
  }
  if (fileType === "xlsx" || fileType === "xls" || fileType === "csv" || fileType === "tsv") {
    return { kind: "spreadsheet" };
  }

  const att = parseAttlogBuffer(buffer);
  if (att.punches.length > 0) return { kind: "attlog" };

  if (fileType === "attlog" && buffer.length > 0 && buffer.length % 72 === 0 && !isMostlyText(buffer)) {
    const parsed = parseUserDat(buffer);
    if (parsed.users.length > 0 && parsed.errors.every((e) => e.code !== "corrupt_user_dat")) {
      return { kind: "user_dat" };
    }
  }

  if (fileType === "attlog") return { kind: "attlog" };
  return { kind: "unknown", message: "Could not detect attendance file format." };
}

function isMostlyText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  let printable = 0;
  for (const b of sample) {
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)) printable += 1;
  }
  return sample.length > 0 && printable / sample.length > 0.85;
}
