import type { AuthContext } from "@/lib/server/auth";
import type { AttendanceIngestHitRow } from "@/lib/attendance-ingest-log";

const HIT_LIMIT = 50;

export type AttendanceIngestLogsPayload = {
  hits: AttendanceIngestHitRow[];
  settings: { logApiHits: boolean };
};

export async function fetchAttendanceIngestLogs(context: AuthContext): Promise<AttendanceIngestLogsPayload> {
  const [{ data: hits, error: hitsErr }, { data: settings, error: settingsErr }] = await Promise.all([
    context.supabase
      .from("attendance_ingest_hits")
      .select(
        "id, called_at, payload, record_count, imported_count, failed_count, response_summary, source_ip, location_codes, created_at",
      )
      .order("called_at", { ascending: false })
      .limit(HIT_LIMIT),
    context.supabase.from("attendance_ingest_settings").select("log_api_hits").eq("id", true).maybeSingle(),
  ]);
  if (hitsErr) throw hitsErr;
  if (settingsErr) throw settingsErr;

  return {
    hits: (hits ?? []) as AttendanceIngestHitRow[],
    settings: { logApiHits: settings?.log_api_hits ?? true },
  };
}

export async function deleteAttendanceIngestHit(context: AuthContext, id: string): Promise<{ deleted: number }> {
  const { error, count } = await context.supabase
    .from("attendance_ingest_hits")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  return { deleted: count ?? 0 };
}

export async function deleteAllAttendanceIngestHits(context: AuthContext): Promise<{ deleted: number }> {
  const { error, count } = await context.supabase
    .from("attendance_ingest_hits")
    .delete({ count: "exact" })
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
  return { deleted: count ?? 0 };
}

export async function updateAttendanceIngestLogging(
  context: AuthContext,
  logApiHits: boolean,
): Promise<{ logApiHits: boolean }> {
  const { data, error } = await context.supabase
    .from("attendance_ingest_settings")
    .upsert(
      {
        id: true,
        log_api_hits: logApiHits,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("log_api_hits")
    .single();
  if (error) throw error;
  return { logApiHits: data.log_api_hits };
}
