"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { HrReviewPanel } from "@/components/hr/hr-review-panel";
import { getLeaveAssistInsights } from "@/lib/hr-assist/read.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

export function LeaveAssistPanel({ staffId }: { staffId?: string | null }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "leave-assist", staffId: staffId || null }),
    queryFn: () => getLeaveAssistInsights({ staffId: staffId || null }),
    staleTime: STALE.people,
  });

  return (
    <HrReviewPanel
      title={t("hrAssist.leave.title")}
      hint={t("hrAssist.leave.hint")}
      queryState={query.isLoading ? "loading" : query.isError ? "error" : "ready"}
      result={query.data}
      emptyLabel={t("hrAssist.emptyLeave")}
    />
  );
}
