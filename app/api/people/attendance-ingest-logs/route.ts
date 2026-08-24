import { withAuthRouteRequest } from "@/lib/server/api-route";
import {
  deleteAllAttendanceIngestHits,
  deleteAttendanceIngestHit,
  fetchAttendanceIngestLogs,
  updateAttendanceIngestLogging,
} from "@/lib/queries/attendance-ingest-logs.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context) => fetchAttendanceIngestLogs(context),
    request,
    { capability: "attendance.view" },
  );
}

export async function DELETE(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
      if (body.all) return deleteAllAttendanceIngestHits(context);
      if (body.id) return deleteAttendanceIngestHit(context, body.id);
      throw new Error("Provide id or all: true");
    },
    request,
    { capability: "attendance.import" },
  );
}

export async function PATCH(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const body = (await req.json()) as { logApiHits?: boolean };
      if (typeof body.logApiHits !== "boolean") {
        throw new Error("logApiHits boolean required");
      }
      return updateAttendanceIngestLogging(context, body.logApiHits);
    },
    request,
    { capability: "attendance.import" },
  );
}
