"use client";

import { useTranslation } from "react-i18next";

import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";
import type { summarizeApprovedHistory } from "@/lib/attendance-hr/missed-punch-approved-history";

type Summary = ReturnType<typeof summarizeApprovedHistory>;

export function ApprovedHistoryKpiStrip({
  summary,
  variant = "correction",
}: {
  summary: Summary;
  variant?: "correction" | "leave";
}) {
  const { t } = useTranslation();
  const copyKey = variant === "leave" ? "hr.me.leaveApprovedHistory" : "hr.me.approvedHistory";

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      role="region"
      aria-label={t(`${copyKey}.kpiStrip`, {
        defaultValue: t("hr.me.approvedHistory.kpiStrip"),
      })}
    >
      <TintedKpiCard
        compact
        tint="sky"
        title={t(`${copyKey}.kpiTotal`, {
          defaultValue: t("hr.me.approvedHistory.kpiTotal"),
        })}
        value={summary.total}
      />
      <TintedKpiCard
        compact
        tint="green"
        title={t(`${copyKey}.kpiApproved`, {
          defaultValue: t("hr.me.approvedHistory.kpiApproved"),
        })}
        value={summary.approved}
      />
      <TintedKpiCard
        compact
        tint={summary.inProgress > 0 ? "amber" : "slate"}
        className="col-span-2 sm:col-span-1"
        title={t(`${copyKey}.kpiInProgress`, {
          defaultValue: t("hr.me.approvedHistory.kpiInProgress"),
        })}
        value={summary.inProgress}
      />
    </div>
  );
}
