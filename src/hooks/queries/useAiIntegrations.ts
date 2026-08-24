import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { AiIntegrationsSnapshot } from "@/lib/ai/types";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export type { AiIntegrationsSnapshot };

export function useAiIntegrations(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.admin.aiIntegrations(),
    queryFn: () => apiGet<AiIntegrationsSnapshot>("/api/admin/ai-integrations"),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}
