/**
 * Wipe every payroll period/run (locked included) via service role.
 * Mirrors resetAllPayroll in hr-payroll.functions.ts — no orphan lines/payslips.
 *
 *   node --env-file=.env.local scripts/reset-all-payroll.mjs
 *   node --env-file=.env.local scripts/reset-all-payroll.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const PAGE = 200;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

function tableMissing(message) {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

async function countTable(table) {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true });
  if (error) {
    if (tableMissing(error.message)) return 0;
    throw error;
  }
  return count ?? 0;
}

async function listPeriods() {
  const { data, error } = await admin
    .from("hr_payroll_periods")
    .select("id, month, status, date_from, date_to, display_name")
    .order("month", { ascending: true });
  if (error) {
    if (tableMissing(error.message)) return [];
    throw error;
  }
  return data ?? [];
}

async function deleteIdPage(table, ids) {
  if (!ids.length) return;
  const { error } = await admin.from(table).delete().in("id", ids);
  if (error) throw error;
}

async function deleteAllPeriods() {
  for (;;) {
    const { data, error } = await admin.from("hr_payroll_periods").select("id").limit(PAGE);
    if (error) {
      if (tableMissing(error.message)) return;
      throw error;
    }
    const ids = (data ?? []).map((row) => String(row.id));
    if (!ids.length) return;
    await deleteIdPage("hr_payroll_periods", ids);
    if (ids.length < PAGE) return;
  }
}

async function deleteAllImportBatches() {
  for (;;) {
    const { data, error } = await admin.from("hr_payroll_import_batches").select("id").limit(PAGE);
    if (error) {
      if (tableMissing(error.message)) return;
      throw error;
    }
    const ids = (data ?? []).map((row) => String(row.id));
    if (!ids.length) return;
    await deleteIdPage("hr_payroll_import_batches", ids);
    if (ids.length < PAGE) return;
  }
}

async function deletePayrollNotifications() {
  for (;;) {
    const { data, error } = await admin
      .from("notifications")
      .select("id")
      .eq("source_type", "hr_payroll_periods")
      .limit(PAGE);
    if (error) {
      if (tableMissing(error.message)) return;
      throw error;
    }
    const ids = (data ?? []).map((row) => String(row.id));
    if (!ids.length) return;
    await deleteIdPage("notifications", ids);
    if (ids.length < PAGE) return;
  }
}

async function releasePostedOtClaims() {
  let released = 0;
  for (let page = 0; page < 100; page += 1) {
    const { data, error } = await admin
      .from("hr_ot_claims")
      .select("id")
      .or("status.eq.payroll_posted,payroll_period_id.not.is.null")
      .limit(PAGE);
    if (error) {
      if (tableMissing(error.message)) return released;
      throw error;
    }
    const ids = (data ?? []).map((row) => String(row.id));
    if (!ids.length) return released;
    const { error: upErr } = await admin
      .from("hr_ot_claims")
      .update({
        status: "gm_approved",
        payroll_posted_by: null,
        payroll_posted_at: null,
        payroll_period_id: null,
      })
      .in("id", ids)
      .eq("status", "payroll_posted");
    if (upErr) throw upErr;
    const { error: linkErr } = await admin
      .from("hr_ot_claims")
      .update({
        payroll_posted_by: null,
        payroll_posted_at: null,
        payroll_period_id: null,
      })
      .in("id", ids);
    if (linkErr) throw linkErr;
    released += ids.length;
    if (ids.length < PAGE) return released;
  }
  throw new Error("Did not finish releasing OT claims.");
}

async function releaseAirTickets() {
  let released = 0;
  for (let page = 0; page < 100; page += 1) {
    const { data, error } = await admin
      .from("hr_air_ticket_issues")
      .select("id")
      .not("payroll_period_id", "is", null)
      .limit(PAGE);
    if (error) {
      if (tableMissing(error.message)) return released;
      throw error;
    }
    const ids = (data ?? []).map((row) => String(row.id));
    if (!ids.length) return released;
    const { error: upErr } = await admin
      .from("hr_air_ticket_issues")
      .update({
        payroll_payment_status: "unpaid",
        payroll_period_id: null,
      })
      .in("id", ids);
    if (upErr) throw upErr;
    released += ids.length;
    if (ids.length < PAGE) return released;
  }
  throw new Error("Did not finish releasing air-ticket links.");
}

async function removePayslipFiles() {
  const paths = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("hr_payslips")
      .select("file_path")
      .not("file_path", "is", null)
      .range(from, from + PAGE - 1);
    if (error) {
      if (tableMissing(error.message)) return { removed: 0, warning: null };
      throw error;
    }
    const rows = data ?? [];
    for (const row of rows) {
      if (typeof row.file_path === "string" && row.file_path.startsWith("payroll/")) {
        paths.push(row.file_path);
      }
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  if (!paths.length) return { removed: 0, warning: null };

  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await admin.storage.from("hr-employee-documents").remove(chunk);
    if (error) return { removed, warning: error.message };
    removed += chunk.length;
  }
  return { removed, warning: null };
}

async function main() {
  const periods = await listPeriods();
  const counts = {
    periods: await countTable("hr_payroll_periods"),
    lines: await countTable("hr_payroll_lines"),
    payslips: await countTable("hr_payslips"),
    locks: await countTable("hr_payroll_locks"),
    adjustments: await countTable("hr_payroll_adjustments"),
    overrides: await countTable("hr_payroll_line_overrides"),
    importBatches: await countTable("hr_payroll_import_batches"),
  };

  console.log("Periods currently in DB:");
  if (!periods.length) console.log("  (none)");
  for (const p of periods) {
    console.log(
      `  ${p.month}  ${p.status}  ${String(p.date_from).slice(0, 10)} → ${String(p.date_to).slice(0, 10)}  id=${p.id}`,
    );
  }
  console.log("Counts:", counts);

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to delete all payroll periods/lines/payslips.");
    return;
  }

  const payslipFiles = await removePayslipFiles();
  const otReleased = await releasePostedOtClaims();
  const airReleased = await releaseAirTickets();
  await deletePayrollNotifications();
  await deleteAllPeriods();
  await deleteAllImportBatches();

  const after = {
    periods: await countTable("hr_payroll_periods"),
    lines: await countTable("hr_payroll_lines"),
    payslips: await countTable("hr_payslips"),
    locks: await countTable("hr_payroll_locks"),
  };

  console.log("\nDeleted (pre-counts):", counts);
  console.log("Released OT claims:", otReleased);
  console.log("Released air-ticket links:", airReleased);
  console.log("Payslip files removed:", payslipFiles.removed, payslipFiles.warning ?? "");
  console.log("After counts:", after);
  console.log("Months removed:", periods.map((p) => `${p.month}(${p.status})`).join(", ") || "(none)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
