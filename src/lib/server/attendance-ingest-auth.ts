import { NextResponse } from "next/server";

/**
 * Validates external attendance ingest requests.
 * Accepts Authorization: Bearer <key> or X-API-Key header.
 */
export function validateAttendanceIngestRequest(request: Request): NextResponse | null {
  const apiKey = process.env.ATTENDANCE_INGEST_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "ATTENDANCE_INGEST_API_KEY not configured" },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-api-key");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = bearer ?? apiKeyHeader;

  if (!token || token !== apiKey) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
