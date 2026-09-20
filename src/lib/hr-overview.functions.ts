"use server";

import { z } from "zod";

import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";
import { canUserDo } from "@/lib/rbac";
import { defaultPayrollPeriod } from "@/lib/attendance-hr/roster-period";
import { getPayrollAttendanceSummary } from "@/lib/attendance-hr-field.functions";
import { formatOtPolicySummary } from "@/lib/hr-advanced";
import {
  airTicketPolicyFromSection,
  isAirTicketOverdue,
  isAirTicketUpcoming,
} from "@/lib/hr-air-ticket";
import {
  addDaysYmd,
  aggregateHrHeadcountBreakdowns,
  countExpiringDocType,
  countJoiningSoon,
  countLeavingSoon,
  countMissingCvStaff,
  countUnattestedEducationalDocs,
  emptyHrOverviewBreakdowns,
} from "@/lib/hr-overview";
import { readPolicySection } from "@/lib/hr-policy-read";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

export const getHrOverview = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context: AuthContext) => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
    const period = defaultPayrollPeriod(today);
    const dayStart = `${today}T00:00:00+03:00`;
    const dayEnd = `${today}T23:59:59+03:00`;
    const expiryHorizon = new Date(`${today}T00:00:00+03:00`);
    expiryHorizon.setDate(expiryHorizon.getDate() + 30);
    const expiryTo = expiryHorizon.toISOString().slice(0, 10);

    const staffFilter = context.supabase
      .from("staff")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "on_leave", "serving_notice"])
      .is("deleted_at", null);
    const { count: headcount, error: staffErr } = data.locationId
      ? await staffFilter.eq("location_id", data.locationId)
      : await staffFilter;
    if (staffErr && !tableMissing(staffErr.message)) throw staffErr;

    const presentFilter = context.supabase
      .from("attendance_daily_summary")
      .select("id", { count: "exact", head: true })
      .eq("work_date", today)
      .in("status", ["present", "late", "overtime", "early_leave", "early_departure"]);
    const { count: presentToday, error: presentErr } = data.locationId
      ? await presentFilter.eq("location_id", data.locationId)
      : await presentFilter;
    if (presentErr && !tableMissing(presentErr.message)) throw presentErr;

    const { count: pendingLeave, error: leaveErr } = await context.supabase
      .from("hr_leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    const leaveMissing = Boolean(leaveErr && (tableMissing(leaveErr.message) || /permission/i.test(leaveErr.message)));
    if (leaveErr && !leaveMissing) throw leaveErr;

    const { count: onLeaveToday, error: onLeaveErr } = await context.supabase
      .from("hr_leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .lte("date_from", today)
      .gte("date_to", today);
    const onLeaveMissing = Boolean(onLeaveErr && (tableMissing(onLeaveErr.message) || /permission/i.test(onLeaveErr.message)));
    if (onLeaveErr && !onLeaveMissing) throw onLeaveErr;

    let fieldCheckedIn = 0;
    const fieldQ = context.supabase
      .from("staff_location_events")
      .select("staff_id, event_type, recorded_at")
      .gte("recorded_at", dayStart)
      .lte("recorded_at", dayEnd)
      .in("event_type", ["check_in", "check_out"])
      .order("recorded_at", { ascending: false })
      .limit(2000);
    const { data: fieldRows, error: fieldErr } = data.locationId
      ? await fieldQ.eq("location_id", data.locationId)
      : await fieldQ;
    if (fieldErr && !tableMissing(fieldErr.message) && !/permission/i.test(fieldErr.message ?? "")) throw fieldErr;
    if (fieldRows?.length) {
      const lastByStaff = new Map<string, string>();
      for (const row of fieldRows) {
        const sid = String(row.staff_id);
        if (lastByStaff.has(sid)) continue;
        lastByStaff.set(sid, String(row.event_type));
      }
      fieldCheckedIn = [...lastByStaff.values()].filter((t) => t === "check_in").length;
    }

    let payrollBlocked = 0;
    let payrollExceptions = 0;
    if (canUserDo(context.roles ?? [], "payroll.view")) {
      try {
        const payroll = await getPayrollAttendanceSummary({
          locationId: data.locationId ?? null,
          dateFrom: period.dateFrom,
          dateTo: period.dateTo,
        });
        payrollBlocked = payroll.blockedCount;
      } catch {
        payrollBlocked = 0;
      }
      const { count: openPeriods, error: periodErr } = await context.supabase
        .from("hr_payroll_periods")
        .select("id", { count: "exact", head: true })
        .in("status", ["draft", "hr_review", "finance_review", "gm_approved"]);
      if (periodErr && !tableMissing(periodErr.message) && !/permission/i.test(periodErr.message ?? "")) {
        throw periodErr;
      }
      payrollExceptions = (openPeriods ?? 0) + payrollBlocked;
    }

    const { count: expiredDocs, error: expiredDocsErr } = await context.supabase
      .from("hr_employee_documents")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("expiry_date", "is", null)
      .lt("expiry_date", today);
    const expiredDocsMissing = Boolean(
      expiredDocsErr && (tableMissing(expiredDocsErr.message) || /permission/i.test(expiredDocsErr.message ?? "")),
    );
    if (expiredDocsErr && !expiredDocsMissing) throw expiredDocsErr;

    const { count: expiringDocs, error: docsErr } = await context.supabase
      .from("hr_employee_documents")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("expiry_date", "is", null)
      .gte("expiry_date", today)
      .lte("expiry_date", expiryTo);
    const docsMissing = Boolean(docsErr && (tableMissing(docsErr.message) || /permission/i.test(docsErr.message ?? "")));
    if (docsErr && !docsMissing) throw docsErr;

    const { count: openOnboarding, error: onboardErr } = await context.supabase
      .from("hr_staff_checklists")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    const onboardMissing = Boolean(
      onboardErr && (tableMissing(onboardErr.message) || /permission/i.test(onboardErr.message ?? "")),
    );
    if (onboardErr && !onboardMissing) throw onboardErr;

    const { count: activeAnnouncements, error: annErr } = await context.supabase
      .from("hr_announcements")
      .select("id", { count: "exact", head: true })
      .eq("active", true);
    const annMissing = Boolean(annErr && (tableMissing(annErr.message) || /permission/i.test(annErr.message ?? "")));
    if (annErr && !annMissing) throw annErr;

    let otPolicySummary: string | null = null;
    const { data: otRow, error: otErr } = await context.supabase
      .from("hr_ot_policy")
      .select(
        "overtime_after_minutes, max_daily_ot_minutes, max_weekly_ot_minutes, requires_preapproval, summary_notes",
      )
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (otErr && !tableMissing(otErr.message) && !/permission/i.test(otErr.message ?? "")) throw otErr;
    if (otRow) {
      otPolicySummary = formatOtPolicySummary({
        overtimeAfterMinutes: Number(otRow.overtime_after_minutes ?? 480),
        maxDailyOtMinutes: otRow.max_daily_ot_minutes != null ? Number(otRow.max_daily_ot_minutes) : null,
        maxWeeklyOtMinutes: otRow.max_weekly_ot_minutes != null ? Number(otRow.max_weekly_ot_minutes) : null,
        requiresPreapproval: Boolean(otRow.requires_preapproval),
      });
      if (otRow.summary_notes) {
        otPolicySummary = `${otPolicySummary} — ${String(otRow.summary_notes).slice(0, 120)}`;
      }
    }

    let activeWarnings = 0;
    let thirdWarningEscalations = 0;
    let upcomingProbationDecisions = 0;
    let servingNotice = 0;
    let terminationQueue = 0;
    if (canUserDo(context.roles ?? [], "hr.warnings.manage") || canUserDo(context.roles ?? [], "hr.manage")) {
      const { data: warnRows, error: warnErr } = await context.supabase
        .from("hr_warnings")
        .select("status, valid_until, requires_formal_review");
      if (warnErr && !tableMissing(warnErr.message) && !/permission/i.test(warnErr.message ?? "")) {
        throw warnErr;
      }
      for (const w of warnRows ?? []) {
        if (String(w.status) !== "active") continue;
        const until = w.valid_until ? String(w.valid_until).slice(0, 10) : null;
        if (until && until < today) continue;
        activeWarnings += 1;
        if (w.requires_formal_review) thirdWarningEscalations += 1;
      }
    }
    if (canUserDo(context.roles ?? [], "hr.probation.manage") || canUserDo(context.roles ?? [], "hr.manage")) {
      const horizon = new Date(`${today}T00:00:00+03:00`);
      horizon.setDate(horizon.getDate() + 45);
      const to = horizon.toISOString().slice(0, 10);
      const { count: probCount, error: probErr } = await context.supabase
        .from("staff_profile_ext")
        .select("staff_id", { count: "exact", head: true })
        .not("probation_end", "is", null)
        .gte("probation_end", today)
        .lte("probation_end", to);
      if (probErr && !tableMissing(probErr.message) && !/permission/i.test(probErr.message ?? "")) {
        throw probErr;
      }
      upcomingProbationDecisions = probCount ?? 0;
    }
    if (
      canUserDo(context.roles ?? [], "hr.resignation.manage") ||
      canUserDo(context.roles ?? [], "hr.manage")
    ) {
      const { count: noticeCount, error: noticeErr } = await context.supabase
        .from("staff")
        .select("id", { count: "exact", head: true })
        .eq("status", "serving_notice")
        .is("deleted_at", null);
      if (noticeErr && !tableMissing(noticeErr.message) && !/permission/i.test(noticeErr.message ?? "")) {
        throw noticeErr;
      }
      servingNotice = noticeCount ?? 0;
    }
    if (
      canUserDo(context.roles ?? [], "hr.termination.initiate") ||
      canUserDo(context.roles ?? [], "hr.termination.approve") ||
      canUserDo(context.roles ?? [], "hr.manage")
    ) {
      const { count: termCount, error: termErr } = await context.supabase
        .from("hr_terminations")
        .select("id", { count: "exact", head: true })
        .in("status", ["draft", "pending_hr_approval", "pending_exec_approval", "approved"]);
      if (termErr && !tableMissing(termErr.message) && !/permission/i.test(termErr.message ?? "")) {
        throw termErr;
      }
      let probationFlags = 0;
      const { data: flagged, error: flagErr } = await context.supabase
        .from("hr_probation_reviews")
        .select("id")
        .eq("flags_phase6_termination", true)
        .eq("status", "decided");
      if (flagErr && !tableMissing(flagErr.message) && !/permission/i.test(flagErr.message ?? "")) {
        throw flagErr;
      }
      if (flagged?.length) {
        const ids = flagged.map((r) => String(r.id));
        const { data: linked } = await context.supabase
          .from("hr_terminations")
          .select("source_probation_review_id")
          .in("source_probation_review_id", ids);
        const linkedSet = new Set(
          (linked ?? []).map((t) => t.source_probation_review_id).filter(Boolean).map(String),
        );
        probationFlags = ids.filter((id) => !linkedSet.has(id)).length;
      }
      terminationQueue = (termCount ?? 0) + probationFlags;
    }

    let openVacancies = 0;
    let pendingJobRequests = 0;
    let quotaShortage = 0;
    let quotaExcess = 0;
    if (
      canUserDo(context.roles ?? [], "quota.view") ||
      canUserDo(context.roles ?? [], "recruitment.manage") ||
      canUserDo(context.roles ?? [], "recruitment.request")
    ) {
      const { data: vacRows, error: vacErr } = await context.supabase
        .from("hr_vacancies")
        .select("vacancies_count")
        .eq("status", "open");
      if (vacErr && !tableMissing(vacErr.message) && !/permission/i.test(vacErr.message ?? "")) {
        throw vacErr;
      }
      openVacancies = (vacRows ?? []).reduce((n, r) => n + Number(r.vacancies_count ?? 1), 0);

      const { count: jobCount, error: jobErr } = await context.supabase
        .from("hr_job_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (jobErr && !tableMissing(jobErr.message) && !/permission/i.test(jobErr.message ?? "")) {
        throw jobErr;
      }
      pendingJobRequests = jobCount ?? 0;

      if (canUserDo(context.roles ?? [], "quota.view")) {
        const { data: quotaRows, error: quotaErr } = await context.supabase
          .from("hr_workforce_quotas")
          .select("approved_headcount")
          .eq("active", true);
        if (quotaErr && !tableMissing(quotaErr.message) && !/permission/i.test(quotaErr.message ?? "")) {
          throw quotaErr;
        }
        const approved = (quotaRows ?? []).reduce((n, r) => n + Number(r.approved_headcount ?? 0), 0);
        // ponytail: global variance only — per-scope dashboard lives on /people/hr/quota
        const variance = (headcount ?? 0) - approved;
        quotaExcess = Math.max(0, variance);
        quotaShortage = Math.max(0, -variance);
      }
    }

    let pendingOt = 0;
    if (canUserDo(context.roles ?? [], "hr.ot.verify") || canUserDo(context.roles ?? [], "hr.ot.approve") || canUserDo(context.roles ?? [], "hr.manage")) {
      const { count: otCount, error: otPendingErr } = await context.supabase
        .from("hr_ot_claims")
        .select("id", { count: "exact", head: true })
        .in("status", ["submitted", "manager_verified"]);
      if (otPendingErr && !tableMissing(otPendingErr.message) && !/permission/i.test(otPendingErr.message ?? "")) {
        throw otPendingErr;
      }
      pendingOt = otCount ?? 0;
    }

    let breakdowns = emptyHrOverviewBreakdowns();
    let expiringQids = 0;
    let expiringPassports = 0;
    let missingCvs = 0;
    let unattestedEducational = 0;
    let joiningSoon = 0;
    let leavingSoon = 0;
    {
      let staffDetailQ = context.supabase
        .from("staff")
        .select(
          "id, hire_date, status, location_id, job_title, locations(code, name), staff_profile_ext(employment_category, last_working_date), staff_departments(department_id, master_departments(name))",
        )
        .in("status", ["active", "on_leave", "serving_notice"])
        .is("deleted_at", null)
        .limit(3000);
      if (data.locationId) staffDetailQ = staffDetailQ.eq("location_id", data.locationId);
      const { data: staffDetail, error: detailErr } = await staffDetailQ;
      if (detailErr && !tableMissing(detailErr.message) && !/permission/i.test(detailErr.message ?? "")) {
        throw detailErr;
      }
      const mapped = (staffDetail ?? []).map((s) => {
        const loc = Array.isArray(s.locations) ? s.locations[0] : s.locations;
        const ext = Array.isArray(s.staff_profile_ext) ? s.staff_profile_ext[0] : s.staff_profile_ext;
        const depts = Array.isArray(s.staff_departments) ? s.staff_departments : s.staff_departments ? [s.staff_departments] : [];
        const firstDept = depts[0] as
          | { department_id?: string; master_departments?: { name?: string } | { name?: string }[] | null }
          | undefined;
        const md = firstDept?.master_departments
          ? Array.isArray(firstDept.master_departments)
            ? firstDept.master_departments[0]
            : firstDept.master_departments
          : null;
        return {
          id: String(s.id),
          hireDate: s.hire_date ? String(s.hire_date).slice(0, 10) : null,
          status: String(s.status ?? "active"),
          employmentCategory: (ext as { employment_category?: string | null } | null)?.employment_category ?? null,
          lastWorkingDate: (ext as { last_working_date?: string | null } | null)?.last_working_date
            ? String((ext as { last_working_date?: string | null }).last_working_date).slice(0, 10)
            : null,
          departmentId: firstDept?.department_id ?? null,
          departmentName: md?.name ?? null,
          locationId: (s.location_id as string | null) ?? null,
          locationCode: (loc as { code?: string } | null)?.code ?? null,
          locationName: (loc as { name?: string } | null)?.name ?? null,
        };
      });
      breakdowns = aggregateHrHeadcountBreakdowns(mapped);
      joiningSoon = countJoiningSoon(mapped, today, 30);
      leavingSoon = countLeavingSoon(mapped, today, 30);

      const staffIds = mapped.map((m) => m.id);
      if (staffIds.length && (canUserDo(context.roles ?? [], "hr.docs.manage") || canUserDo(context.roles ?? [], "hr.manage"))) {
        const { data: docRows, error: docListErr } = await context.supabase
          .from("hr_employee_documents")
          .select("staff_id, doc_type, expiry_date, mofa_status, deleted_at")
          .in("staff_id", staffIds.slice(0, 1000))
          .is("deleted_at", null)
          .limit(5000);
        if (docListErr && !tableMissing(docListErr.message) && !/permission/i.test(docListErr.message ?? "")) {
          throw docListErr;
        }
        const docs = (docRows ?? []).map((d) => ({
          staffId: String(d.staff_id),
          docType: String(d.doc_type),
          expiryDate: d.expiry_date ? String(d.expiry_date).slice(0, 10) : null,
          mofaStatus: (d.mofa_status as string | null) ?? null,
          deletedAt: (d.deleted_at as string | null) ?? null,
        }));
        const horizon = addDaysYmd(today, 30);
        expiringQids = countExpiringDocType(docs, "qid", today, horizon);
        expiringPassports = countExpiringDocType(docs, "passport", today, horizon);
        missingCvs = countMissingCvStaff(staffIds, docs);
        unattestedEducational = countUnattestedEducationalDocs(docs);
      }
    }

    let upcomingAirTickets = 0;
    let overdueAirTickets = 0;
    if (canUserDo(context.roles ?? [], "hr.air_ticket.manage") || canUserDo(context.roles ?? [], "hr.manage")) {
      let horizonDays = 60;
      try {
        const section = await readPolicySection(context, "air_ticket");
        horizonDays = airTicketPolicyFromSection(section).upcomingHorizonDays;
      } catch {
        horizonDays = 60;
      }
      const { data: airRows, error: airErr } = await context.supabase
        .from("hr_air_ticket_entitlements")
        .select("status, eligibility_on, expiry_on");
      if (airErr && !tableMissing(airErr.message) && !/permission/i.test(airErr.message ?? "")) {
        throw airErr;
      }
      for (const row of airRows ?? []) {
        const status = String(row.status);
        const eligibilityOn = String(row.eligibility_on).slice(0, 10);
        const expiryOn = row.expiry_on ? String(row.expiry_on).slice(0, 10) : null;
        if (
          isAirTicketUpcoming({
            eligibilityOn,
            asOfDate: today,
            horizonDays,
            status,
          })
        ) {
          upcomingAirTickets += 1;
        }
        if (
          isAirTicketOverdue({
            eligibilityOn,
            asOfDate: today,
            status,
            expiryOn,
          })
        ) {
          overdueAirTickets += 1;
        }
      }
    }

    return {
      headcount: headcount ?? 0,
      presentToday: presentToday ?? 0,
      onLeaveToday: onLeaveMissing ? 0 : onLeaveToday ?? 0,
      pendingLeave: leaveMissing ? 0 : pendingLeave ?? 0,
      pendingOt,
      fieldCheckedIn,
      payrollBlocked,
      payrollExceptions,
      expiredDocs: expiredDocsMissing ? 0 : expiredDocs ?? 0,
      expiringDocs: docsMissing ? 0 : expiringDocs ?? 0,
      expiringQids,
      expiringPassports,
      missingCvs,
      unattestedEducational,
      joiningSoon,
      leavingSoon,
      openOnboarding: onboardMissing ? 0 : openOnboarding ?? 0,
      activeAnnouncements: annMissing ? 0 : activeAnnouncements ?? 0,
      activeWarnings,
      thirdWarningEscalations,
      upcomingProbationDecisions,
      servingNotice,
      terminationQueue,
      upcomingAirTickets,
      overdueAirTickets,
      openVacancies,
      pendingJobRequests,
      quotaShortage,
      quotaExcess,
      breakdowns,
      otPolicySummary,
      period,
      today,
    };
  },
  { auth: { anyCapability: ["people.view_roster", "hr.manage", "hr.leave.manage"] } },
);
