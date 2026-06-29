import "server-only";

import { assertLocationAccess } from "@/lib/server/authorize";
import type { AuthContext } from "@/lib/server/auth";
import type { AppRole } from "@/lib/rbac";

import {
  canViewComplianceExpiryAlerts,
  isEstateWideComplianceExpiryAccess,
  LOCATION_CODE_TO_E3,
  type LocationScope,
} from "./compliance-expiry-access";

export type { LocationScope };

export async function resolveComplianceExpiryLocationScope(
  context: AuthContext,
  roles: AppRole[],
  locationId?: string | null,
): Promise<LocationScope | null> {
  if (!canViewComplianceExpiryAlerts(roles)) return null;

  const estateWide = isEstateWideComplianceExpiryAccess(roles);

  if (locationId) {
    await assertLocationAccess(context, locationId);
    const { data: loc, error } = await context.supabase
      .from("locations")
      .select("id, code")
      .eq("id", locationId)
      .maybeSingle();
    if (error) throw error;
    const code = loc?.code ?? "";
    return {
      estateWide: false,
      locationIds: [locationId],
      locationCodes: code ? [code] : [],
      e3LocationNames: code && LOCATION_CODE_TO_E3[code] ? [LOCATION_CODE_TO_E3[code]] : [],
    };
  }

  if (estateWide) {
    const { data: locs, error } = await context.supabase
      .from("locations")
      .select("id, code")
      .eq("status", "active");
    if (error) throw error;
    const locationIds = (locs ?? []).map((l) => l.id);
    const locationCodes = (locs ?? []).map((l) => l.code);
    const e3LocationNames = locationCodes
      .map((code) => LOCATION_CODE_TO_E3[code])
      .filter(Boolean) as string[];
    return { estateWide: true, locationIds, locationCodes, e3LocationNames };
  }

  const { data: roleRows, error: roleErr } = await context.supabase
    .from("user_roles")
    .select("location_ids")
    .eq("user_id", context.userId);
  if (roleErr) throw roleErr;

  const locationIds = [...new Set((roleRows ?? []).flatMap((r) => r.location_ids ?? []))];
  if (!locationIds.length) {
    return { estateWide: false, locationIds: [], locationCodes: [], e3LocationNames: [] };
  }

  const { data: locs, error } = await context.supabase
    .from("locations")
    .select("id, code")
    .in("id", locationIds);
  if (error) throw error;

  const locationCodes = (locs ?? []).map((l) => l.code);
  const e3LocationNames = locationCodes
    .map((code) => LOCATION_CODE_TO_E3[code])
    .filter(Boolean) as string[];

  return { estateWide: false, locationIds, locationCodes, e3LocationNames };
}
