import type { jsPDF } from "jspdf";

import { fmtQar } from "@/lib/currency";
import type { ExecutiveWeeklyReport, RagStatus } from "@/lib/weekly-reports/executive-report-types";

async function loadPdfTools() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable: autoTableModule.default };
}

const RAG_RGB: Record<RagStatus, [number, number, number]> = {
  green: [34, 139, 84],
  amber: [217, 119, 6],
  red: [220, 38, 38],
};

function ensureSpace(doc: jsPDF, y: number, need: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need > pageH - 40) {
    doc.addPage();
    return 48;
  }
  return y;
}

function sectionTitle(doc: jsPDF, title: string, y: number): number {
  y = ensureSpace(doc, y, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(10, 18, 40);
  doc.text(title, 40, y);
  return y + 14;
}

function bodyText(doc: jsPDF, text: string, y: number, maxWidth = 515): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(40);
  const lines = doc.splitTextToSize(text, maxWidth);
  y = ensureSpace(doc, y, lines.length * 11 + 8);
  doc.text(lines, 40, y);
  return y + lines.length * 11 + 6;
}

function bulletList(doc: jsPDF, items: string[], y: number): number {
  for (const item of items) {
    y = bodyText(doc, `• ${item}`, y);
  }
  return y + 4;
}

export async function buildExecutiveWeeklyReportPdf(report: ExecutiveWeeklyReport): Promise<jsPDF> {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = 48;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("CEO/GM Weekly Executive Report", 40, y);
  y += 18;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90);
  doc.text(`${report.meta.company}`, 40, y);
  y += 14;
  doc.text(`Week ${report.meta.week_start} → ${report.meta.week_end}`, 40, y);
  y += 12;
  doc.text(`Generated ${new Date(report.meta.generated_at).toLocaleString("en-QA")} · ${report.meta.generation_mode}`, 40, y);
  doc.setTextColor(0);
  y += 24;

  y = sectionTitle(doc, "1. Executive Summary", y);
  y = bodyText(doc, `Performance: ${report.executive_summary.performance}`, y);
  y = bodyText(doc, `Health: ${report.executive_summary.health}`, y);
  y = bodyText(doc, `Risk level: ${report.executive_summary.risk_level}`, y);
  y = bodyText(doc, `Recommendation: ${report.executive_summary.recommendation}`, y);
  if (report.executive_summary.achievements.length) {
    y = bodyText(doc, "Achievements:", y);
    y = bulletList(doc, report.executive_summary.achievements, y);
  }
  if (report.executive_summary.concerns.length) {
    y = bodyText(doc, "Concerns:", y);
    y = bulletList(doc, report.executive_summary.concerns, y);
  }

  y = sectionTitle(doc, "2. Executive KPI Dashboard", y);
  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value", "RAG", "Note"]],
    body: report.kpi_dashboard.map((k) => [k.metric, k.value, k.rag.toUpperCase(), k.note ?? ""]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [10, 18, 40] },
    margin: { left: 40, right: 40 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        const rag = String(data.cell.raw).toLowerCase() as RagStatus;
        if (RAG_RGB[rag]) {
          data.cell.styles.textColor = RAG_RGB[rag];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 20;

  y = sectionTitle(doc, "3. Location Performance Ranking", y);
  autoTable(doc, {
    startY: y,
    head: [["Location", "Score", "Strengths", "Weaknesses", "Critical issues"]],
    body: report.location_ranking.map((l) => [
      l.location,
      l.score,
      l.strengths.join("; ") || "—",
      l.weaknesses.join("; ") || "—",
      l.critical_issues.join("; ") || "—",
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [10, 18, 40] },
    margin: { left: 40, right: 40 },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 20;

  y = sectionTitle(doc, "4. Top Achievements", y);
  for (const a of report.top_achievements) {
    y = bodyText(doc, `${a.title}${a.location ? ` (${a.location})` : ""}: ${a.detail}`, y);
  }
  y += 8;

  y = sectionTitle(doc, "5. Top Risks", y);
  autoTable(doc, {
    startY: y,
    head: [["Severity", "Title", "Impact", "Action", "Location"]],
    body: report.top_risks.map((r) => [r.severity, r.title, r.impact, r.recommended_action, r.location ?? "Estate"]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [10, 18, 40] },
    margin: { left: 40, right: 40 },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 20;

  y = sectionTitle(doc, "6. Maintenance Summary", y);
  const m = report.maintenance_summary;
  y = bodyText(
    doc,
    `Open: ${m.open} · Closed: ${m.closed} · Overdue: ${m.overdue} · Vendor pending: ${m.vendor_pending} · Critical: ${m.critical}`,
    y,
  );
  if (m.highlights.length) y = bulletList(doc, m.highlights, y);

  y = sectionTitle(doc, "7. Compliance Summary", y);
  const c = report.compliance_summary;
  autoTable(doc, {
    startY: y,
    head: [["Area", "Status"]],
    body: [
      ["QCDD", c.qcdd],
      ["Fire alarm", c.fire_alarm],
      ["Fire fighting", c.fire_fighting],
      ["CCTV", c.cctv],
      ["Pest control", c.pest_control],
      ["HVAC", c.hvac],
      ["Kitchen", c.kitchen],
      ["Medical certs", c.medical_certs],
      ["Licenses", c.licenses],
      ["AMC", c.amc],
      ["Renewals", c.renewals],
      ["Expired", c.expired],
    ],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [10, 18, 40] },
    margin: { left: 40, right: 40 },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 20;

  y = sectionTitle(doc, "8. Customer Experience Summary", y);
  const cx = report.customer_experience;
  y = bodyText(doc, `Complaints: ${cx.complaints}`, y);
  if (cx.recurring_issues.length) y = bulletList(doc, cx.recurring_issues, y);

  y = sectionTitle(doc, "9. Staffing Summary", y);
  const st = report.staffing_summary;
  y = bodyText(
    doc,
    `Attendance: ${st.attendance_pct != null ? `${st.attendance_pct}%` : "—"} · Absenteeism: ${st.absenteeism} · Overtime: ${st.overtime}`,
    y,
  );
  y = bodyText(doc, `Performance: ${st.performance} · Training: ${st.training}`, y);

  y = sectionTitle(doc, "10. Financial & Business Summary", y);
  const f = report.financial_summary;
  y = bodyText(doc, `Revenue: ${f.revenue} · Targets: ${f.targets}`, y);
  y = bodyText(doc, `Events: ${f.events} · Birthdays: ${f.birthdays} · Promotions: ${f.promotions}`, y);
  if (f.opportunities.length) y = bulletList(doc, f.opportunities, y);

  y = sectionTitle(doc, "11. Decisions Required from CEO/GM", y);
  if (report.decisions_required.length) {
    autoTable(doc, {
      startY: y,
      head: [["Issue", "Impact", "Decision", "Priority", "Owner", "Date"]],
      body: report.decisions_required.map((d) => [
        d.issue,
        d.impact,
        d.recommended_decision,
        d.priority,
        d.owner,
        d.required_date,
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [10, 18, 40] },
      margin: { left: 40, right: 40 },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 20;
  } else {
    y = bodyText(doc, "No pending decisions flagged.", y);
  }

  y = sectionTitle(doc, "12. Next Week Priorities", y);
  autoTable(doc, {
    startY: y,
    head: [["Action", "Owner", "Deadline", "Status"]],
    body: report.next_week_priorities.map((p) => [p.action, p.owner, p.deadline, p.status]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [10, 18, 40] },
    margin: { left: 40, right: 40 },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 20;

  y = sectionTitle(doc, "13. Head of Operations Assessment", y);
  y = bodyText(doc, report.head_of_operations_assessment, y);

  y = sectionTitle(doc, "14. Executive Action Tracker", y);
  autoTable(doc, {
    startY: y,
    head: [["Action", "Location", "Owner", "Priority", "Deadline", "Status"]],
    body: report.action_tracker.map((a) => [a.action, a.location, a.owner, a.priority, a.deadline, a.status]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [10, 18, 40] },
    margin: { left: 40, right: 40 },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`FEC-OS Executive Weekly Report · ${report.meta.week_start} · Page ${i}/${pages}`, 40, doc.internal.pageSize.getHeight() - 20);
  }

  return doc;
}

export async function downloadExecutiveWeeklyReportPdf(report: ExecutiveWeeklyReport, filename?: string) {
  const doc = await buildExecutiveWeeklyReportPdf(report);
  doc.save(filename ?? `e3-executive-weekly-${report.meta.week_start}.pdf`);
}

/** Used in PDF revenue cells when report stores formatted strings */
export { fmtQar };
