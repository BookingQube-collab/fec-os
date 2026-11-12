"use client";

import { Phone, PhoneOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { CallCenterCall } from "@/lib/call-center/types";

export function IncomingCallOverlay({
  call,
  pending,
  onAnswer,
  onDecline,
}: {
  call: CallCenterCall;
  pending: boolean;
  onAnswer: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alertdialog"
      aria-labelledby="cc-incoming-title"
      className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-elevated-md sm:inset-x-auto sm:end-6 sm:bottom-6"
    >
      <p id="cc-incoming-title" className="text-sm font-semibold">
        {t("callCenter.incoming")}
      </p>
      <p className="mt-1 text-lg font-medium tracking-tight">{call.fromE164 || t("callCenter.unknownCaller")}</p>
      <p className="text-xs text-muted-foreground">
        {t("callCenter.toDid")}: {call.toE164 || "—"}
      </p>
      <div className="mt-4 flex gap-2">
        <Button type="button" className="min-h-11 flex-1" disabled={pending} onClick={onAnswer}>
          <Phone className="me-1.5 h-4 w-4" aria-hidden />
          {t("callCenter.answer")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 flex-1"
          disabled={pending}
          onClick={onDecline}
        >
          <PhoneOff className="me-1.5 h-4 w-4" aria-hidden />
          {t("callCenter.decline")}
        </Button>
      </div>
    </div>
  );
}
