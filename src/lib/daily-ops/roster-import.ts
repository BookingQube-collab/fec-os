import type { SupabaseClient } from "@supabase/supabase-js";

import { parseCsv } from "@/lib/csv-parse";
import type { AuthContext } from "@/lib/server/auth";
import {
  expandWeeklyRoster,
  parseDatedRosterRows,
  toQatarIso,
  type RosterImportRow,
} from "@/lib/staff-import";
import { shiftUuid } from "@/lib/staff-import-ids";

export interface RosterImportResult {
  imported: number;
  periodStart: string | null;
  periodEnd: string | null;
}

export function parseRosterCsvRows(csv: string, month?: string): RosterImportRow[] {
  const raw = parseCsv(csv);
  const hasWeekday = raw.some((r) => r.weekday);
  if (hasWeekday) {
    if (!month) throw new Error("Weekly roster CSV requires month (YYYY-MM)");
    const [year, m] = month.split("-").map(Number);
    return expandWeeklyRoster(raw, year, m);
  }
  return parseDatedRosterRows(raw);
}

export async function importRosterRows(
  supabase: SupabaseClient,
  _context: AuthContext,
  rosterRows: RosterImportRow[],
  options: {
    locationId?: string;
    rosterUploadId?: string;
    assertAccess: (locationId: string) => Promise<void>;
  },
): Promise<RosterImportResult> {
  if (!rosterRows.length) throw new Error("No roster rows to import");

  const { data: locations, error: locErr } = await supabase
    .from("locations")
    .select("id, code")
    .eq("status", "active");
  if (locErr) throw locErr;
  const locByCode = new Map((locations ?? []).map((l) => [l.code, l.id]));

  const codes = [...new Set(rosterRows.map((r) => r.employee_code))];
  const { data: staffRows, error: stErr } = await supabase
    .from("staff")
    .select("id, employee_code, user_id, job_title, location_id")
    .in("employee_code", codes)
    .is("deleted_at", null);
  if (stErr) throw stErr;
  const staffByCode = new Map((staffRows ?? []).map((s) => [s.employee_code, s]));
  const missing = codes.filter((c) => !staffByCode.has(c));
  if (missing.length) {
    throw new Error(`Import staff first — unknown employee_code: ${missing.join(", ")}`);
  }

  const dates = rosterRows.map((r) => r.date).sort();
  const shifts = [];
  for (const r of rosterRows) {
    const location_id = locByCode.get(r.location_code);
    if (!location_id) throw new Error(`Branch "${r.location_code}" not found`);
    if (options.locationId && location_id !== options.locationId) {
      throw new Error(`Row for ${r.location_code} does not match selected location`);
    }
    await options.assertAccess(location_id);
    const st = staffByCode.get(r.employee_code)!;
    if (st.location_id !== location_id) {
      throw new Error(`${r.employee_code} is not assigned to ${r.location_code}`);
    }
    const starts_at = toQatarIso(r.date, r.start_time);
    const ends_at = toQatarIso(r.date, r.end_time);
    shifts.push({
      id: shiftUuid(r.employee_code, starts_at),
      location_id,
      staff_id: st.id,
      user_id: st.user_id,
      role_label: r.role_label || st.job_title,
      starts_at,
      ends_at,
      status: r.status,
      roster_upload_id: options.rosterUploadId ?? null,
    });
  }

  const { error } = await supabase.from("shifts").upsert(shifts, { onConflict: "id" });
  if (error) throw error;

  return {
    imported: shifts.length,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
  };
}
