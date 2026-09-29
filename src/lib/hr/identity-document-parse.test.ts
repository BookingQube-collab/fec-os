import { describe, expect, it } from "vitest";

import {
  applyIdentityExtraction,
  parseIdentityDocument,
  type IdentityFormFields,
} from "./identity-document-parse";

function padMrz(value: string): string {
  return (value + "<".repeat(44)).slice(0, 44);
}

const emptyFields = (): IdentityFormFields => ({
  fullName: "",
  qid: "",
  qidExpiry: "",
  passportNumber: "",
  passportExpiry: "",
  visaNumber: "",
  visaExpiry: "",
  contractNumber: "",
  contractExpiry: "",
});

describe("parseIdentityDocument", () => {
  it("reads a PDF text layer the same way the server extract does", async () => {
    const content =
      "BT /F1 12 Tf 40 340 Td (ID. No. 28412345678) Tj 0 -24 Td (Name) Tj 0 -24 Td (MOHAMMED ALI HASSAN) Tj 0 -24 Td (Date of Expiry 15/03/2028) Tj ET";
    const objects = [
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
      "2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n",
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 500 500]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n",
      `4 0 obj<</Length ${Buffer.byteLength(content)}>>stream\n${content}\nendstream\nendobj\n`,
      "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n",
    ];
    let body = "%PDF-1.4\n";
    const offsets = [0];
    for (const obj of objects) {
      offsets.push(Buffer.byteLength(body));
      body += obj;
    }
    const xrefStart = Buffer.byteLength(body);
    let xref = "xref\n0 6\n0000000000 65535 f \n";
    for (let i = 1; i <= 5; i += 1) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    const pdf = Buffer.from(`${body}${xref}trailer<</Size 6/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`);
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: pdf });
    try {
      const result = await parser.getText();
      const text = (result.pages ?? []).map((page: { text?: string }) => page.text ?? "").join("\n");
      const parsed = parseIdentityDocument(text, "qid");
      expect(parsed.name?.value).toBe("MOHAMMED ALI HASSAN");
      expect(parsed.documentNumber?.value).toBe("28412345678");
      expect(parsed.expiryDate?.value).toBe("2028-03-15");
    } finally {
      await parser.destroy?.();
    }
  });

  it("reads a Qatar QID text layer into name, number, and expiry", () => {
    const text = [
      "STATE OF QATAR",
      "RESIDENCY PERMIT",
      "ID. No.",
      "28412345678",
      "Name",
      "MOHAMMED ALI HASSAN",
      "Nationality",
      "INDIA",
      "Date of Birth",
      "01/01/1985",
      "Date of Expiry",
      "15/03/2028",
    ].join("\n");

    const parsed = parseIdentityDocument(text, "qid");
    expect(parsed.name).toEqual({ value: "MOHAMMED ALI HASSAN", confidence: "high" });
    expect(parsed.documentNumber).toEqual({ value: "28412345678", confidence: "high" });
    expect(parsed.expiryDate).toEqual({ value: "2028-03-15", confidence: "high" });
  });

  it("reads passport number and expiry from labels and a TD3 MRZ", () => {
    const mrzName = padMrz("P<QATHASSAN<<MOHAMMED<ALI");
    const mrzData = padMrz("A123456784QAT8501019M2803157");
    expect(mrzName).toHaveLength(44);
    expect(mrzData).toHaveLength(44);

    const text = [
      "PASSPORT",
      "Surname",
      "HASSAN",
      "Given Names",
      "MOHAMMED ALI",
      "Passport No.",
      "A12345678",
      "Date of birth",
      "01 JAN 1985",
      "Date of expiry",
      "15 MAR 2028",
      mrzName,
      mrzData,
    ].join("\n");

    const parsed = parseIdentityDocument(text, "passport");
    expect(parsed.documentNumber).toEqual({ value: "A12345678", confidence: "high" });
    expect(parsed.expiryDate).toEqual({ value: "2028-03-15", confidence: "high" });
    expect(parsed.name).toEqual({ value: "MOHAMMED ALI HASSAN", confidence: "high" });
  });

  it("reads visa number and expiry", () => {
    const parsed = parseIdentityDocument(
      ["ENTRY VISA", "Visa No. V-2024-88321", "Date of Expiry", "01/12/2027"].join("\n"),
      "visa",
    );
    expect(parsed.documentNumber).toEqual({ value: "V-2024-88321", confidence: "high" });
    expect(parsed.expiryDate).toEqual({ value: "2027-12-01", confidence: "high" });
  });

  it("reads contract number and end date", () => {
    const parsed = parseIdentityDocument(
      ["EMPLOYMENT CONTRACT", "Contract No. FEC-CT-2024-014", "End Date", "31/12/2026"].join("\n"),
      "contract",
    );
    expect(parsed.documentNumber).toEqual({ value: "FEC-CT-2024-014", confidence: "high" });
    expect(parsed.expiryDate).toEqual({ value: "2026-12-31", confidence: "high" });
  });
});

describe("applyIdentityExtraction", () => {
  const qidText = [
    "ID. No. 28412345678",
    "Name",
    "MOHAMMED ALI HASSAN",
    "Date of Expiry 15/03/2028",
  ].join("\n");

  it("fills empty name, QID, and expiry", () => {
    const parsed = parseIdentityDocument(qidText, "qid");
    const applied = applyIdentityExtraction(emptyFields(), "qid", parsed);
    expect(applied.fields.fullName).toBe("MOHAMMED ALI HASSAN");
    expect(applied.fields.qid).toBe("28412345678");
    expect(applied.fields.qidExpiry).toBe("2028-03-15");
    expect(applied.suggestions).toEqual({});
  });

  it("keeps a typed QID that differs and offers the extracted value", () => {
    const parsed = parseIdentityDocument(qidText, "qid");
    const current = { ...emptyFields(), fullName: "MOHAMMED ALI HASSAN", qid: "29000000001" };
    const applied = applyIdentityExtraction(current, "qid", parsed);
    expect(applied.fields.qid).toBe("29000000001");
    expect(applied.fields.qidExpiry).toBe("2028-03-15");
    expect(applied.suggestions.qid).toBe("28412345678");
    expect(applied.suggestions.fullName).toBeUndefined();
  });

  it("does not fill an empty field from a low-confidence value", () => {
    const applied = applyIdentityExtraction(emptyFields(), "visa", {
      name: null,
      documentNumber: { value: "V88421", confidence: "low" },
      expiryDate: { value: "2027-12-01", confidence: "high" },
    });
    expect(applied.fields.visaNumber).toBe("");
    expect(applied.suggestions.visaNumber).toBe("V88421");
    expect(applied.fields.visaExpiry).toBe("2027-12-01");
  });

  it("fills an empty passport number and expiry without touching a typed name", () => {
    const parsed = parseIdentityDocument(
      ["Passport No. A12345678", "Date of expiry 15 MAR 2028", "Surname HASSAN"].join("\n"),
      "passport",
    );
    const current = { ...emptyFields(), fullName: "Desk Entry" };
    const applied = applyIdentityExtraction(current, "passport", parsed);
    expect(applied.fields.fullName).toBe("Desk Entry");
    expect(applied.fields.passportNumber).toBe("A12345678");
    expect(applied.fields.passportExpiry).toBe("2028-03-15");
    expect(applied.suggestions.fullName).toBeUndefined();
  });
});
