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
  /** Printed on the back of a Qatar residency permit, when that side is in the image. */
  passportNumber?: ConfidentValue | null;
  passportExpiry?: ConfidentValue | null;
  nationality?: ConfidentValue | null;
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
  | "contractExpiry"
  | "nationality";

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
  return {
    name: null,
    documentNumber: null,
    expiryDate: null,
    passportNumber: null,
    passportExpiry: null,
    nationality: null,
  };
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

function tightenDates(text: string): string {
  let prev = "";
  let next = text;
  while (next !== prev) {
    prev = next;
    next = next.replace(/(\d)\s*([\/\-.])\s*(\d)/g, "$1$2$3");
  }
  return next;
}

function linesOf(text: string): string[] {
  return tightenDates(westernDigits(text))
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
  const match = westernDigits(value).match(/(?<!\d)(\d{11})(?!\d)/);
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
  const matches = westernDigits(text).match(/(?<!\d)\d{11}(?!\d)/g) ?? [];
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

const LATIN_NAME_STOP = new Set([
  "state",
  "qatar",
  "residency",
  "permit",
  "passport",
  "nationality",
  "occupation",
  "employer",
  "expiry",
  "serial",
  "signature",
  "directorate",
  "general",
  "holder",
  "name",
  "date",
  "birth",
  "number",
  "type",
  "work",
  "id",
  "no",
]);

const NATIONALITY_STOP = new Set(
  [...LATIN_NAME_STOP].filter((word) => word !== "qatar").concat(["of", "no", "id", "dob"]),
);

const RESIDENCY_NAME_LABEL =
  /(?:full\s*name|holder\s*name|card\s*holder|(?<![A-Za-z])name(?![A-Za-z])|الإسم|الاسم)/gi;
const RESIDENCY_QID_LABEL =
  /(?:id\s*\.?\s*no\.?|i\s*\.?\s*d\s*\.?\s*(?:no\.?|number)|qid(?:\s*(?:no\.?|number))?|الرقم\s*الشخصي|رقم\s*الهوية)/gi;
const RESIDENCY_PASSPORT_LABEL = /(?:passport\s*(?:no\.?|number|#)|رقم\s*جواز\s*السفر|رقم\s*الجواز)/gi;
const RESIDENCY_NATIONALITY_LABEL = /(?:nationality|الجنسية)/gi;

function allMatches(text: string, re: RegExp): RegExpExecArray[] {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const copy = new RegExp(re.source, flags);
  const found: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = copy.exec(text))) {
    found.push(match);
    if (match.index === copy.lastIndex) copy.lastIndex += 1;
  }
  return found;
}

function windowAfter(text: string, index: number, labelLength: number): string {
  const after = text.slice(index + labelLength);
  return after.split(/\r?\n/).slice(0, 3).join("\n");
}

function latinPersonName(raw: string): string | null {
  const tokens = raw.match(/[A-Z][A-Za-z.'-]+/g) ?? [];
  const kept: string[] = [];
  for (const token of tokens) {
    if (LATIN_NAME_STOP.has(token.toLowerCase())) break;
    kept.push(token);
    if (kept.length === 8) break;
  }
  if (kept.length < 2) return null;
  const name = cleanName(kept.join(" "));
  if (!looksLikePersonName(name)) return null;
  return name;
}

function bestLatinName(text: string): string | null {
  let best: string | null = null;
  for (const match of allMatches(text, RESIDENCY_NAME_LABEL)) {
    const after = windowAfter(text, match.index, match[0].length);
    const before = text.slice(Math.max(0, match.index - 80), match.index);
    const candidate = latinPersonName(after) ?? latinPersonName(before);
    if (!candidate) continue;
    if (!best || candidate.split(" ").length > best.split(" ").length) best = candidate;
  }
  return best;
}

function labeledBoundedQid(text: string): string | null {
  for (const match of allMatches(text, RESIDENCY_QID_LABEL)) {
    const after = windowAfter(text, match.index, match[0].length).slice(0, 80);
    const foundAfter = after.match(/(?<!\d)(\d{11})(?!\d)/);
    if (foundAfter) return foundAfter[1]!;
    const before = text.slice(Math.max(0, match.index - 40), match.index);
    const foundBefore = before.match(/(\d{11})(?!\d)\s*$/);
    if (foundBefore) return foundBefore[1]!;
  }
  return null;
}

function passportToken(window: string): string | null {
  const token = window.toUpperCase().match(/(?<![A-Z0-9])([A-Z]{1,3}\d{5,9})(?![A-Z0-9])/);
  return token?.[1] ?? null;
}

function labeledPassportNumber(text: string): string | null {
  for (const match of allMatches(text, RESIDENCY_PASSPORT_LABEL)) {
    const after = passportToken(windowAfter(text, match.index, match[0].length));
    if (after) return after;
    const before = text.slice(Math.max(0, match.index - 48), match.index);
    const prior = passportToken(before);
    if (prior) return prior;
  }
  return null;
}

function titleCaseWords(value: string): string {
  return value.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_lead, gap: string, ch: string) => `${gap}${ch.toUpperCase()}`);
}

function labeledNationality(text: string): string | null {
  for (const match of allMatches(text, RESIDENCY_NATIONALITY_LABEL)) {
    const window = (windowAfter(text, match.index, match[0].length).split(
      /\b(?:name|passport|expiry|occupation|serial|d\.?\s*o\.?\s*b|id\.?\s*no)\b/i,
    )[0] ?? "");
    const words = window.match(/\b[A-Z][A-Za-z]{2,}(?:[ \t]+[A-Z][A-Za-z]{2,}){0,3}\b/g) ?? [];
    for (const candidate of words) {
      const parts = candidate.split(/[ \t]+/);
      if (parts.some((part) => NATIONALITY_STOP.has(part.toLowerCase()))) continue;
      return titleCaseWords(candidate);
    }
  }
  return null;
}

function lastIndexOfAny(haystack: string, needles: string[]): number {
  let at = -1;
  for (const needle of needles) {
    const found = haystack.lastIndexOf(needle);
    if (found > at) at = found;
  }
  return at;
}

/** Card expiry, passport expiry, and date of birth sit on the same Qatar residency permit. */
function residencyDateRoles(text: string): {
  cardExpiry: string | null;
  passportExpiry: string | null;
} {
  let cardExpiry: string | null = null;
  let passportExpiry: string | null = null;
  let dob: string | null = null;
  const re = /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2}\s+\d{4})\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const iso = parseIdentityDate(match[0]);
    if (!iso) continue;
    const context = text.slice(Math.max(0, match.index - 80), match.index).toLowerCase();
    const passportAt = lastIndexOfAny(context, ["passport", "جواز"]);
    const birthAt = lastIndexOfAny(context, ["birth", "d.o.b", "dob", "ميلاد"]);
    const expiryAt = lastIndexOfAny(context, ["expir", "صلاح", "انتهاء"]);
    const ranked = [
      { at: passportAt, role: "passport" as const },
      { at: birthAt, role: "dob" as const },
      { at: expiryAt, role: "card" as const },
    ].filter((item) => item.at >= 0);
    if (!ranked.length) continue;
    ranked.sort((a, b) => b.at - a.at);
    let role = ranked[0]!.role;
    if (role === "card" && passportAt >= 0 && expiryAt - passportAt <= 24 && expiryAt > passportAt) {
      role = "passport";
    }
    if (role === "dob" && !dob) dob = iso;
    else if (role === "passport" && !passportExpiry) passportExpiry = iso;
    else if (role === "card" && !cardExpiry) cardExpiry = iso;
  }
  if (cardExpiry && cardExpiry === dob) cardExpiry = null;
  if (passportExpiry && passportExpiry === dob) passportExpiry = null;
  return { cardExpiry, passportExpiry };
}

/**
 * Qatar residency permits print the ID, Latin name, card expiry, and nationality
 * on the front, and the passport number and passport expiry on the back.
 * OCR often keeps Arabic and English on the same line, or in one paragraph.
 */
function enrichQatarResidency(parsed: ParsedIdentityDocument, text: string): void {
  const qid = labeledBoundedQid(text);
  if (qid) parsed.documentNumber = high(qid);
  else if (!parsed.documentNumber) {
    const sole = soleQid(text);
    if (sole) parsed.documentNumber = sole;
  }

  const dates = residencyDateRoles(text);
  if (dates.cardExpiry) parsed.expiryDate = high(dates.cardExpiry);
  if (dates.passportExpiry) parsed.passportExpiry = high(dates.passportExpiry);

  const passport = labeledPassportNumber(text);
  if (passport) parsed.passportNumber = high(passport);

  const nationality = labeledNationality(text);
  if (nationality) parsed.nationality = high(nationality);

  const latin = bestLatinName(text);
  if (latin) parsed.name = high(latin);
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
    enrichQatarResidency(parsed, joined);
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
  if (docType === "qid") {
    consider("passportNumber", parsed.passportNumber ?? null);
    consider("passportExpiry", parsed.passportExpiry ?? null);
    consider("nationality", parsed.nationality ?? null);
  }
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
    nationality: "",
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
