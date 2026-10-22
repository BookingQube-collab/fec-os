/**
 * Rebuild attendance_daily_summary from stored punches + leave + roster.
 *
 * Usage (Oct 2026 INF-CC F&B Cafe payroll window):
 *   npx --yes tsx --env-file=.env.local scripts/recalc-attendance-range.ts \
 *     --code INF-CC --from 2026-09-28 --to 2026-10-27 --dept "F&B Cafe"
 *
 * Or by location UUID:
 *   npx --yes tsx --env-file=.env.local scripts/recalc-attendance-range.ts \
 *     --location <uuid> --from 2026-09-28 --to 2026-10-27
 *
 * Optional: --staff <uuid> (repeatable) to limit to specific people (e.g. Lester).
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { recalculateAttendanceRange } from "../src/lib/attendance-hr/process";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1] ?? null;
}

function argValues(flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === flag && process.argv[i + 1]) out.push(process.argv[i + 1]!);
  }
  return out;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const dateFrom = argValue("--from");
  const dateTo = argValue("--to");
  if (!dateFrom || !dateTo) {
    console.error("Required: --from YYYY-MM-DD --to YYYY-MM-DD");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let locationId = argValue("--location");
  const code = argValue("--code");
  if (!locationId && code) {
    const { data, error } = await supabase
      .from("locations")
      .select("id, code, name")
      .eq("code", code)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) {
      console.error(`No location with code ${code}`);
      process.exit(1);
    }
    locationId = String(data.id);
    console.log(`Resolved ${code} → ${locationId} (${data.name ?? ""})`);
  }
  if (!locationId) {
    console.error("Required: --location <uuid> or --code INF-CC");
    process.exit(1);
  }

  let staffIds = argValues("--staff");
  const deptNeedle = (argValue("--dept") ?? "").trim().toLowerCase();
  if (deptNeedle) {
    const { data: staffRows, error } = await supabase
      .from("staff")
      .select("id, full_name, department, employee_code, location_id")
      .is("deleted_at", null)
      .ilike("department", `%${deptNeedle.replace(/%/g, "")}%`)
      .limit(500);
    if (error) throw error;
    // Include every department match — F&B Cafe staff often home at UA/KDS while
    // rostered/punching at INF-CC. Process still scopes logs/roster to this site.
    const deptIds = (staffRows ?? []).map((row) => String(row.id));
    // Also include staff linked via staff_departments whose name matches.
    const { data: masterDepts } = await supabase
      .from("departments")
      .select("id, name, code")
      .or(`name.ilike.%${deptNeedle.replace(/%/g, "")}%,code.ilike.%${deptNeedle.replace(/%/g, "")}%`)
      .limit(20);
    const masterIds = (masterDepts ?? []).map((d) => String(d.id));
    if (masterIds.length) {
      const { data: links } = await supabase
        .from("staff_departments")
        .select("staff_id")
        .in("department_id", masterIds)
        .limit(500);
      for (const link of links ?? []) {
        const id = String(link.staff_id ?? "");
        if (id) deptIds.push(id);
      }
    }
    const scoped = [...new Set(deptIds)];
    console.log(`Department filter "${deptNeedle}" → ${scoped.length} staff`);
    for (const row of staffRows ?? []) {
      console.log(`  - ${row.full_name} (${row.employee_code ?? "—"})`);
    }
    staffIds = staffIds.length ? staffIds.filter((id) => scoped.includes(id)) : scoped;
    if (!staffIds.length) {
      console.error("No staff matched --dept filter.");
      process.exit(1);
    }
  }

  console.log(
    `Recalculating ${locationId} ${dateFrom}…${dateTo}` +
      (staffIds.length ? ` (${staffIds.length} staff)` : " (full site)"),
  );
  const result = await recalculateAttendanceRange(
    supabase as unknown as Parameters<typeof recalculateAttendanceRange>[0],
    locationId,
    dateFrom,
    dateTo,
    staffIds.length ? { staffIds } : undefined,
  );
  console.log("Done:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
