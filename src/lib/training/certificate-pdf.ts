import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export type CertificatePdfInput = {
  holderName: string;
  courseTitle: string;
  courseCode: string | null;
  issuedAt: string | null;
  validUntil: string | null;
  score: number | null;
  signatoryName: string | null;
  displayCode: string;
  verifyUrl: string;
};

function line(value: string | null, fallback: string) {
  const text = value?.trim() ?? "";
  return text || fallback;
}

/** Server-side certificate. Fields come from the caller, which must load them from the database. */
export async function renderCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setDrawColor(20, 60, 70);
  doc.setLineWidth(1.2);
  doc.rect(12, 12, 273, 186);
  doc.setLineWidth(0.3);
  doc.rect(16, 16, 265, 178);

  doc.setFont("times", "bold");
  doc.setFontSize(28);
  doc.text("Certificate of completion", 148.5, 42, { align: "center" });
  doc.setFont("times", "italic");
  doc.setFontSize(14);
  doc.text("This certifies that", 148.5, 58, { align: "center" });
  doc.setFont("times", "bold");
  doc.setFontSize(26);
  doc.text(input.holderName, 148.5, 74, { align: "center" });
  doc.setFont("times", "normal");
  doc.setFontSize(14);
  doc.text("has successfully completed", 148.5, 88, { align: "center" });
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text(input.courseTitle, 148.5, 102, { align: "center", maxWidth: 180 });

  doc.setFont("times", "normal");
  doc.setFontSize(12);
  const details = [
    line(input.courseCode, "Course code not stored"),
    input.issuedAt ? `Completed ${input.issuedAt.slice(0, 10)}` : "Completion date not stored",
    input.score == null ? "Score not recorded" : `Score ${input.score}`,
    input.validUntil ? `Valid until ${input.validUntil}` : "No expiry",
    input.displayCode,
  ];
  details.forEach((text, index) => {
    doc.text(text, 36, 124 + index * 8);
  });
  doc.text(line(input.signatoryName, "Authorized signatory"), 36, 176);
  doc.setFontSize(10);
  doc.text("Authorized signatory", 36, 182);

  const qr = await QRCode.toDataURL(input.verifyUrl, { margin: 0, width: 180 });
  doc.addImage(qr, "PNG", 220, 128, 42, 42);
  doc.setFontSize(9);
  doc.text("Verify", 241, 176, { align: "center" });

  return new Uint8Array(doc.output("arraybuffer"));
}
