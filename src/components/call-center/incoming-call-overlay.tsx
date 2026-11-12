"use client";

import { Phone, PhoneOff, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { CallCenterCall } from "@/lib/call-center/types";
import {
  isSoftphoneAudioUnlocked,
  startSoftphoneRingtone,
  stopSoftphoneRingtone,
  unlockSoftphoneAudio,
} from "@/lib/call-center/softphone-audio";

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
  const [needsGesture, setNeedsGesture] = useState(false);
  const notifiedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await unlockSoftphoneAudio();
      if (cancelled) return;
      await startSoftphoneRingtone();
      if (cancelled) {
        stopSoftphoneRingtone();
        return;
      }
      if (!isSoftphoneAudioUnlocked()) {
        setNeedsGesture(true);
      } else {
        setNeedsGesture(false);
      }
    })();

    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      notifiedRef.current !== call.id
    ) {
      notifiedRef.current = call.id;
      try {
        new Notification(t("callCenter.incoming"), {
          body: call.fromE164 || t("callCenter.unknownCaller"),
          tag: `cc-ring-${call.id}`,
          silent: true,
        });
      } catch {
        // ignore
      }
    } else if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission().catch(() => undefined);
    }

    return () => {
      cancelled = true;
      stopSoftphoneRingtone();
    };
  }, [call.id, call.fromE164, t]);

  async function enableSound() {
    const ok = await unlockSoftphoneAudio();
    if (ok) {
      setNeedsGesture(false);
      await startSoftphoneRingtone();
    }
  }

  async function handleAnswer() {
    stopSoftphoneRingtone();
    await unlockSoftphoneAudio();
    onAnswer();
  }

  function handleDecline() {
    stopSoftphoneRingtone();
    onDecline();
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby="cc-incoming-title"
      className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-elevated-md sm:inset-x-auto sm:end-6 sm:bottom-6"
    >
      <p id="cc-incoming-title" className="text-sm font-semibold">
        {t("callCenter.incoming")}
      </p>
      <p className="mt-1 text-lg font-medium tracking-tight">
        {call.fromE164 || t("callCenter.unknownCaller")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("callCenter.toDid")}: {call.toE164 || "—"}
      </p>
      {needsGesture ? (
        <button
          type="button"
          onClick={() => void enableSound()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40"
        >
          <Volume2 className="h-3.5 w-3.5" aria-hidden />
          {t("callCenter.tapToEnableSound")}
        </button>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button type="button" className="min-h-11 flex-1" disabled={pending} onClick={() => void handleAnswer()}>
          <Phone className="me-1.5 h-4 w-4" aria-hidden />
          {t("callCenter.answer")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 flex-1"
          disabled={pending}
          onClick={handleDecline}
        >
          <PhoneOff className="me-1.5 h-4 w-4" aria-hidden />
          {t("callCenter.decline")}
        </Button>
      </div>
    </div>
  );
}
