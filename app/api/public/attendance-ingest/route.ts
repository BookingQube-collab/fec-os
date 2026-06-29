import { NextResponse } from "next/server";

import { ingestAttendanceRecords, normalizeIngestRecords } from "@/lib/attendance-ingest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validateAttendanceIngestRequest } from "@/lib/server/attendance-ingest-auth";

/**
 * External attendance data ingestion (HR / biometric exports).
 * POST /api/public/attendance-ingest
 *
 * Auth: Authorization: Bearer <ATTENDANCE_INGEST_API_KEY> or X-API-Key header.
 */
export async function POST(request: Request) {
  const authError = validateAttendanceIngestRequest(request);
  if (authError) return authError;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { success: false, error: "SUPABASE_SERVICE_ROLE_KEY missing" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  let records;
  try {
    records = normalizeIngestRecords(body);
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 400 });
  }

  if (!records.length) {
    return NextResponse.json({ success: false, error: "No records provided" }, { status: 400 });
  }

  if (records.length > 500) {
    return NextResponse.json(
      { success: false, error: "Maximum 500 records per request" },
      { status: 400 },
    );
  }

  try {
    const result = await ingestAttendanceRecords(supabaseAdmin, records);
    return NextResponse.json(result, { status: result.imported > 0 ? 200 : 422 });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message, imported: 0, failed: records.length, errors: [] },
      { status: 500 },
    );
  }
}
