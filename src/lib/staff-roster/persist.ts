import { createHash } from "node:crypto";

import type { AuthContext } from "@/lib/server/create-action";
import { encryptFileBuffer, hasAttendanceFileKey } from "@/lib/attendance-hr/file-crypto";

import { STAFF_ROSTER_BUCKET } from "./file-guard";

export function rosterFileSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function persistRosterOriginalFile(
  context: AuthContext,
  fileId: string,
  buffer: Buffer,
): Promise<{ path: string; encrypted: boolean; byteSize: number }> {
  const payload = hasAttendanceFileKey() ? encryptFileBuffer(buffer) : buffer;
  const path = `${fileId}.bin`;
  const { error } = await context.supabase.storage.from(STAFF_ROSTER_BUCKET).upload(path, payload, {
    contentType: "application/octet-stream",
    upsert: true,
  });
  if (error) throw error;
  return { path, encrypted: hasAttendanceFileKey(), byteSize: buffer.length };
}
