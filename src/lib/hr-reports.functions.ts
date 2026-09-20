"use server";

import { z } from "zod";

import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";
import { defaultPayrollPeriod } from "@/lib/attendance-hr/roster-period";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { aggregateHeadcountBySite, sumLeaveDaysInPeriod } from "@/lib/hr-advanced";
import {
  columnsForReport,
  filterReportColumns,
  HR_REPORT_IDS,
  inDateRange,
  matchesTextFilter,
  projectReportRows,
  stubRowsForReport,
  visibleHrReportIds,
  type HrReportCaps,
  type HrReportId,
} from "@/lib/hr-reports";
import { canUserDo } from "@/lib/rbac";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

function reportCaps(context: AuthContext): HrReportCaps {
  const roles = context.roles ?? [];
  return {
    canIdentity: canUserDo(roles, "hr.profile.view_sensitive") || canUserDo(roles, "hr.manage"),
    canSalary: canUserDo(roles, "people.view_salary"),
    canPayroll: canUserDo(roles, "payroll.view"),
    canRecruitment:
      canUserDo(roles, "recruitment.manage") || canUserDo(roles, "recruitment.request"),
    canWarnings: canUserDo(roles, "hr.warnings.manage") || canUserDo(roles, "hr.manage"),
    canLeave: canUserDo(roles, "hr.leave.manage") || canUserDo(roles, "hr.manage"),
    canOt:
      canUserDo(roles, "hr.ot.approve") ||
      canUserDo(roles, "hr.ot.verify") ||
      canUserDo(roles, "hr.manage"),
    canQuota: canUserDo(roles, "quota.view") || canUserDo(roles, "hr.manage"),
    canAirTicket: canUserDo(roles, "hr.air_ticket.manage") || canUserDo(roles, "hr.manage"),
    canExit:
      canUserDo(roles, "hr.resignation.manage") ||
      canUserDo(roles, "hr.termination.initiate") ||
      canUserDo(roles, "hr.manage"),
    canDocs: canUserDo(roles, "hr.docs.manage") || canUserDo(roles, "hr.manage"),
    canTimeline: canUserDo(roles, "hr.timeline.view") || canUserDo(roles, "hr.manage"),
  };
}

function staffLabel(row: {
  full_name?: string | null;
  employee_code?: string | null;
} | null): { fullName: string; employeeCode: string } {
  return {
    fullName: row?.full_name?.trim() || "—",
    employeeCode: row?.employee_code?.trim() || "—",
  };
}

export const getHrReportsSummary = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  async (data, context: AuthContext) => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
    const period = defaultPayrollPeriod(today);
    const dateFrom = data.dateFrom ?? period.dateFrom;
    const dateTo = data.dateTo ?? period.dateTo;
    const caps = reportCaps(context);

    let staffQ = context.supabase
      .from("staff")
      .select("id, location_id, locations(code, name)")
      .in("status", ["active", "on_leave"])
      .is("deleted_at", null)
      .limit(2000);
    if (data.locationId) staffQ = staffQ.eq("location_id", data.locationId);
    const { data: staffRows, error: staffErr } = await staffQ;
    if (staffErr && !tableMissing(staffErr.message)) throw staffErr;

    const bySite = aggregateHeadcountBySite(
      (staffRows ?? []).map((s) => {
        const loc = Array.isArray(s.locations) ? s.locations[0] : s.locations;
        return {
          locationId: (s.location_id as string | null) ?? null,
          locationCode: (loc as { code?: string } | null)?.code ?? null,
          locationName: (loc as { name?: string } | null)?.name ?? null,
        };
      }),
    ).map((row) => ({
      ...row,
      label: formatLocationLabel(row.locationCode, row.locationName) || "Unassigned",
    }));

    const { data: leaveRows, error: leaveErr } = await context.supabase
      .from("hr_leave_requests")
      .select("days, status, date_from, date_to")
      .eq("status", "approved")
      .lte("date_from", dateTo)
      .gte("date_to", dateFrom)
      .limit(2000);
    if (leaveErr && !tableMissing(leaveErr.message) && !/permission/i.test(leaveErr.message)) throw leaveErr;

    const leaveDaysInPeriod = sumLeaveDaysInPeriod(
      (leaveRows ?? []).map((r) => ({
        days: Number(r.days ?? 0),
        status: String(r.status),
        dateFrom: String(r.date_from),
        dateTo: String(r.date_to),
      })),
      dateFrom,
      dateTo,
    );

    let presentDays = 0;
    let absentDays = 0;
    let leaveStatusDays = 0;
    let overtimeMinutes = 0;
    let attendanceQ = context.supabase
      .from("attendance_daily_summary")
      .select("status, overtime_minutes")
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .limit(5000);
    if (data.locationId) attendanceQ = attendanceQ.eq("location_id", data.locationId);
    const { data: attRows, error: attErr } = await attendanceQ;
    if (attErr && !tableMissing(attErr.message)) throw attErr;
    for (const row of attRows ?? []) {
      const status = String(row.status);
      if (["present", "late", "overtime", "early_leave", "early_departure"].includes(status)) presentDays += 1;
      else if (status === "absent") absentDays += 1;
      else if (["annual_leave", "sick_leave", "unpaid_leave"].includes(status)) leaveStatusDays += 1;
      overtimeMinutes += Number(row.overtime_minutes ?? 0);
    }

    const { count: syncedLeaveDays, error: syncErr } = await context.supabase
      .from("attendance_leave_records")
      .select("id", { count: "exact", head: true })
      .eq("source", "hr_leave")
      .gte("leave_date", dateFrom)
      .lte("leave_date", dateTo);
    if (syncErr && !tableMissing(syncErr.message) && !/permission/i.test(syncErr.message ?? "")) throw syncErr;

    const expiryHorizon = new Date(`${today}T00:00:00+03:00`);
    expiryHorizon.setDate(expiryHorizon.getDate() + 30);
    const { count: expiringDocs, error: docsErr } = await context.supabase
      .from("hr_employee_documents")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("expiry_date", "is", null)
      .lte("expiry_date", expiryHorizon.toISOString().slice(0, 10));
    if (docsErr && !tableMissing(docsErr.message) && !/permission/i.test(docsErr.message ?? "")) throw docsErr;

    return {
      period: { month: period.month, dateFrom, dateTo },
      headcountBySite: bySite,
      leaveDaysInPeriod,
      attendance: {
        presentDays,
        absentDays,
        leaveStatusDays,
        overtimeHours: Math.round((overtimeMinutes / 60) * 10) / 10,
      },
      syncedLeaveDays: syncedLeaveDays ?? 0,
      expiringDocs: expiringDocs ?? 0,
      payrollExportHref: `/api/people/attendance-hr/export?format=payroll&from=${dateFrom}&to=${dateTo}${
        data.locationId ? `&locationId=${data.locationId}` : ""
      }`,
      attendanceReportsHref: `/people/attendance/reports?from=${dateFrom}&to=${dateTo}`,
      catalog: visibleHrReportIds(caps).map((id) => ({
        id,
        labelKey: `hr.reports.catalog.${id}`,
      })),
      caps: {
        canIdentity: caps.canIdentity,
        canSalary: caps.canSalary,
      },
    };
  },
  { auth: { anyCapability: ["hr.manage", "people.view_roster", "payroll.view"] } },
);

async function buildReportRows(
  id: HrReportId,
  filters: {
    dateFrom: string;
    dateTo: string;
    locationId: string | null;
    departmentId: string | null;
    employeeId: string | null;
    category: string | null;
    designation: string | null;
    status: string | null;
  },
  context: AuthContext,
  caps: HrReportCaps,
): Promise<Array<Record<string, string | number | null>>> {
  if (id === "loan_deduction" || id === "bonus_commission") {
    return stubRowsForReport(id);
  }

  const { dateFrom, dateTo, locationId, departmentId, employeeId, category, designation, status } =
    filters;

  if (id === "employee_master") {
    let q = context.supabase
      .from("staff")
      .select(
        "id, employee_code, full_name, status, job_title, hire_date, qid, location_id, locations(code, name), staff_profile_ext(employment_category), staff_departments(department_id, master_departments(name)), staff_compensation(basic_salary)",
      )
      .is("deleted_at", null)
      .limit(2000);
    if (locationId) q = q.eq("location_id", locationId);
    if (employeeId) q = q.eq("id", employeeId);
    if (status && status !== "all") q = q.eq("status", status);
    else q = q.in("status", ["active", "on_leave", "serving_notice"]);
    if (designation) q = q.ilike("job_title", designation);
    const { data, error } = await q;
    if (error && !tableMissing(error.message)) throw error;
    const rows: Array<Record<string, string | number | null>> = [];
    for (const s of data ?? []) {
      const loc = Array.isArray(s.locations) ? s.locations[0] : s.locations;
      const ext = Array.isArray(s.staff_profile_ext) ? s.staff_profile_ext[0] : s.staff_profile_ext;
      const depts = Array.isArray(s.staff_departments) ? s.staff_departments : [];
      const first = depts[0] as
        | { department_id?: string; master_departments?: { name?: string } | { name?: string }[] }
        | undefined;
      if (departmentId && first?.department_id !== departmentId) continue;
      const cat = (ext as { employment_category?: string | null } | null)?.employment_category ?? null;
      if (!matchesTextFilter(cat, category)) continue;
      const md = first?.master_departments
        ? Array.isArray(first.master_departments)
          ? first.master_departments[0]
          : first.master_departments
        : null;
      const comp = Array.isArray(s.staff_compensation) ? s.staff_compensation[0] : s.staff_compensation;
      rows.push({
        employeeCode: s.employee_code ?? "—",
        fullName: s.full_name ?? "—",
        status: String(s.status ?? ""),
        jobTitle: s.job_title ?? "—",
        department: md?.name ?? "—",
        location: formatLocationLabel(
          (loc as { code?: string } | null)?.code ?? null,
          (loc as { name?: string } | null)?.name ?? null,
        ),
        category: cat ?? "—",
        hireDate: s.hire_date ? String(s.hire_date).slice(0, 10) : "—",
        qid: (s.qid as string | null) ?? null,
        basicSalary: (comp as { basic_salary?: number } | null)?.basic_salary ?? null,
      });
    }
    return rows;
  }

  if (id === "employee_history") {
    if (!caps.canTimeline) return [];
    let q = context.supabase
      .from("hr_employee_events")
      .select("event_type, effective_on, payload, staff_id, staff(full_name, employee_code, location_id)")
      .gte("effective_on", dateFrom)
      .lte("effective_on", dateTo)
      .order("effective_on", { ascending: false })
      .limit(2000);
    if (employeeId) q = q.eq("staff_id", employeeId);
    const { data, error } = await q;
    if (error && !tableMissing(error.message)) throw error;
    return (data ?? [])
      .filter((e) => {
        const staff = Array.isArray(e.staff) ? e.staff[0] : e.staff;
        if (locationId && (staff as { location_id?: string } | null)?.location_id !== locationId) return false;
        return true;
      })
      .map((e) => {
        const staff = Array.isArray(e.staff) ? e.staff[0] : e.staff;
        const label = staffLabel(staff as { full_name?: string; employee_code?: string } | null);
        const payload = (e.payload ?? {}) as Record<string, unknown>;
        return {
          employeeCode: label.employeeCode,
          fullName: label.fullName,
          eventType: String(e.event_type),
          effectiveOn: String(e.effective_on).slice(0, 10),
          detail: JSON.stringify(payload).slice(0, 120),
        };
      });
  }

  if (id === "document_expiry" || id === "missing_document") {
    if (!caps.canDocs) return [];
    let staffQ = context.supabase
      .from("staff")
      .select("id, employee_code, full_name, location_id, locations(code, name)")
      .in("status", ["active", "on_leave", "serving_notice"])
      .is("deleted_at", null)
      .limit(2000);
    if (locationId) staffQ = staffQ.eq("location_id", locationId);
    if (employeeId) staffQ = staffQ.eq("id", employeeId);
    const { data: staffRows, error: staffErr } = await staffQ;
    if (staffErr && !tableMissing(staffErr.message)) throw staffErr;
    const ids = (staffRows ?? []).map((s) => String(s.id));
    const { data: docs, error: docsErr } = await context.supabase
      .from("hr_employee_documents")
      .select("staff_id, doc_type, expiry_date, status, title, deleted_at")
      .in("staff_id", ids.length ? ids.slice(0, 1000) : ["00000000-0000-0000-0000-000000000000"])
      .is("deleted_at", null)
      .limit(5000);
    if (docsErr && !tableMissing(docsErr.message)) throw docsErr;

    if (id === "document_expiry") {
      return (docs ?? [])
        .filter((d) => d.expiry_date && inDateRange(String(d.expiry_date), dateFrom, dateTo))
        .map((d) => {
          const staff = (staffRows ?? []).find((s) => String(s.id) === String(d.staff_id));
          const label = staffLabel(staff as { full_name?: string; employee_code?: string } | null);
          return {
            employeeCode: label.employeeCode,
            fullName: label.fullName,
            docType: String(d.doc_type),
            expiryDate: String(d.expiry_date).slice(0, 10),
            status: String(d.status ?? ""),
            docRef: (d.title as string | null) ?? null,
          };
        });
    }

    const required = ["cv", "qid", "passport", "contract"] as const;
    const byStaff = new Map<string, Set<string>>();
    for (const d of docs ?? []) {
      const set = byStaff.get(String(d.staff_id)) ?? new Set();
      set.add(String(d.doc_type));
      byStaff.set(String(d.staff_id), set);
    }
    const out: Array<Record<string, string | number | null>> = [];
    for (const s of staffRows ?? []) {
      const have = byStaff.get(String(s.id)) ?? new Set();
      const missing = required.filter((t) => !have.has(t));
      if (!missing.length) continue;
      const loc = Array.isArray(s.locations) ? s.locations[0] : s.locations;
      out.push({
        employeeCode: s.employee_code ?? "—",
        fullName: s.full_name ?? "—",
        location: formatLocationLabel(
          (loc as { code?: string } | null)?.code ?? null,
          (loc as { name?: string } | null)?.name ?? null,
        ),
        missing: missing.join(", "),
      });
    }
    return out;
  }

  if (id === "warning_disciplinary") {
    if (!caps.canWarnings) return [];
    let q = context.supabase
      .from("hr_warnings")
      .select(
        "warning_level, category, status, issued_on, valid_until, staff_id, staff(full_name, employee_code, location_id)",
      )
      .limit(2000);
    if (status && status !== "all") q = q.eq("status", status);
    const { data, error } = await q;
    if (error && !tableMissing(error.message)) throw error;
    return (data ?? [])
      .filter((w) => {
        if (!inDateRange(w.issued_on ? String(w.issued_on) : null, dateFrom, dateTo)) return false;
        const staff = Array.isArray(w.staff) ? w.staff[0] : w.staff;
        if (locationId && (staff as { location_id?: string } | null)?.location_id !== locationId) return false;
        if (employeeId && String(w.staff_id) !== employeeId) return false;
        return true;
      })
      .map((w) => {
        const staff = Array.isArray(w.staff) ? w.staff[0] : w.staff;
        const label = staffLabel(staff as { full_name?: string; employee_code?: string } | null);
        return {
          employeeCode: label.employeeCode,
          fullName: label.fullName,
          level: String(w.warning_level ?? ""),
          category: String(w.category ?? ""),
          status: String(w.status ?? ""),
          issuedOn: w.issued_on ? String(w.issued_on).slice(0, 10) : "—",
          validUntil: w.valid_until ? String(w.valid_until).slice(0, 10) : "—",
        };
      });
  }

  if (id === "probation") {
    let q = context.supabase
      .from("staff_profile_ext")
      .select(
        "probation_end, staff_id, staff(full_name, employee_code, location_id, status, deleted_at)",
      )
      .not("probation_end", "is", null)
      .gte("probation_end", dateFrom)
      .lte("probation_end", dateTo)
      .limit(1000);
    const { data, error } = await q;
    if (error && !tableMissing(error.message)) throw error;
    const staffIds = (data ?? []).map((r) => String(r.staff_id));
    const { data: reviews } = staffIds.length
      ? await context.supabase
          .from("hr_probation_reviews")
          .select("staff_id, status, decision")
          .in("staff_id", staffIds)
      : { data: [] as { staff_id: string; status: string; decision: string | null }[] };
    const reviewByStaff = new Map((reviews ?? []).map((r) => [String(r.staff_id), r]));
    return (data ?? [])
      .filter((r) => {
        const staff = Array.isArray(r.staff) ? r.staff[0] : r.staff;
        if ((staff as { deleted_at?: string | null } | null)?.deleted_at) return false;
        if (locationId && (staff as { location_id?: string } | null)?.location_id !== locationId) return false;
        if (employeeId && String(r.staff_id) !== employeeId) return false;
        return true;
      })
      .map((r) => {
        const staff = Array.isArray(r.staff) ? r.staff[0] : r.staff;
        const label = staffLabel(staff as { full_name?: string; employee_code?: string } | null);
        const rev = reviewByStaff.get(String(r.staff_id));
        return {
          employeeCode: label.employeeCode,
          fullName: label.fullName,
          probationEnd: String(r.probation_end).slice(0, 10),
          reviewStatus: rev ? String(rev.status) : "none",
          decision: rev?.decision ? String(rev.decision) : "—",
        };
      });
  }

  if (id === "leave_balance") {
    if (!caps.canLeave) return [];
    let q = context.supabase
      .from("hr_leave_balances")
      .select(
        "leave_type, allotted_days, carried_forward, expired_days, pending_days, staff_id, staff(full_name, employee_code, location_id)",
      )
      .limit(3000);
    if (employeeId) q = q.eq("staff_id", employeeId);
    const { data, error } = await q;
    if (error && !tableMissing(error.message)) throw error;
    const staffIds = [...new Set((data ?? []).map((r) => String(r.staff_id)))];
    const year = Number(dateFrom.slice(0, 4));
    const { data: leaveRows } = staffIds.length
      ? await context.supabase
          .from("hr_leave_requests")
          .select("staff_id, leave_type, days, status, date_from")
          .in("staff_id", staffIds.slice(0, 500))
          .eq("status", "approved")
          .gte("date_from", `${year}-01-01`)
          .lte("date_from", `${year}-12-31`)
          .limit(5000)
      : { data: [] as { staff_id: string; leave_type: string; days: number; status: string; date_from: string }[] };
    const usedKey = (sid: string, lt: string) => `${sid}:${lt}`;
    const usedMap = new Map<string, number>();
    for (const lr of leaveRows ?? []) {
      const k = usedKey(String(lr.staff_id), String(lr.leave_type));
      usedMap.set(k, (usedMap.get(k) ?? 0) + Number(lr.days ?? 0));
    }
    return (data ?? [])
      .filter((r) => {
        const staff = Array.isArray(r.staff) ? r.staff[0] : r.staff;
        if (locationId && (staff as { location_id?: string } | null)?.location_id !== locationId) return false;
        return true;
      })
      .map((r) => {
        const staff = Array.isArray(r.staff) ? r.staff[0] : r.staff;
        const label = staffLabel(staff as { full_name?: string; employee_code?: string } | null);
        const allotted = Number(r.allotted_days ?? 0);
        const carried = Number((r as { carried_forward?: number }).carried_forward ?? 0);
        const expired = Number((r as { expired_days?: number }).expired_days ?? 0);
        const pending = Number(r.pending_days ?? 0);
        const used = usedMap.get(usedKey(String(r.staff_id), String(r.leave_type))) ?? 0;
        const remaining = Math.max(0, allotted + carried - expired - used - pending);
        return {
          employeeCode: label.employeeCode,
          fullName: label.fullName,
          leaveType: String(r.leave_type),
          allotted,
          used,
          remaining,
          pending,
        };
      });
  }

  if (id === "ot") {
    if (!caps.canOt) return [];
    let q = context.supabase
      .from("hr_ot_claims")
      .select(
        "work_date, claimed_minutes, approved_minutes, rate_type, status, amount_qar, staff_id, location_id, staff(full_name, employee_code)",
      )
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .limit(2000);
    if (locationId) q = q.eq("location_id", locationId);
    if (employeeId) q = q.eq("staff_id", employeeId);
    if (status && status !== "all") q = q.eq("status", status);
    const { data, error } = await q;
    if (error && !tableMissing(error.message)) throw error;
    return (data ?? []).map((r) => {
      const staff = Array.isArray(r.staff) ? r.staff[0] : r.staff;
      const label = staffLabel(staff as { full_name?: string; employee_code?: string } | null);
      return {
        employeeCode: label.employeeCode,
        fullName: label.fullName,
        workDate: String(r.work_date).slice(0, 10),
        minutes: Number(r.approved_minutes ?? r.claimed_minutes ?? 0),
        rateType: String(r.rate_type ?? ""),
        status: String(r.status ?? ""),
        amountQar: Number(r.amount_qar ?? 0),
      };
    });
  }

  if (id === "payroll") {
    if (!caps.canPayroll) return [];
    const { data: periods, error: pErr } = await context.supabase
      .from("hr_payroll_periods")
      .select("id, month, status, date_from, date_to")
      .lte("date_from", dateTo)
      .gte("date_to", dateFrom)
      .limit(24);
    if (pErr && !tableMissing(pErr.message)) throw pErr;
    const periodIds = (periods ?? []).map((p) => String(p.id));
    if (!periodIds.length) return [];
    let lq = context.supabase
      .from("hr_payroll_lines")
      .select(
        "period_id, payment_method, gross_qar, net_qar, staff_id, staff(full_name, employee_code, qid, location_id)",
      )
      .in("period_id", periodIds)
      .limit(5000);
    if (employeeId) lq = lq.eq("staff_id", employeeId);
    const { data: lines, error: lErr } = await lq;
    if (lErr && !tableMissing(lErr.message)) throw lErr;
    const periodMap = new Map((periods ?? []).map((p) => [String(p.id), p]));
    return (lines ?? [])
      .filter((l) => {
        const staff = Array.isArray(l.staff) ? l.staff[0] : l.staff;
        if (locationId && (staff as { location_id?: string } | null)?.location_id !== locationId) return false;
        return true;
      })
      .map((l) => {
        const staff = Array.isArray(l.staff) ? l.staff[0] : l.staff;
        const label = staffLabel(staff as { full_name?: string; employee_code?: string } | null);
        const p = periodMap.get(String(l.period_id));
        return {
          period: (p as { month?: string } | undefined)?.month ?? String(l.period_id).slice(0, 8),
          employeeCode: label.employeeCode,
          fullName: label.fullName,
          paymentMethod: String(l.payment_method ?? ""),
          grossQar: Number(l.gross_qar ?? 0),
          netQar: Number(l.net_qar ?? 0),
          qid: (staff as { qid?: string | null } | null)?.qid ?? null,
          status: String((p as { status?: string } | undefined)?.status ?? ""),
        };
      });
  }

  if (id === "air_ticket") {
    if (!caps.canAirTicket) return [];
    let q = context.supabase
      .from("hr_air_ticket_entitlements")
      .select(
        "eligibility_on, expiry_on, status, staff_id, staff(full_name, employee_code, location_id)",
      )
      .limit(2000);
    if (employeeId) q = q.eq("staff_id", employeeId);
    if (status && status !== "all") q = q.eq("status", status);
    const { data, error } = await q;
    if (error && !tableMissing(error.message)) throw error;
    return (data ?? [])
      .filter((r) => {
        if (!inDateRange(String(r.eligibility_on), dateFrom, dateTo) && !inDateRange(r.expiry_on ? String(r.expiry_on) : null, dateFrom, dateTo)) {
          return false;
        }
        const staff = Array.isArray(r.staff) ? r.staff[0] : r.staff;
        if (locationId && (staff as { location_id?: string } | null)?.location_id !== locationId) return false;
        return true;
      })
      .map((r) => {
        const staff = Array.isArray(r.staff) ? r.staff[0] : r.staff;
        const label = staffLabel(staff as { full_name?: string; employee_code?: string } | null);
        return {
          employeeCode: label.employeeCode,
          fullName: label.fullName,
          eligibilityOn: String(r.eligibility_on).slice(0, 10),
          status: String(r.status ?? ""),
          expiryOn: r.expiry_on ? String(r.expiry_on).slice(0, 10) : "—",
        };
      });
  }

  if (id === "resignation_termination") {
    if (!caps.canExit) return [];
    const rows: Array<Record<string, string | number | null>> = [];
    const { data: resignations } = await context.supabase
      .from("hr_resignations")
      .select(
        "status, approved_lwd, proposed_lwd, submitted_on, staff_id, staff(full_name, employee_code, location_id)",
      )
      .limit(1000);
    for (const r of resignations ?? []) {
      const lwd = r.approved_lwd ?? r.proposed_lwd;
      if (!inDateRange(lwd ? String(lwd) : null, dateFrom, dateTo)) continue;
      const staff = Array.isArray(r.staff) ? r.staff[0] : r.staff;
      if (locationId && (staff as { location_id?: string } | null)?.location_id !== locationId) continue;
      if (employeeId && String(r.staff_id) !== employeeId) continue;
      const label = staffLabel(staff as { full_name?: string; employee_code?: string } | null);
      rows.push({
        employeeCode: label.employeeCode,
        fullName: label.fullName,
        kind: "resignation",
        status: String(r.status ?? ""),
        effectiveOn: r.submitted_on ? String(r.submitted_on).slice(0, 10) : "—",
        lastWorkingDate: lwd ? String(lwd).slice(0, 10) : "—",
      });
    }
    const { data: terms } = await context.supabase
      .from("hr_terminations")
      .select(
        "status, last_working_date, effective_on, staff_id, staff(full_name, employee_code, location_id)",
      )
      .limit(1000);
    for (const r of terms ?? []) {
      const eff = r.effective_on ?? r.last_working_date;
      if (!inDateRange(eff ? String(eff) : null, dateFrom, dateTo)) continue;
      const staff = Array.isArray(r.staff) ? r.staff[0] : r.staff;
      if (locationId && (staff as { location_id?: string } | null)?.location_id !== locationId) continue;
      if (employeeId && String(r.staff_id) !== employeeId) continue;
      const label = staffLabel(staff as { full_name?: string; employee_code?: string } | null);
      rows.push({
        employeeCode: label.employeeCode,
        fullName: label.fullName,
        kind: "termination",
        status: String(r.status ?? ""),
        effectiveOn: r.effective_on ? String(r.effective_on).slice(0, 10) : "—",
        lastWorkingDate: r.last_working_date ? String(r.last_working_date).slice(0, 10) : "—",
      });
    }
    return rows;
  }

  if (id === "recruitment_funnel" || id === "time_to_hire" || id === "candidate_source") {
    if (!caps.canRecruitment) return [];
    if (id === "candidate_source") {
      const { data, error } = await context.supabase
        .from("hr_candidates")
        .select("source")
        .limit(5000);
      if (error && !tableMissing(error.message)) throw error;
      const map = new Map<string, number>();
      for (const c of data ?? []) {
        const s = String(c.source ?? "other");
        map.set(s, (map.get(s) ?? 0) + 1);
      }
      return [...map.entries()].map(([source, count]) => ({ source, count }));
    }
    if (id === "recruitment_funnel") {
      const { data, error } = await context.supabase
        .from("hr_applications")
        .select("stage, vacancy_id, hr_vacancies(job_title)")
        .limit(5000);
      if (error && !tableMissing(error.message)) throw error;
      const map = new Map<string, { vacancy: string; stage: string; count: number }>();
      for (const a of data ?? []) {
        const vac = Array.isArray(a.hr_vacancies) ? a.hr_vacancies[0] : a.hr_vacancies;
        const title = (vac as { job_title?: string } | null)?.job_title ?? "Vacancy";
        const stage = String(a.stage ?? "new");
        const key = `${title}::${stage}`;
        const cur = map.get(key) ?? { vacancy: title, stage, count: 0 };
        cur.count += 1;
        map.set(key, cur);
      }
      return [...map.values()];
    }
    const { data, error } = await context.supabase
      .from("hr_applications")
      .select(
        "applied_at, stage_changed_at, stage, hr_vacancies(job_title), hr_candidates(full_name)",
      )
      .eq("stage", "joined")
      .limit(1000);
    if (error && !tableMissing(error.message)) throw error;
    return (data ?? [])
      .map((a) => {
        const vac = Array.isArray(a.hr_vacancies) ? a.hr_vacancies[0] : a.hr_vacancies;
        const cand = Array.isArray(a.hr_candidates) ? a.hr_candidates[0] : a.hr_candidates;
        const applied = a.applied_at ? String(a.applied_at).slice(0, 10) : null;
        const joined = a.stage_changed_at ? String(a.stage_changed_at).slice(0, 10) : null;
        if (!applied || !joined) return null;
        if (!inDateRange(joined, dateFrom, dateTo)) return null;
        const days = Math.max(
          0,
          Math.round(
            (new Date(`${joined}T12:00:00+03:00`).getTime() -
              new Date(`${applied}T12:00:00+03:00`).getTime()) /
              86400000,
          ),
        );
        return {
          vacancy: (vac as { job_title?: string } | null)?.job_title ?? "—",
          candidate: (cand as { full_name?: string } | null)?.full_name ?? "—",
          appliedOn: applied,
          joinedOn: joined,
          days,
        };
      })
      .filter(Boolean) as Array<Record<string, string | number | null>>;
  }

  if (id === "location_quota" || id === "department_quota") {
    if (!caps.canQuota) return [];
    const { data: quotas, error } = await context.supabase
      .from("hr_workforce_quotas")
      .select(
        "approved_headcount, location_id, department_id, locations(code, name), master_departments(name)",
      )
      .eq("active", true)
      .limit(500);
    if (error && !tableMissing(error.message)) throw error;
    let staffQ = context.supabase
      .from("staff")
      .select("id, location_id, staff_departments(department_id)")
      .in("status", ["active", "on_leave", "serving_notice"])
      .is("deleted_at", null)
      .limit(3000);
    const { data: staffRows } = await staffQ;
    const activeByLoc = new Map<string, number>();
    const activeByDept = new Map<string, number>();
    for (const s of staffRows ?? []) {
      const lid = s.location_id ? String(s.location_id) : "none";
      activeByLoc.set(lid, (activeByLoc.get(lid) ?? 0) + 1);
      const depts = Array.isArray(s.staff_departments) ? s.staff_departments : [];
      for (const d of depts) {
        const did = String((d as { department_id?: string }).department_id ?? "none");
        activeByDept.set(did, (activeByDept.get(did) ?? 0) + 1);
      }
    }
    return (quotas ?? [])
      .filter((q) => {
        if (id === "location_quota") return Boolean(q.location_id);
        return Boolean(q.department_id);
      })
      .map((q) => {
        if (id === "location_quota") {
          const loc = Array.isArray(q.locations) ? q.locations[0] : q.locations;
          const lid = String(q.location_id);
          const active = activeByLoc.get(lid) ?? 0;
          const approved = Number(q.approved_headcount ?? 0);
          return {
            scope: formatLocationLabel(
              (loc as { code?: string } | null)?.code ?? null,
              (loc as { name?: string } | null)?.name ?? null,
            ),
            approved,
            active,
            variance: active - approved,
          };
        }
        const dept = Array.isArray(q.master_departments) ? q.master_departments[0] : q.master_departments;
        const did = String(q.department_id);
        const active = activeByDept.get(did) ?? 0;
        const approved = Number(q.approved_headcount ?? 0);
        return {
          scope: (dept as { name?: string } | null)?.name ?? "—",
          approved,
          active,
          variance: active - approved,
        };
      });
  }

  if (id === "headcount_movement") {
    let q = context.supabase
      .from("staff")
      .select("hire_date, location_id, locations(code, name), staff_profile_ext(last_working_date)")
      .is("deleted_at", null)
      .limit(3000);
    if (locationId) q = q.eq("location_id", locationId);
    const { data, error } = await q;
    if (error && !tableMissing(error.message)) throw error;
    const byLoc = new Map<string, { location: string; joined: number; left: number }>();
    for (const s of data ?? []) {
      const loc = Array.isArray(s.locations) ? s.locations[0] : s.locations;
      const key = s.location_id ? String(s.location_id) : "none";
      const cur = byLoc.get(key) ?? {
        location: formatLocationLabel(
          (loc as { code?: string } | null)?.code ?? null,
          (loc as { name?: string } | null)?.name ?? null,
        ),
        joined: 0,
        left: 0,
      };
      if (s.hire_date && inDateRange(String(s.hire_date), dateFrom, dateTo)) cur.joined += 1;
      const ext = Array.isArray(s.staff_profile_ext) ? s.staff_profile_ext[0] : s.staff_profile_ext;
      const lwd = (ext as { last_working_date?: string | null } | null)?.last_working_date;
      if (lwd && inDateRange(String(lwd), dateFrom, dateTo)) cur.left += 1;
      byLoc.set(key, cur);
    }
    return [...byLoc.values()].map((r) => ({
      period: `${dateFrom} → ${dateTo}`,
      joined: r.joined,
      left: r.left,
      net: r.joined - r.left,
      location: r.location,
    }));
  }

  return [];
}

export const runHrCatalogReport = createAuthenticatedAction(
  z.object({
    reportId: z.enum(HR_REPORT_IDS),
    locationId: z.string().uuid().nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    employeeId: z.string().uuid().nullable().optional(),
    category: z.string().max(80).nullable().optional(),
    designation: z.string().max(120).nullable().optional(),
    status: z.string().max(80).nullable().optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  async (data, context: AuthContext) => {
    const caps = reportCaps(context);
    const visible = visibleHrReportIds(caps);
    if (!visible.includes(data.reportId)) {
      return {
        reportId: data.reportId,
        columns: [] as { key: string; header: string }[],
        rows: [] as Array<Record<string, string | number | null>>,
        denied: true as const,
      };
    }
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
    const period = defaultPayrollPeriod(today);
    const dateFrom = data.dateFrom ?? period.dateFrom;
    const dateTo = data.dateTo ?? period.dateTo;
    const raw = await buildReportRows(
      data.reportId,
      {
        dateFrom,
        dateTo,
        locationId: data.locationId ?? null,
        departmentId: data.departmentId ?? null,
        employeeId: data.employeeId ?? null,
        category: data.category ?? null,
        designation: data.designation ?? null,
        status: data.status ?? null,
      },
      context,
      caps,
    );
    const columns = filterReportColumns(columnsForReport(data.reportId), caps);
    const rows = projectReportRows(raw, columns);
    return {
      reportId: data.reportId,
      columns: columns.map((c) => ({ key: c.key, header: c.header })),
      rows,
      denied: false as const,
      period: { dateFrom, dateTo },
    };
  },
  { auth: { anyCapability: ["hr.manage", "people.view_roster", "payroll.view"] } },
);
