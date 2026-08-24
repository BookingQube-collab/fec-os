import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost } from "@/lib/api-client";
import type { I18nOverrideRecord } from "@/lib/queries/i18n-overrides.core";

/** Inline key — do not call queryKeys.admin.translations (may be missing at runtime). */
function translationsQueryKey(locale: string) {
  return ["admin", "translations", locale] as const;
}

export function useI18nOverrides(locale: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: translationsQueryKey(locale),
    queryFn: async () => {
      try {
        return await apiGet<{ items: I18nOverrideRecord[] }>("/api/admin/translations", { locale });
      } catch {
        return { items: [] as I18nOverrideRecord[] };
      }
    },
    staleTime: 5 * 60_000,
    enabled: options?.enabled ?? true,
    throwOnError: false,
    placeholderData: { items: [] },
  });
}

export function useSaveI18nOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { locale: string; key: string; value: string }) =>
      apiPost<{ item: I18nOverrideRecord }>("/api/admin/translations", body),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: translationsQueryKey(variables.locale) });
    },
  });
}
