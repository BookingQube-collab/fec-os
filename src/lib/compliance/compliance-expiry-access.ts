import { canUserDo, type AppRole } from "@/lib/rbac";

/** Roles that receive on-page and bell compliance expiry alerts. */
export const COMPLIANCE_EXPIRY_ADMIN_ROLES = ["ceo", "coo", "regional_ops"] as const satisfies readonly AppRole[];

export const COMPLIANCE_EXPIRY_SUPERVISOR_ROLES = [
  "tech_supervisor",
  "duty_manager",
  "branch_gm",
] as const satisfies readonly AppRole[];

export const COMPLIANCE_EXPIRY_ALERT_WINDOW_DAYS = 30;
export const COMPLIANCE_EXPIRY_CRITICAL_DAYS = 7;

/** Maps FEC location codes to E3 tracker location labels. */
export const LOCATION_CODE_TO_E3: Record<string, string> = {
  "INF-CC": "InflataPark City Center",
  "KDS-CC": "KDS City Center",
  "UA-DM": "Urban Arena Doha Mall",
  "CB-VM": "Crayons & Bricks Vendome",
  "CB-DSM": "Crayons & Bricks Dar Al Salam",
  "CAR-AP": "Carousel Aspire Park",
};

export function canViewComplianceExpiryAlerts(roles: AppRole[]): boolean {
  if (roles.some((r) => COMPLIANCE_EXPIRY_ADMIN_ROLES.includes(r as (typeof COMPLIANCE_EXPIRY_ADMIN_ROLES)[number]))) {
    return true;
  }
  if (canUserDo(roles, "admin.manage_users")) return true;
  return roles.some((r) =>
    COMPLIANCE_EXPIRY_SUPERVISOR_ROLES.includes(r as (typeof COMPLIANCE_EXPIRY_SUPERVISOR_ROLES)[number]),
  );
}

export function isEstateWideComplianceExpiryAccess(roles: AppRole[]): boolean {
  if (roles.some((r) => COMPLIANCE_EXPIRY_ADMIN_ROLES.includes(r as (typeof COMPLIANCE_EXPIRY_ADMIN_ROLES)[number]))) {
    return true;
  }
  if (canUserDo(roles, "admin.manage_users")) return true;
  if (canUserDo(roles, "dashboard.view_estate")) return true;
  return false;
}

export type LocationScope = {
  estateWide: boolean;
  locationIds: string[];
  locationCodes: string[];
  e3LocationNames: string[];
};

export function severityForDays(daysRemaining: number): "expired" | "critical" | "warning" {
  if (daysRemaining < 0) return "expired";
  if (daysRemaining <= COMPLIANCE_EXPIRY_CRITICAL_DAYS) return "critical";
  return "warning";
}
