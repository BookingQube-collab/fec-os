import { venueMatchesScope } from "@/lib/compliance/compliance-derive";
import {
  COMPLIANCE_EXPIRY_ALERT_WINDOW_DAYS,
  severityForDays,
} from "@/lib/compliance/compliance-expiry-access";
import {
  resolveComplianceExpiryLocationScope,
  type LocationScope,
} from "@/lib/compliance/compliance-expiry-access.server";
import { requireCapability } from "@/lib/server/authorize";
import type { AuthContext } from "@/lib/server/auth";
import { E3_TABLE_ENRICHED } from "@/lib/compliance-tracker/constants";

export type ComplianceExpiryAlertSource = "document" | "register" | "e3_tracker" | "location_tracker";

export interface ComplianceExpiryAlertItem {
  id: string;
  source: ComplianceExpiryAlertSource;
  title: string;
  subtitle: string | null;
  locationLabel: string;
  locationId: string | null;
  expiryDate: string;
  daysRemaining: number;
  severity: "expired" | "critical" | "warning";
  actionUrl: string;
}

export interface ComplianceExpiryNotificationsPayload {
  eligible: boolean;
  estateWide: boolean;
  summary: {
    expired: number;
    critical: number;
    warning: number;
    total: number;
  };
  items: ComplianceExpiryAlertItem[];
}

function buildSummary(items: ComplianceExpiryAlertItem[]) {
  let expired = 0;
  let critical = 0;
  let warning = 0;
  for (const item of items) {
    if (item.severity === "expired") expired += 1;
    else if (item.severity === "critical") critical += 1;
    else warning += 1;
  }
  return {
    expired,
    critical,
    warning,
    total: items.length,
  };
}

function withinAlertWindow(daysRemaining: number): boolean {
  return daysRemaining <= COMPLIANCE_EXPIRY_ALERT_WINDOW_DAYS;
}

function matchesLocationScope(
  scope: LocationScope,
  opts: { locationId?: string | null; locationCode?: string | null; e3Location?: string | null },
): boolean {
  if (scope.estateWide) return true;
  if (opts.locationId && scope.locationIds.includes(opts.locationId)) return true;
  if (opts.locationCode && scope.locationCodes.includes(opts.locationCode)) return true;
  if (opts.e3Location && scope.e3LocationNames.includes(opts.e3Location)) return true;
  return false;
}

async function fetchDocumentAlerts(
  context: AuthContext,
  scope: LocationScope,
): Promise<ComplianceExpiryAlertItem[]> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + COMPLIANCE_EXPIRY_ALERT_WINDOW_DAYS);
  const horizonIso = horizon.toISOString().slice(0, 10);

  let q = context.supabase
    .from("compliance_documents")
    .select("id, location_id, document_type, document_name, expiry_date")
    .not("expiry_date", "is", null)
    .not("renewal_status", "in", "(renewed,not_applicable)")
    .lte("expiry_date", horizonIso);

  if (!scope.estateWide && scope.locationIds.length) {
    q = q.in("location_id", scope.locationIds);
  }

  const { data: rows, error } = await q;
  if (error) throw error;

  const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
  const { data: locs } = locIds.length
    ? await context.supabase.from("locations").select("id, code, name").in("id", locIds)
    : { data: [] };
  const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

  const items: ComplianceExpiryAlertItem[] = [];
  for (const row of rows ?? []) {
    const daysRemaining = Math.ceil(
      (new Date(row.expiry_date).getTime() - new Date(today).getTime()) / 86_400_000,
    );
    if (!withinAlertWindow(daysRemaining)) continue;
    const loc = locMap.get(row.location_id);
    if (!matchesLocationScope(scope, { locationId: row.location_id, locationCode: loc?.code ?? null })) {
      continue;
    }
    items.push({
      id: `doc:${row.id}`,
      source: "document",
      title: row.document_name ?? row.document_type,
      subtitle: row.document_type,
      locationLabel: loc?.code ?? "—",
      locationId: row.location_id,
      expiryDate: row.expiry_date,
      daysRemaining,
      severity: severityForDays(daysRemaining),
      actionUrl: `/compliance/documents/${row.id}`,
    });
  }
  return items;
}

async function fetchRegisterAlerts(
  context: AuthContext,
  scope: LocationScope,
): Promise<ComplianceExpiryAlertItem[]> {
  const { data, error } = await context.supabase
    .from("compliance_items_enriched")
    .select(
      "id, domain, item_name, venue_scope, expiry_date, days_remaining, alert_tier, governing_date",
    )
    .in("alert_tier", ["Expired", "Due ≤30"]);
  if (error) throw error;

  const items: ComplianceExpiryAlertItem[] = [];
  for (const row of data ?? []) {
    const daysRemaining = Number(row.days_remaining ?? 999);
    if (!withinAlertWindow(daysRemaining)) continue;

    const scoped =
      scope.estateWide ||
      scope.locationCodes.some((code) => venueMatchesScope(String(row.venue_scope), code)) ||
      row.venue_scope === "All";

    if (!scoped) continue;

    const expiryDate = String(row.governing_date ?? row.expiry_date ?? "");
    items.push({
      id: `reg:${row.id}`,
      source: "register",
      title: row.item_name,
      subtitle: row.domain,
      locationLabel: String(row.venue_scope),
      locationId: null,
      expiryDate,
      daysRemaining,
      severity: severityForDays(daysRemaining),
      actionUrl: "/compliance/alerts",
    });
  }
  return items;
}

async function fetchE3TrackerAlerts(
  context: AuthContext,
  scope: LocationScope,
): Promise<ComplianceExpiryAlertItem[]> {
  const { data, error } = await context.supabase
    .from(E3_TABLE_ENRICHED)
    .select("id, location, category, item, expiry_date, days_to_expiry, computed_status")
    .in("computed_status", ["Critical", "Overdue"]);
  if (error) throw error;

  const items: ComplianceExpiryAlertItem[] = [];
  for (const row of data ?? []) {
    const daysRemaining = Number(row.days_to_expiry ?? 999);
    if (!withinAlertWindow(daysRemaining)) continue;
    if (!matchesLocationScope(scope, { e3Location: row.location })) continue;
    if (!row.expiry_date) continue;

    items.push({
      id: `e3:${row.id}`,
      source: "e3_tracker",
      title: row.item,
      subtitle: `${row.category} · ${row.location}`,
      locationLabel: row.location,
      locationId: null,
      expiryDate: row.expiry_date,
      daysRemaining,
      severity: severityForDays(daysRemaining),
      actionUrl: "/compliance/e3-tracker",
    });
  }
  return items;
}

async function fetchLocationTrackerAlerts(
  context: AuthContext,
  scope: LocationScope,
): Promise<ComplianceExpiryAlertItem[]> {
  let q = context.supabase
    .from("location_compliance_items_enriched")
    .select(
      "id, location_id, location_code, requirement_name, category, governing_date, days_remaining, computed_status, expiry_bucket",
    )
    .in("computed_status", ["Expired", "Due Soon"]);

  if (!scope.estateWide && scope.locationIds.length) {
    q = q.in("location_id", scope.locationIds);
  }

  const { data, error } = await q;
  if (error) throw error;

  const items: ComplianceExpiryAlertItem[] = [];
  for (const row of data ?? []) {
    const daysRemaining = Number(row.days_remaining ?? 999);
    if (!withinAlertWindow(daysRemaining)) continue;
    if (!matchesLocationScope(scope, { locationId: row.location_id, locationCode: row.location_code })) {
      continue;
    }
    if (!row.governing_date) continue;

    items.push({
      id: `loc:${row.id}`,
      source: "location_tracker",
      title: String(row.requirement_name),
      subtitle: String(row.category ?? ""),
      locationLabel: String(row.location_code ?? "—"),
      locationId: row.location_id as string,
      expiryDate: String(row.governing_date),
      daysRemaining,
      severity: severityForDays(daysRemaining),
      actionUrl: "/compliance/location-tracker",
    });
  }
  return items;
}

function dedupeAndSort(items: ComplianceExpiryAlertItem[], limit: number): ComplianceExpiryAlertItem[] {
  const seen = new Set<string>();
  const unique: ComplianceExpiryAlertItem[] = [];
  for (const item of items.sort((a, b) => a.daysRemaining - b.daysRemaining)) {
    const key = `${item.source}:${item.title}:${item.locationLabel}:${item.expiryDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= limit) break;
  }
  return unique;
}

export async function fetchComplianceExpiryNotifications(
  context: AuthContext,
  opts: { locationId?: string | null; limit?: number; summaryOnly?: boolean } = {},
): Promise<ComplianceExpiryNotificationsPayload> {
  const roles = await requireCapability(context, "compliance.view");
  const scope = await resolveComplianceExpiryLocationScope(context, roles, opts.locationId ?? null);

  if (!scope) {
    return {
      eligible: false,
      estateWide: false,
      summary: { expired: 0, critical: 0, warning: 0, total: 0 },
      items: [],
    };
  }

  const limit = Math.min(opts.limit ?? 25, 100);

  const [documents, register, e3, locationTracker] = await Promise.all([
    fetchDocumentAlerts(context, scope),
    fetchRegisterAlerts(context, scope),
    fetchE3TrackerAlerts(context, scope),
    fetchLocationTrackerAlerts(context, scope),
  ]);

  const allMerged = dedupeAndSort([...documents, ...register, ...e3, ...locationTracker], 500);
  const summary = buildSummary(allMerged);

  return {
    eligible: true,
    estateWide: scope.estateWide,
    summary,
    items: opts.summaryOnly ? [] : allMerged.slice(0, limit),
  };
}
