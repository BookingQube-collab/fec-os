import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { ComplianceDocumentListRow } from "@/lib/queries/compliance-documents.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export interface ComplianceDocumentFilters {
  locationId?: string | null;
  status?: string | null;
  documentType?: string | null;
  renewalStatus?: string | null;
  paymentStatus?: string | null;
  contractId?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export function useComplianceDocuments(
  filters: ComplianceDocumentFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.compliance.documents(filters),
    queryFn: () =>
      apiGet<{ items: ComplianceDocumentListRow[]; total: number }>("/api/compliance/documents", {
        locationId: filters.locationId,
        status: filters.status,
        documentType: filters.documentType,
        renewalStatus: filters.renewalStatus,
        paymentStatus: filters.paymentStatus,
        contractId: filters.contractId,
        search: filters.search,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 50,
      }),
    staleTime: STALE.complianceDocuments,
    enabled: options?.enabled ?? true,
  });
}
