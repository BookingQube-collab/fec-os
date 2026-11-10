"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { previewLeavePlanner } from "@/lib/hr-leave-planner.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { cn } from "@/lib/utils";

type Props = {
  dateFrom: string;
  dateTo: string;
  leaveType: string;
  staffId?: string | null;
  enabled?: boolean;
  onSwitchToEmergency?: () => void;
  className?: string;
};

export function LeavePlannerGateBanner({
  dateFrom,
  dateTo,
  leaveType,
  staffId,
  enabled = true,
  onSwitchToEmergency,
  className,
}: Props) {
  const { t } = useTranslation();
  const ready = Boolean(enabled && dateFrom && dateTo && dateTo >= dateFrom);

  const preview = useQuery({
    queryKey: queryKeys.people.hrLeavePlannerPreview({
      dateFrom,
      dateTo,
      leaveType,
      staffId: staffId ?? null,
    }),
    queryFn: () =>
      previewLeavePlanner({
        dateFrom,
        dateTo,
        leaveType,
        staffId: staffId || null,
      }),
    enabled: ready,
    staleTime: STALE.people,
  });

  if (!ready || !preview.data?.applies || !preview.data.evaluation) return null;

  const evaluation = preview.data.evaluation;
  const isEmergency = leaveType === "emergency";
  const blocked = evaluation.result === "DECLINE" && !isEmergency;
  const override = isEmergency && evaluation.wouldDecline;

  if (evaluation.result === "APPROVE" && !override) {
    return (
      <div
        className={cn(
          "mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs",
          className,
        )}
      >
        <p className="font-medium text-emerald-800 dark:text-emerald-200">
          {t("hr.leave.planner.approve", { defaultValue: "Leave planner: APPROVE" })}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-2 rounded-xl border px-3 py-2 text-xs",
        blocked
          ? "border-destructive/40 bg-destructive/10"
          : "border-amber-500/40 bg-amber-500/10",
        className,
      )}
    >
      <p className="font-medium">
        {blocked
          ? t("hr.leave.planner.blocked", {
              defaultValue: "Leave planner: DECLINE — annual leave cannot be submitted for these dates.",
            })
          : t("hr.leave.planner.emergencyOverride", {
              defaultValue:
                "Leave planner would DECLINE these dates. Submitting as Emergency will override the block for approvers to review.",
            })}
      </p>
      <ul className="mt-1 list-disc ps-4">
        {evaluation.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      {blocked && onSwitchToEmergency ? (
        <Button type="button" size="sm" className="mt-2" variant="secondary" onClick={onSwitchToEmergency}>
          {t("hr.leave.planner.switchEmergency", {
            defaultValue: "Switch to Emergency leave",
          })}
        </Button>
      ) : null}
    </div>
  );
}
