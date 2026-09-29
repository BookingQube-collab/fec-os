/**
 * Pure parser for Qatar QID cards, passport biodata (including TD3 MRZ),
 * visas, and employment contracts. No I/O — OCR and PDF text feed this.
 */

export const IDENTITY_DOC_TYPES = ["qid", "passport", "visa", "contract"] as const;
export type IdentityDocType = (typeof IDENTITY_DOC_TYPES)[number];

export type FieldConfidence = "high" | "low";

export type ConfidentValue = {
  value: string;
  confidence: FieldConfidence;
};

export type ParsedIdentityDocument = {
  name: ConfidentValue | null;
  documentNumber: ConfidentValue | null;
  expiryDate: ConfidentValue | null;
};

export type IdentityFieldKey =
  | "fullName"
  | "qid"
  | "qidExpiry"
  | "passportNumber"
  | "passportExpiry"
  | "visaNumber"
  | "visaExpiry"
  | "contractNumber"
  | "contractExpiry";

export type IdentityFormFields = Record<IdentityFieldKey, string>;

export type IdentitySuggestions = Partial<Record<IdentityFieldKey, string>>;

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const NAME_LABEL =
  /^(?:full\s*name|card\s*holder|holder\s*name|name|الاسم|الإسم)\s*[:\-]?\s*(.*)$/i;
const SURNAME_LABEL = /^(?:surname|last\s*name|family\s*name)\s*[:\-]?\s*(.*)$/i;
const GIVEN_LABEL = /^(?:given\s*names?|first\s*names?|forenames?)\s*[:\-]?\s*(.*)$/i;
const QID_LABEL =
  /^(?:id\.?\s*no\.?|i\.?d\.?\s*(?:no\.?|number)|qid(?:\s*(?:no\.?|number))?|identity\s*(?:card\s*)?(?:no\.?|number)?|civil\s*(?:id|number)|رقم\s*الهوية|الرقم\s*الشخصي)\s*[:.\-]?\s*(.*)$/i;
const PASSPORT_LABEL =
  /^(?:passport\s*(?:no\.?|number|#)?|document\s*no\.?|رقم\s*الجواز)\s*[:.\-]?\s*(.*)$/i;
const VISA_LABEL =
  /^(?:visa\s*(?:no\.?|number|#)?|permit\s*(?:no\.?|number)?|work\s*permit\s*(?:no\.?|number)?)\s*[:.\-]?\s*(.*)$/i;
const CONTRACT_LABEL =
  /^(?:contract\s*(?:no\.?|number|ref(?:erence)?)|agreement\s*(?:no\.?|number)?)\s*[:.\-]?\s*(.*)$/i;
const EXPIRY_LABEL =
  /^(?:date\s*of\s*expiry|expiry\s*date|date\s*of\s*expiration|expir(?:y|es)(?:\s*on)?|valid\s*(?:until|to|thru|through)|end\s*date|contract\s*end|تاريخ\s*الانتهاء|تاريخ\s*الإنتهاء)\s*[:\-]?\s*(.*)$/i;

const DOC_FIELDS: Record<
  IdentityDocType,
  { name?: IdentityFieldKey; number?: IdentityFieldKey; expiry?: IdentityFieldKey }
> = {
  qid: { name: "fullName", number: "qid", expiry: "qidExpiry" },
  passport: { name: "fullName", number: "passportNumber", expiry: "passportExpiry" },
  visa: { number: "visaNumber", expiry: "visaExpiry" },
  contract: { number: "contractNumber", expiry: "contractExpiry" },
};

export function emptyIdentityParse(): ParsedIdentityDocument {
  return { name: null, documentNumber: null, expiryDate: null };
}

export function isIdentityDocType(value: string): value is IdentityDocType {
  return (IDENTITY_DOC_TYPES as readonly string[]).includes(value);
}

function westernDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string | null {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Pull the first plausible calendar date out of a fragment. Qatar layout defaults to day/month/year. */
export function parseIdentityDate(raw: string): string | null {
  const text = westernDigits(raw).replace(/,/g, " ").trim();
  if (!text) return null;

  const iso = text.match(/\b(19\d{2}|20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const year = Number(numeric[3]);
    let day = a;
    let month = b;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      day = b;
      month = a;
    }
    return isoDate(year, month, day);
  }

  const named = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
  if (named) {
    const month = MONTHS[named[2]!.toLowerCase()];
    if (!month) return null;
    return isoDate(Number(named[3]), Number(month), Number(named[1]));
  }

  const namedUs = text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})\b/);
  if (namedUs) {
    const month = MONTHS[namedUs[1]!.toLowerCase()];
    if (!month) return null;
    return isoDate(Number(namedUs[3]), Number(month), Number(namedUs[2]));
  }

  return null;
}

function linesOf(text: string): string[] {
  return westernDigits(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function looksLikePersonName(value: string): boolean {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length < 2 || cleaned.length > 80) return false;
  if (parseIdentityDate(cleaned)) return false;
  if (/\d{4,}/.test(cleaned)) return false;
  const letters = cleaned.replace(/[^A-Za-z\u0600-\u06FF]/g, "");
  return letters.length >= 2;
}

function trimValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanName(value: string): string {
  return trimValue(value).replace(/[|]+/g, " ").replace(/\s+/g, " ").trim();
}

function valueAfterLabel(lines: string[], label: RegExp, accept: (value: string) => boolean): string | null {
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i]!.match(label);
    if (!match) continue;
    const inline = trimValue(match[1] ?? "");
    if (inline && accept(inline)) return inline;
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j += 1) {
      const next = trimValue(lines[j] ?? "");
      if (!next) continue;
      if (label.test(lines[j]!)) break;
      if (accept(next)) return next;
    }
  }
  return null;
}

function qidDigits(value: string): string | null {
  const compact = westernDigits(value).replace(/[^\d]/g, "");
  const match = compact.match(/(\d{11})/);
  return match?.[1] ?? null;
}

function labeledQid(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i]!.match(QID_LABEL);
    if (!match) continue;
    const inline = qidDigits(match[1] ?? "");
    if (inline) return inline;
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j += 1) {
      const next = qidDigits(lines[j] ?? "");
      if (next) return next;
    }
  }
  return null;
}

function soleQid(text: string): { value: string; confidence: FieldConfidence } | null {
  const matches = westernDigits(text).match(/\d{11}/g) ?? [];
  const unique = [...new Set(matches)];
  if (unique.length !== 1) return null;
  return { value: unique[0]!, confidence: "high" };
}

function mrzValue(char: string): number {
  if (char === "<") return 0;
  if (char >= "0" && char <= "9") return char.charCodeAt(0) - 48;
  const upper = char.toUpperCase();
  if (upper >= "A" && upper <= "Z") return upper.charCodeAt(0) - 55;
  return -1;
}

function mrzCheck(data: string, check: string): boolean {
  if (!/^\d$/.test(check)) return false;
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    const value = mrzValue(data[i] ?? "");
    if (value < 0) return false;
    sum += value * weights[i % 3]!;
  }
  return String(sum % 10) === check;
}

function mrzLines(lines: string[]): string[] {
  const found: string[] = [];
  for (const line of lines) {
    const compact = line.replace(/\s+/g, "").toUpperCase();
    if (/^[A-Z0-9<]{44}$/.test(compact)) found.push(compact);
  }
  return found;
}

function mrzExpiry(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const year = yy >= 80 ? 1900 + yy : 2000 + yy;
  return isoDate(year, Number(yymmdd.slice(2, 4)), Number(yymmdd.slice(4, 6)));
}

function parseMrz(lines: string[]): {
  name: string | null;
  passportNumber: string | null;
  expiry: string | null;
} {
  const rows = mrzLines(lines);
  let name: string | null = null;
  let passportNumber: string | null = null;
  let expiry: string | null = null;

  for (const row of rows) {
    if (row.startsWith("P<") || row.startsWith("V<") || row.startsWith("I<")) {
      const body = row.slice(5);
      const [surnameRaw, givenRaw = ""] = body.split("<<");
      const surname = (surnameRaw ?? "").replace(/<+/g, " ").trim();
      const given = givenRaw.replace(/<+/g, " ").trim();
      const combined = cleanName(`${given} ${surname}`);
      if (looksLikePersonName(combined)) name = combined;
      continue;
    }
    if (mrzCheck(row.slice(0, 9), row[9] ?? "")) {
      const number = row.slice(0, 9).replace(/<+$/g, "").replace(/</g, "");
      if (/^[A-Z0-9]{6,9}$/.test(number)) passportNumber = number;
    }
    if (mrzCheck(row.slice(21, 27), row[27] ?? "")) {
      expiry = mrzExpiry(row.slice(21, 27)) ?? expiry;
    }
  }

  return { name, passportNumber, expiry };
}

function tokenNumber(value: string, pattern: RegExp): string | null {
  const compact = value.replace(/\s+/g, "").toUpperCase();
  const match = compact.match(pattern);
  return match?.[0] ?? null;
}

function high(value: string): ConfidentValue {
  return { value, confidence: "high" };
}

export function parseIdentityDocument(text: string, docType: IdentityDocType): ParsedIdentityDocument {
  const lines = linesOf(text);
  const joined = lines.join("\n");
  const parsed = emptyIdentityParse();
  if (!joined.trim()) return parsed;

  const expiryRaw = valueAfterLabel(lines, EXPIRY_LABEL, (value) => Boolean(parseIdentityDate(value)));
  if (expiryRaw) {
    const expiry = parseIdentityDate(expiryRaw);
    if (expiry) parsed.expiryDate = high(expiry);
  }

  if (docType === "qid") {
    const labeled = labeledQid(lines);
    if (labeled) parsed.documentNumber = high(labeled);
    else {
      const sole = soleQid(joined);
      if (sole) parsed.documentNumber = sole;
    }
    const name = valueAfterLabel(lines, NAME_LABEL, looksLikePersonName);
    if (name) parsed.name = high(cleanName(name));
  }

  if (docType === "passport") {
    const mrz = parseMrz(lines);
    const labeled = valueAfterLabel(lines, PASSPORT_LABEL, (value) =>
      Boolean(tokenNumber(value, /^[A-Z0-9]{6,12}$/)),
    );
    const number = mrz.passportNumber ?? (labeled ? tokenNumber(labeled, /^[A-Z0-9]{6,12}$/) : null);
    if (number) parsed.documentNumber = high(number);
    if (!parsed.expiryDate && mrz.expiry) parsed.expiryDate = high(mrz.expiry);
    const surname = valueAfterLabel(lines, SURNAME_LABEL, looksLikePersonName);
    const given = valueAfterLabel(lines, GIVEN_LABEL, looksLikePersonName);
    const labeledName = valueAfterLabel(lines, NAME_LABEL, looksLikePersonName);
    const name = given && surname ? cleanName(`${given} ${surname}`) : labeledName ? cleanName(labeledName) : mrz.name;
    if (name && looksLikePersonName(name)) parsed.name = high(name);
  }

  if (docType === "visa") {
    const labeled = valueAfterLabel(lines, VISA_LABEL, (value) =>
      Boolean(tokenNumber(value, /^[A-Z0-9][A-Z0-9\/-]{4,23}$/)),
    );
    const number = labeled ? tokenNumber(labeled, /^[A-Z0-9][A-Z0-9\/-]{4,23}$/) : null;
    if (number) parsed.documentNumber = high(number);
    const mrz = parseMrz(lines);
    if (!parsed.expiryDate && mrz.expiry) parsed.expiryDate = high(mrz.expiry);
    if (!parsed.documentNumber && mrz.passportNumber) {
      parsed.documentNumber = { value: mrz.passportNumber, confidence: "low" };
    }
  }

  if (docType === "contract") {
    const labeled = valueAfterLabel(lines, CONTRACT_LABEL, (value) =>
      Boolean(tokenNumber(value, /^[A-Z0-9][A-Z0-9\/-]{2,29}$/)),
    );
    const number = labeled ? tokenNumber(labeled, /^[A-Z0-9][A-Z0-9\/-]{2,29}$/) : null;
    if (number) parsed.documentNumber = high(number);
  }

  return parsed;
}

function sameIdentityValue(left: string, right: string): boolean {
  return left.trim().replace(/\s+/g, " ").toUpperCase() === right.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Fill empty fields when extraction is confident. Keep a typed value when it
 * differs, and surface the extracted value so the user can accept it.
 */
export function applyIdentityExtraction(
  current: IdentityFormFields,
  docType: IdentityDocType,
  parsed: ParsedIdentityDocument,
  suggestions: IdentitySuggestions = {},
): { fields: IdentityFormFields; suggestions: IdentitySuggestions } {
  const fields = { ...current };
  const nextSuggestions: IdentitySuggestions = { ...suggestions };
  const map = DOC_FIELDS[docType];

  const consider = (field: IdentityFieldKey | undefined, extracted: ConfidentValue | null) => {
    if (!field) return;
    delete nextSuggestions[field];
    if (!extracted?.value) return;
    const existing = fields[field].trim();
    if (!existing) {
      if (extracted.confidence === "high") fields[field] = extracted.value;
      else nextSuggestions[field] = extracted.value;
      return;
    }
    if (!sameIdentityValue(existing, extracted.value)) nextSuggestions[field] = extracted.value;
  };

  consider(map.name, parsed.name);
  consider(map.number, parsed.documentNumber);
  consider(map.expiry, parsed.expiryDate);
  return { fields, suggestions: nextSuggestions };
}

const NUMBER_FIELD: Record<IdentityDocType, IdentityFieldKey> = {
  qid: "qid",
  passport: "passportNumber",
  visa: "visaNumber",
  contract: "contractNumber",
};

const EXPIRY_FIELD: Record<IdentityDocType, IdentityFieldKey> = {
  qid: "qidExpiry",
  passport: "passportExpiry",
  visa: "visaExpiry",
  contract: "contractExpiry",
};

/** Apply a parse onto the number + expiry inputs used by document editors. */
export function applyDocumentEditorExtraction(input: {
  docType: IdentityDocType;
  fullName?: string;
  number: string;
  expiry: string;
  parsed: ParsedIdentityDocument;
}): {
  fullName: string;
  number: string;
  expiry: string;
  suggestions: { fullName?: string; number?: string; expiry?: string };
} {
  const current: IdentityFormFields = {
    fullName: input.fullName ?? "",
    qid: "",
    qidExpiry: "",
    passportNumber: "",
    passportExpiry: "",
    visaNumber: "",
    visaExpiry: "",
    contractNumber: "",
    contractExpiry: "",
  };
  const numberKey = NUMBER_FIELD[input.docType];
  const expiryKey = EXPIRY_FIELD[input.docType];
  current[numberKey] = input.number;
  current[expiryKey] = input.expiry;
  const applied = applyIdentityExtraction(current, input.docType, input.parsed);
  return {
    fullName: applied.fields.fullName,
    number: applied.fields[numberKey],
    expiry: applied.fields[expiryKey],
    suggestions: {
      fullName: applied.suggestions.fullName,
      number: applied.suggestions[numberKey],
      expiry: applied.suggestions[expiryKey],
    },
  };
}
