"use server";

import { z } from "zod";

import { alertTier, daysRemaining, governingDate, lineStatus, venueMatchesScope } from "@/lib/compliance/compliance-derive";
import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction } from "@/lib/server/create-action";

const RegisterFilter = z
  .object({
    locationCode: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    vendor: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    risk: z.string().nullable().optional(),
    year: z.number().int().optional(),
    month: z.number().int().min(1).max(12).optional(),
  })
  .default({});

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchEnrichedItems(context: Awaited<ReturnType<typeof import("@/lib/server/auth").getAuthenticatedContext>>, filter: z.infer<typeof RegisterFilter>) {
  const { data, error } = await context.supabase.from("compliance_items_enriched").select("*").order("governing_date");
  if (error) throw error;
  let rows = data ?? [];
  if (filter.domain) rows = rows.filter((r) => r.domain === filter.domain);
  if (filter.vendor) rows = rows.filter((r) => String(r.vendor_authority ?? "").toLowerCase().includes(filter.vendor!.toLowerCase()));
  if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  if (filter.risk) rows = rows.filter((r) => r.risk_level === filter.risk);
  if (filter.locationCode) rows = rows.filter((r) => venueMatchesScope(r.venue_scope, filter.locationCode!));
  return rows;
}

export const listComplianceRegister = createAuthenticatedAction(
  RegisterFilter,
  async (data, context) => fetchEnrichedItems(context, data),
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const getComplianceCommandCenter = createAuthenticatedAction(
  RegisterFilter,
  async (data, context) => {
    const items = await fetchEnrichedItems(context, data);
    const total = items.length;
    const expired = items.filter((i) => i.alert_tier === "Expired").length;
    const due30 = items.filter((i) => i.alert_tier === "Due ≤30").length;
    const due60 = items.filter((i) => i.alert_tier === "Due ≤60").length;
    const active = items.filter((i) => i.status === "Active").length;
    const pendingRenewal = items.filter((i) => i.status === "Pending Renewal").length;
    const critical = items.filter((i) => i.risk_level === "Critical").length;
    const renewalCost = items.reduce((a, i) => a + Number(i.renewal_cost ?? 0), 0);
    const avgDays =
      items.filter((i) => i.days_remaining != null).length > 0
        ? Math.round(
            items.filter((i) => i.days_remaining != null).reduce((a, i) => a + Number(i.days_remaining), 0) /
              items.filter((i) => i.days_remaining != null).length,
          )
        : 0;
    const healthPct = total > 0 ? Math.round(((total - expired - due30) / total) * 100) : 100;

    const byDomain = new Map<string, typeof items>();
    for (const i of items) {
      const list = byDomain.get(i.domain) ?? [];
      list.push(i);
      byDomain.set(i.domain, list);
    }

    const { data: locations } = await context.supabase.from("locations").select("code, name, region").eq("status", "active");
    const byLocation = (locations ?? []).map((loc) => {
      const scoped = items.filter((i) => venueMatchesScope(i.venue_scope, loc.code));
      return {
        code: loc.code,
        name: loc.name,
        region: loc.region,
        total: scoped.length,
        expired: scoped.filter((i) => i.alert_tier === "Expired").length,
        due30: scoped.filter((i) => i.alert_tier === "Due ≤30").length,
        ok: scoped.filter((i) => i.alert_tier === "OK").length,
      };
    });
    const shared = items.filter((i) => i.venue_scope === "All");

    return {
      kpis: {
        total,
        active,
        pending_renewal: pendingRenewal,
        expired,
        health_pct: healthPct,
        critical_risk: critical,
        due_30: due30,
        due_60: due60,
        avg_days_remaining: avgDays,
        annual_renewal_cost: renewalCost,
        upcoming_30: due30,
      },
      by_domain: [...byDomain.entries()].map(([domain, rows]) => {
        const exp = rows.filter((r) => r.alert_tier === "Expired").length;
        const d30 = rows.filter((r) => r.alert_tier === "Due ≤30").length;
        const ok = rows.filter((r) => r.alert_tier === "OK").length;
        const cost = rows.reduce((a, r) => a + Number(r.renewal_cost ?? 0), 0);
        const health = exp > 0 ? "At Risk" : d30 > 0 ? "Watch" : "Healthy";
        return { domain, total: rows.length, expired: exp, due_30: d30, ok, renewal_cost: cost, health };
      }),
      by_location: [...byLocation, { code: "All", name: "Shared (group-wide)", region: "—", total: shared.length, expired: shared.filter((i) => i.alert_tier === "Expired").length, due30: shared.filter((i) => i.alert_tier === "Due ≤30").length, ok: shared.filter((i) => i.alert_tier === "OK").length }],
      status_buckets: { expired, due30, due60, ok: items.filter((i) => i.alert_tier === "OK").length },
      risk_buckets: {
        Critical: items.filter((i) => i.risk_level === "Critical").length,
        High: items.filter((i) => i.risk_level === "High").length,
        Medium: items.filter((i) => i.risk_level === "Medium").length,
        Low: items.filter((i) => i.risk_level === "Low").length,
      },
    };
  },
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const getComplianceAlerts = createAuthenticatedAction(
  RegisterFilter,
  async (data, context) => {
    const items = await fetchEnrichedItems(context, data);
    const missingDate = items.filter((i) => !i.governing_date).length;
    const missingVendor = items.filter((i) => !i.vendor_authority).length;
    const missingOwner = items.filter((i) => !i.owner).length;

    const flagged = items.map((i) => {
      let flag = "✔ OK";
      if (i.alert_tier === "Expired") flag = "⛔ EXPIRED";
      else if (["Due ≤30", "Due ≤60"].includes(i.alert_tier as string)) flag = "⚠ RENEW SOON";
      else if (!i.vendor_authority) flag = "✎ Missing vendor";
      else if (!i.owner) flag = "✎ Missing owner";
      else if (!i.governing_date) flag = "✎ Missing date";
      return { ...i, flag };
    });

    return {
      kpis: {
        expired: items.filter((i) => i.alert_tier === "Expired").length,
        due_30: items.filter((i) => i.alert_tier === "Due ≤30").length,
        due_60: items.filter((i) => i.alert_tier === "Due ≤60").length,
        missing_date: missingDate,
        missing_vendor: missingVendor,
        missing_owner: missingOwner,
      },
      items: flagged.sort((a, b) => Number(a.days_remaining ?? 999) - Number(b.days_remaining ?? 999)),
    };
  },
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const getComplianceCalendarMonth = createAuthenticatedAction(
  z.object({ year: z.number(), month: z.number().min(1).max(12), locationCode: z.string().nullable().optional() }),
  async (data, context) => {
    const items = await fetchEnrichedItems(context, { locationCode: data.locationCode });
    const prefix = `${data.year}-${String(data.month).padStart(2, "0")}`;
    const inMonth = items.filter((i) => i.governing_date?.startsWith(prefix));
    const byDay = new Map<string, number>();
    for (const i of inMonth) {
      const d = i.governing_date as string;
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    return {
      month: prefix,
      count: inMonth.length,
      renewal_cost: inMonth.reduce((a, i) => a + Number(i.renewal_cost ?? 0), 0),
      by_day: [...byDay.entries()].map(([date, count]) => ({ date, count })),
      items: inMonth,
    };
  },
  { auth: { capability: "compliance.view" } },
);

export const getComplianceTrend = createAuthenticatedAction(
  z.object({ year: z.number(), locationCode: z.string().nullable().optional() }),
  async (data, context) => {
    const items = await fetchEnrichedItems(context, { locationCode: data.locationCode });
    const { data: history } = await context.supabase.from("compliance_service_history").select("service_date, cost");
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    let cumulative = 0;
    return {
      months: months.map((m) => {
        const prefix = `${data.year}-${String(m).padStart(2, "0")}`;
        const renewalsDue = items.filter((i) => i.governing_date?.startsWith(prefix)).length;
        const servicesCompleted = (history ?? []).filter((h) => h.service_date?.startsWith(prefix)).length;
        const renewalCost = items
          .filter((i) => i.governing_date?.startsWith(prefix))
          .reduce((a, i) => a + Number(i.renewal_cost ?? 0), 0);
        cumulative += renewalCost;
        return { month: m, renewals_due: renewalsDue, services_completed: servicesCompleted, renewal_cost: renewalCost, cumulative_cost: cumulative };
      }),
    };
  },
  { auth: { capability: "compliance.view" } },
);

export const listComplianceServiceHistory = createAuthenticatedAction(
  z.object({
    vendor: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    locationCode: z.string().nullable().optional(),
    result: z.string().nullable().optional(),
    dateFrom: z.string().nullable().optional(),
    dateTo: z.string().nullable().optional(),
  }).default({}),
  async (data, context) => {
    let q = context.supabase.from("compliance_service_history").select("*").order("service_date", { ascending: false }).limit(300);
    if (data.vendor) q = q.ilike("vendor", `%${data.vendor}%`);
    if (data.domain) q = q.eq("domain", data.domain);
    if (data.locationCode) q = q.eq("venue_scope", data.locationCode);
    if (data.result) q = q.eq("result", data.result);
    if (data.dateFrom) q = q.gte("service_date", data.dateFrom);
    if (data.dateTo) q = q.lte("service_date", data.dateTo);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []).map((r) => ({ ...r, cost: Number(r.cost) }));
  },
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const getVendorScorecard = createAuthenticatedAction(
  z.object({ locationCode: z.string().nullable().optional() }).default({}),
  async (data, context) => {
    const items = await fetchEnrichedItems(context, { locationCode: data.locationCode });
    const { data: history } = await context.supabase.from("compliance_service_history").select("vendor, cost");
    const { data: repairs } = await context.supabase.from("vendor_repairs").select("*");

    const vendors = new Set<string>();
    for (const i of items) if (i.vendor_authority) vendors.add(String(i.vendor_authority));
    for (const h of history ?? []) if (h.vendor) vendors.add(h.vendor);
    for (const r of repairs ?? []) vendors.add(r.vendor);

    const scorecard = [...vendors].map((vendor) => {
      const amcItems = items.filter((i) => i.vendor_authority === vendor);
      const visits = (history ?? []).filter((h) => h.vendor === vendor).length;
      const vendorRepairs = (repairs ?? []).filter((r) => r.vendor === vendor);
      const openRepairs = vendorRepairs.filter((r) => !["Returned", "Cancelled"].includes(String(r.status))).length;
      const returned = vendorRepairs.filter((r) => r.status === "Returned" && r.actual_return && r.expected_return);
      const onTime = returned.filter((r) => r.actual_return! <= r.expected_return!).length;
      const onTimePct = returned.length ? onTime / returned.length : null;
      const amcSpend = amcItems.reduce((a, i) => a + Number(i.renewal_cost ?? 0), 0);
      const repairSpend = vendorRepairs.reduce((a, r) => a + Number(r.cost ?? 0), 0);
      const totalSpend = amcSpend + repairSpend;
      let rating = "—";
      if (visits + amcItems.length + vendorRepairs.length > 0) {
        if (openRepairs > 2) rating = "Watch";
        else if (onTimePct != null && onTimePct >= 0.9) rating = "Excellent";
        else if (onTimePct != null && onTimePct >= 0.75) rating = "Good";
        else if (onTimePct != null && onTimePct >= 0.5) rating = "Watch";
        else if (onTimePct != null) rating = "Poor";
        else rating = "Good";
      }
      return { vendor, amc_contracts: amcItems.length, service_visits: visits, open_repairs: openRepairs, on_time_pct: onTimePct, amc_spend: amcSpend, repair_spend: repairSpend, total_spend: totalSpend, rating };
    });

    return scorecard.sort((a, b) => b.total_spend - a.total_spend);
  },
  { defaultInput: {}, auth: { capability: "vendors.view" } },
);

export const getStaffReadiness = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }).default({}),
  async (data, context) => {
    let q = context.supabase.from("staff_certifications").select("*");
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    const t = today();

    const staff = (rows ?? []).map((s) => {
      const certStatus = (exp: string | null) => {
        if (!exp) return "—";
        if (exp < t) return "Expired";
        const d = daysRemaining(exp, t)!;
        if (d <= 30) return "Expiring";
        return "Valid";
      };
      const certs = {
        medical: certStatus(s.medical_expiry),
        food_handler: certStatus(s.food_handler_expiry),
        first_aid: certStatus(s.first_aid_expiry),
        qid: certStatus(s.qid_expiry),
      };
      const validCount = Object.values(certs).filter((c) => c === "Valid").length;
      return { ...s, certs, valid_count: validCount, readiness_pct: Math.round((validCount / 4) * 100) };
    });

    const expiredCerts = staff.reduce((a, s) => a + Object.values(s.certs).filter((c) => c === "Expired").length, 0);
    const expiring30 = staff.reduce((a, s) => a + Object.values(s.certs).filter((c) => c === "Expiring").length, 0);
    const fullyCompliant = staff.filter((s) => s.valid_count === 4).length;
    const overall = staff.length ? Math.round(staff.reduce((a, s) => a + s.readiness_pct, 0) / staff.length) : 0;

    return {
      kpis: { overall_readiness_pct: overall, expired_certificates: expiredCerts, expiring_30: expiring30, fully_compliant: fullyCompliant, staff_tracked: staff.length },
      staff,
    };
  },
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const getComplianceCoverage = createAuthenticatedAction(
  RegisterFilter,
  async (data, context) => {
    const items = await fetchEnrichedItems(context, data);
    const { data: locations } = await context.supabase.from("locations").select("code, name").eq("status", "active").order("code");
    const codes = (locations ?? []).map((l) => l.code);
    const domains = [...new Set(items.map((i) => i.domain))];

    const grid = domains.map((domain) => {
      const domainItems = items.filter((i) => i.domain === domain);
      const cells: Record<string, number> = {};
      for (const code of codes) {
        cells[code] = domainItems.filter((i) => venueMatchesScope(i.venue_scope, code)).length;
      }
      cells.All = domainItems.filter((i) => i.venue_scope === "All").length;
      const owners = [...new Set(domainItems.map((i) => i.owner).filter(Boolean))];
      const vendors = [...new Set(domainItems.map((i) => i.vendor_authority).filter(Boolean))];
      return {
        domain,
        cells,
        owner: owners[0] ?? "—",
        vendor: vendors[0] ?? "—",
        frequency: domainItems[0]?.frequency ?? "—",
        risk: domainItems.reduce((max, i) => (i.risk_level === "Critical" ? "Critical" : max), "Low"),
      };
    });

    return { locations: codes, grid };
  },
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const getSupervisorConsole = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid() }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const { data: loc } = await context.supabase.from("locations").select("id, code, name, region").eq("id", data.locationId).single();
    const t = today();

    const [{ data: issues }, { data: readiness }, { data: report }] = await Promise.all([
      context.supabase.from("supervisor_issues").select("*").eq("location_id", data.locationId).order("log_date", { ascending: false }).limit(100),
      context.supabase.from("opening_readiness").select("*").eq("location_id", data.locationId).eq("check_date", t),
      context.supabase.from("daily_reports").select("*").eq("location_id", data.locationId).eq("report_date", t).maybeSingle(),
    ]);

    const allItems = await fetchEnrichedItems(context, { locationCode: loc?.code ?? null });
    const openIssues = (issues ?? []).filter((i) => !["Closed", "Verified"].includes(i.status));
    const naCount = (readiness ?? []).filter((r) => r.status === "N.A.").length;
    const readyCount = (readiness ?? []).filter((r) => r.status === "Ready").length;
    const denom = Math.max((readiness ?? []).length - naCount, 1);
    const readinessPct = Math.round((readyCount / denom) * 100);

    return {
      location: loc,
      today: t,
      issues: issues ?? [],
      readiness: readiness ?? [],
      daily_report: report,
      compliance_items: allItems,
      kpis: {
        open_issues: openIssues.length,
        overdue: openIssues.filter((i) => i.due_date && i.due_date < t).length,
        critical_open: openIssues.filter((i) => i.priority === "Critical").length,
        logged_today: (issues ?? []).filter((i) => i.log_date === t).length,
        closed_verified: (issues ?? []).filter((i) => ["Closed", "Verified"].includes(i.status)).length,
        opening_readiness_pct: readinessPct,
        my_compliance_items: allItems.length,
        due_30: allItems.filter((i) => i.alert_tier === "Due ≤30").length,
        due_60: allItems.filter((i) => i.alert_tier === "Due ≤60").length,
        expired: allItems.filter((i) => i.alert_tier === "Expired").length,
        open_cost_exposure: openIssues.reduce((a, i) => a + Number(i.cost ?? 0), 0),
      },
    };
  },
  { auth: { capability: "tasks.complete" } },
);

export const getExecutiveComplianceKpis = createAuthenticatedAction(
  z.object({ locationCode: z.string().nullable().optional() }).default({}),
  async (data, context) => {
    const items = await fetchEnrichedItems(context, { locationCode: data.locationCode });
    const staff = await getStaffReadiness({ locationId: null });
    const total = items.length;
    const expired = items.filter((i) => i.alert_tier === "Expired").length;
    const due30 = items.filter((i) => i.alert_tier === "Due ≤30").length;
    const healthPct = total > 0 ? Math.round(((total - expired - due30) / total) * 100) : 100;

    let locationId: string | null = null;
    if (data.locationCode) {
      const { data: loc } = await context.supabase.from("locations").select("id").eq("code", data.locationCode).maybeSingle();
      locationId = loc?.id ?? null;
    }
    const sup = locationId ? await getSupervisorConsole({ locationId }) : null;
    const openingPct = sup?.kpis.opening_readiness_pct ?? 100;
    const issueClosure = sup && sup.kpis.logged_today > 0
      ? Math.round((sup.kpis.closed_verified / Math.max(sup.kpis.logged_today, 1)) * 100)
      : 100;
    const revenueReadiness = Math.round(0.45 * openingPct + 0.35 * healthPct + 0.2 * issueClosure);

    return {
      licenses_amcs: total,
      active: items.filter((i) => i.status === "Active").length,
      pending_renewal: items.filter((i) => i.status === "Pending Renewal").length,
      expired,
      due_30: due30,
      due_60: items.filter((i) => i.alert_tier === "Due ≤60").length,
      upcoming_30: items.filter((i) => i.alert_tier === "Due ≤30").length,
      compliance_health_pct: healthPct,
      annual_renewal_cost: items.reduce((a, i) => a + Number(i.renewal_cost ?? 0), 0),
      staff_readiness_pct: staff.kpis.overall_readiness_pct,
      revenue_readiness: revenueReadiness,
    };
  },
  { defaultInput: {}, auth: { capability: "dashboard.view" } },
);
