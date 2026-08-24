import "server-only";

import type { AuthContext } from "@/lib/server/auth";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import { CANONICAL_LOCATION_CODES } from "@/lib/locations/normalize";
import { fetchWorkLocationsByStaffId } from "@/lib/staff-work-locations";
import type { SampleLocation, SampleStaff } from "@/lib/staff-sample-scope";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function accessibleLocationIdSet(
  context: AuthContext,
  locationIds: string[],
): Promise<Set<string>> {
  const allowed = new Set<string>();
  const unique = [...new Set(locationIds.filter(Boolean))];
  for (const locationId of unique) {
    const { data, error } = await context.supabase.rpc("user_can_access_location", {
      _location_id: locationId,
    });
    if (error) throw error;
    if (data) allowed.add(locationId);
  }
  return allowed;
}

export async function loadLiveStaffForSample(context: AuthContext): Promise<{
  staff: SampleStaff[];
  locations: SampleLocation[];
}> {
  const [{ data: staffRows, error: staffErr }, { data: locationRows, error: locErr }] = await Promise.all([
    context.supabase
      .from("staff")
      .select(
        "id, full_name, employee_code, qid, location_id, job_title, employment_type, e3_enrolled, phone, hire_date, status",
      )
      .is("deleted_at", null)
      .order("full_name")
      .limit(5000),
    context.supabase.from("locations").select("id, code, name").in("code", [...CANONICAL_LOCATION_CODES]),
  ]);
  if (staffErr) throw staffErr;
  if (locErr) throw locErr;

  const rows = staffRows ?? [];
  let workByStaff = new Map<string, { id: string; code: string; name: string }[]>();
  try {
    workByStaff = await fetchWorkLocationsByStaffId(
      context.supabase,
      rows.map((row) => row.id),
    );
  } catch {
    workByStaff = new Map();
  }

  return {
    locations: (locationRows ?? []).map((loc) => ({ id: loc.id, code: loc.code, name: loc.name })),
    staff: rows.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      employee_code: row.employee_code,
      qid: row.qid,
      location_id: row.location_id,
      work_location_ids: (workByStaff.get(row.id) ?? []).map((loc) => loc.id),
      job_title: row.job_title,
      employment_type: row.employment_type,
      e3_enrolled: row.e3_enrolled,
      phone: row.phone,
      hire_date: row.hire_date,
      status: row.status,
    })),
  };
}

export async function resolveSampleScope(
  context: AuthContext,
  locations: SampleLocation[],
  locationIdRaw: string | null,
): Promise<{ scopeLocationId: string | null; accessibleLocationIds: Set<string>; locationCode: string | null }> {
  const accessibleLocationIds = await accessibleLocationIdSet(
    context,
    locations.map((loc) => loc.id),
  );
  if (!accessibleLocationIds.size) {
    throw new ForbiddenError("Forbidden: cannot access this branch");
  }
  const raw = locationIdRaw?.trim() || null;
  if (!raw) {
    return { scopeLocationId: null, accessibleLocationIds, locationCode: null };
  }
  if (!UUID_RE.test(raw)) throw new Error("Choose a valid location.");
  if (!accessibleLocationIds.has(raw)) {
    await assertLocationAccess(context, raw);
  }
  const loc = locations.find((row) => row.id === raw);
  if (!loc) throw new Error("Unknown location.");
  return { scopeLocationId: raw, accessibleLocationIds, locationCode: loc.code };
}

export async function loadSalaryByStaffId(
  context: AuthContext,
  staffIds: string[],
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  if (!staffIds.length) return map;
  for (let i = 0; i < staffIds.length; i += 200) {
    const chunk = staffIds.slice(i, i + 200);
    const { data, error } = await context.supabase
      .from("staff_compensation")
      .select("staff_id, monthly_salary_qar")
      .in("staff_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      map.set(row.staff_id, row.monthly_salary_qar == null ? null : Number(row.monthly_salary_qar));
    }
  }
  return map;
}
