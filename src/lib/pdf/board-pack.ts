import type { jsPDF } from "jspdf";

import type { BoardPackData } from "@/lib/reports.functions";
import { fmtQar } from "@/lib/currency";

async function loadPdfTools() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable: autoTableModule.default };
}

export async function buildBoardPackPdf(data: BoardPackData): Promise<jsPDF> {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const page = doc.internal.pageSize;
  let y = 56;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("FEC-OS Board Pack", 40, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Generated ${new Date(data.generated_at).toLocaleString("en-QA")}`, 40, y + 16);
  doc.setTextColor(0);
  y += 40;

  // Estate KPIs
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Estate snapshot (last 30 days)", 40, y);
  y += 16;
  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: [
      ["Revenue 30d", fmtQar(data.estate.revenue_30d)],
      ["EBITDA 30d", fmtQar(data.estate.ebitda_30d)],
      ["Margin", `${data.estate.margin_pct.toFixed(1)}%`],
      ["Active branches", `${data.estate.active_branches} / ${data.estate.total_branches}`],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [10, 18, 40] },
    margin: { left: 40, right: 40 },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 24;

  // Branch league
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Branch league", 40, y);
  y += 8;
  autoTable(doc, {
    startY: y + 4,
    head: [["Branch", "City", "Revenue 30d", "EBITDA", "Margin %", "Open tickets", "Urgent", "Incidents", "Score"]],
    body: data.branches.map((b) => [
      `${b.name} (${b.code})`,
      b.city,
      fmtQar(b.revenue_30d),
      fmtQar(b.ebitda_30d),
      b.margin_pct.toFixed(1),
      b.open_tickets,
      b.urgent_tickets,
      b.incidents_30d,
      b.score,
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [10, 18, 40] },
    margin: { left: 40, right: 40 },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 24;

  // Latest brief
  if (data.latest_brief?.narrative) {
    if (y > page.getHeight() - 200) { doc.addPage(); y = 56; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Latest AI brief", 40, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const wrapped = doc.splitTextToSize(data.latest_brief.narrative, page.getWidth() - 80);
    doc.text(wrapped, 40, y);
    y += wrapped.length * 12 + 16;
  }

  // Leakage
  if (data.open_leakage.length) {
    if (y > page.getHeight() - 180) { doc.addPage(); y = 56; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Open leakage cases", 40, y);
    y += 8;
    autoTable(doc, {
      startY: y + 4,
      head: [["Detected", "Category", "Status", "Estimated loss"]],
      body: data.open_leakage.map((l) => [l.detected_on, l.category, l.status, fmtQar(l.estimated_loss)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [10, 18, 40] },
      margin: { left: 40, right: 40 },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // Incidents
  if (data.open_incidents_24h.length) {
    if (y > page.getHeight() - 180) { doc.addPage(); y = 56; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Incidents (last 24h)", 40, y);
    y += 8;
    autoTable(doc, {
      startY: y + 4,
      head: [["When", "Severity", "Summary"]],
      body: data.open_incidents_24h.map((i) => [new Date(i.occurred_at).toLocaleString("en-QA"), i.severity, i.summary]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [10, 18, 40] },
      margin: { left: 40, right: 40 },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // Complaints
  if (data.open_complaints.length) {
    if (y > page.getHeight() - 180) { doc.addPage(); y = 56; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Open customer complaints", 40, y);
    y += 8;
    autoTable(doc, {
      startY: y + 4,
      head: [["Channel", "Severity", "Summary"]],
      body: data.open_complaints.map((c) => [c.channel ?? "—", c.severity, c.summary]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [10, 18, 40] },
      margin: { left: 40, right: 40 },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // POs
  if (data.open_pos.length) {
    if (y > page.getHeight() - 180) { doc.addPage(); y = 56; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Purchase orders awaiting action", 40, y);
    y += 8;
    autoTable(doc, {
      startY: y + 4,
      head: [["PO #", "Vendor", "Status", "Amount"]],
      body: data.open_pos.map((p) => [p.po_number, p.vendor_name, p.status, fmtQar(p.amount)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [10, 18, 40] },
      margin: { left: 40, right: 40 },
    });
  }

  // Footer
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`FEC-OS · Confidential · Page ${i} of ${pages}`, 40, page.getHeight() - 24);
  }

  return doc;
}