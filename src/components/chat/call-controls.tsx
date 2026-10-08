"use client";

import { useId } from "react";
import { Phone, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { ChatCallBlock } from "@/lib/chat/call-rules";

function reasonKey(blocked: ChatCallBlock): string {
  if (blocked === "send") return "chat.callBlockedSend";
  if (blocked === "role") return "chat.callBlockedRole";
  if (blocked === "policy") return "chat.callBlockedPolicy";
  return "chat.callBlockedAdmins";
}

export function CallControls({
  blocked,
  pending,
  onVoice,
  onVideo,
}: {
  blocked: ChatCallBlock | null;
  pending: boolean;
  onVoice: () => void;
  onVideo: () => void;
}) {
  const { t } = useTranslation();
  const reasonId = useId();
  const reason = blocked ? t(reasonKey(blocked)) : null;
  const disabled = reason != null || pending;

  return (
    <>
      {reason ? (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 min-w-11 px-2"
        disabled={disabled}
        aria-label={reason ? `${t("chat.callVoice")}. ${reason}` : t("chat.callVoice")}
        aria-describedby={reason ? reasonId : undefined}
        title={reason ?? t("chat.callVoice")}
        onClick={onVoice}
      >
        <Phone aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 min-w-11 px-2"
        disabled={disabled}
        aria-label={reason ? `${t("chat.callVideo")}. ${reason}` : t("chat.callVideo")}
        aria-describedby={reason ? reasonId : undefined}
        title={reason ?? t("chat.callVideo")}
        onClick={onVideo}
      >
        <Video aria-hidden />
      </Button>
    </>
  );
}
