import type { jsPDF } from "jspdf";

import {
  ORG_PDF_CARD_PAD,
  ORG_PDF_HEADER,
  ORG_PDF_MARGIN,
  ORG_PDF_TITLE_BLOCK,
  orgChartPdfFilename,
  orgChartPdfNameLineHeight,
  orgChartPdfPageOrientation,
  prepareOrgChartPdf,
  type OrgChartPdfCard,
  type OrgChartPdfCurve,
  type OrgChartPdfPlan,
  type OrgChartPdfRequest,
  type OrgChartPdfTile,
} from "@/lib/org-chart-pdf";

function intersects(
  box: { x: number; y: number; width: number; height: number },
  tile: OrgChartPdfTile,
): boolean {
  return (
    box.x < tile.originX + tile.contentWidth &&
    box.x + box.width > tile.originX &&
    box.y < tile.originY + tile.contentHeight &&
    box.y + box.height > tile.originY
  );
}

function curveBox(curve: OrgChartPdfCurve): { x: number; y: number; width: number; height: number } {
  const xs = [curve.x1, curve.c1x, curve.c2x, curve.x2];
  const ys = [curve.y1, curve.c1y, curve.c2y, curve.y2];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function drawCurve(doc: jsPDF, curve: OrgChartPdfCurve, tile: OrgChartPdfTile) {
  const x = (value: number) => ORG_PDF_MARGIN + value - tile.originX;
  const y = (value: number) => ORG_PDF_HEADER + value - tile.originY;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(1.15);
  doc.moveTo(x(curve.x1), y(curve.y1));
  doc.curveTo(x(curve.c1x), y(curve.c1y), x(curve.c2x), y(curve.c2y), x(curve.x2), y(curve.y2));
  doc.stroke();
}

function drawCard(doc: jsPDF, card: OrgChartPdfCard, tile: OrgChartPdfTile) {
  const x = ORG_PDF_MARGIN + card.x - tile.originX;
  const y = ORG_PDF_HEADER + card.y - tile.originY;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.9);
  doc.roundedRect(x, y, card.width, card.height, 7, 7, "FD");

  const radius = 10;
  const cx = x + ORG_PDF_CARD_PAD + radius;
  const cy = y + card.height / 2;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(226, 232, 240);
  doc.circle(cx, cy, radius, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  doc.text(card.initials, cx, cy + 2.4, { align: "center" });

  const textX = cx + radius + 6;
  const lineCount = Math.max(1, card.nameLines.length);
  const lineH = orgChartPdfNameLineHeight(card.height, lineCount);
  const nameSize = Math.max(8, Math.min(11, lineH * 0.72));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(nameSize);
  doc.setTextColor(15, 23, 42);
  let baseline = y + ORG_PDF_CARD_PAD + lineH * 0.78;
  for (const line of card.nameLines) {
    doc.text(line, textX, baseline);
    baseline += lineH;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const titleBaseline = Math.min(y + card.height - 4, y + card.height - ORG_PDF_TITLE_BLOCK + 8);
  doc.text(card.jobTitle, textX, titleBaseline);
}

function lockPageSize(doc: jsPDF, tile: OrgChartPdfTile) {
  // jsPDF swaps a custom format when it disagrees with orientation. Write the
  // planned size onto the page before drawing so a wide tree is not cropped.
  doc.internal.pageSize.width = tile.pageWidth;
  doc.internal.pageSize.height = tile.pageHeight;
}

function drawTile(doc: jsPDF, plan: OrgChartPdfPlan, tile: OrgChartPdfTile, pageNumber: number, pageCount: number) {
  lockPageSize(doc, tile);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(plan.heading, ORG_PDF_MARGIN, 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(plan.dateLabel, tile.pageWidth - ORG_PDF_MARGIN, 24, { align: "right" });

  doc.saveGraphicsState();
  doc.rect(ORG_PDF_MARGIN, ORG_PDF_HEADER, tile.contentWidth, tile.contentHeight, null);
  doc.clip();
  doc.discardPath();
  for (const curve of plan.curves) {
    if (intersects(curveBox(curve), tile)) drawCurve(doc, curve, tile);
  }
  for (const card of plan.cards) {
    if (intersects(card, tile)) drawCard(doc, card, tile);
  }
  doc.restoreGraphicsState();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("Organization chart", ORG_PDF_MARGIN, tile.pageHeight - 14);
  doc.text(`${pageNumber} / ${pageCount}`, tile.pageWidth - ORG_PDF_MARGIN, tile.pageHeight - 14, { align: "right" });
}

export async function buildOrgChartPdf(input: OrgChartPdfRequest): Promise<jsPDF> {
  const { jsPDF } = await import("jspdf");
  const plan = prepareOrgChartPdf(input);
  const first = plan.tiles[0];
  if (!first) throw new Error("Organization chart PDF has no pages.");
  const doc = new jsPDF({
    unit: "pt",
    format: [first.pageWidth, first.pageHeight],
    orientation: orgChartPdfPageOrientation(first.pageWidth, first.pageHeight),
    compress: false,
  });
  doc.setProperties({ title: plan.heading, subject: "Organization chart" });
  plan.tiles.forEach((tile, index) => {
    if (index > 0) {
      doc.addPage([tile.pageWidth, tile.pageHeight], orgChartPdfPageOrientation(tile.pageWidth, tile.pageHeight));
    }
    drawTile(doc, plan, tile, index + 1, plan.tiles.length);
  });
  return doc;
}

export async function downloadOrgChartPdf(input: OrgChartPdfRequest & { filename?: string }): Promise<void> {
  const doc = await buildOrgChartPdf(input);
  const filename =
    input.filename ??
    orgChartPdfFilename(input.generatedAt ?? new Date(), input.readOnly ? "team" : "company");
  doc.save(filename);
}
