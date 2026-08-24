"use client";

import { CheckCircle2, Clock, CircleSlash, PauseCircle, RotateCcw, FileEdit, Ban } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { isApprovedStatus, isPendingStatus, isRejectedStatus } from "@/lib/procurement/dashboard";
import { cn } from "@/lib/utils";

export function prStatusTone(status: string): "warning" | "success" | "destructive" | "muted" | "info" {
  if (isApprovedStatus(status)) return "success";
  if (isRejectedStatus(status) || status === "cancelled") return "destructive";
  if (status === "returned" || status === "on_hold") return "warning";
  if (isPendingStatus(status)) return "warning";
  if (status === "draft") return "muted";
  return "info";
}

function StatusIcon({ status }: { status: string }) {
  if (isApprovedStatus(status)) return <CheckCircle2 />;
  if (isRejectedStatus(status) || status === "cancelled") return <Ban />;
  if (status === "on_hold") return <PauseCircle />;
  if (status === "returned") return <RotateCcw />;
  if (status === "draft") return <FileEdit />;
  if (isPendingStatus(status)) return <Clock />;
  return <CircleSlash />;
}

export function PrStatusPill({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant={prStatusTone(status)} className={cn("font-semibold", className)}>
      <StatusIcon status={status} />
      {t(`procurement.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}
