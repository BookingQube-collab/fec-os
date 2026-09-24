/**
 * E3 Employee Masterfile PDF (print layout) → ParsedRosterRow[].
 * Columns are split across consecutive pages within Active / Secondment / Resigned sections.
 */

import type { E3MasterfileSheet, ParsedRosterRow } from "./types";
import {
  formatPhoneDisplay,
  mapPositionToStaffRole,
  normalizePhoneMatch,
  normalizeQid,
  parseE3Flag,
  parseGender,
  parseHireDate,
  parseSalaryQar,
  parseTicketMonths,
} from "./values";
import { resolveLocationCode } from "@/lib/locations/normalize";

export type PdfPageText = { pageNumber: number; lines: string[] };

const IDENTITY_HEADER = /department.*e\.?\s*code.*e\.?\s*name/i;

function isHeaderLine(line: string): boolean {
  const l = line.toLowerCase();
  return (
    IDENTITY_HEADER.test(l) ||
    /sponsorship\s+position/i.test(l) ||
    /position\s+location of work/i.test(l) ||
    /location of work\s+qid/i.test(l) ||
    /qid ex\.?date.*doj/i.test(l) ||
    /birth date.*contact/i.test(l) ||
    /passport ex\.?date.*gender/i.test(l) ||
    /no\.?\s*of\s*mos.*ticket/i.test(l) ||
    /^eligibility\)/i.test(l) ||
    /^secondment$/i.test(l) ||
    /^expiry date$/i.test(l) ||
    /^note$/i.test(l) ||
    /edoc|rejoining date/i.test(l)
  );
}

function stripHeaders(lines: string[]): string[] {
  const out = [...lines];
  while (out.length && isHeaderLine(out[0])) out.shift();
  return out;
}

type ColKind = "identity" | "position" | "qid_loc" | "personal" | "ticket" | "note" | "other";

function classifyPage(lines: string[]): ColKind {
  const head = lines.slice(0, 4).join(" ");
  if (IDENTITY_HEADER.test(head)) return "identity";
  if (/sponsorship\s+position/i.test(head) || /position\s+location of work/i.test(head) || /^secondment$/i.test(lines[0] ?? "")) {
    return "position";
  }
  if (/location of work\s+qid/i.test(head) || /qid ex\.?date.*doj.*birth/i.test(head)) {
    // secondment personal block starts with QID Ex.Date DOJ Birth...
    if (/birth date/i.test(head)) return "personal";
    return "qid_loc";
  }
  if (/birth date.*contact|nationality.*passport/i.test(head)) return "personal";
  if (/passport ex\.?date.*gender|ticket eligibility|no\.?\s*of\s*mos/i.test(head)) return "ticket";
  if (/^note$/i.test(lines[0] ?? "")) return "note";

  const first = lines[0] ?? "";
  if (/^(head office|city center|vendome|urban|aspire|inflat|kds|doha mall)/i.test(first)) return "qid_loc";
  if (/\b(male|female)\b/i.test(first) && /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(first)) return "ticket";
  if (/\b(attendant|cashier|supervisor|cleaner|manager|chef|driver|barista|maintenance|sr\.?\s*site)/i.test(first)) {
    return "position";
  }
  if (/^(operations|f&b|management|hr|sales|logistics|creatives|administration|project|finance|it|fec|branding)/i.test(first)) {
    return "identity";
  }
  if (/^\d{1,2}\s+[A-Za-z]+|^(\d{1,2}[/-]){2}\d{2,4}/.test(first)) return "personal";
  return "other";
}

type SectionName = "active" | "secondment" | "resigned_terminated";

function splitSections(pages: PdfPageText[]): Array<{ name: SectionName; pages: PdfPageText[] }> {
  const starts: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].lines[0] && IDENTITY_HEADER.test(pages[i].lines[0])) starts.push(i);
  }
  if (!starts.length) return [{ name: "active", pages }];
  return starts.map((start, si) => {
    const end = starts[si + 1] ?? pages.length;
    const name: SectionName = si === 0 ? "active" : si === 1 ? "secondment" : "resigned_terminated";
    return { name, pages: pages.slice(start, end) };
  });
}

function sheetFor(section: SectionName): E3MasterfileSheet {
  if (section === "secondment") return "Secondment Contract";
  if (section === "resigned_terminated") return "Resigned-Terminated";
  return "E3 - Active Employee";
}

function parseIdentity(line: string): { department: string | null; employeeCode: string | null; fullName: string; sponsorship: string | null } {
  let sponsorship: string | null = null;
  let body = line;
  for (const token of ["Secondment", "Sponsored", "Family", "Personal"]) {
    if (body.endsWith(` ${token}`)) {
      sponsorship = token;
      body = body.slice(0, -(token.length + 1)).trim();
      break;
    }
  }
  const parts = body.split(/\s+/);
  let codeIdx = -1;
  for (let i = 1; i < parts.length; i++) {
    if (/^S?\d{1,4}$/i.test(parts[i]) || /^0\d{1,3}$/.test(parts[i])) {
      codeIdx = i;
      break;
    }
  }
  if (codeIdx < 0) {
    return { department: parts[0] ?? null, employeeCode: null, fullName: body, sponsorship };
  }
  return {
    department: parts.slice(0, codeIdx).join(" ") || null,
    employeeCode: parts[codeIdx],
    fullName: parts.slice(codeIdx + 1).join(" ") || body,
    sponsorship,
  };
}

const LOC_HINT =
  /(Head Office|City Center|Vendome|Urban Arena|Urban Café|Aspire Park|Inflata(?:\s*Cafe)?(?:\s*-\s*City Center)?|KDS(?:\s*-\s*City Center)?|Doha Mall|All Sites|Plaza)/i;

function parsePosition(line: string): {
  sponsorship: string | null;
  position: string | null;
  location: string | null;
  qid: string | null;
} {
  let sponsorship: string | null = null;
  let body = line;
  for (const token of ["Sponsorship", "Personal", "Family", "Sponsored", "Secondment"]) {
    if (body.startsWith(`${token} `)) {
      sponsorship = token === "Sponsorship" ? "Sponsorship" : token;
      body = body.slice(token.length + 1).trim();
      break;
    }
  }
  body = body.replace(/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s+/, "");
  const qidMatch = body.match(/^(.*?)(?:\s+(\d{8,11}))?$/);
  const rest = (qidMatch?.[1] ?? body).trim();
  const qid = qidMatch?.[2] ?? null;
  const locMatch = rest.match(new RegExp(`^(.*?)\\s+(${LOC_HINT.source}.*)$`, "i"));
  if (locMatch) {
    return { sponsorship, position: locMatch[1].trim(), location: locMatch[2].trim(), qid };
  }
  return { sponsorship, position: rest || null, location: null, qid };
}

function parseQidLoc(line: string): {
  location: string | null;
  qid: string | null;
  qidExpiry: string | null;
  hireDateRaw: string | null;
} {
  const m = line.match(
    /^(?<location>.+?)\s+(?<qid>\d{8,11})(?:\s+(?<qidExp>\d{1,2}[/-]\d{1,2}[/-]\d{2,4}))?(?:\s+(?<doj>.+))?$/,
  );
  if (!m?.groups) return { location: line, qid: null, qidExpiry: null, hireDateRaw: null };
  return {
    location: m.groups.location,
    qid: m.groups.qid,
    qidExpiry: m.groups.qidExp ?? null,
    hireDateRaw: m.groups.doj ?? null,
  };
}

function parsePersonal(line: string): {
  dateOfBirthRaw: string | null;
  phone: string | null;
  nationality: string | null;
  passportNumber: string | null;
  qidExpiryRaw: string | null;
  hireDateRaw: string | null;
} {
  // Secondment style: qid_exp doj dob phone nationality passport
  // Active style: dob phone nationality passport
  const tokens = line.split(/\s+/);
  let passportNumber: string | null = null;
  if (tokens.length && /[A-Za-z]/.test(tokens[tokens.length - 1]) && /\d/.test(tokens[tokens.length - 1])) {
    passportNumber = tokens.pop() ?? null;
  }
  const nat: string[] = [];
  while (tokens.length && /^[A-Za-z][A-Za-z./-]*$/.test(tokens[tokens.length - 1]) && nat.length < 3) {
    nat.unshift(tokens.pop()!);
  }
  let phone: string | null = null;
  if (tokens.length && /^\d{7,10}$/.test(tokens[tokens.length - 1])) {
    phone = tokens.pop() ?? null;
  }
  // If leading date looks like qid expiry + doj (two dates before dob)
  let qidExpiryRaw: string | null = null;
  let hireDateRaw: string | null = null;
  const dateLike = (t: string) => /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(t);
  if (tokens.length >= 3 && dateLike(tokens[0]) && (dateLike(tokens[1]) || /^\d{1,2}\s/.test(tokens.slice(1).join(" ")))) {
    qidExpiryRaw = tokens.shift() ?? null;
    // doj may be "05 May 2022" or "15/05/2022"
    if (tokens.length && dateLike(tokens[0])) {
      hireDateRaw = tokens.shift() ?? null;
    } else if (tokens.length >= 3 && /^\d{1,2}$/.test(tokens[0]) && /^[A-Za-z]+$/.test(tokens[1])) {
      hireDateRaw = tokens.splice(0, 3).join(" ");
    }
  }
  return {
    dateOfBirthRaw: tokens.join(" ") || null,
    phone,
    nationality: nat.length ? nat.join(" ") : null,
    passportNumber,
    qidExpiryRaw,
    hireDateRaw,
  };
}

function parseTicket(line: string): {
  passportExpiryRaw: string | null;
  gender: string | null;
  ticketEligibility: boolean | null;
  ticketMonths: number | null;
  ticketAmount: number | null;
} {
  const m = line.match(
    /^(?<passExp>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})?\s*(?<gender>Male|Female|Other)?\s*(?<elig>Y|N)?(?:\s+(?<months>\d{1,3}))?(?:\s+(?<amount>\d+(?:\.\d+)?))?$/i,
  );
  if (!m?.groups) {
    return { passportExpiryRaw: null, gender: null, ticketEligibility: null, ticketMonths: null, ticketAmount: null };
  }
  const elig = m.groups.elig?.toUpperCase();
  return {
    passportExpiryRaw: m.groups.passExp ?? null,
    gender: parseGender(m.groups.gender),
    ticketEligibility: elig === "Y" ? true : elig === "N" ? false : null,
    ticketMonths: parseTicketMonths(m.groups.months),
    ticketAmount: parseSalaryQar(m.groups.amount),
  };
}

function emptyRow(partial: Partial<ParsedRosterRow> & Pick<ParsedRosterRow, "rowNumber" | "fullName" | "sheetSource">): ParsedRosterRow {
  return {
    sourceRowNo: null,
    locationLabel: "",
    locationCode: null,
    employeeCode: null,
    e3Raw: "",
    e3Enrolled: null,
    employmentTypeRaw: "",
    employmentType: null,
    salaryRaw: "",
    monthlySalaryQar: null,
    qidRaw: "",
    qid: null,
    activity: null,
    position: null,
    staffRole: null,
    contactRaw: "",
    contactDisplay: null,
    contactMatch: null,
    joiningDateRaw: "",
    hireDate: null,
    statusRaw: "",
    status: null,
    sponsorship: null,
    nationality: null,
    gender: null,
    dateOfBirthRaw: "",
    dateOfBirth: null,
    qidExpiryRaw: "",
    qidExpiry: null,
    passportNumber: null,
    passportIssueDate: null,
    passportExpiryRaw: "",
    passportExpiry: null,
    ticketEligibility: null,
    ticketEligibilityMonths: null,
    ticketAmount: null,
    notes: null,
    warnings: [],
    errors: [],
    emptyTemplate: false,
    ...partial,
  };
}

function buildSectionRows(section: SectionName, pages: PdfPageText[], rowBase: number): ParsedRosterRow[] {
  const buckets: Record<ColKind, string[]> = {
    identity: [],
    position: [],
    qid_loc: [],
    personal: [],
    ticket: [],
    note: [],
    other: [],
  };
  for (const page of pages) {
    const kind = classifyPage(page.lines);
    buckets[kind].push(...stripHeaders(page.lines));
  }

  const n = buckets.identity.length;
  const sheetSource = sheetFor(section);
  const rows: ParsedRosterRow[] = [];

  for (let i = 0; i < n; i++) {
    const warnings: string[] = [];
    const ident = parseIdentity(buckets.identity[i] ?? "");
    const pos = buckets.position[i] ? parsePosition(buckets.position[i]) : null;
    const qloc = buckets.qid_loc[i] ? parseQidLoc(buckets.qid_loc[i]) : null;
    const pers = buckets.personal[i] ? parsePersonal(buckets.personal[i]) : null;
    const tick = buckets.ticket[i] ? parseTicket(buckets.ticket[i]) : null;
    const note = buckets.note[i] ?? null;

    if (!ident.fullName) continue;

    const locationLabel = qloc?.location || pos?.location || "";
    const locationCode = resolveLocationCode(locationLabel);
    if (locationLabel && !locationCode) warnings.push(`Unmapped location "${locationLabel}"`);

    const qid = normalizeQid(qloc?.qid || pos?.qid || null);
    const hireRaw = qloc?.hireDateRaw || pers?.hireDateRaw || "";
    const hireParsed = parseHireDate(hireRaw);
    const dobParsed = parseHireDate(pers?.dateOfBirthRaw ?? "");
    const qidExpParsed = parseHireDate(qloc?.qidExpiry || pers?.qidExpiryRaw || "");
    const passExpParsed = parseHireDate(tick?.passportExpiryRaw ?? "");

    const status =
      section === "secondment" ? "secondment" : section === "resigned_terminated" ? "terminated" : "active";
    const employmentType = section === "secondment" ? "secondment" : null;

    if (buckets.position.length && buckets.position.length !== n) {
      warnings.push("Position column count differs from identity count");
    }

    rows.push(
      emptyRow({
        rowNumber: rowBase + i + 1,
        sheetSource,
        fullName: ident.fullName,
        employeeCode: ident.employeeCode,
        activity: ident.department,
        sponsorship: ident.sponsorship || pos?.sponsorship || null,
        position: pos?.position ?? null,
        staffRole: mapPositionToStaffRole(pos?.position),
        locationLabel,
        locationCode,
        qidRaw: qid ?? "",
        qid,
        joiningDateRaw: hireRaw,
        hireDate: hireParsed.iso,
        dateOfBirthRaw: pers?.dateOfBirthRaw ?? "",
        dateOfBirth: dobParsed.iso,
        contactRaw: pers?.phone ?? "",
        contactDisplay: formatPhoneDisplay(pers?.phone),
        contactMatch: normalizePhoneMatch(pers?.phone),
        nationality: pers?.nationality ?? null,
        passportNumber: pers?.passportNumber ?? null,
        qidExpiryRaw: qloc?.qidExpiry || pers?.qidExpiryRaw || "",
        qidExpiry: qidExpParsed.iso,
        passportExpiryRaw: tick?.passportExpiryRaw ?? "",
        passportExpiry: passExpParsed.iso,
        gender: tick?.gender ?? null,
        ticketEligibility: tick?.ticketEligibility ?? null,
        ticketEligibilityMonths: tick?.ticketMonths ?? null,
        ticketAmount: tick?.ticketAmount ?? null,
        notes: note,
        statusRaw: status,
        status,
        employmentTypeRaw: employmentType ?? "",
        employmentType,
        warnings: [...new Set(warnings)],
      }),
    );
  }
  return rows;
}

/** Pure: parse nonempty PDF page texts into roster rows. */
export function parseE3PdfPageTexts(pages: PdfPageText[]): {
  rows: ParsedRosterRow[];
  sheetsParsed: string[];
  skippedEmpty: number;
} {
  const nonempty = pages.filter((p) => p.lines.some((l) => l.trim()));
  const sections = splitSections(nonempty);
  const rows: ParsedRosterRow[] = [];
  const sheetsParsed: string[] = [];
  for (const section of sections) {
    sheetsParsed.push(sheetFor(section.name));
    const built = buildSectionRows(section.name, section.pages, rows.length * 10_000);
    rows.push(...built);
  }
  return { rows, sheetsParsed, skippedEmpty: pages.length - nonempty.length };
}

/** Extract per-page text lines from an E3 masterfile PDF buffer. */
export async function extractE3PdfPages(buffer: Buffer): Promise<PdfPageText[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.pages ?? []).map((p: { text?: string }, idx: number) => ({
      pageNumber: idx + 1,
      lines: String(p.text ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    }));
  } finally {
    await parser.destroy?.();
  }
}

export async function parseE3MasterfilePdf(buffer: Buffer): Promise<{
  rows: ParsedRosterRow[];
  sheetsParsed: string[];
  skippedEmpty: number;
  pageCount: number;
  nonemptyPages: number;
}> {
  const pages = await extractE3PdfPages(buffer);
  const parsed = parseE3PdfPageTexts(pages);
  return {
    ...parsed,
    pageCount: pages.length,
    nonemptyPages: pages.filter((p) => p.lines.length).length,
  };
}

export function isLikelyE3EmployeeMasterPdf(filename: string, firstPageText?: string): boolean {
  const name = filename.toLowerCase();
  if (name.endsWith(".pdf") && (/employee.*master|masterfile|e3.*employee/i.test(name) || name.includes("e3_employee"))) {
    return true;
  }
  if (firstPageText && IDENTITY_HEADER.test(firstPageText)) return true;
  return false;
}

// silence unused helper for now — used by ticket eligibility alias
void parseE3Flag;
