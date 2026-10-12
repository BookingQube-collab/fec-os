import "server-only";

import { analyzeImage } from "@/lib/ai/gateway";
import {
  emptyIdentityParse,
  hasIdentitySignal,
  identityReadFromTranscription,
  parseIdentityDocument,
  type IdentityDocType,
  type ParsedIdentityDocument,
} from "@/lib/hr/identity-document-parse";

const OCR_PROMPT = `Transcribe this identity document exactly as printed.
Include every Latin letter, digit, date, and MRZ line (lines made of letters, digits, and <).
Do not translate, summarize, or invent labels that are not printed.
Return plain text only.`;

const QID_OCR_PROMPT = `Transcribe this identity document exactly as printed.
It may show the front and back of a Qatar residency permit together, in English and Arabic.
Write one field per line and keep each English label with its value:
ID.No: <11 digits>
D.O.B: <date>
Expiry: <residency expiry>
Nationality: <English nationality>
Name: <name in Latin letters>
Passport Number: <passport number>
Passport Expiry: <date>
Serial No: <digits>
Copy digits and spelling from the card. Omit a line when that field is not visible. Do not invent values.
Return plain text only.`;

export type IdentityExtractResult = {
  parsed: ParsedIdentityDocument;
  source: "pdf_text" | "vision" | "none";
  /** True when nothing readable was found. The file can still be stored. */
  manual: boolean;
};

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

async function visionText(
  bytes: Buffer,
  contentType: string,
  docType: IdentityDocType,
): Promise<string | null> {
  try {
    const result = await analyzeImage({
      moduleSource: "hr.identity_document",
      temperature: 0,
      maxTokens: 4096,
      timeoutMs: 60_000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: docType === "qid" ? QID_OCR_PROMPT : OCR_PROMPT },
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
  if (hasIdentitySignal(fromPdf)) {
    return { parsed: fromPdf, source: "pdf_text", manual: false };
  }

  const visionMime = isPdf ? "application/pdf" : input.contentType;
  const canVision = visionMime === "application/pdf" || visionMime.startsWith("image/");
  if (canVision) {
    const transcribed = await visionText(input.bytes, visionMime, input.docType);
    if (transcribed) {
      const read = identityReadFromTranscription(transcribed, input.docType);
      return { parsed: read.parsed, source: "vision", manual: read.manual };
    }
  }

  if (pdfText.trim().length >= 20) {
    return { parsed: fromPdf, source: "pdf_text", manual: true };
  }
  return { parsed: emptyIdentityParse(), source: "none", manual: true };
}
