"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { HrReviewPanel } from "@/components/hr/hr-review-panel";
import { getRosterAssistRecommendations } from "@/lib/hr-assist/read.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

export function RosterAssistPanel({
  locationId,
  dateFrom,
  dateTo,
}: {
  locationId?: string | null;
  dateFrom: string;
  dateTo: string;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.people.attendanceHr({
      view: "roster-assist",
      locationId: locationId || null,
      dateFrom,
      dateTo,
    }),
    queryFn: () => getRosterAssistRecommendations({ locationId: locationId || null, dateFrom, dateTo }),
    enabled: Boolean(dateFrom && dateTo),
    staleTime: STALE.people,
  });

  return (
    <HrReviewPanel
      title={t("hrAssist.roster.title")}
      hint={t("hrAssist.roster.hint")}
      queryState={query.isLoading ? "loading" : query.isError ? "error" : "ready"}
      result={query.data}
      emptyLabel={t("hrAssist.emptyRoster")}
    />
  );
}
