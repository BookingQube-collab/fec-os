"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { HR_LEAVE_TYPES } from "@/lib/hr-leave";
import { previewLeaveApplyPolicy } from "@/lib/hr-leave.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";

type LeaveType = (typeof HR_LEAVE_TYPES)[number];

type Props = {
  leaveType: LeaveType | string;
  dateFrom: string;
  dateTo: string;
  staffId?: string | null;
  enabled?: boolean;
  className?: string;
};

/** Live policy preview for employee leave apply (sandwich, balance, sick→annual). */
export function MeLeavePolicyPreview({
  leaveType,
  dateFrom,
  dateTo,
  staffId,
  enabled = true,
  className,
}: Props) {
  const { t } = useTranslation();
  const ready = Boolean(enabled && dateFrom && dateTo && dateTo >= dateFrom);

  const preview = useQuery({
    queryKey: queryKeys.people.hrLeaveApplyPreview({
      leaveType,
      dateFrom,
      dateTo,
      staffId: staffId ?? null,
    }),
    queryFn: () =>
      previewLeaveApplyPolicy({
        leaveType: leaveType as LeaveType,
        dateFrom,
        dateTo,
        staffId: staffId || null,
      }),
    enabled: ready,
    staleTime: STALE.people,
  });

  if (!ready || preview.isPending || !preview.data) return null;

  const data = preview.data;
  const warnings: string[] = [];

  if (data.sandwichBlocked) {
    warnings.push(
      t("hr.leave.sandwichBlocked", {
        defaultValue:
          "Weekly OFF both before and after annual leave is not allowed (sandwich). Adjust dates so OFF is only before or only after leave.",
      }),
    );
  }
  if (data.insufficientBalance) {
    warnings.push(
      t("hr.leave.balanceExceeded", {
        remaining: data.entitlement.remainingDays,
        requested: data.annualDaysNeeded,
        defaultValue:
          "Request needs {{requested}} annual day(s) but only {{remaining}} remaining from your joining-date accrual.",
      }),
    );
  }

  const sickSplit = data.sickSplit;
  const showSickSplit = Boolean(sickSplit?.requiresAnnualFollowOn);

  if (!warnings.length && !showSickSplit) {
    if (leaveType === "annual" || leaveType === "sick") {
      return (
        <div
          className={cn(
            "mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs",
            className,
          )}
        >
          <p className="font-medium text-emerald-800 dark:text-emerald-200">
            {t("hr.leave.policyPreviewOk", {
              days: data.days,
              remaining: data.entitlement.remainingDays,
              defaultValue: "{{days}} day(s) look OK · {{remaining}} annual day(s) remaining.",
            })}
          </p>
          <p className="mt-1 text-muted-foreground">{t("hr.leave.sandwichHelp")}</p>
        </div>
      );
    }
    return null;
  }

  return (
    <div
      className={cn(
        "mt-2 space-y-2 rounded-xl border px-3 py-2 text-xs",
        warnings.length
          ? "border-destructive/40 bg-destructive/10"
          : "border-amber-500/40 bg-amber-500/10",
        className,
      )}
    >
      {warnings.map((msg) => (
        <p key={msg} className="font-medium">
          {msg}
        </p>
      ))}
      {data.sandwichBlocked ? (
        <p className="text-muted-foreground">
          {t("hr.leave.sandwichPreview", {
            before: data.sandwichPrefixDates.join(", ") || "—",
            after: data.sandwichSuffixDates.join(", ") || "—",
            defaultValue: "OFF before: {{before}} · OFF after: {{after}}",
          })}
        </p>
      ) : null}
      {showSickSplit && sickSplit ? (
        <div>
          <p className="font-medium">
            {t("hr.leave.sickSplitPreview", {
              sick: sickSplit.sickDays,
              annual: sickSplit.annualDays,
              defaultValue:
                "Sick quota covers {{sick}} day(s); {{annual}} day(s) continue as annual leave (HR → GM) with medical document.",
            })}
          </p>
          <p className="mt-1 text-muted-foreground">{t("hr.leave.sickQuotaExhaustedDocs")}</p>
        </div>
      ) : null}
      {data.insufficientBalance ? (
        <p className="text-muted-foreground">
          {t("hr.leave.balanceExceededHint", {
            defaultValue: "Shorten the range or wait for more months to accrue from your joining date.",
          })}
        </p>
      ) : null}
    </div>
  );
}
