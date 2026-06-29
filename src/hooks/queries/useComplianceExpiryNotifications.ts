import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { canViewComplianceExpiryAlerts } from "@/lib/compliance/compliance-expiry-access";
import type { ComplianceExpiryNotificationsPayload } from "@/lib/queries/compliance-expiry-notifications.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { useUserRoles } from "@/hooks/use-auth";
import type { AppRole } from "@/lib/rbac";

export interface ComplianceExpiryNotificationFilters {
  locationId?: string | null;
  limit?: number;
  summaryOnly?: boolean;
}

export function useComplianceExpiryNotifications(
  filters: ComplianceExpiryNotificationFilters = {},
  options?: { enabled?: boolean },
) {
  const roles = useUserRoles() as AppRole[];
  const roleEligible = canViewComplianceExpiryAlerts(roles);

  return useQuery({
    queryKey: queryKeys.compliance.expiryNotifications(filters),
    queryFn: () =>
      apiGet<ComplianceExpiryNotificationsPayload>("/api/compliance/expiry-notifications", {
        locationId: filters.locationId,
        limit: filters.limit ?? 25,
        summaryOnly: filters.summaryOnly,
      }),
    staleTime: STALE.complianceDocuments,
    enabled: (options?.enabled ?? true) && roleEligible,
  });
}
