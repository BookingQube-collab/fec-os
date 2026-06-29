import { z } from "zod";

import {
  E3_AREAS,
  E3_CATEGORIES,
  E3_FREQUENCIES,
  E3_LOCATIONS,
  E3_OWNERS,
} from "@/lib/compliance-tracker/constants";

export const E3_IMPORT_HEADERS = [
  "ID",
  "Location",
  "Area",
  "Category",
  "Item",
  "Vendor",
  "Contract Start",
  "Contract End",
  "Last Service",
  "Next Service",
  "Issue Date",
  "Expiry Date",
  "Frequency",
  "Owner",
  "Remarks",
  "Drive Link",
] as const;

const SAMPLE_ROW: Record<(typeof E3_IMPORT_HEADERS)[number], string> = {
  ID: "EXAMPLE-001",
  Location: "InflataPark City Center",
  Area: "Whole Area",
  Category: "Fire Alarm",
  Item: "Annual fire alarm maintenance",
  Vendor: "Qatar Fire Systems LLC",
  "Contract Start": "2026-01-01",
  "Contract End": "2026-12-31",
  "Last Service": "2026-03-15",
  "Next Service": "2026-06-15",
  "Issue Date": "",
  "Expiry Date": "2026-12-31",
  Frequency: "Annual",
  Owner: "Facilities & Maintenance",
  Remarks: "Replace with your data; delete sample rows before import.",
  "Drive Link": "https://drive.google.com/example",
};

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional()
  .or(z.literal(""));

const driveLinkField = z
  .string()
  .max(2000)
  .nullable()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || v.startsWith("http://") || v.startsWith("https://"), {
    message: "Drive link must be a valid URL",
  });

const E3ImportRowSchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, "ID may only contain letters, numbers, hyphens, and underscores"),
  location: z.enum(E3_LOCATIONS as unknown as [string, ...string[]]),
  area: z.enum(E3_AREAS as unknown as [string, ...string[]]),
  category: z.enum(E3_CATEGORIES as unknown as [string, ...string[]]),
  item: z.string().min(1, "Item name is required").max(300),
  vendor: z.string().min(1, "Vendor is required").max(200),
  contract_start: dateField,
  contract_end: dateField,
  last_service: dateField,
  next_service: dateField,
  issue_date: dateField,
  expiry_date: dateField,
  frequency: z.enum(E3_FREQUENCIES as unknown as [string, ...string[]]),
  owner: z.enum(E3_OWNERS as unknown as [string, ...string[]]),
  remarks: z.string().max(4000).nullable().optional().or(z.literal("")),
  drive_link: driveLinkField,
});

export type E3ImportPayload = z.infer<typeof E3ImportRowSchema>;

export type E3ImportRowError = { row: number; message: string };

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildE3SampleCsv(): string {
  const headerLine = E3_IMPORT_HEADERS.join(",");
  const sampleLine = E3_IMPORT_HEADERS.map((h) => escapeCsvCell(SAMPLE_ROW[h])).join(",");
  return `${headerLine}\n${sampleLine}\n`;
}

function pickField(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v != null && v !== "") return v;
  }
  return "";
}

function normalizeImportRow(raw: Record<string, string>): Record<string, string> {
  return {
    id: pickField(raw, "id"),
    location: pickField(raw, "location"),
    area: pickField(raw, "area"),
    category: pickField(raw, "category"),
    item: pickField(raw, "item", "name"),
    vendor: pickField(raw, "vendor"),
    contract_start: pickField(raw, "contract_start", "contract start"),
    contract_end: pickField(raw, "contract_end", "contract end"),
    last_service: pickField(raw, "last_service", "last service"),
    next_service: pickField(raw, "next_service", "next service"),
    issue_date: pickField(raw, "issue_date", "issue date"),
    expiry_date: pickField(raw, "expiry_date", "expiry date"),
    frequency: pickField(raw, "frequency"),
    owner: pickField(raw, "owner"),
    remarks: pickField(raw, "remarks"),
    drive_link: pickField(raw, "drive_link", "drive link", "document"),
  };
}

function isBlankRow(raw: Record<string, string>): boolean {
  return Object.values(raw).every((v) => !v?.trim());
}

const emptyToNull = (v: string | null | undefined) => (v === "" || v == null ? null : v);

export function normalizeE3ImportPayload(data: E3ImportPayload) {
  return {
    id: data.id.trim(),
    location: data.location,
    area: data.area,
    category: data.category,
    item: data.item.trim(),
    vendor: data.vendor.trim(),
    contract_start: emptyToNull(data.contract_start),
    contract_end: emptyToNull(data.contract_end),
    last_service: emptyToNull(data.last_service),
    next_service: emptyToNull(data.next_service),
    issue_date: emptyToNull(data.issue_date),
    expiry_date: emptyToNull(data.expiry_date),
    frequency: data.frequency,
    owner: data.owner,
    remarks: emptyToNull(data.remarks),
    drive_link: emptyToNull(data.drive_link),
  };
}

export function parseE3ImportRows(rows: Record<string, string>[]): {
  payloads: ReturnType<typeof normalizeE3ImportPayload>[];
  errors: E3ImportRowError[];
} {
  const payloads: ReturnType<typeof normalizeE3ImportPayload>[] = [];
  const errors: E3ImportRowError[] = [];

  rows.forEach((raw, index) => {
    if (isBlankRow(raw)) return;
    const rowNum = index + 2;
    const normalized = normalizeImportRow(raw);
    const parsed = E3ImportRowSchema.safeParse(normalized);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join("; ");
      errors.push({ row: rowNum, message });
      return;
    }
    payloads.push(normalizeE3ImportPayload(parsed.data));
  });

  return { payloads, errors };
}
