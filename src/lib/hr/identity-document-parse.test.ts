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
  nationality: "",
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

  it("reads a Qatar residency permit front and back, including passport and nationality", () => {
    const text = [
      "State Of Qatar",
      "Residency Permit",
      "دولة قطر",
      "رخصة إقامة",
      "ID.No: 28511223344 الرقم الشخصي:",
      "D.O.B: 01/02/1990 تاريخ الميلاد:",
      "Expiry: 15/08/2028 الصلاحية:",
      "Nationality: الفلبين",
      "PHILIPPINES الجنسية:",
      "Occupation: كاشير المهنة:",
      "الإسم: جين دو",
      "Name: JANE MARIE DOE",
      "Passport Number: P1234567 رقم جواز السفر:",
      "Passport Expiry: 20/11/2032 تاريخ انتهاء الجواز:",
      "Serial No: 30130285112233 الرقم المسلسل:",
      "Residency Type: عمل نوع الرخصة:",
    ].join("\n");

    const parsed = parseIdentityDocument(text, "qid");
    expect(parsed.name).toEqual({ value: "JANE MARIE DOE", confidence: "high" });
    expect(parsed.documentNumber).toEqual({ value: "28511223344", confidence: "high" });
    expect(parsed.expiryDate).toEqual({ value: "2028-08-15", confidence: "high" });
    expect(parsed.passportNumber).toEqual({ value: "P1234567", confidence: "high" });
    expect(parsed.passportExpiry).toEqual({ value: "2032-11-20", confidence: "high" });
    expect(parsed.nationality).toEqual({ value: "Philippines", confidence: "high" });
    expect(parsed.expiryDate?.value).not.toBe("1990-02-01");
    expect(parsed.documentNumber?.value).not.toBe("30130285112");
  });

  it("reads the same permit when OCR keeps the front and back on one line", () => {
    const text =
      "State Of Qatar Residency Permit ID.No: 28511223344 D.O.B: 01/02/1990 Expiry: 15/08/2028 Nationality: PHILIPPINES Name: JANE MARIE DOE Passport Number: P1234567 Passport Expiry: 20/11/2032 Serial No: 30130285112233";
    const parsed = parseIdentityDocument(text, "qid");
    expect(parsed.name?.value).toBe("JANE MARIE DOE");
    expect(parsed.documentNumber?.value).toBe("28511223344");
    expect(parsed.expiryDate?.value).toBe("2028-08-15");
    expect(parsed.passportNumber?.value).toBe("P1234567");
    expect(parsed.passportExpiry?.value).toBe("2032-11-20");
    expect(parsed.nationality?.value).toBe("Philippines");
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

  it("fills passport and nationality from a residency permit without touching visa fields", () => {
    const parsed = parseIdentityDocument(
      [
        "ID.No: 28511223344",
        "Name: JANE MARIE DOE",
        "Expiry: 15/08/2028",
        "Nationality: PHILIPPINES",
        "Passport Number: P1234567",
        "Passport Expiry: 20/11/2032",
        "D.O.B: 01/02/1990",
        "Serial No: 30130285112233",
      ].join("\n"),
      "qid",
    );
    const applied = applyIdentityExtraction(emptyFields(), "qid", parsed);
    expect(applied.fields.fullName).toBe("JANE MARIE DOE");
    expect(applied.fields.qid).toBe("28511223344");
    expect(applied.fields.qidExpiry).toBe("2028-08-15");
    expect(applied.fields.passportNumber).toBe("P1234567");
    expect(applied.fields.passportExpiry).toBe("2032-11-20");
    expect(applied.fields.nationality).toBe("Philippines");
    expect(applied.fields.visaNumber).toBe("");
    expect(applied.fields.visaExpiry).toBe("");
    expect(applied.suggestions).toEqual({});
  });

  it("keeps a typed passport number when the residency permit disagrees", () => {
    const parsed = parseIdentityDocument(
      ["ID.No: 28511223344", "Passport Number: P1234567", "Expiry: 15/08/2028"].join("\n"),
      "qid",
    );
    const current = { ...emptyFields(), passportNumber: "X999999" };
    const applied = applyIdentityExtraction(current, "qid", parsed);
    expect(applied.fields.passportNumber).toBe("X999999");
    expect(applied.suggestions.passportNumber).toBe("P1234567");
    expect(applied.fields.qid).toBe("28511223344");
    expect(applied.fields.qidExpiry).toBe("2028-08-15");
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
