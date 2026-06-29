"use server";

import { z } from "zod";

import {
  E3_AREAS,
  E3_CATEGORIES,
  E3_FREQUENCIES,
  E3_LOCATIONS,
  E3_OWNERS,
  E3_TABLE,
} from "@/lib/compliance-tracker/constants";
import { parseCsv } from "@/lib/csv-parse";
import { parseE3ImportRows } from "@/lib/e3-compliance-import";
import { createAuthenticatedAction, createAuthenticatedActionNoInput } from "@/lib/server/create-action";

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

const E3ItemFields = z.object({
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

function normalizePayload(data: z.infer<typeof E3ItemFields>) {
  const emptyToNull = (v: string | null | undefined) => (v === "" || v == null ? null : v);
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

export const createE3ComplianceItem = createAuthenticatedAction(
  E3ItemFields,
  async (data, context) => {
    const payload = normalizePayload(data);
    const { data: row, error } = await context.supabase
      .from(E3_TABLE)
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "compliance.edit_e3_tracker" } },
);

export const updateE3ComplianceItem = createAuthenticatedAction(
  E3ItemFields,
  async (data, context) => {
    const { id, ...rest } = normalizePayload(data);
    const { data: row, error } = await context.supabase
      .from(E3_TABLE)
      .update(rest)
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "compliance.edit_e3_tracker" } },
);

export const deleteE3ComplianceItem = createAuthenticatedAction(
  z.object({ id: z.string().min(1) }),
  async (data, context) => {
    const { error } = await context.supabase.from(E3_TABLE).delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  },
  { auth: { capability: "compliance.edit_e3_tracker" } },
);

export const importE3ComplianceCsv = createAuthenticatedAction(
  z.object({ csv: z.string().max(5_000_000) }),
  async (data, context) => {
    const rawRows = parseCsv(data.csv);
    if (!rawRows.length) throw new Error("CSV has no data rows");

    const { payloads, errors } = parseE3ImportRows(rawRows);
    if (!payloads.length && errors.length) {
      return { imported: 0, errors };
    }
    if (!payloads.length) throw new Error("CSV has no data rows");
    if (errors.length) return { imported: 0, errors };

    const { error } = await context.supabase.from(E3_TABLE).upsert(payloads, { onConflict: "id" });
    if (error) throw error;
    return { imported: payloads.length, errors: [] as { row: number; message: string }[] };
  },
  { auth: { capability: "compliance.edit_e3_tracker" } },
);

export const deleteAllE3ComplianceItems = createAuthenticatedActionNoInput(
  async (context) => {
    const { error, count } = await context.supabase
      .from(E3_TABLE)
      .delete({ count: "exact" })
      .neq("id", "");
    if (error) throw error;
    return { deleted: count ?? 0 };
  },
  { auth: { capability: "admin.manage_users" } },
);
