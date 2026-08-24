import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { AttendanceIngestRecord, AttendanceIngestResult } from "@/lib/attendance-ingest";

export type AttendanceIngestHitRow = {
  id: string;
  called_at: string;
  payload: unknown;
  record_count: number;
  imported_count: number;
  failed_count: number;
  response_summary: unknown;
  source_ip: string | null;
  location_codes: string[];
  created_at: string;
};

export function getRequestSourceIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip") ?? null;
}

export function extractIngestLocationCodes(records: AttendanceIngestRecord[]): string[] {
  const codes = new Set<string>();
  for (const record of records) {
    const code = record.location_code?.trim().toUpperCase();
    if (code) codes.add(code);
  }
  return [...codes];
}

export async function isAttendanceIngestLoggingEnabled(
  sb: SupabaseClient<Database>,
): Promise<boolean> {
  const { data, error } = await sb
    .from("attendance_ingest_settings")
    .select("log_api_hits")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return data?.log_api_hits ?? true;
}

export async function logAttendanceIngestHit(
  sb: SupabaseClient<Database>,
  input: {
    payload: unknown;
    recordCount: number;
    result: AttendanceIngestResult;
    sourceIp: string | null;
    locationCodes: string[];
  },
): Promise<void> {
  const enabled = await isAttendanceIngestLoggingEnabled(sb);
  if (!enabled) return;

  const { error } = await sb.from("attendance_ingest_hits").insert({
    payload: input.payload as Record<string, unknown>,
    record_count: input.recordCount,
    imported_count: input.result.imported,
    failed_count: input.result.failed,
    response_summary: {
      success: input.result.success,
      imported: input.result.imported,
      failed: input.result.failed,
      errors: input.result.errors,
    },
    source_ip: input.sourceIp,
    location_codes: input.locationCodes,
  });
  if (error) throw error;
}
