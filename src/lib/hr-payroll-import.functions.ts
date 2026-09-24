/**
 * Payroll Excel import preview/commit + enriched period detail KPIs.
 * Historical import stores Excel figures; does not overwrite until reconciled.
 */

"use server";

import { z } from "zod";

import {
  buildFullPayrollExportMatrix,
  buildPayrollSummaryMatrix,
  buildReconciliationExportMatrix,
} from "@/lib/hr-payroll-export";
import {
  buildPayrollSnapshot,
  parsePayrollWorkbookSheets,
  type ParsedPayrollImportRow,
} from "@/lib/hr-payroll-import";
import { matchAllPayrollImportRows, type PayrollMatchStaff } from "@/lib/hr-payroll-match";
import {
  buildReconciliationReport,
  detectPayrollExceptions,
  sumPayrollKpis,
  systemNetFromImportRow,
} from "@/lib/hr-payroll-reconcile";
import { fecPeriodForMonth, type HrPayrollPaymentMethod } from "@/lib/hr-payroll";
import { canUserDo } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import {
  createAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

function requireCap(context: AuthContext, cap: Parameters<typeof canUserDo>[1]) {
  if (!canUserDo(context.roles ?? [], cap)) {
    throw new ForbiddenError(`Missing capability: ${cap}`);
  }
}

async function auditPayroll(
  context: AuthContext,
  action: string,
  rowId: string,
  after: Record<string, unknown>,
) {
  try {
    const { buildHrAuditRpcArgs } = await import("@/lib/hr-audit");
    await context.supabase.rpc(
      "log_audit",
      buildHrAuditRpcArgs({
        action,
        tableName: "hr_payroll_periods",
        rowId,
        after,
      }) as never,
    );
  } catch {
    /* non-blocking */
  }
}

function aoaFromWorkbook(buffer: ArrayBuffer): {
  sheetNames: string[];
  sheets: Record<string, unknown[][]>;
} {
  // Dynamic require keeps this server-only and matches other FEC xlsx call sites
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.read(Buffer.from(buffer), { type: "buffer", cellDates: true, raw: true });
  const sheets: Record<string, unknown[][]> = {};
  for (const name of wb.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name]!, {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];
  }
  return { sheetNames: wb.SheetNames, sheets };
}

function toPaymentMethod(v: string): HrPayrollPaymentMethod {
  if (v === "cash" || v === "cheque" || v === "bank_transfer" || v === "wps") return v;
  return "wps";
}

function lineInsertFromMatched(
  periodId: string,
  row: ParsedPayrollImportRow & { match: { staffId: string | null; matchRule: string } },
  recon: { excelNetPay: number; systemNetPay: number; difference: number; status: string },
) {
  const snap = buildPayrollSnapshot(row);
  const earnings = [
    { code: "basic", label: "Basic / Earned", amountQar: row.earnedGross || row.basicSalary },
    ...(row.allowances
      ? [{ code: "allowances", label: "Allowances", amountQar: row.allowances }]
      : []),
    ...(row.bonus ? [{ code: "bonus", label: "Bonus", amountQar: row.bonus }] : []),
    ...(row.otPayReg
      ? [{ code: "ot_reg", label: "Regular OT", amountQar: row.otPayReg, meta: { hours: row.otHoursReg } }]
      : []),
    ...(row.otPayPh
      ? [{ code: "ot_ph", label: "Public Holiday OT", amountQar: row.otPayPh, meta: { hours: row.otHoursPh } }]
      : []),
    ...(row.extraPay ? [{ code: "extra", label: "Extra Pay", amountQar: row.extraPay }] : []),
  ];
  const deductions = [
    ...(row.advancePay
      ? [{ code: "loan_advance", label: "Advance Pay", amountQar: row.advancePay }]
      : []),
    ...(row.deduction ? [{ code: "other", label: "Deduction", amountQar: row.deduction }] : []),
  ];
  const reviewStatus =
    recon.status === "matched"
      ? "matched"
      : recon.status === "variance"
        ? "variance"
        : recon.status === "unmatched"
          ? "unmatched"
          : "ok";

  return {
    period_id: periodId,
    staff_id: row.match.staffId,
    payment_method: toPaymentMethod(row.paymentMethod),
    earnings,
    deductions,
    gross_qar: row.earnedGross || row.grossSalary || recon.excelNetPay,
    // Historical: store Excel net as operational net (do not auto-replace with system)
    net_qar: recon.excelNetPay,
    wps_eligible: row.paymentMethod === "wps",
    proration_factor: 1,
    notes: row.notes,
    employment_category: row.category === "project_staff" ? "project_staff" : "permanent",
    position_snapshot: row.position,
    workplace_snapshot: row.workplace,
    working_days: row.workingDays,
    working_hours: row.workingHours,
    snapshot: snap,
    imported_amounts: snap,
    imported_net_qar: recon.excelNetPay,
    system_net_qar: recon.systemNetPay,
    variance_import_qar: recon.difference,
    review_status: reviewStatus,
    line_source: row.category === "project_staff" ? "project_staff" : "excel_import",
  };
}

export const previewPayrollExcelImport = createAuthenticatedAction(
  z.object({
    fileBase64: z.string().min(16),
    fileName: z.string().trim().max(260).optional().nullable(),
    preferredMonthSheet: z.string().trim().max(120).optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.generate");
    const buffer = Buffer.from(data.fileBase64, "base64");
    const { sheetNames, sheets } = aoaFromWorkbook(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    );
    const parsed = parsePayrollWorkbookSheets({
      sheetNames,
      sheets,
      preferredMonthSheet: data.preferredMonthSheet ?? undefined,
    });

    const { data: staffRows, error: staffErr } = await context.supabase
      .from("staff")
      .select("id, employee_code, full_name, qid, deleted_at")
      .is("deleted_at", null)
      .limit(5000);
    if (staffErr) throw staffErr;
    const staff = (staffRows ?? []) as PayrollMatchStaff[];

    const allRows = [...parsed.main, ...parsed.projectStaff];
    const matched = matchAllPayrollImportRows(allRows, staff);
    const report = buildReconciliationReport(matched);

    const { data: batch, error: batchErr } = await context.supabase
      .from("hr_payroll_import_batches")
      .insert({
        month: parsed.month,
        file_name: data.fileName ?? null,
        sheet_summary: {
          sheets: parsed.sheets,
          mainCount: parsed.main.length,
          projectStaffCount: parsed.projectStaff.length,
          wpsRegisterCount: parsed.wpsRegister.length,
          pendingEidOtCount: parsed.pendingEidOt.length,
        },
        preview: {
          matched: report.summary.matched,
          variance: report.summary.variance,
          unmatched: report.summary.unmatched,
        },
        reconciliation: report.summary,
        status: "preview",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (batchErr && !tableMissing(batchErr.message)) throw batchErr;

    return {
      batchId: batch?.id ?? null,
      periodName: parsed.periodName,
      month: parsed.month,
      sheets: parsed.sheets,
      counts: {
        main: parsed.main.length,
        projectStaff: parsed.projectStaff.length,
        wpsRegister: parsed.wpsRegister.length,
        pendingEidOt: parsed.pendingEidOt.length,
      },
      reconciliation: report,
      pendingEidOt: parsed.pendingEidOt,
      wpsRegisterSample: parsed.wpsRegister.slice(0, 5),
      // Keep matched rows for commit (client re-sends file; server re-parses)
      note: report.summary.successfullyReconciled
        ? "All rows matched with no unexplained variance."
        : "Review unmatched / variance rows before commit. Production amounts are not overwritten until you commit.",
    };
  },
  { auth: { capability: "payroll.generate" } },
);

export const commitPayrollExcelImport = createAuthenticatedAction(
  z.object({
    fileBase64: z.string().min(16),
    fileName: z.string().trim().max(260).optional().nullable(),
    preferredMonthSheet: z.string().trim().max(120).optional().nullable(),
    batchId: z.string().uuid().optional().nullable(),
    /** When true, still commit even with variance (marks lines for review). */
    allowVariance: z.boolean().optional().nullable(),
    /** Only insert matched staff; unmatched skipped (never creates employees). */
    matchedOnly: z.boolean().optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.generate");
    const buffer = Buffer.from(data.fileBase64, "base64");
    const { sheetNames, sheets } = aoaFromWorkbook(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    );
    const parsed = parsePayrollWorkbookSheets({
      sheetNames,
      sheets,
      preferredMonthSheet: data.preferredMonthSheet ?? undefined,
    });

    const { data: staffRows, error: staffErr } = await context.supabase
      .from("staff")
      .select("id, employee_code, full_name, qid, deleted_at")
      .is("deleted_at", null)
      .limit(5000);
    if (staffErr) throw staffErr;
    const staff = (staffRows ?? []) as PayrollMatchStaff[];
    const matched = matchAllPayrollImportRows([...parsed.main, ...parsed.projectStaff], staff);
    const report = buildReconciliationReport(matched);

    if (!data.allowVariance && !report.summary.successfullyReconciled) {
      throw new Error(
        `Import blocked: ${report.summary.variance} variance and ${report.summary.unmatched} unmatched. Review reconciliation or pass allowVariance.`,
      );
    }

    const bounds = fecPeriodForMonth(parsed.month);
    let periodId: string | null = null;
    const { data: existing } = await context.supabase
      .from("hr_payroll_periods")
      .select("id, status, source")
      .eq("month", bounds.month)
      .maybeSingle();

    if (existing?.id) {
      if (existing.status === "locked" || existing.status === "paid") {
        throw new Error("Cannot import into a locked or paid period.");
      }
      periodId = existing.id as string;
      // Do not wipe generated production lines blindly — only replace excel_import / project_staff lines
      await context.supabase
        .from("hr_payroll_lines")
        .delete()
        .eq("period_id", periodId)
        .in("line_source", ["excel_import", "project_staff"]);
      await context.supabase
        .from("hr_payroll_periods")
        .update({
          display_name: parsed.periodName,
          source: existing.source === "generated" ? "mixed" : "excel_import",
          import_batch_id: data.batchId ?? null,
          notes: `Historical import from ${data.fileName ?? "workbook"}`,
        })
        .eq("id", periodId);
    } else {
      const { data: created, error: createErr } = await context.supabase
        .from("hr_payroll_periods")
        .insert({
          month: bounds.month,
          date_from: bounds.dateFrom,
          date_to: bounds.dateTo,
          status: "draft",
          currency: "QAR",
          display_name: parsed.periodName,
          source: "excel_import",
          import_batch_id: data.batchId ?? null,
          notes: `Historical import from ${data.fileName ?? "workbook"}`,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (createErr) throw createErr;
      periodId = created.id as string;
    }

    const matchedOnly = data.matchedOnly !== false;
    const inserts: Record<string, unknown>[] = [];
    for (let i = 0; i < matched.length; i++) {
      const row = matched[i]!;
      const recon = report.rows[i]!;
      if (matchedOnly && !row.match.staffId) continue;
      if (!row.match.staffId) continue; // never orphan FK — skip unmatched
      inserts.push(lineInsertFromMatched(periodId!, row, recon));
    }

    if (inserts.length) {
      const { error: insErr } = await context.supabase.from("hr_payroll_lines").insert(inserts);
      if (insErr) {
        // Fallback if new columns missing (migration not applied yet)
        if (/column|schema cache/i.test(insErr.message)) {
          const slim = inserts.map((r) => ({
            period_id: r.period_id,
            staff_id: r.staff_id,
            payment_method:
              r.payment_method === "cash" ? "cheque" : r.payment_method,
            earnings: r.earnings,
            deductions: r.deductions,
            gross_qar: r.gross_qar,
            net_qar: r.net_qar,
            wps_eligible: r.wps_eligible,
            proration_factor: 1,
            notes: r.notes,
          }));
          const { error: slimErr } = await context.supabase.from("hr_payroll_lines").insert(slim);
          if (slimErr) throw slimErr;
        } else throw insErr;
      }
    }

    if (data.batchId) {
      await context.supabase
        .from("hr_payroll_import_batches")
        .update({
          period_id: periodId,
          status: "committed",
          committed_at: new Date().toISOString(),
          committed_by: context.userId,
          reconciliation: report.summary,
        })
        .eq("id", data.batchId);
    }

    if (report.summary.successfullyReconciled) {
      await context.supabase
        .from("hr_payroll_periods")
        .update({
          reconciled_at: new Date().toISOString(),
          reconciled_by: context.userId,
        })
        .eq("id", periodId!);
    }

    // Store pending Eid OT as adjustments (pending) — does not auto-enter pay
    if (parsed.pendingEidOt.length && periodId) {
      const eidInserts: Record<string, unknown>[] = [];
      for (const eid of parsed.pendingEidOt) {
        const m = matchAllPayrollImportRows(
          [
            {
              sheet: "Pending Eid Holiday Overtime",
              category: "pending_eid_ot" as const,
              srNo: null,
              employeeCode: null,
              employeeName: eid.employeeName,
              position: eid.position,
              workplace: eid.location,
              basicSalary: 0,
              allowances: 0,
              grossSalary: eid.grossSalary,
              workingDays: eid.pendingOffsetDays,
              workingHours: 0,
              earnedGross: 0,
              bonus: 0,
              otHoursReg: 0,
              otPayReg: 0,
              otHoursPh: eid.pendingOffsetDays,
              otPayPh: eid.total,
              extraPay: 0,
              advancePay: 0,
              deduction: 0,
              netPayable: eid.total,
              wps: 0,
              cash: 0,
              bankTransfer: 0,
              cheque: 0,
              paymentMethod: "wps" as const,
              notes: eid.remarks,
            },
          ],
          staff,
        )[0];
        if (!m?.match.staffId) continue;
        eidInserts.push({
          period_id: periodId,
          staff_id: m.match.staffId,
          adj_type: "ph_adj",
          amount_qar: eid.total,
          reason: `Pending Eid Holiday OT: ${eid.remarks ?? ""} (${eid.pendingOffsetDays} days)`.trim(),
          status: "pending",
          created_by: context.userId,
        });
      }
      if (eidInserts.length) {
        const { error: adjErr } = await context.supabase
          .from("hr_payroll_adjustments")
          .insert(eidInserts);
        if (adjErr && !tableMissing(adjErr.message) && !/column|schema cache/i.test(adjErr.message)) {
          throw adjErr;
        }
      }
    }

    await auditPayroll(context, "hr.payroll.excel.import", periodId!, {
      inserted: inserts.length,
      month: bounds.month,
      successfullyReconciled: report.summary.successfullyReconciled,
      unmatchedSkipped: report.summary.unmatched,
    });

    return {
      periodId,
      month: bounds.month,
      inserted: inserts.length,
      reconciliation: report.summary,
      successfullyReconciled: report.summary.successfullyReconciled,
    };
  },
  { auth: { capability: "payroll.generate" } },
);

export const getPayrollPeriodWorkspace = createAuthenticatedAction(
  z.object({
    periodId: z.string().uuid(),
    paymentMethod: z
      .enum(["wps", "cheque", "bank_transfer", "cash", "all"])
      .optional()
      .nullable(),
    employmentCategory: z.string().trim().max(40).optional().nullable(),
    workplace: z.string().trim().max(120).optional().nullable(),
    reviewStatus: z.string().trim().max(40).optional().nullable(),
    search: z.string().trim().max(120).optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.view");
    const { data: period, error: pErr } = await context.supabase
      .from("hr_payroll_periods")
      .select("*")
      .eq("id", data.periodId)
      .maybeSingle();
    if (pErr && !tableMissing(pErr.message)) throw pErr;
    if (!period) throw new Error("Payroll period not found.");

    let q = context.supabase
      .from("hr_payroll_lines")
      .select(
        "*, staff(full_name, employee_code, qid, location_id, department, employment_type, locations(name, code))",
      )
      .eq("period_id", data.periodId)
      .order("created_at", { ascending: true });
    if (data.paymentMethod && data.paymentMethod !== "all") {
      q = q.eq("payment_method", data.paymentMethod);
    }
    if (data.employmentCategory) q = q.eq("employment_category", data.employmentCategory);
    if (data.reviewStatus) q = q.eq("review_status", data.reviewStatus);
    const { data: lines, error } = await q;
    if (error && !tableMissing(error.message)) throw error;

    const mapped = (lines ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const staff = row.staff as
        | {
            full_name?: string;
            employee_code?: string;
            qid?: string | null;
            department?: string | null;
            employment_type?: string | null;
            locations?: { name?: string; code?: string } | { name?: string; code?: string }[] | null;
          }
        | null
        | undefined;
      const s = Array.isArray(staff) ? staff[0] : staff;
      const loc = s?.locations;
      const locObj = Array.isArray(loc) ? loc[0] : loc;
      const snap = (row.snapshot as Record<string, unknown> | null) ?? {};
      return {
        id: String(row.id),
        periodId: String(row.period_id),
        staffId: String(row.staff_id),
        staffName: s?.full_name ?? String(snap.employeeName ?? "Staff"),
        employeeCode: s?.employee_code ?? String(snap.employeeCode ?? ""),
        qid: s?.qid ?? null,
        department: s?.department ?? null,
        employmentType: s?.employment_type ?? (row.employment_category as string | null) ?? null,
        locationName: locObj?.name ?? null,
        locationCode: locObj?.code ?? null,
        paymentMethod: row.payment_method as HrPayrollPaymentMethod,
        earnings: (row.earnings as unknown[]) ?? [],
        deductions: (row.deductions as unknown[]) ?? [],
        grossQar: Number(row.gross_qar) || 0,
        netQar: Number(row.net_qar) || 0,
        wpsEligible: Boolean(row.wps_eligible),
        varianceVsPrev: row.variance_vs_prev == null ? null : Number(row.variance_vs_prev),
        prorationFactor: Number(row.proration_factor) || 1,
        notes: (row.notes as string | null) ?? null,
        position: (row.position_snapshot as string | null) ?? (snap.position as string | null) ?? null,
        workplace:
          (row.workplace_snapshot as string | null) ?? (snap.workplace as string | null) ?? null,
        workingDays: row.working_days == null ? null : Number(row.working_days),
        workingHours: row.working_hours == null ? null : Number(row.working_hours),
        snapshot: snap,
        importedNetQar: row.imported_net_qar == null ? null : Number(row.imported_net_qar),
        systemNetQar: row.system_net_qar == null ? null : Number(row.system_net_qar),
        varianceImportQar:
          row.variance_import_qar == null ? null : Number(row.variance_import_qar),
        reviewStatus: String(row.review_status ?? "ok"),
        lineSource: String(row.line_source ?? "generated"),
        employmentCategory: (row.employment_category as string | null) ?? null,
      };
    });

    let filtered = mapped;
    if (data.workplace) {
      const w = data.workplace.toLowerCase();
      filtered = filtered.filter((l) => (l.workplace ?? "").toLowerCase().includes(w));
    }
    if (data.search) {
      const s = data.search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.staffName.toLowerCase().includes(s) ||
          l.employeeCode.toLowerCase().includes(s) ||
          (l.qid ?? "").toLowerCase().includes(s),
      );
    }

    const kpis = sumPayrollKpis(
      filtered.map((l) => ({
        snapshot: l.snapshot,
        imported_amounts: l.snapshot,
        net_qar: l.netQar,
        payment_method: l.paymentMethod,
      })),
    );

    const exceptions = detectPayrollExceptions({
      lines: filtered.map((l) => ({
        staffId: l.staffId,
        staffName: l.staffName,
        netQar: l.netQar,
        varianceVsPrev: l.varianceVsPrev,
        reviewStatus: l.reviewStatus,
        paymentMethod: l.paymentMethod,
        snapshot: l.snapshot,
        notes: l.notes,
        wpsEligible: l.wpsEligible,
      })),
    });

    const reconRows = filtered
      .filter((l) => l.importedNetQar != null || l.lineSource.includes("excel") || l.lineSource === "project_staff")
      .map((l) => ({
        employeeName: l.staffName,
        excelNetPay: l.importedNetQar ?? l.netQar,
        systemNetPay: l.systemNetQar ?? systemNetFromImportRow({
          sheet: "",
          category: l.lineSource === "project_staff" ? "project_staff" : "monthly",
          srNo: null,
          employeeCode: l.employeeCode,
          employeeName: l.staffName,
          position: l.position,
          workplace: l.workplace,
          basicSalary: Number(l.snapshot.basicSalary) || 0,
          allowances: Number(l.snapshot.allowances) || 0,
          grossSalary: Number(l.snapshot.grossSalary) || 0,
          workingDays: Number(l.snapshot.workingDays) || 0,
          workingHours: Number(l.snapshot.workingHours) || 0,
          earnedGross: Number(l.snapshot.earnedGross) || 0,
          bonus: Number(l.snapshot.bonus) || 0,
          otHoursReg: Number(l.snapshot.otHoursReg) || 0,
          otPayReg: Number(l.snapshot.otPayReg) || 0,
          otHoursPh: Number(l.snapshot.otHoursPh) || 0,
          otPayPh: Number(l.snapshot.otPayPh) || 0,
          extraPay: Number(l.snapshot.extraPay) || 0,
          advancePay: Number(l.snapshot.advancePay) || 0,
          deduction: Number(l.snapshot.deduction) || 0,
          netPayable: l.importedNetQar ?? l.netQar,
          wps: Number(l.snapshot.wps) || 0,
          cash: Number(l.snapshot.cash) || 0,
          bankTransfer: Number(l.snapshot.bankTransfer) || 0,
          cheque: Number(l.snapshot.cheque) || 0,
          paymentMethod: l.paymentMethod,
          notes: l.notes,
          perDayRate: Number(l.snapshot.perDayRate) || undefined,
        }),
        difference: l.varianceImportQar ?? 0,
        status: l.reviewStatus,
      }));

    const { data: adjustments } = await context.supabase
      .from("hr_payroll_adjustments")
      .select("id, staff_id, adj_type, amount_qar, reason, status, created_at")
      .eq("period_id", data.periodId)
      .order("created_at", { ascending: false })
      .limit(200);

    return {
      period: {
        id: String(period.id),
        month: String(period.month),
        displayName: (period.display_name as string | null) ?? null,
        dateFrom: String(period.date_from).slice(0, 10),
        dateTo: String(period.date_to).slice(0, 10),
        status: String(period.status),
        currency: String(period.currency ?? "QAR"),
        source: String(period.source ?? "generated"),
        notes: (period.notes as string | null) ?? null,
        reconciledAt: (period.reconciled_at as string | null) ?? null,
      },
      lines: filtered,
      kpis,
      exceptions,
      reconciliation: {
        rows: reconRows,
        successfullyReconciled:
          reconRows.length > 0 &&
          reconRows.every((r) => r.status === "matched" || r.status === "reviewed" || r.status === "ok"),
      },
      adjustments: adjustments ?? [],
    };
  },
  { auth: { capability: "payroll.view" } },
);

export const exportPayrollExcelMatrix = createAuthenticatedAction(
  z.object({
    periodId: z.string().uuid(),
    format: z.enum([
      "full",
      "filtered",
      "wps",
      "project_staff",
      "summary",
      "reconciliation",
      "location",
      "department",
    ]),
    paymentMethod: z
      .enum(["wps", "cheque", "bank_transfer", "cash", "all"])
      .optional()
      .nullable(),
    workplace: z.string().trim().max(120).optional().nullable(),
    department: z.string().trim().max(120).optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.export_wps");
    const workspace = await getPayrollPeriodWorkspace({
      periodId: data.periodId,
      paymentMethod: data.paymentMethod ?? "all",
      workplace: data.workplace,
    });
    let lines = workspace.lines;
    if (data.format === "wps") lines = lines.filter((l) => l.paymentMethod === "wps");
    if (data.format === "project_staff") {
      lines = lines.filter(
        (l) => l.lineSource === "project_staff" || l.employmentCategory === "project_staff",
      );
    }
    if (data.format === "department" && data.department) {
      const d = data.department.toLowerCase();
      lines = lines.filter((l) => (l.department ?? "").toLowerCase().includes(d));
    }
    if (data.format === "location" && data.workplace) {
      const w = data.workplace.toLowerCase();
      lines = lines.filter(
        (l) =>
          (l.workplace ?? "").toLowerCase().includes(w) ||
          (l.locationName ?? "").toLowerCase().includes(w),
      );
    }

    if (data.format === "summary") {
      return {
        month: workspace.period.month,
        format: data.format,
        matrix: buildPayrollSummaryMatrix({ ...workspace.kpis, month: workspace.period.month }),
        sheetName: "Summary",
      };
    }
    if (data.format === "reconciliation") {
      return {
        month: workspace.period.month,
        format: data.format,
        matrix: buildReconciliationExportMatrix(workspace.reconciliation.rows),
        sheetName: "Reconciliation",
      };
    }

    const matrix = buildFullPayrollExportMatrix(
      lines.map((l, i) => ({
        srNo: i + 1,
        employeeCode: l.employeeCode,
        employeeName: l.staffName,
        position: l.position,
        workplace: l.workplace ?? l.locationName,
        employmentCategory: l.employmentCategory ?? l.employmentType,
        paymentMethod: l.paymentMethod,
        snapshot: l.snapshot,
        netQar: l.netQar,
        importedNetQar: l.importedNetQar,
        systemNetQar: l.systemNetQar,
        varianceImportQar: l.varianceImportQar,
        reviewStatus: l.reviewStatus,
        notes: l.notes,
      })),
    );

    await auditPayroll(context, `hr.payroll.export.excel.${data.format}`, data.periodId, {
      rows: lines.length,
    });

    return {
      month: workspace.period.month,
      format: data.format,
      matrix,
      sheetName:
        data.format === "project_staff"
          ? "Project Staff"
          : data.format === "wps"
            ? "WPS"
            : "Payroll",
    };
  },
  { auth: { capability: "payroll.export_wps" } },
);

export const markPayrollReconReviewed = createAuthenticatedAction(
  z.object({
    lineId: z.string().uuid(),
    note: z.string().trim().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.finance");
    const { data: line, error } = await context.supabase
      .from("hr_payroll_lines")
      .select("id, period_id, notes, review_status")
      .eq("id", data.lineId)
      .maybeSingle();
    if (error) throw error;
    if (!line) throw new Error("Line not found.");
    const notes = [line.notes, data.note ? `Reviewed: ${data.note}` : "Reviewed variance"]
      .filter(Boolean)
      .join(" | ");
    const { error: updErr } = await context.supabase
      .from("hr_payroll_lines")
      .update({ review_status: "reviewed", notes })
      .eq("id", data.lineId);
    if (updErr) throw updErr;
    await auditPayroll(context, "hr.payroll.recon.reviewed", data.lineId, {
      note: data.note ?? null,
    });
    return { lineId: data.lineId, reviewStatus: "reviewed" as const };
  },
  { auth: { capability: "payroll.finance" } },
);

export const createPayrollAdjustment = createAuthenticatedAction(
  z.object({
    periodId: z.string().uuid(),
    staffId: z.string().uuid(),
    adjType: z.enum([
      "bonus",
      "commission",
      "extra",
      "salary_adj",
      "advance",
      "loan_recovery",
      "unpaid_leave",
      "absence",
      "late_undertime",
      "previous_month",
      "ph_adj",
      "other_add",
      "other_deduct",
    ]),
    amountQar: z.number(),
    reason: z.string().trim().min(2).max(2000),
    documentRef: z.string().trim().max(260).optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.finance");
    const { data: period } = await context.supabase
      .from("hr_payroll_periods")
      .select("id, status")
      .eq("id", data.periodId)
      .maybeSingle();
    if (!period) throw new Error("Period not found.");
    if (period.status === "locked") throw new Error("Locked period — reopen required.");

    const { data: row, error } = await context.supabase
      .from("hr_payroll_adjustments")
      .insert({
        period_id: data.periodId,
        staff_id: data.staffId,
        adj_type: data.adjType,
        amount_qar: Math.round(data.amountQar * 100) / 100,
        reason: data.reason,
        document_ref: data.documentRef ?? null,
        status: "pending",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (tableMissing(error.message)) {
        throw new Error("Adjustments table missing — apply migration 20260924180000.");
      }
      throw error;
    }
    await auditPayroll(context, "hr.payroll.adjustment.create", row.id, {
      adjType: data.adjType,
      amountQar: data.amountQar,
    });
    return { id: row.id as string };
  },
  { auth: { capability: "payroll.finance" } },
);
