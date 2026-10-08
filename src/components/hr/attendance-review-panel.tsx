"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { HrReviewPanel } from "@/components/hr/hr-review-panel";
import { getAttendanceReviewFlags } from "@/lib/hr-assist/read.functions";
import { STALE } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

export function AttendanceReviewPanel({
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
      view: "assist-flags",
      locationId: locationId || null,
      dateFrom,
      dateTo,
    }),
    queryFn: () => getAttendanceReviewFlags({ locationId: locationId || null, dateFrom, dateTo }),
    enabled: Boolean(dateFrom && dateTo),
    staleTime: STALE.people,
  });

  return (
    <HrReviewPanel
      title={t("hrAssist.attendance.title")}
      hint={t("hrAssist.attendance.hint")}
      queryState={query.isLoading ? "loading" : query.isError ? "error" : "ready"}
      result={query.data}
      emptyLabel={t("hrAssist.emptyAttendance")}
      footerHref="/people/attendance/corrections"
      footerLabel={t("hrAssist.corrections")}
    />
  );
}
