import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { jsPDF } from "jspdf";

import type { HrLetterStaffContext } from "@/lib/hr/hr-letter-fallback";
import type { HrLetterDraft } from "@/lib/hr/hr-letter-types";

const HEADER_REL = path.join("public", "brand", "e3-letterhead-header.jpg");
const FOOTER_REL = path.join("public", "brand", "e3-letterhead-footer.jpg");

function formatLetterDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function wrapLines(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

async function loadBrandJpeg(relPath: string): Promise<string | null> {
  try {
    const abs = path.join(process.cwd(), relPath);
    const bytes = await readFile(abs);
    return bytes.toString("base64");
  } catch {
    return null;
  }
}

export type HrLetterPdfInput = {
  draft: HrLetterDraft;
  staff: HrLetterStaffContext;
  letterDate: string;
  letterTypeLabel: string;
  locale?: "en" | "ar";
};

/**
 * A4 PDF with official E3 letterhead header/footer rasters from public/brand
 * (extracted from docs/letterhead/letterhead.docx).
 */
export async function renderHrLetterPdf(input: HrLetterPdfInput): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 18;
  const contentW = pageW - marginX * 2;
  const rtl = input.locale === "ar";

  const [headerB64, footerB64] = await Promise.all([
    loadBrandJpeg(HEADER_REL),
    loadBrandJpeg(FOOTER_REL),
  ]);

  const headerH = 32;
  const footerH = 18;
  if (headerB64) {
    doc.addImage(`data:image/jpeg;base64,${headerB64}`, "JPEG", marginX, 10, contentW, headerH);
  }
  if (footerB64) {
    doc.addImage(
      `data:image/jpeg;base64,${footerB64}`,
      "JPEG",
      marginX,
      pageH - footerH - 8,
      contentW,
      footerH,
    );
  }

  let y = headerB64 ? 10 + headerH + 10 : 28;
  const align = rtl ? "right" : "left";
  const x = rtl ? pageW - marginX : marginX;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(formatLetterDate(input.letterDate), x, y, { align });
  y += 8;

  if (input.draft.reference?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Ref: ${input.draft.reference.trim()}`, x, y, { align });
    y += 8;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(123, 45, 142);
  const titleLines = wrapLines(doc, input.draft.subject.trim() || input.letterTypeLabel, contentW);
  for (const line of titleLines) {
    doc.text(line, pageW / 2, y, { align: "center" });
    y += 6;
  }
  y += 4;

  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const meta = [
    input.staff.fullName,
    input.staff.employeeCode ? `ID: ${input.staff.employeeCode}` : null,
    input.staff.jobTitle,
    input.staff.department,
  ]
    .filter(Boolean)
    .join(" · ");
  if (meta) {
    for (const line of wrapLines(doc, meta, contentW)) {
      doc.text(line, x, y, { align });
      y += 5;
    }
    y += 3;
  }

  for (const line of wrapLines(doc, input.draft.salutation.trim(), contentW)) {
    doc.text(line, x, y, { align });
    y += 5;
  }
  y += 3;

  const footerTop = pageH - footerH - 14;
  for (const paragraph of input.draft.bodyParagraphs) {
    const lines = wrapLines(doc, paragraph.trim(), contentW);
    for (const line of lines) {
      if (y > footerTop - 28) {
        doc.addPage();
        if (headerB64) {
          doc.addImage(`data:image/jpeg;base64,${headerB64}`, "JPEG", marginX, 10, contentW, headerH);
        }
        if (footerB64) {
          doc.addImage(
            `data:image/jpeg;base64,${footerB64}`,
            "JPEG",
            marginX,
            pageH - footerH - 8,
            contentW,
            footerH,
          );
        }
        y = headerB64 ? 10 + headerH + 10 : 28;
      }
      doc.text(line, x, y, { align });
      y += 5;
    }
    y += 4;
  }

  y += 4;
  for (const line of wrapLines(doc, input.draft.closing.trim(), contentW)) {
    doc.text(line, x, y, { align });
    y += 5;
  }
  y += 14;
  doc.setFont("helvetica", "bold");
  for (const line of wrapLines(doc, input.draft.signatoryTitle.trim(), contentW)) {
    doc.text(line, x, y, { align });
    y += 5;
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

export function uint8ToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
