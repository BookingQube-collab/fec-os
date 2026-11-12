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
  queueName,
  speakerMuted = false,
  onAnswer,
  onDecline,
}: {
  call: CallCenterCall;
  pending: boolean;
  queueName?: string | null;
  speakerMuted?: boolean;
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
      if (speakerMuted) {
        stopSoftphoneRingtone();
        setNeedsGesture(false);
        return;
      }
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
  }, [call.id, call.fromE164, speakerMuted, t]);

  async function enableSound() {
    const ok = await unlockSoftphoneAudio();
    if (ok) {
      setNeedsGesture(false);
      if (!speakerMuted) await startSoftphoneRingtone();
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
      aria-modal="true"
      aria-labelledby="cc-incoming-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--foreground)/0.45)] p-4 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-lg rounded-[1.75rem] border border-border/60 bg-card px-6 py-8 text-center shadow-elevated-md sm:px-10 sm:py-10">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t("callCenter.incoming")}
        </p>
        <div
          className="mx-auto mt-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-700 ring-4 ring-emerald-600/20"
          aria-hidden
        >
          <Phone className="h-9 w-9 animate-pulse" />
        </div>
        <h2 id="cc-incoming-title" className="mt-5 text-3xl font-semibold tracking-tight text-foreground">
          {call.fromE164 || t("callCenter.unknownCaller")}
        </h2>
        <dl className="mt-4 space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center justify-center gap-2">
            <dt className="sr-only">{t("callCenter.toDid")}</dt>
            <dd>
              {t("callCenter.toDid")}: {call.toE164 || "—"}
            </dd>
          </div>
          {queueName ? (
            <div>
              <dt className="sr-only">{t("callCenter.queueLabel")}</dt>
              <dd>
                {t("callCenter.queueLabel")}: {queueName}
              </dd>
            </div>
          ) : null}
          {call.eventId ? (
            <div>
              <dt className="sr-only">{t("callCenter.eventId")}</dt>
              <dd>
                {t("callCenter.eventId")}: {call.eventId.slice(0, 8)}…
              </dd>
            </div>
          ) : null}
        </dl>
        {needsGesture && !speakerMuted ? (
          <button
            type="button"
            onClick={() => void enableSound()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted/40"
          >
            <Volume2 className="h-3.5 w-3.5" aria-hidden />
            {t("callCenter.tapToEnableSound")}
          </button>
        ) : null}
        {speakerMuted ? (
          <p className="mt-4 text-xs text-muted-foreground">{t("callCenter.speakerMutedHint")}</p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            className="min-h-14 flex-1 rounded-full bg-emerald-600 text-base text-white hover:bg-emerald-700"
            disabled={pending}
            onClick={() => void handleAnswer()}
          >
            <Phone className="me-2 h-5 w-5" aria-hidden />
            {t("callCenter.answer")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-14 flex-1 rounded-full text-base"
            disabled={pending}
            onClick={handleDecline}
          >
            <PhoneOff className="me-2 h-5 w-5" aria-hidden />
            {t("callCenter.decline")}
          </Button>
        </div>
        <p className="mt-4 text-[0.7rem] text-muted-foreground">{t("callCenter.ringShortcuts")}</p>
      </div>
    </div>
  );
}
