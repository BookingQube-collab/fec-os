import "server-only";

import { analyzeImage } from "@/lib/ai/gateway";
import {
  emptyIdentityParse,
  parseIdentityDocument,
  type IdentityDocType,
  type ParsedIdentityDocument,
} from "@/lib/hr/identity-document-parse";

const OCR_PROMPT = `Transcribe this identity document exactly as printed.
Include every Latin letter, digit, date, and MRZ line (lines made of letters, digits, and <).
Do not translate, summarize, or invent labels that are not printed.
Return plain text only.`;

export type IdentityExtractResult = {
  parsed: ParsedIdentityDocument;
  source: "pdf_text" | "vision" | "none";
  /** True when nothing readable was found. The file can still be stored. */
  manual: boolean;
};

function hasSignal(parsed: ParsedIdentityDocument): boolean {
  return Boolean(parsed.name || parsed.documentNumber || parsed.expiryDate);
}

async function pdfPlainText(bytes: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return (result.pages ?? [])
      .map((page: { text?: string }) => String(page.text ?? ""))
      .join("\n");
  } finally {
    await parser.destroy?.();
  }
}

async function visionText(bytes: Buffer, contentType: string): Promise<string | null> {
  try {
    const result = await analyzeImage({
      moduleSource: "hr.identity_document",
      temperature: 0,
      maxTokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            { type: "image", mimeType: contentType, data: bytes.toString("base64") },
          ],
        },
      ],
    });
    const text = result.text?.trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function extractIdentityDocumentFromBytes(input: {
  docType: IdentityDocType;
  filename: string;
  bytes: Buffer;
  contentType: string;
}): Promise<IdentityExtractResult> {
  const isPdf =
    input.contentType === "application/pdf" || input.filename.toLowerCase().endsWith(".pdf");
  let pdfText = "";
  if (isPdf) {
    try {
      pdfText = await pdfPlainText(input.bytes);
    } catch {
      pdfText = "";
    }
  }

  const fromPdf = pdfText.trim().length >= 20 ? parseIdentityDocument(pdfText, input.docType) : emptyIdentityParse();
  if (hasSignal(fromPdf)) {
    return { parsed: fromPdf, source: "pdf_text", manual: false };
  }

  const visionMime = isPdf ? "application/pdf" : input.contentType;
  const canVision = visionMime === "application/pdf" || visionMime.startsWith("image/");
  if (canVision) {
    const transcribed = await visionText(input.bytes, visionMime);
    if (transcribed) {
      const parsed = parseIdentityDocument(transcribed, input.docType);
      return { parsed, source: "vision", manual: !hasSignal(parsed) };
    }
  }

  if (pdfText.trim().length >= 20) {
    return { parsed: fromPdf, source: "pdf_text", manual: true };
  }
  return { parsed: emptyIdentityParse(), source: "none", manual: true };
}
