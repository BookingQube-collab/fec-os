export type AssignableTech = {
  id: string;
  display_name: string | null;
  name: string;
  /** True when this row is staff-only (no auth login) — select stores requested name. */
  requested_only?: boolean;
};

type SupabaseLike = {
  from: (table: string) => any;
};

/**
 * Assignable technicians for a venue:
 * - All technician / tech_supervisor app users (company-wide)
 * - Active staff at the venue with a linked login (user_id)
 * - Active staff company-wide with technician / maintenance job titles
 * Staff without a login are returned with id `requested:<name>` so the dropdown
 * can still select them; create maps those to requested_technician_name.
 */
export async function loadAssignableTechnicians(
  supabase: SupabaseLike,
  locationId: string,
): Promise<{
  assignable: AssignableTech[];
  /** All names useful for AI matching (assignable + staff without login). */
  matchPool: { id: string; name: string }[];
}> {
  const [{ data: roles, error: roleErr }, { data: staffRows, error: staffErr }] = await Promise.all([
    supabase
      .from("user_roles")
      .select("user_id, role, location_ids")
      .in("role", ["technician", "tech_supervisor"]),
    supabase
      .from("staff")
      .select("id, full_name, user_id, employee_code, staff_role, job_title, location_id, status")
      .is("deleted_at", null)
      .eq("status", "active"),
  ]);
  if (roleErr) throw roleErr;
  if (staffErr) throw staffErr;

  const roleUserIds = [...new Set((roles ?? []).map((r: { user_id: string }) => r.user_id as string))];

  const staffList = (staffRows ?? []) as Array<{
    id: string;
    full_name: string;
    user_id: string | null;
    employee_code: string;
    staff_role: string | null;
    job_title: string | null;
    location_id: string;
    status: string;
  }>;

  const isTechish = (s: (typeof staffList)[number]) => {
    const role = (s.staff_role ?? "").toLowerCase();
    const title = (s.job_title ?? "").toLowerCase();
    const deptish = title.includes("maint") || title.includes("tech");
    return role === "technician" || role === "tech_supervisor" || deptish;
  };

  const relevantStaff = staffList.filter((s) => s.location_id === locationId || isTechish(s));

  const staffUserIds = relevantStaff
    .map((s) => s.user_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const employeeCodes = relevantStaff
    .filter((s) => !s.user_id)
    .map((s) => s.employee_code)
    .filter(Boolean);

  const allProfileIds = [...new Set([...roleUserIds, ...staffUserIds])];

  const [{ data: profiles }, { data: linkedProfiles }] = await Promise.all([
    allProfileIds.length
      ? supabase.from("profiles").select("id, display_name, employee_code").in("id", allProfileIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; display_name: string | null; employee_code: string | null }>,
        }),
    employeeCodes.length
      ? supabase.from("profiles").select("id, display_name, employee_code").in("employee_code", employeeCodes)
      : Promise.resolve({
          data: [] as Array<{ id: string; display_name: string | null; employee_code: string | null }>,
        }),
  ]);

  const byId = new Map<string, AssignableTech>();
  for (const p of [...(profiles ?? []), ...(linkedProfiles ?? [])]) {
    const name = ((p.display_name as string | null) ?? "").trim();
    if (!name) continue;
    byId.set(p.id as string, {
      id: p.id as string,
      display_name: name,
      name,
    });
  }

  const codeToProfileId = new Map<string, string>();
  for (const p of linkedProfiles ?? []) {
    const code = (p.employee_code as string | null)?.trim();
    if (code) codeToProfileId.set(code, p.id as string);
  }

  const matchPool: { id: string; name: string }[] = [];
  const seenNames = new Set<string>();
  const staffOnly: AssignableTech[] = [];

  for (const tech of byId.values()) {
    matchPool.push({ id: tech.id, name: tech.name });
    seenNames.add(tech.name.toLowerCase());
  }

  for (const s of relevantStaff) {
    const name = (s.full_name ?? "").trim();
    if (!name) continue;
    const linkedId = s.user_id || codeToProfileId.get(s.employee_code) || null;
    if (linkedId) {
      if (!byId.has(linkedId)) {
        byId.set(linkedId, { id: linkedId, display_name: name, name });
        matchPool.push({ id: linkedId, name });
        seenNames.add(name.toLowerCase());
      } else if (!seenNames.has(name.toLowerCase())) {
        matchPool.push({ id: linkedId, name });
        seenNames.add(name.toLowerCase());
      }
    } else if (!seenNames.has(name.toLowerCase())) {
      const requestedId = `requested:${name}`;
      staffOnly.push({
        id: requestedId,
        display_name: name,
        name,
        requested_only: true,
      });
      matchPool.push({ id: requestedId, name });
      seenNames.add(name.toLowerCase());
    }
  }

  const assignable = [...byId.values(), ...staffOnly].sort((a, b) => a.name.localeCompare(b.name));
  const matchPoolClean = matchPool.filter((t) => t.name.length > 0);

  return { assignable, matchPool: matchPoolClean };
}

export const REQUESTED_TECH_PREFIX = "requested:";

export function isRequestedTechnicianValue(id: string | null | undefined): boolean {
  return !!id?.startsWith(REQUESTED_TECH_PREFIX);
}

export function nameFromRequestedTechnicianValue(id: string): string {
  return id.slice(REQUESTED_TECH_PREFIX.length).trim();
}
