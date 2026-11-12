"use client";

import { ConnectionState, Room, RoomEvent, Track } from "livekit-client";
import {
  ArrowRightLeft,
  Grid3X3,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ensureRemoteAudioPlays,
  stopSoftphoneRingtone,
  unlockSoftphoneAudio,
} from "@/lib/call-center/softphone-audio";
import type { CallCenterTransferTarget } from "@/lib/call-center/types";

function isLiveKitAccessToken(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

function formatElapsed(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export function CallCenterSoftphoneRoom({
  token,
  serverUrl,
  held,
  answeredAt,
  transferTargets = [],
  compact = false,
  onHangup,
  onHoldToggle,
  onDtmf,
  onTransfer,
}: {
  token: string;
  serverUrl: string;
  held: boolean;
  answeredAt?: string | null;
  transferTargets?: CallCenterTransferTarget[];
  compact?: boolean;
  onHangup: () => void;
  onHoldToggle: () => void;
  onDtmf: (digit: string) => void;
  onTransfer?: (type: "cold" | "warm", target: string) => void;
}) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [connection, setConnection] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [failed, setFailed] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [showPad, setShowPad] = useState(true);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    stopSoftphoneRingtone();
    void unlockSoftphoneAudio();
  }, []);

  useEffect(() => {
    const start = answeredAt ? new Date(answeredAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [answeredAt]);

  useEffect(() => {
    if (!isLiveKitAccessToken(token) || !serverUrl.startsWith("wss://")) return;
    const room = new Room({
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
    });
    roomRef.current = room;
    const attached = new Set<HTMLMediaElement>();
    let cancelled = false;

    const mountRemoteAudio = (track: Track) => {
      if (track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.className = "sr-only";
      attached.add(element);
      audioRef.current?.appendChild(element);
      void ensureRemoteAudioPlays(element);
    };

    const attachExistingRemotes = () => {
      room.remoteParticipants.forEach((participant) => {
        participant.audioTrackPublications.forEach((publication) => {
          if (publication.track) mountRemoteAudio(publication.track);
        });
      });
    };

    const refresh = () => setConnection(room.state);

    room.on(RoomEvent.ConnectionStateChanged, refresh);
    room.on(RoomEvent.TrackSubscribed, (track) => mountRemoteAudio(track));
    room.on(RoomEvent.Disconnected, refresh);

    void (async () => {
      try {
        await unlockSoftphoneAudio();
        await room.connect(serverUrl, token);
        if (cancelled) return;
        attachExistingRemotes();
        await room.localParticipant.setMicrophoneEnabled(true);
        if (!cancelled) refresh();
      } catch {
        if (!cancelled) {
          setFailed(true);
          setConnection(ConnectionState.Disconnected);
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const element of attached) {
        element.pause();
        element.remove();
      }
      attached.clear();
      room.localParticipant.trackPublications.forEach((publication) => {
        publication.track?.stop();
      });
      void room.disconnect(true);
      roomRef.current = null;
    };
  }, [serverUrl, token]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    void room.localParticipant.setMicrophoneEnabled(!held && micOn);
  }, [held, micOn]);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room || held) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }

  const connected = connection === ConnectionState.Connected;
  const mediaReady = isLiveKitAccessToken(token) && serverUrl.startsWith("wss://");

  return (
    <section
      role="region"
      aria-label={t("callCenter.inCall")}
      className={
        compact
          ? "rounded-2xl border border-border/50 bg-card p-3 shadow-elevated-xs"
          : "rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs"
      }
    >
      <div ref={audioRef} className="sr-only" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{t("callCenter.inCall")}</p>
        <p className="font-mono text-lg tabular-nums tracking-wide text-foreground">
          {formatElapsed(elapsed)}
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {!mediaReady
          ? t("callCenter.mediaNotConfigured")
          : failed
            ? t("callCenter.mediaFailed")
            : held
              ? t("callCenter.onHold")
              : connected
                ? t("callCenter.connected")
                : t("callCenter.connecting")}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11 px-2"
          disabled={!mediaReady || held}
          onClick={() => void toggleMic()}
          aria-label={micOn ? t("callCenter.mute") : t("callCenter.unmute")}
        >
          {micOn && !held ? <Mic aria-hidden /> : <MicOff aria-hidden />}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11 px-2"
          onClick={onHoldToggle}
          aria-label={held ? t("callCenter.resume") : t("callCenter.hold")}
        >
          {held ? <Play aria-hidden /> : <Pause aria-hidden />}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11 px-2"
          onClick={() => setShowPad((v) => !v)}
          aria-label={t("callCenter.keypad")}
        >
          <Grid3X3 aria-hidden />
        </Button>
        {onTransfer ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 px-3"
            onClick={() => setShowTransfer((v) => !v)}
          >
            <ArrowRightLeft className="me-1.5 h-4 w-4" aria-hidden />
            {t("callCenter.divert")}
          </Button>
        ) : null}
        <Button type="button" variant="destructive" className="min-h-11 px-3" onClick={onHangup}>
          <PhoneOff className="me-1.5 h-4 w-4" aria-hidden />
          {t("callCenter.hangup")}
        </Button>
      </div>
      {showPad ? (
        <div className="mt-4 grid max-w-[15rem] grid-cols-3 gap-2">
          {KEYPAD.map((digit) => (
            <Button
              key={digit}
              type="button"
              variant="secondary"
              className="min-h-12 text-lg font-semibold"
              onClick={() => onDtmf(digit)}
            >
              {digit}
            </Button>
          ))}
        </div>
      ) : null}
      {showTransfer && onTransfer ? (
        <div className="mt-4 space-y-3 rounded-xl border border-border/60 p-3">
          <p className="text-xs font-medium text-foreground">{t("callCenter.divertTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("callCenter.transferHint")}</p>
          {transferTargets.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {transferTargets.map((agent) => (
                <Button
                  key={agent.userId}
                  type="button"
                  size="sm"
                  variant={transferTarget === agent.userId ? "default" : "secondary"}
                  onClick={() => setTransferTarget(agent.userId)}
                >
                  {agent.label}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("callCenter.noAvailableAgents")}</p>
          )}
          <Input
            value={transferTarget}
            onChange={(e) => setTransferTarget(e.target.value)}
            placeholder={t("callCenter.transferTarget")}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!transferTarget.trim()}
              onClick={() => onTransfer("warm", transferTarget.trim())}
            >
              {t("callCenter.warmTransfer")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!transferTarget.trim()}
              onClick={() => onTransfer("cold", transferTarget.trim())}
            >
              {t("callCenter.coldTransfer")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
