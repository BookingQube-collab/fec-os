"use client";

import { CheckCircle2, Clock, CircleSlash, PauseCircle, RotateCcw, FileEdit, Ban } from "lucide-react";
import { useTranslation } from "react-i18next";

import { StatusChip, type StatusTone } from "@/components/ds";
import { isApprovedStatus, isPendingStatus, isRejectedStatus } from "@/lib/procurement/dashboard";
import { cn } from "@/lib/utils";

function StatusIcon({ status }: { status: string }) {
  const className = "h-3.5 w-3.5";
  if (isApprovedStatus(status)) return <CheckCircle2 className={className} aria-hidden />;
  if (isRejectedStatus(status) || status === "cancelled") return <Ban className={className} aria-hidden />;
  if (status === "on_hold") return <PauseCircle className={className} aria-hidden />;
  if (status === "returned") return <RotateCcw className={className} aria-hidden />;
  if (status === "draft") return <FileEdit className={className} aria-hidden />;
  if (isPendingStatus(status)) return <Clock className={className} aria-hidden />;
  return <CircleSlash className={className} aria-hidden />;
}

function chipTone(status: string): StatusTone {
  if (isApprovedStatus(status)) return "approved";
  if (isRejectedStatus(status) || status === "cancelled") return "rejected";
  if (status === "returned" || status === "on_hold" || status === "changes_requested") return "warning";
  if (isPendingStatus(status)) return "pending";
  return "neutral";
}

export function PrStatusPill({
  status,
  actionRequired,
  className,
}: {
  status: string;
  actionRequired?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <StatusChip tone={chipTone(status)}>
        <StatusIcon status={status} />
        {t(`procurement.status.${status}`, { defaultValue: status })}
      </StatusChip>
      {actionRequired ? <span className="pr-action-required">{t("procurement.actionRequired")}</span> : null}
    </div>
  );
}
