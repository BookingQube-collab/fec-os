"use client";

import dynamic from "next/dynamic";
import { MicOff, VideoOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { ChatCallKind } from "@/lib/chat/call-rules";

const LiveKitCallRoom = dynamic(
  () => import("@/components/chat/livekit-call-room").then((mod) => mod.LiveKitCallRoom),
  { ssr: false },
);

export function CallOverlay({
  kind,
  phase,
  startedByMe,
  pending,
  session,
  onCancel,
  onDismiss,
  onEnd,
}: {
  kind: ChatCallKind;
  phase: "ringing" | "unconfigured" | "live";
  startedByMe: boolean;
  pending: boolean;
  session: { token: string; serverUrl: string } | null;
  onCancel: () => void;
  onDismiss: () => void;
  onEnd: () => void;
}) {
  const { t } = useTranslation();
  if (phase === "live" && session?.token && session.serverUrl) {
    return (
      <LiveKitCallRoom
        kind={kind}
        token={session.token}
        serverUrl={session.serverUrl}
        pending={pending}
        onEnd={onEnd}
      />
    );
  }
  const unconfigured = phase === "unconfigured";
  const title = unconfigured ? t("chat.callUnconfigured") : t("chat.callRinging");

  return (
    <section role="region" aria-label={title} className="border-b border-border px-3 py-3">
      <p role="status" className="text-sm font-medium">
        {title}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t(`chat.callKind.${kind}`)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="min-h-11 min-w-11 px-2" disabled aria-label={t("chat.callMuteDisabled")}>
          <MicOff aria-hidden />
        </Button>
        <Button type="button" variant="outline" className="min-h-11 min-w-11 px-2" disabled aria-label={t("chat.callCameraDisabled")}>
          <VideoOff aria-hidden />
        </Button>
        {startedByMe ? (
          <Button type="button" variant="outline" className="min-h-11 px-3" disabled={pending} onClick={onCancel}>
            {t("chat.callCancel")}
          </Button>
        ) : (
          <Button type="button" variant="outline" className="min-h-11 px-3" disabled={pending} onClick={onDismiss}>
            {t("chat.callDismiss")}
          </Button>
        )}
      </div>
    </section>
  );
}
