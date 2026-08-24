import { NextResponse } from "next/server";

import { getAuthenticatedContext } from "@/lib/server/auth";
import { enforceActionAuth } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { ATTENDANCE_FILE_BUCKET } from "@/lib/attendance-hr/constants";
import { decryptFileBuffer, hasAttendanceFileKey } from "@/lib/attendance-hr/file-crypto";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthenticatedContext();
  await enforceActionAuth(context, { capability: "attendance.view" });
  const { id } = await params;

  const { data: file, error } = await context.supabase
    .from("attendance_import_files")
    .select("id, original_filename, storage_path, location_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!file?.storage_path) {
    return NextResponse.json({ error: "Original file is not available." }, { status: 404 });
  }

  const { data: blob, error: dlErr } = await context.supabase.storage
    .from(ATTENDANCE_FILE_BUCKET)
    .download(file.storage_path);
  if (dlErr || !blob) {
    throw new ForbiddenError(dlErr?.message ?? "Could not download file");
  }

  const bytes = Buffer.from(await blob.arrayBuffer());
  const plain = hasAttendanceFileKey() && bytes[0] === 1 ? decryptFileBuffer(bytes) : bytes;
  const filename = String(file.original_filename ?? "attendance-file.bin").replace(/[^\w.\-]+/g, "_");

  return new NextResponse(new Uint8Array(plain), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
