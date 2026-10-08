"use client";

import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { ChatCallHistoryItem } from "@/lib/chat.functions";

export function IncomingCall({
  call,
  pending,
  onAccept,
  onReject,
}: {
  call: ChatCallHistoryItem;
  pending: boolean;
  onAccept: (call: ChatCallHistoryItem) => void;
  onReject: (callId: string) => void;
}) {
  const { t } = useTranslation();
  const label = call.kind === "VIDEO" ? t("chat.callIncomingVideo") : t("chat.callIncomingVoice");

  return (
    <section role="region" aria-label={label} className="border-b border-border px-3 py-3">
      <p role="status" className="text-sm font-medium">
        {label}
      </p>
      <div className="mt-3 flex gap-2">
        <Button type="button" className="min-h-11 px-3" disabled={pending} onClick={() => onAccept(call)}>
          {t("chat.callAccept")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11 px-3" disabled={pending} onClick={() => onReject(call.id)}>
          {t("chat.callReject")}
        </Button>
      </div>
    </section>
  );
}
