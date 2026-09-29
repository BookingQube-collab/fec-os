import type { AuthContext } from "@/lib/server/auth";

/** Staff ids that attendance mapping has linked to a biometric user. */
export async function fetchAttendanceMappedStaffIds(
  supabase: AuthContext["supabase"],
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("attendance_biometric_users")
    .select("staff_id")
    .not("staff_id", "is", null)
    .limit(8000);
  if (error) throw error;
  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.staff_id) ids.add(row.staff_id);
  }
  return ids;
}
